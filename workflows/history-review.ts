import {beginHistoryBatch,nextHistoryChunk} from '@/lib/comparison/batch-steps';
import {comparisonSide,settleComparison} from '@/lib/comparison/steps';
import {sleep} from 'workflow';
export async function historyReviewWorkflow(id:string){
 'use workflow';
 if(!await beginHistoryBatch(id))return;
 for(;;){const ids=await nextHistoryChunk(id);if(!ids.length)return;
  await Promise.allSettled(ids.map(async caseId=>{await comparisonSide(caseId,'b');await settleComparison(caseId);}));
  await sleep('1s');
 }
}
