import {NextRequest,NextResponse} from 'next/server';
import {historyRecoveryCounts} from '@/lib/comparison/recovery';
import {start} from 'workflow/api';
import {historyReviewWorkflow} from '@/workflows/history-review';
import {randomUUID} from 'crypto';
import {supabaseAdmin as db} from '@/lib/supabase-admin';
import {requireAdminSession,getAccessibleClassIds,isSuperAdmin} from '@/lib/admin-access';
import {comparisonSettings,enqueueComparison,dispatchComparison,blindText} from '@/lib/comparison/server';
import {comparisonModels,validateConfig,isUuid,reserveTwd} from '@/lib/comparison/config';
import {calculateScore,validateRatings,RUBRIC_VERSION} from '@/lib/comparison/rubric';
import {normalizeChemicalStructure} from '@/lib/ai/router';
import {normalizeScienceDiagram} from '@/lib/science/diagram-engine';
export const maxDuration=60;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
class RequestError extends Error{constructor(message:string,public status=400){super(message);}}
function filters(request:NextRequest){
 const version=request.nextUrl.searchParams.get('version'),subject=request.nextUrl.searchParams.get('subject'),source=request.nextUrl.searchParams.get('source');
 if(version&&!isUuid(version))throw new RequestError('實驗版本錯誤。');
 if(subject&&!['physics','chemistry','biology','earth','auto'].includes(subject))throw new RequestError('科目錯誤。');
 if(source&&!['auto','manual','historical'].includes(source))throw new RequestError('來源錯誤。');
 return {version,subject,source};
}
function scopeQuery(classIds:string[]|null){
 let q=db.from('model_comparison_cases').select('*,model_comparison_reviews(*),solve_history!inner(student_id,students!inner(class_id))');
 if(classIds!==null)q=q.in('solve_history.students.class_id',classIds.length?classIds:['00000000-0000-0000-0000-000000000000']);return q;
}
async function accessibleCase(id:string,classIds:string[]|null){
 const {data,error}=await scopeQuery(classIds).eq('id',id).maybeSingle();if(error)throw error;if(!data)throw new RequestError('找不到題目或沒有存取權限。',404);return data;
}
function reviewOf(row:any){return Array.isArray(row.model_comparison_reviews)?row.model_comparison_reviews[0]:row.model_comparison_reviews;}
async function detail(row:any){
 const review=reviewOf(row),revealed=Boolean(review);const cfg=validateConfig(row.config);
 const {data:h,error}=await db.from('solve_history').select('question_note,reference_answer').eq('id',row.history_id).single();if(error)throw error;
 const images=await Promise.all((row.images as {path:string}[]).map(async image=>{const {data,error}=await db.storage.from('solve-images').createSignedUrl(image.path,600);if(error)throw error;return data.signedUrl;}));
 const slots=row.blind_swap?['b','a']:['a','b'];
 const answers=slots.map(s=>{
  const raw=row[`${s}_result`];
  const cleaned=raw?JSON.parse(blindText(JSON.stringify({answer:raw.answer,explanation:raw.explanation,options:raw.options,diagram:raw.diagram,chemicalStructure:raw.chemicalStructure}),cfg)):{};
  return {answer:cleaned.answer||'',explanation:cleaned.explanation||'',options:cleaned.options||'',diagram:normalizeScienceDiagram(cleaned.diagram,[]),chemicalStructure:normalizeChemicalStructure(cleaned.chemicalStructure),...(revealed?{model:cfg[s as 'a'|'b'].model,latencyMs:raw?.latencyMs,costUsd:raw?.usage?.estimatedCostUsd,reused:Boolean(raw?.historical),ratings:review[`${s}_ratings`],score:calculateScore(review[`${s}_ratings`])}:{})};
 });
 return {id:row.id,subject:row.subject,source:row.source,status:row.status,createdAt:row.created_at,images,note:h.question_note,referenceAnswer:h.reference_answer,referenceMode:cfg.referenceMode,answers,reviewed:revealed,review:revealed?{note:review.note,preference:review.preference==='tie'||review.preference==='neither'?review.preference:slots.indexOf(review.preference)===0?'left':'right'}:null};
}
export async function GET(request:NextRequest){
 try{
  const actor=await requireAdminSession(request);if(!actor)return json({error:'請先登入。'},401);
  const classIds=await getAccessibleClassIds(request,actor),mode=request.nextUrl.searchParams.get('mode')||'list';
  if(mode==='batches'){
   if(!isSuperAdmin(actor)||classIds!==null)return json({batches:[]});
   const {data:rows,error}=await db.from('model_review_batches').select('id,label,status,total,reason,created_at').order('created_at',{ascending:false}).limit(10);if(error)throw error;
   const batches=await Promise.all(rows.map(async row=>{const {data,error}=await db.rpc('historical_luna_batch_progress',{p_batch:row.id});if(error)throw error;return {...row,progress:data};}));return json({batches});
  }
  if(mode==='settings'){
   const settings=await comparisonSettings();let q=db.from('classes').select('id,name').order('name');if(classIds!==null)q=q.in('id',classIds);
   const {data:classes,error}=await q;if(error)throw error;
   return json({...settings,models:comparisonModels(),classes,canEdit:isSuperAdmin(actor)&&classIds===null,reserveTwd:reserveTwd(settings.config)});
  }
  if(mode==='detail'){
   const id=request.nextUrl.searchParams.get('id');if(!isUuid(id))throw new RequestError('題目識別碼錯誤。');const row=await accessibleCase(id,classIds);return json(await detail(row));
  }
  const f=filters(request);
  if(mode==='stats'){
   // Page all matching records; never silently compute percentages from one API page.
   const rows:any[]=[];let offset=0;
   for(;;){let q=scopeQuery(classIds).order('id');if(f.version)q=q.eq('version',f.version);if(f.subject)q=q.eq('subject',f.subject);if(f.source)q=q.eq('source',f.source);
    const {data,error}=await q.range(offset,offset+499);if(error)throw error;rows.push(...data);if(data.length<500)break;offset+=500;if(offset>=10000)throw new RequestError('資料超過一萬題，請先縮小實驗或科目範圍。');}
   const groups:Record<string,any>={};
   for(const row of rows){const c=validateConfig(row.config),r=reviewOf(row);for(const side of ['a','b'] as const){
    const key=[row.version,row.source,row.subject,c.referenceMode,side].join(':');
    const g=groups[key]??={key,version:row.version,source:row.source,subject:row.subject,referenceMode:c.referenceMode,model:c[side].model,reasoning:c[side].reasoning,total:0,success:0,reviewed:0,paired:0,correct:0,scored:0,scoreSum:0,majorErrors:0,wins:0,ties:0,neither:0,costUsd:0,unknownCost:0,latencies:[]};
    g.total++;const result=row[`${side}_result`];if(row[`${side}_status`]==='succeeded')g.success++;if(typeof result?.usage?.estimatedCostUsd==='number')g.costUsd+=result.usage.estimatedCostUsd;else g.unknownCost++;
    if(typeof result?.latencyMs==='number')g.latencies.push(result.latencyMs);
    if(r){g.reviewed++;const ratings=r[`${side}_ratings`];if(r.a_ratings.answer!=='unknown'&&r.b_ratings.answer!=='unknown'){g.paired++;if(ratings.answer==='1')g.correct++;}
     if(r.a_score!==null&&r.b_score!==null){g.scored++;g.scoreSum+=Number(r[`${side}_score`]);}
     if(ratings.answer==='0'||ratings.reasoning==='0')g.majorErrors++;if(r.preference===side)g.wins++;if(r.preference==='tie')g.ties++;if(r.preference==='neither')g.neither++;
    }
   }}
   return json({cases:rows.length,groups:Object.values(groups).map(g=>{g.latencies.sort((a:number,b:number)=>a-b);return {...g,latencies:undefined,accuracy:g.paired?g.correct/g.paired:null,averageScore:g.scored?g.scoreSum/g.scored:null,averageMs:g.latencies.length?g.latencies.reduce((a:number,b:number)=>a+b,0)/g.latencies.length:null,p95Ms:g.latencies.length?g.latencies[Math.ceil(g.latencies.length*.95)-1]:null};})});
  }
  const params=request.nextUrl.searchParams;
  const page=Number(params.get('page')||0),pageSize=Number(params.get('pageSize')||10),sort=params.get('sort')||'newest',search=(params.get('q')||'').trim();
  if(!Number.isInteger(page)||page<0||page>10000||![10,20,30,50].includes(pageSize)||!['newest','oldest'].includes(sort)||search.length>100)throw new RequestError('分頁或搜尋條件錯誤。');
  let q=db.from('model_comparison_cases').select('id,history_id,created_at,subject,source,version,status,model_comparison_reviews(id),solve_history!inner(question_note,students!inner(class_id))');
  if(classIds!==null)q=q.in('solve_history.students.class_id',classIds.length?classIds:['00000000-0000-0000-0000-000000000000']);
  q=q.order('created_at',{ascending:sort==='oldest'}).order('id',{ascending:sort==='oldest'});
  if(f.version)q=q.eq('version',f.version);if(f.subject)q=q.eq('subject',f.subject);if(f.source)q=q.eq('source',f.source);
  if(search){const pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';if(isUuid(search))q=q.eq('history_id',search);else q=q.ilike('solve_history.question_note',pattern);}
  const {data,error}=await q.range(page*pageSize,page*pageSize+pageSize);if(error)throw error;
  return json({pageSize,hasMore:data.length>pageSize,items:data.slice(0,pageSize).map(r=>({id:r.id,historyId:r.history_id,note:(r.solve_history as any)?.question_note||'',createdAt:r.created_at,subject:r.subject,source:r.source,version:r.version,status:r.status,reviewed:Boolean(reviewOf(r))}))});
 }catch(error){console.error('Comparison GET',error);return json({error:error instanceof RequestError?error.message:'讀取模型比較失敗，請稍後再試。'},error instanceof RequestError?error.status:503);}
}
export async function POST(request:NextRequest){
 try{
  const actor=await requireAdminSession(request);if(!actor)return json({error:'請先登入。'},401);
  if(request.headers.get('origin')&&new URL(request.headers.get('origin')!).host!==request.headers.get('host'))return json({error:'請由管理頁面操作。'},403);
  const classIds=await getAccessibleClassIds(request,actor);const body=await request.json();
  if(body.action==='pauseBatch'||body.action==='resumeBatch'){
   if(!isSuperAdmin(actor)||classIds!==null)return json({error:'只有總管理員可操作批次。'},403);if(!isUuid(body.id))throw new RequestError('批次識別碼錯誤。');
   if(body.action==='pauseBatch'){const {error}=await db.from('model_review_batches').update({status:'paused',reason:'管理員暫停；已送出的呼叫仍會完成。'}).eq('id',body.id).eq('status','running');if(error)throw error;return json({ok:true});}
   const {data:progress,error:pe}=await db.rpc('historical_luna_batch_progress',{p_batch:body.id});if(pe)throw pe;
   if(progress.running)throw new RequestError('仍有執行中的模型呼叫，請稍後再繼續。');
   if((await historyRecoveryCounts(body.id)).blocked)throw new RequestError('修復後仍有模型失敗，請先檢查錯誤紀錄，避免再次付費失敗。');
   const {data:changed,error}=await db.from('model_review_batches').update({status:'queued',workflow_id:null}).eq('id',body.id).in('status',['paused','queued']).select('id');if(error)throw error;if(!changed?.length)throw new RequestError('批次狀態已變更。');
   const run=await start(historyReviewWorkflow,[body.id]);const {error:we}=await db.from('model_review_batches').update({workflow_id:run.runId}).eq('id',body.id);if(we)throw we;return json({ok:true});
  }
  if(body.action==='settings'){
   if(!isSuperAdmin(actor)||classIds!==null)return json({error:'只有總管理員可調整比較設定。'},403);
   let cfg;try{cfg=validateConfig(body.config);}catch(e){throw new RequestError((e as Error).message);}
   const current=await comparisonSettings();
   if(current.version!==body.version)throw new RequestError('設定已被更新，請重新整理後再修改。',409);
   const version=randomUUID();
   if(current.version){const {data,error}=await db.from('model_comparison_settings').update({version,config:cfg,updated_at:new Date().toISOString()}).eq('id',true).eq('version',current.version).select('id');if(error)throw error;if(!data?.length)throw new RequestError('設定已變更。',409);}
   else{const {error}=await db.from('model_comparison_settings').insert({id:true,version,config:cfg});if(error)throw error;}
   return json({ok:true,version});
  }
  if(body.action==='manual'){
   if(!isUuid(body.historyId))throw new RequestError('題目識別碼錯誤。');
   const {data:h,error}=await db.from('solve_history').select('id,students!inner(class_id)').eq('id',body.historyId).maybeSingle();if(error)throw error;
   const student=(Array.isArray(h?.students)?h.students[0]:h?.students) as {class_id?:string}|undefined;
   if(!h||classIds!==null&&!classIds.includes(student?.class_id||''))throw new RequestError('找不到題目或沒有權限。',404);
   const {data:guard,error:guardError}=await db.rpc('consume_auth_rate_limit',{p_rate_key:`comparison:${actor.userId}`,p_limit:6,p_window_seconds:60});if(guardError)throw guardError;if(!(Array.isArray(guard)?guard[0]:guard)?.allowed)throw new RequestError('操作太頻繁，請稍後重試。',429);
   try{return json({id:await enqueueComparison(body.historyId,'manual')});}catch(e){throw new RequestError(e instanceof Error?e.message:'無法加入比較，請檢查設定或每日上限。');}
  }
  if(!isUuid(body.id))throw new RequestError('題目識別碼錯誤。');const row=await accessibleCase(body.id,classIds);
  if(body.action==='dispatch'){
   if(!isSuperAdmin(actor))throw new RequestError('只有總管理員可恢復派工。',403);
   if(row.status!=='queued'||row.workflow_id)throw new RequestError('任務已派送；不重送可能計費的呼叫。');
   await dispatchComparison(row.id);return json({ok:true});
  }
  if(body.action!=='review')throw new RequestError('不支援的操作。');
  if(row.status!=='ready')throw new RequestError('兩模型尚未成功完成。',409);if(reviewOf(row))throw new RequestError('此題已評閱，請重新整理。',409);
  let left,right;try{left=validateRatings(body.left,row.images.length>0);right=validateRatings(body.right,row.images.length>0);}catch(e){throw new RequestError((e as Error).message);}
  if(!['left','right','tie','neither'].includes(body.preference)||typeof body.note!=='string'||body.note.length>1000)throw new RequestError('請完成整體偏好，備註限 1,000 字。');
  const a=row.blind_swap?right:left,b=row.blind_swap?left:right,as=calculateScore(a),bs=calculateScore(b);
  const preference=body.preference==='left'?(row.blind_swap?'b':'a'):body.preference==='right'?(row.blind_swap?'a':'b'):body.preference;
  const {error}=await db.from('model_comparison_reviews').insert({case_id:row.id,reviewer_id:actor.userId,a_ratings:a,b_ratings:b,a_score:as.score,b_score:bs.score,a_grade:as.grade,b_grade:bs.grade,preference,note:body.note.trim(),rubric_version:RUBRIC_VERSION});if(error?.code==='23505')throw new RequestError('另一位老師已完成評閱，請重新整理。',409);if(error)throw error;
  return json({ok:true});
 }catch(error){console.error('Comparison POST',error);return json({error:error instanceof RequestError?error.message:'儲存失敗，請稍後再試。'},error instanceof RequestError?error.status:503);}
}
