import {NextRequest,NextResponse} from 'next/server';
import {getRun,start} from 'workflow/api';
import {solveWorkflow} from '@/workflows/solve';
import {supabaseAdmin} from '@/lib/supabase-admin';
import {jobStudent,publicJob,validImageId,finishJob,SolveInputError} from '@/lib/solve-jobs';
export const maxDuration=60;
export async function GET(request:NextRequest){
 try{
  const student=await jobStudent(request),id=request.nextUrl.searchParams.get('id');
  if(id&&!validImageId(id))throw new SolveInputError('任務識別碼錯誤。');
  let q=supabaseAdmin.from('solve_jobs').select('*').eq('student_id',student.id);
  if(id)q=q.eq('id',id);else q=q.is('acknowledged_at',null).gte('created_at',new Date(Date.now()-7*86400000).toISOString());
  const {data,error}=await q.order('created_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;if(!data)return NextResponse.json({job:null});
  const age=Date.now()-Date.parse(data.updated_at);
  if(data.status==='uploading'&&age>5*60000){await finishJob(data.id,{error:'上傳未完成，請重新上傳題目。'},503);data.status='failed';data.stage='failed';data.result={error:'上傳未完成，請重新上傳題目。'};}
  else if(data.status==='queued'&&!data.workflow_run_id&&age>15000){
   // A missing dispatch acknowledgement is safe to retry: beginJob uses a compare-and-swap claim.
   try{const run=await start(solveWorkflow,[data.id]);await supabaseAdmin.from('solve_jobs').update({workflow_run_id:run.runId,updated_at:new Date().toISOString()}).eq('id',data.id).is('workflow_run_id',null);}catch(error){console.error('Solve dispatch recovery',error);}
  }
  else if(['queued','running'].includes(data.status)&&data.workflow_run_id&&age>60000){
   try{const status=await getRun(data.workflow_run_id).status;if(['failed','cancelled','canceled'].includes(status)){await finishJob(data.id,{error:'背景任務中斷，額度已釋放，請重試。'},503);const {data:fresh}=await supabaseAdmin.from('solve_jobs').select('*').eq('id',data.id).single();if(fresh)Object.assign(data,fresh);}}catch(error){console.error('Solve status unavailable',error);}
  }
  if(['queued','running'].includes(data.status)&&age>30*60000){
   // Provider calls time out after 3 minutes; an unchanged stage for 30 minutes is abandoned.
   await finishJob(data.id,{error:'背景任務已逾時，額度已釋放，請重試。'},504);
   const {data:fresh}=await supabaseAdmin.from('solve_jobs').select('*').eq('id',data.id).single();if(fresh)Object.assign(data,fresh);
  }
  return NextResponse.json({job:await publicJob(data)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof SolveInputError?error.message:'讀取任務失敗，請稍後再試。'},{status:error instanceof SolveInputError?error.status:503});}
}
export async function PATCH(request:NextRequest){
 try{const student=await jobStudent(request),body=await request.json();if(!validImageId(String(body.id||'')))throw new SolveInputError('任務識別碼錯誤。');const {error}=await supabaseAdmin.from('solve_jobs').update({acknowledged_at:new Date().toISOString()}).eq('id',body.id).eq('student_id',student.id).in('status',['succeeded','failed']);if(error)throw error;return NextResponse.json({ok:true});}catch(error){return NextResponse.json({error:'更新任務失敗。'},{status:error instanceof SolveInputError?error.status:503});}
}
