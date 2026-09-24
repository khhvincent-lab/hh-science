import {supabaseAdmin} from './supabase-admin';
import {readJob,jobInput,setJobStage,finishJob,JOB_BUCKET} from './solve-jobs';
import {runScienceGate,runAIRouter} from './ai/router';
import {solveJobContext} from './solve-job-context';
import type {RouterResult} from './ai/router';
import {FatalError} from 'workflow';

export async function beginJob(id:string){
 'use step';
 const {data,error}=await supabaseAdmin.from('solve_jobs').update({status:'running',stage:'science_gate',updated_at:new Date().toISOString()}).eq('id',id).eq('status','queued').select('id');if(error)throw error;return Boolean(data?.length);
}
async function claimPaidPhase(id:string,phase:string){
 const {error}=await supabaseAdmin.from('solve_job_calls').insert({job_id:id,phase});
 if(error?.code==='23505')throw new FatalError('此模型步驟已送出，為避免重複計費，不自動重送。請稍後查看結果或重試。');
 if(error)throw error;
}
export async function gateJob(id:string){
 'use step';
 const {input,student,settings}=await jobInput(id);await claimPaidPhase(id,'gate');
 return solveJobContext.run({settings,onStage:stage=>setJobStage(id,stage)},()=>runScienceGate({...input,studentId:student.id,campus:student.campus}));
}
gateJob.maxRetries=0;
export async function reserveJob(id:string){
 'use step';
 const job=await readJob(id),limit=job.settings.dailyLimit;const {data,error}=await supabaseAdmin.rpc('reserve_solve_job_quota',{p_job:id,p_limit:limit});if(error)throw error;return {allowed:Boolean(data.allowed),count:Number(data.count),limit};
}
export async function routeJob(id:string,gate:Awaited<ReturnType<typeof runScienceGate>>){
 'use step';
 const {input,student,settings}=await jobInput(id);await claimPaidPhase(id,'router');
 return solveJobContext.run({settings,onStage:stage=>setJobStage(id,stage)},()=>runAIRouter({...input,studentId:student.id,campus:student.campus},gate));
}
routeJob.maxRetries=0;
export async function completeJob(id:string,routed:RouterResult,quota:{count:number;limit:number}){
 'use step';
 const job=await readJob(id);if(job.status==='succeeded')return job.result;
 if(job.status==='failed')throw new FatalError('任務已結束。');
 await setJobStage(id,'saving');
 const {input}=await jobInput(id);
 const imagePaths=[];
 for(let i=0;i<input.images.length;i++){
  const match=input.images[i].match(/^data:([^;]+);base64,(.+)$/)!;const extension=match[1]==='image/png'?'png':match[1]==='image/webp'?'webp':'jpg';const path=`${job.student_id}/jobs/${id}/${i}.${extension}`;
  const {error}=await supabaseAdmin.storage.from('solve-images').upload(path,Buffer.from(match[2],'base64'),{contentType:match[1],upsert:true});if(error)throw error;
  imagePaths.push({path,mimeType:match[1],order:i});
 }
 const {data:existing,error:existingError}=await supabaseAdmin.from('solve_history').select('id').eq('solve_job_id',id).maybeSingle();if(existingError)throw existingError;
 let historyId=existing?.id;
 if(!historyId){
  const {data,error}=await supabaseAdmin.from('solve_history').insert({solve_job_id:id,student_id:job.student_id,subject:input.subject,image_paths:imagePaths,reference_answer:input.referenceAnswer||null,question_note:input.questionNote||null,answer:routed.result.answer,explanation:routed.result.explanation,options:routed.result.options,annotations:routed.result.annotations,diagram:routed.result.diagram,chemical_structure:routed.result.chemicalStructure,primary_provider:routed.models.primary.provider,primary_model:routed.models.primary.model,primary_answer:routed.trace.primaryAnswer,verifier_provider:routed.models.verifier?.provider||null,verifier_model:routed.models.verifier?.model||null,verifier_result:routed.trace.verifier||null,arbiter_provider:routed.models.arbiter?.provider||null,arbiter_model:routed.models.arbiter?.model||null,arbiter_answer:routed.trace.arbiterAnswer,arbitration_trigger:routed.route.arbitrationTrigger,dispute_status:routed.route.disputeStatus}).select('id').single();
  if(error?.code==='23505'){const {data:found}=await supabaseAdmin.from('solve_history').select('id').eq('solve_job_id',id).single();historyId=found?.id;}else if(error)throw error;else historyId=data?.id;
 }
 if(!historyId)throw Error('解題紀錄尚未儲存完成');
 const {error:usageError}=await supabaseAdmin.from('api_usage').update({solve_history_id:historyId}).eq('request_id',routed.requestId);if(usageError)throw usageError;
 const result={...routed.result,historyId,usage:{...quota,remaining:Math.max(0,quota.limit-quota.count)},ai:{...routed.models,...routed.route}};
 await finishJob(id,result,200,historyId);
 // Completed images are persisted in solve-images; temporary input is no longer needed.
 if(job.input_path){const {error}=await supabaseAdmin.storage.from(JOB_BUCKET).remove([job.input_path]);if(!error)await supabaseAdmin.from('solve_jobs').update({input_path:null}).eq('id',id);}
 return result;
}
completeJob.maxRetries=5;
export async function failJob(id:string,result:Record<string,unknown>,status:number){
 'use step';
 await finishJob(id,result,status);return result;
}
failJob.maxRetries=5;
export async function gateDecision(id:string,gate:Awaited<ReturnType<typeof runScienceGate>>){
 'use step';
 const {input}=await jobInput(id);const g=gate.gate;
 if(!g.allowed)return {status:422,result:{error:g.rejectionType==='invalid_image'?`圖片不夠清楚：${g.reason||'請重新拍攝完整題目。'}`:'目前僅支援自然科題目。',code:g.rejectionType==='invalid_image'?'INVALID_IMAGE':'NON_SCIENCE'}};
 if(['physics','chemistry','biology','earth'].includes(input.subject)&&['physics','chemistry','biology','earth'].includes(g.category)&&input.subject!==g.category&&g.confidence>=85)return {status:422,result:{error:'圖片題目與所選科目不同，請確認後重新選擇。',code:'SUBJECT_MISMATCH',detectedSubject:g.category}};
 return null;
}
