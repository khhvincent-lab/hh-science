import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'crypto';
import {supabaseAdmin as db} from '@/lib/supabase-admin';
import {start} from 'workflow/api';
import {historyReviewWorkflow} from '@/workflows/history-review';
export const maxDuration=60;
// One-batch, expiring capability. It cannot read student data or create/alter batches.
export async function POST(request:NextRequest){
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return NextResponse.json({error:'Unauthorized'},{status:401});
 const hash=createHash('sha256').update(token).digest('hex');
 const {data:batch,error}=await db.from('model_review_batches').select('id,status,workflow_id').eq('launch_hash',hash).gt('launch_expires_at',new Date().toISOString()).maybeSingle();
 if(error||!batch)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(batch.workflow_id||batch.status!=='queued')return NextResponse.json({started:true});
 try{const run=await start(historyReviewWorkflow,[batch.id]);const {error:e}=await db.from('model_review_batches').update({workflow_id:run.runId,launch_hash:null}).eq('id',batch.id);if(e)throw e;return NextResponse.json({started:true});}
 catch{return NextResponse.json({error:'Dispatch unavailable; retry safely.'},{status:503});}
}
