import {beginJob,gateJob,gateDecision,reserveJob,routeJob,completeJob,failJob} from '@/lib/solve-job-steps';
export async function solveWorkflow(id:string){
 'use workflow';
 // A second dispatch is harmless: only one run can acquire the queued job.
 if(!await beginJob(id))return;
 try{
  const gate=await gateJob(id);const rejection=await gateDecision(id,gate);
  if(rejection)return await failJob(id,rejection.result,rejection.status);
  const quota=await reserveJob(id);
  if(!quota.allowed)return await failJob(id,{error:`今日 ${quota.limit} 題額度已用完。`,usage:{count:quota.count,limit:quota.limit,remaining:0}},429);
  const routed=await routeJob(id,gate);
  return await completeJob(id,routed,quota);
 }catch{
  return await failJob(id,{error:'解題未能完成，已釋放本題額度。請稍後重試；不會自動重送付費模型請求。',code:'SOLVE_JOB_FAILED'},500);
 }
}
