import { randomUUID } from 'crypto';
import { NextRequest,NextResponse } from 'next/server';
import { requireAdminSession,isSuperAdmin } from '@/lib/admin-access';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { TEACHING_IMAGE_BUCKET,IMAGE_SUBJECTS,imageMime,validImageId } from '@/lib/teaching-images';
function metadata(raw:any){
 const title=String(raw.title||'').trim(),subject=String(raw.subject||''),description=String(raw.description||'').trim();
 const keywords=(Array.isArray(raw.keywords)?raw.keywords:String(raw.keywords||'').split(/[,，、\n]/)).map((x:unknown)=>String(x).trim()).filter(Boolean);
 if(!title||title.length>80||!IMAGE_SUBJECTS.includes(subject)||description.length>1500||!description||!keywords.length||keywords.length>20||keywords.some((x:string)=>x.length>40))throw new Error('請填寫標題、科目、使用說明及 1–20 個關鍵字（每個最多 40 字）。');
 return {title,subject,description,keywords:[...new Set(keywords)]};
}
export async function GET(request:NextRequest){
 const actor=await requireAdminSession(request);if(!actor)return NextResponse.json({error:'請先登入。'},{status:401});
 const {data,error}=await supabaseAdmin.from('teaching_images').select('id,title,subject,description,keywords,enabled,created_at').is('deleted_at',null).order('created_at',{ascending:false}).limit(500);
 return error?NextResponse.json({error:'讀取圖庫失敗。'},{status:500}):NextResponse.json({items:data,canEdit:isSuperAdmin(actor)});
}
export async function POST(request:NextRequest){
 const actor=await requireAdminSession(request);if(!actor)return NextResponse.json({error:'請先登入。'},{status:401});if(!isSuperAdmin(actor))return NextResponse.json({error:'只有總管理員可以管理共用教學圖庫。'},{status:403});
 try{
  if(Number(request.headers.get('content-length')||0)>4*1024*1024)return NextResponse.json({error:'圖片請控制在 3 MB 以內。'},{status:413});
  const form=await request.formData(),file=form.get('file');const fields=metadata(Object.fromEntries(form));
  if(!(file instanceof File)||file.size<16||file.size>3*1024*1024)return NextResponse.json({error:'請上傳 3 MB 以內的 PNG、JPEG 或 WebP 圖片。'},{status:400});
  const bytes=Buffer.from(await file.arrayBuffer()),mime=imageMime(bytes);if(!mime)return NextResponse.json({error:'不支援這種圖片格式，請先轉成 PNG 或 JPEG。'},{status:400});
  const {count,error:countError}=await supabaseAdmin.from('teaching_images').select('id',{count:'exact',head:true}).is('deleted_at',null);if(countError)throw new Error('讀取圖庫失敗。');if((count||0)>=500)return NextResponse.json({error:'圖庫目前上限為 500 張，請先移除不使用的圖片。'},{status:400});
  const id=randomUUID(),path=`${id}.${mime==='image/png'?'png':mime==='image/jpeg'?'jpg':'webp'}`;
  const {error:uploadError}=await supabaseAdmin.storage.from(TEACHING_IMAGE_BUCKET).upload(path,bytes,{contentType:mime,upsert:false});if(uploadError)throw new Error('上傳失敗，請稍後重試。');
  const {error}=await supabaseAdmin.from('teaching_images').insert({id,...fields,storage_path:path,mime_type:mime,created_by:actor.userId,enabled:form.get('enabled')==='true'});
  if(error){await supabaseAdmin.storage.from(TEACHING_IMAGE_BUCKET).remove([path]);throw new Error('儲存圖片資料失敗。');}
  return NextResponse.json({id});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'上傳失敗。'},{status:400});}
}
export async function PATCH(request:NextRequest){
 const actor=await requireAdminSession(request);if(!actor)return NextResponse.json({error:'請先登入。'},{status:401});if(!isSuperAdmin(actor))return NextResponse.json({error:'無法修改共用圖庫。'},{status:403});
 try{const body=await request.json();if(!validImageId(String(body.id||'')))throw new Error('圖片 ID 格式錯誤。');
 const patch=body.action==='archive'?{deleted_at:new Date().toISOString(),enabled:false}:body.action==='toggle'?(typeof body.enabled==='boolean'?{enabled:body.enabled}:null):metadata(body);
 if(!patch)throw new Error('啟用狀態格式錯誤。');
 const {data,error}=await supabaseAdmin.from('teaching_images').update({...patch,updated_at:new Date().toISOString()}).eq('id',body.id).is('deleted_at',null).select('id').maybeSingle();if(error)throw new Error('儲存失敗。');if(!data)return NextResponse.json({error:'找不到圖片。'},{status:404});return NextResponse.json({ok:true});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'儲存失敗。'},{status:400});}
}
