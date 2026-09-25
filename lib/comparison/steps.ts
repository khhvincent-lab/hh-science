import {supabaseAdmin as db} from '@/lib/supabase-admin';
import {runOpenAISolver} from '@/lib/solvers/openai';
import {runGeminiSolver} from '@/lib/solvers/gemini';
import {getAIModel} from '@/lib/ai-models';
import {FORMAT_REVISION,OUTPUT_CONTRACT,parseComparisonOutput} from './output';
import {validateConfig} from './config';
export async function comparisonSide(id:string,side:'a'|'b'){
 'use step';
 // Atomic claim before any paid call. A replay never sends another provider request.
 const {data:claimed,error:claimError}=await db.from('model_comparison_cases').update({[`${side}_status`]:'running',status:'running'}).eq('id',id).eq(`${side}_status`,'queued').select('*').maybeSingle();if(claimError)throw claimError;if(!claimed)return;
 let payload:Record<string,unknown>;let state:'succeeded'|'failed'='failed';
 try{
  const config=validateConfig(claimed.config),slot=config[side];
  if(Buffer.byteLength(claimed.prompt)>32000||!Array.isArray(claimed.images)||claimed.images.length>4||claimed.images.length===0)throw Error('比較輸入超過限制或無圖');
  const images:string[]=[];
  for(const entry of claimed.images as {path:string;mimeType:string}[]){
   const {data,error}=await db.storage.from('solve-images').download(entry.path);if(error||!data)throw Error('圖片讀取失敗');
   if(data.size>8*1024*1024)throw Error('圖片過大');
   images.push(`data:${entry.mimeType||data.type};base64,${Buffer.from(await data.arrayBuffer()).toString('base64')}`);
  }
 const request={...slot,prompt:claimed.prompt+OUTPUT_CONTRACT,images,expectJson:true,jsonMode:true,maxOutputTokens:8192};
  const response=await (getAIModel(slot.model).provider==='openai'?runOpenAISolver(request):runGeminiSolver(request));
  const parsed=parseComparisonOutput(response.text);
  const complete=!response.responseStatus||response.responseStatus==='completed';
  payload={formatRevision:FORMAT_REVISION,usage:response.usage,latencyMs:response.latencyMs,responseId:response.responseId,responseStatus:response.responseStatus,incompleteReason:response.incompleteReason,...(parsed.ok&&complete?parsed.result:{error:'模型回傳格式不完整',errorCode:!complete?'incomplete_response':!parsed.ok?parsed.code:'unknown',rawText:response.text.slice(0,100000),rawTruncated:response.text.length>100000})};
  state=parsed.ok&&complete?'succeeded':'failed';
 }catch(error){const status=typeof error==='object'&&error&&'status' in error?Number(error.status):null;payload={formatRevision:FORMAT_REVISION,error:'模型或圖片處理失敗；可能已有供應商費用，未自動重送。',errorStatus:status!==null&&Number.isFinite(status)?status:null};console.error('Comparison provider failure',{caseId:id,side,status});}
 const {error}=await db.from('model_comparison_cases').update({[`${side}_status`]:state,[`${side}_result`]:payload}).eq('id',id).eq(`${side}_status`,'running');if(error)throw error;
}
comparisonSide.maxRetries=0;
export async function settleComparison(id:string){'use step';const {error}=await db.rpc('settle_model_comparison',{p_id:id});if(error)throw error;}
settleComparison.maxRetries=5;
