import 'server-only';
import {createHash} from 'crypto';
import {supabaseAdmin as db} from '@/lib/supabase-admin';
import {DEFAULT_CONFIG,validateConfig,reserveTwd,type ComparisonConfig} from './config';
import {buildPrimaryPrompt} from '@/lib/ai/prompts';
import {buildTeachingContext} from '@/lib/teaching-engine';
import {start} from 'workflow/api';
import {comparisonWorkflow} from '@/workflows/comparison';
import {AI_MODELS} from '@/lib/ai-models';
export async function comparisonSettings(){
 const {data,error}=await db.from('model_comparison_settings').select('*').eq('id',true).maybeSingle();if(error)throw error;
 return data?{version:String(data.version),config:validateConfig(data.config)}:{version:null,config:DEFAULT_CONFIG};
}
export async function dispatchComparison(id:string){
 const run=await start(comparisonWorkflow,[id]);
 const {error}=await db.from('model_comparison_cases').update({workflow_id:run.runId}).eq('id',id).is('workflow_id',null);if(error)throw error;
}
export async function enqueueComparison(historyId:string,source:'auto'|'manual'){
 const settings=await comparisonSettings();const c=settings.config;
 if(!settings.version){if(source==='auto')return null;throw Error('請先儲存比較設定。');}
 if(source==='auto'&&(!c.enabled||c.percentage===0))return null;
 const {data:h,error}=await db.from('solve_history').select('id,student_id,subject,question_note,reference_answer,image_paths,students(class_id)').eq('id',historyId).single();if(error)throw error;
 const student=(Array.isArray(h.students)?h.students[0]:h.students) as {class_id?:string}|null;
 if(source==='auto'){
  if(!c.subjects.includes(h.subject)||c.classIds.length&&!c.classIds.includes(student?.class_id||''))return null;
  const n=createHash('sha256').update(`${settings.version}:${historyId}`).digest().readUInt32BE(0)/0x100000000*100;if(n>=c.percentage)return null;
 }
 // Persist one prompt; neither model sees the production answer or the other response.
 const teachingContext=await buildTeachingContext(h.subject,{referenceAnswer:c.referenceMode==='provided'?h.reference_answer:undefined,questionNote:h.question_note});
 const prompt=buildPrimaryPrompt({subject:h.subject,questionNote:h.question_note||'',referenceAnswer:c.referenceMode==='provided'?h.reference_answer||'':'',teachingContext})+'\n不要自述模型名稱、供應商或版本。';
 if(Buffer.byteLength(prompt)>32000)throw Error('題目與教學規則過長，暫不納入比較。');
 const paths=h.image_paths;if(!Array.isArray(paths)||!paths.length||paths.length>4)throw Error('此題沒有可用圖片，或圖片超過四張。');
 if(paths.some((x:{path?:string})=>!x.path?.startsWith(h.student_id+'/')))throw Error('圖片路徑不正確。');
 const {data:id,error:reserveError}=await db.rpc('reserve_model_comparison',{p_history:historyId,p_version:settings.version,p_source:source,p_subject:h.subject,p_prompt:prompt,p_images:paths,p_reserve:reserveTwd(c)});if(reserveError)throw reserveError;
 if(!id){if(source==='manual')throw Error('今日比較題數或預估預算已達上限。');return null;}
 const {data:existing}=await db.from('model_comparison_cases').select('status,workflow_id').eq('id',id).single();
 if(existing?.status==='queued'&&!existing.workflow_id)await dispatchComparison(id);
 return id as string;
}
export function blindText(text:unknown,config:ComparisonConfig):string{
 let value=typeof text==='string'?text:'';
 const terms=[...Object.values(AI_MODELS).flatMap(m=>[m.id,m.name]),config.a.model,config.b.model,'OpenAI','Google','Gemini','GPT','ChatGPT'];
 for(const term of [...new Set(terms)].sort((a,b)=>b.length-a.length))value=value.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'［模型］');
 return value;
}
