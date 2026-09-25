import {supabaseAdmin as db} from '@/lib/supabase-admin';
import {FORMAT_REVISION} from './output';
export function recoveryCounts(rows:{b_status:string;format_revision:string|null;error:string|null;not_called:string|null}[]){
 let succeeded=0,failed=0;
 for(const row of rows){
  if(row.b_status==='succeeded'&&Number(row.format_revision)===FORMAT_REVISION)succeeded++;
  if(row.b_status!=='failed'||row.not_called==='true')continue;
  // Preserve old failures and their costs; only this known pre-fix format error
  // is excluded from the new revision's circuit breaker. Never requeue it.
  if(!row.format_revision&&row.error==='模型回傳格式不完整')continue;
  failed++;
 }
 return {succeeded,failed,blocked:failed>=3||(!succeeded&&failed>0)};
}
export async function historyRecoveryCounts(id:string){
 const rows=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from('model_comparison_cases').select('b_status,format_revision:b_result->>formatRevision,error:b_result->>error,not_called:b_result->>notCalled').eq('batch_id',id).order('id').range(offset,offset+499);
  if(error)throw error;rows.push(...data);if(data.length<500)break;
 }
 return recoveryCounts(rows);
}
