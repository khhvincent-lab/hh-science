import {supabaseAdmin as db} from '@/lib/supabase-admin';
export async function beginHistoryBatch(id:string){
 'use step';
 const {data,error}=await db.from('model_review_batches').update({status:'running',reason:null}).eq('id',id).eq('status','queued').select('id');if(error)throw error;return Boolean(data?.length);
}
export async function nextHistoryChunk(id:string){
 'use step';
 const {data:batch,error}=await db.from('model_review_batches').select('status,config').eq('id',id).single();if(error)throw error;if(batch.status!=='running')return [] as string[];
 const {data:progress,error:pe}=await db.rpc('historical_luna_batch_progress',{p_batch:id});if(pe)throw pe;
 let reason='';
 if(progress.running)reason='先前模型呼叫結果尚未確認，已暫停，避免重複計費。';
 if(progress.failed-progress.notCalled>=3||(!progress.succeeded&&progress.failed>progress.notCalled))reason='模型呼叫未通過或累積失敗，已暫停，請檢查模型權限及額度。';
 if(progress.committedTwd+2>(batch.config.dailyBudgetTwd||300))reason='批次預估預算已達上限，已暫停。';
 if(reason){const {error:e}=await db.from('model_review_batches').update({status:'paused',reason}).eq('id',id).eq('status','running');if(e)throw e;return [];}
 const {data:items,error:ie}=await db.from('model_comparison_cases').select('id').eq('batch_id',id).eq('b_status','queued').order('created_at').order('id').limit(progress.succeeded?4:1);if(ie)throw ie;
 if(!items.length){const {error:e}=await db.from('model_review_batches').update({status:progress.running?'paused':'completed',reason:progress.running?'有中斷工作，為避免重複付費不自動重送。':null}).eq('id',id).eq('status','running');if(e)throw e;}
 return items.map(row=>String(row.id));
}
