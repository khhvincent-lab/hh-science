import {NextRequest} from 'next/server';
import {supabaseAdmin} from './supabase-admin';
import {verifySessionToken} from './session';
import {imageMime,validImageId} from './teaching-images';
import type {AISolverSettings} from './ai-settings';
export const JOB_BUCKET='solve-job-inputs';
export class SolveInputError extends Error{constructor(message:string,public status=400,public details:Record<string,unknown>={}){super(message)}}
export async function jobStudent(request:NextRequest){
 const session=verifySessionToken(request.cookies.get('hh_science_session')?.value||'');
 if(!session)throw new SolveInputError('請先登入。',401);
 const {data,error}=await supabaseAdmin.from('students').select('id,name,campus,class_id,active,must_change_pin').eq('id',session.studentId).maybeSingle();
 if(error)throw new SolveInputError('暫時無法讀取帳號。',503);
 if(!data?.active||data.must_change_pin)throw new SolveInputError('請重新登入並完成密碼設定。',403);
 return data;
}
export function validateSolveInput(raw:any){
 if(!Array.isArray(raw?.images)||raw.images.length<1||raw.images.length>5)throw new SolveInputError('請上傳 1～5 張題目圖片。');
 let size=0;
 const images=raw.images.map((v:unknown)=>{if(typeof v!=='string')throw new SolveInputError('圖片格式錯誤。');size+=v.length;if(size>4_000_000)throw new SolveInputError('圖片總容量過大，請裁切或減少張數。',413);const m=v.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!m||imageMime(Buffer.from(m[2],'base64'))!==m[1])throw new SolveInputError('圖片格式不支援。');return v;});
 const subject=String(raw.subject||'');if(!['physics','chemistry','biology','earth','auto'].includes(subject))throw new SolveInputError('請選擇科目。');
 return {images,subject,referenceAnswer:String(raw.referenceAnswer||'').slice(0,2000),questionNote:String(raw.questionNote||'').slice(0,4000),imageQuality:Array.isArray(raw.imageQuality)?raw.imageQuality.slice(0,5):[]};
}
export async function checkSubject(student:{class_id:string|null},subject:string){
 if(!student.class_id)throw new SolveInputError('尚未設定班級，請聯絡老師。',403);
 const {data,error}=await supabaseAdmin.from('classes').select('allowed_subjects').eq('id',student.class_id).maybeSingle();
 if(error)throw new SolveInputError('暫時無法讀取科目設定。',503);
 if(!data?.allowed_subjects?.includes(subject))throw new SolveInputError('班級尚未開放這個科目。',403,{code:'SUBJECT_NOT_ALLOWED',allowedSubjects:data?.allowed_subjects||[]});
}
export async function readJob(id:string){
 const {data,error}=await supabaseAdmin.from('solve_jobs').select('*').eq('id',id).single();if(error||!data)throw Error('找不到解題任務');return data;
}
export async function jobInput(id:string){
 const job=await readJob(id);if(job.status!=='running')throw Error('任務已停止');if(!job.input_path)throw Error('題目暫存已過期，請重新上傳');
 const {data,error}=await supabaseAdmin.storage.from(JOB_BUCKET).download(job.input_path);if(error||!data)throw Error('讀取題目圖片失敗');
 const input=validateSolveInput(JSON.parse(await data.text()));
 const {data:student,error:se}=await supabaseAdmin.from('students').select('id,name,campus,class_id,active,must_change_pin').eq('id',job.student_id).single();
 if(se||!student?.active||student.must_change_pin)throw Error('帳號狀態已變更，請重新登入');await checkSubject(student,input.subject);
 return {job,input,student,settings:job.settings as AISolverSettings};
}
export async function setJobStage(id:string,stage:string){const {error}=await supabaseAdmin.from('solve_jobs').update({stage,updated_at:new Date().toISOString()}).eq('id',id).eq('status','running');if(error)throw error;}
export async function finishJob(id:string,result:Record<string,unknown>,status:number,historyId:string|null=null){const {error}=await supabaseAdmin.rpc('finish_solve_job',{p_job:id,p_result:result,p_status:status,p_history:historyId});if(error)throw error;}
export async function publicJob(job:any){
 let images:string[]=[];
 if(job.status==='succeeded'&&job.history_id){const {data}=await supabaseAdmin.from('solve_history').select('image_paths').eq('id',job.history_id).eq('student_id',job.student_id).maybeSingle();if(Array.isArray(data?.image_paths)){images=(await Promise.all(data.image_paths.map(async(x:any)=>{const {data}=await supabaseAdmin.storage.from('solve-images').createSignedUrl(x.path,3600);return data?.signedUrl||'';}))).filter(Boolean);}}
 return {id:job.id,status:job.status,stage:job.stage,result:job.result,httpStatus:job.http_status,createdAt:job.created_at,images};
}
export {validImageId};
