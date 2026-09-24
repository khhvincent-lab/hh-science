import {NextRequest,NextResponse} from 'next/server';
import {randomUUID,createHash} from 'node:crypto';
import {start} from 'workflow/api';
import {solveWorkflow} from '@/workflows/solve';
import {supabaseAdmin} from '@/lib/supabase-admin';
import {getAISolverSettings} from '@/lib/ai-settings';
import {jobStudent,checkSubject,validateSolveInput,validImageId,publicJob,finishJob,JOB_BUCKET,SolveInputError} from '@/lib/solve-jobs';
export const maxDuration=300;
export async function POST(request:NextRequest){
 let createdId:string|null=null;
 try{
  const student=await jobStudent(request);
  if(Number(request.headers.get('content-length')||0)>4_300_000)throw new SolveInputError('圖片總容量過大。',413);
  const raw=await request.json();
  const key=String(raw.clientKey||randomUUID());if(!validImageId(key))throw new SolveInputError('任務識別碼格式錯誤。');
  let input;
  if(raw.retryOf){
   if(!validImageId(String(raw.retryOf)))throw new SolveInputError('題目識別碼錯誤。');
   const {data:old,error}=await supabaseAdmin.from('solve_jobs').select('input_path,status,created_at').eq('id',raw.retryOf).eq('student_id',student.id).maybeSingle();
   if(error)throw error;if(!old||old.status!=='failed'||!old.input_path||Date.now()-Date.parse(old.created_at)>7*86400000)throw new SolveInputError('原題已無法重試，請重新上傳。');
   const {data:blob,error:downloadError}=await supabaseAdmin.storage.from(JOB_BUCKET).download(old.input_path);if(downloadError||!blob)throw new SolveInputError('讀取原題失敗，請重新上傳。');input=validateSolveInput(JSON.parse(await blob.text()));
  }else input=validateSolveInput(raw);
  await checkSubject(student,input.subject);
  const text=JSON.stringify(input),hash=createHash('sha256').update(text).digest('hex');
  const {data:previous,error:previousError}=await supabaseAdmin.from('solve_jobs').select('*').eq('student_id',student.id).eq('client_key',key).maybeSingle();if(previousError)throw previousError;
  if(previous){if(previous.request_hash!==hash)throw new SolveInputError('相同任務識別碼不能送出不同題目。',409);return NextResponse.json({job:await publicJob(previous)},{status:202});}
  const {data:active,error:activeError}=await supabaseAdmin.from('solve_jobs').select('*').eq('student_id',student.id).in('status',['uploading','queued','running']).maybeSingle();if(activeError)throw activeError;if(active)return NextResponse.json({job:await publicJob(active),reused:true},{status:202});
  const guard=await supabaseAdmin.rpc('consume_auth_rate_limit',{p_rate_key:`solve-job:${student.id}`,p_limit:6,p_window_seconds:60});if(guard.error)throw guard.error;if(!(Array.isArray(guard.data)?guard.data[0]:guard.data)?.allowed)throw new SolveInputError('送出次數較多，請稍後再試。',429);
  const id=randomUUID(),path=`${student.id}/${id}.json`,settings=await getAISolverSettings();
  const {error:insertError}=await supabaseAdmin.from('solve_jobs').insert({id,student_id:student.id,client_key:key,request_hash:hash,input_path:path,settings});
  if(insertError?.code==='23505'){const {data:race}=await supabaseAdmin.from('solve_jobs').select('*').eq('student_id',student.id).in('status',['uploading','queued','running']).maybeSingle();if(race)return NextResponse.json({job:await publicJob(race),reused:true},{status:202});throw new SolveInputError('這題已送出，請重新整理查看任務。',409);}if(insertError)throw insertError;
  createdId=id;
  const {error:uploadError}=await supabaseAdmin.storage.from(JOB_BUCKET).upload(path,text,{contentType:'application/json',upsert:false});if(uploadError)throw uploadError;
  const {error:queueError}=await supabaseAdmin.from('solve_jobs').update({status:'queued',stage:'queued',updated_at:new Date().toISOString()}).eq('id',id);if(queueError)throw queueError;
  // Never mark a job failed after a dispatch attempt: a lost acknowledgement may still have started it.
  createdId=null;
  let run;
  try{run=await start(solveWorkflow,[id]);await supabaseAdmin.from('solve_jobs').update({workflow_run_id:run.runId}).eq('id',id);}catch(error){console.error('Solve dispatch will be recovered by polling',error);}
  if(raw.background!==true&&run){await run.returnValue;const {data}=await supabaseAdmin.from('solve_jobs').select('*').eq('id',id).single();if(data?.result)return NextResponse.json(data.result,{status:data.http_status||200});}
  return NextResponse.json({job:{id,status:'queued',stage:'queued'}},{status:202});
 }catch(error){
  if(createdId)await finishJob(createdId,{error:'題目未成功送出，請重試。'},503).catch(()=>{});
  if(error instanceof SolveInputError)return NextResponse.json({error:error.message,...error.details},{status:error.status});
  console.error('Solve job submission failed',error);return NextResponse.json({error:'暫時無法送出題目，請稍後再試。'},{status:503});
 }
}
