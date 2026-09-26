"use client";
import {useEffect,useRef,useState} from 'react';
export type SolveJob={id:string;status:string;stage:string;createdAt?:string;result?:any;httpStatus?:number;images?:string[]};
export const solveStages:Record<string,string>={uploading:'正在上傳題目',queued:'已排入解題佇列',science_gate:'正在辨識題目與科目',primary:'正在分析與解題',verifier:'正在交叉驗算',arbiter:'正在核對不同解法',saving:'正在儲存解析',complete:'解題已完成',failed:'本次解題未完成'};
export function useSolveJob(studentId:string|undefined,onComplete:(job:SolveJob)=>void,onFailed:(job:SolveJob)=>void){
 const [job,setJob]=useState<SolveJob|null>(null),[connectionError,setConnectionError]=useState('');
 const callbacks=useRef({onComplete,onFailed});callbacks.current={onComplete,onFailed};
 const handled=useRef('');
 useEffect(()=>{let alive=true;if(!studentId){setJob(null);handled.current='';return;}
 fetch('/api/solve-jobs',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(alive)setJob(d.job||null)}).catch(()=>{if(alive)setConnectionError('暫時無法確認背景任務，請稍後重新整理。')});return()=>{alive=false;};},[studentId]);
 useEffect(()=>{if(!studentId||!job)return;if(['succeeded','failed'].includes(job.status)){if(handled.current!==job.id){handled.current=job.id;job.status==='succeeded'?callbacks.current.onComplete(job):callbacks.current.onFailed(job);}return;}
 let alive=true,timer:ReturnType<typeof setTimeout>;
 async function poll(){try{const r=await fetch(`/api/solve-jobs?id=${job!.id}`,{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(alive){if(d.job)setJob(d.job);setConnectionError('');}}catch{if(alive)setConnectionError('連線暫時中斷；背景任務仍會繼續，恢復連線後會自動更新。');}finally{if(alive)timer=setTimeout(poll,4000);}}
 void poll();return()=>{alive=false;clearTimeout(timer);};},[studentId,job?.id,job?.status]);
 async function dismiss(){if(job){const id=job.id;const response=await fetch('/api/solve-jobs',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});if(!response.ok)throw Error('更新任務失敗。');setJob(current=>current?.id===id?null:current);}}
 async function retry(){if(!job)return;const r=await fetch('/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({retryOf:job.id,clientKey:crypto.randomUUID(),background:true})}),d=await r.json();if(!r.ok)throw Error(d.error);setJob(d.job);setConnectionError('');}
 return {job,adopt:setJob,dismiss,retry,connectionError,running:Boolean(job&&['uploading','queued','running'].includes(job.status))};
}
