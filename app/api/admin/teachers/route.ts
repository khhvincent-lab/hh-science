import bcrypt from "bcryptjs";
import { NextRequest,NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminSession } from "@/lib/admin-access";
import { canCreateRole,canManageAccounts,institutionGrants,mayManageTarget } from "@/lib/admin-account-policy";
import type { AdminRole } from "@/lib/admin-session";
const clean=(v:unknown)=>typeof v==="string"?v.trim():"";
const roles:AdminRole[]=["teacher"];
const unique=(v:unknown)=>Array.isArray(v)?[...new Set(v.map(clean).filter(Boolean))]:[];
const fail=(msg:string,status=403)=>NextResponse.json({error:msg},{status});
async function within(actor:{role:AdminRole;userId:string},ids:string[]){
 if(actor.role==="super_admin")return true;
 const allowed=await institutionGrants(actor.userId);
 return ids.length>0&&ids.every(id=>allowed.includes(id));
}
export async function GET(request:NextRequest){
 const actor=await requireAdminSession(request);
 if(!actor)return fail("未登入。",401);
 const [{data:users,error:ue},{data:links,error:le},{data:grants,error:ge}]=await Promise.all([
  supabaseAdmin.from("admin_users").select("id,username,display_name,role,active,created_at,last_login_at").is("deleted_at",null).order("display_name"),
  supabaseAdmin.from("admin_user_classes").select("admin_user_id,class_id"),
  supabaseAdmin.from("admin_user_institutions").select("admin_user_id,institution_id"),
 ]);
 if(ue||le||ge){
  const issue=ue||le||ge;
  const migrationHint=/deleted_at|admin_user_institutions|admin_user_classes|schema cache|does not exist/i.test(issue?.message||"")
   ? "資料庫可能尚未完成 v2.0 升級 SQL；請確認已在網站對應的 Supabase 專案執行。" : "";
  return fail(`${migrationHint}${issue?.message||"讀取失敗"}`,500);
 }
 const mine=actor.role==="super_admin"?null:await institutionGrants(actor.userId);
 const output=(users??[]).filter((u:any)=>{
  if(!mine)return true;
  if(u.id===actor.userId)return true;
  if(u.id!==actor.userId)return false;
  const theirs=(grants??[]).filter((x:any)=>x.admin_user_id===u.id).map((x:any)=>String(x.institution_id));
  return theirs.length>0&&theirs.every((id:string)=>mine.includes(id));
 }).map((u:any)=>({...u,classIds:(links??[]).filter((x:any)=>x.admin_user_id===u.id).map((x:any)=>x.class_id),institutionIds:(grants??[]).filter((x:any)=>x.admin_user_id===u.id).map((x:any)=>x.institution_id)}));
 return NextResponse.json({teachers:output});
}
export async function POST(request:NextRequest){
 try{
  const actor=await requireAdminSession(request);
  if(!actor)return fail("登入已失效，請重新登入管理後台。",401);
  if(!canManageAccounts(actor.role))return fail("目前帳號沒有新增教師的權限。",403);
  const b=await request.json().catch(()=>null);
  const username=clean(b?.username).toLowerCase(), displayName=clean(b?.displayName), password=String(b?.password??"");
  const role=(b?.role||"teacher") as AdminRole, institutionIds=unique(b?.institutionIds);
  if(!roles.includes(role)||!canCreateRole(actor.role,role))return fail("不能建立此層級帳號。",403);
  if(!/^[a-z0-9._-]{3,40}$/.test(username))return fail("登入帳號須為 3–40 碼英文小寫、數字、點、底線或連字號。",400);
  if(!displayName||displayName.length>40)return fail("請填寫教師姓名，最多 40 字。",400);
  if(password.length<10||password.length>128)return fail("初始密碼需 10–128 碼。",400);
  if(role!=="super_admin"&&!institutionIds.length)return fail("請勾選至少一間補習班。",400);
  if(!(await within(actor,institutionIds)))return fail("不可授權自己管理範圍以外的補習班。",403);
  if(institutionIds.length){
   const {data:institutions,error:ie}=await supabaseAdmin.from("institutions").select("id").in("id",institutionIds);
   if(ie)return fail(`檢查補習班失敗：${ie.message}`,500);
   if((institutions??[]).length!==institutionIds.length)return fail("補習班清單可能已變更，請重新整理後再選擇。",400);
  }
  const {data,error}=await supabaseAdmin.from("admin_users")
   .insert({username,display_name:displayName,password_hash:await bcrypt.hash(password,12),role,active:true})
   .select("id,username,display_name,role,active").single();
  if(error)return fail(error.code==="23505"?"帳號已存在，請改用其他登入帳號。":`建立帳號失敗：${error.message}`,error.code==="23505"?409:500);
  const {error:grantError}=institutionIds.length
   ? await supabaseAdmin.from("admin_user_institutions").insert(institutionIds.map(id=>({admin_user_id:data.id,institution_id:id})))
   : {error:null};
  if(grantError){
   const rollback=await supabaseAdmin.from("admin_users").delete().eq("id",data.id);
   if(rollback.error){
    console.error("Teacher creation rollback failed",{userId:data.id,rollbackError:rollback.error});
    return fail("帳號建立但授權設定失敗，且無法自動復原；請聯繫總管理員檢查教師清單，勿重複新增。",500);
   }
   return fail(`補習班授權失敗，帳號未建立：${grantError.message}`,500);
  }
  return NextResponse.json({teacher:{...data,institutionIds,classIds:[]}});
 }catch(e){
  console.error("Teacher account creation failed",e);
  return fail("新增帳號時發生資料庫或伺服器錯誤，請確認 v2.0 SQL 已執行；詳細錯誤請查看 Vercel Logs。",500);
 }
}
export async function PATCH(request:NextRequest){
 const actor=await requireAdminSession(request);if(!actor)return fail("未登入。",401);
 if(!canManageAccounts(actor.role))return fail("權限不足。");
 const b=await request.json().catch(()=>null),id=clean(b?.id);
 if(!id)return fail("缺少 ID。",400);
 const {data:target,error:te}=await supabaseAdmin.from("admin_users").select("id,role,active").eq("id",id).is("deleted_at",null).maybeSingle();
 if(te||!target)return fail("找不到帳號。",404);
 if(id===actor.userId)return fail("請使用個人密碼設定；不可變更自身權限或停用自己。");
 if(!(await mayManageTarget(actor,target)))return fail("不可修改超出管理範圍的帳號。");
 const role:AdminRole="teacher";
 if(b?.role && b.role!=="teacher")return fail("只可建立與管理教師帳號。");
 const institutionIds=Array.isArray(b?.institutionIds)?unique(b.institutionIds):null;
 
 const effectiveInstitutions=institutionIds??await institutionGrants(id);
 if(!effectiveInstitutions.length)return fail("請先選擇補習班。",400);
 if(!(await within(actor,effectiveInstitutions)))return fail("不可授權管理範圍以外的補習班。");
 const update:Record<string,unknown>={};
 if(role!==target.role)update.role=role;
 if(typeof b?.displayName==="string") { const name=clean(b.displayName);if(!name||name.length>40)return fail("姓名長度不正確。",400);update.display_name=name; }
 if(typeof b?.active==="boolean")update.active=b.active;
 if(typeof b?.password==="string"&&b.password){if(b.password.length<10||b.password.length>128)return fail("密碼需 10–128 碼。",400);update.password_hash=await bcrypt.hash(b.password,12);update.password_changed_at=new Date().toISOString();}
 if(Object.keys(update).length){const {error}=await supabaseAdmin.from("admin_users").update(update).eq("id",id);if(error)return fail(error.message,500);}
 if(institutionIds){const {error:de}=await supabaseAdmin.from("admin_user_institutions").delete().eq("admin_user_id",id);if(de)return fail(de.message,500);
  if(institutionIds.length){const {error}=await supabaseAdmin.from("admin_user_institutions").insert(institutionIds.map(i=>({admin_user_id:id,institution_id:i})));if(error)return fail(error.message,500);}}
 // 移除 v1.5.1 舊班級指派；教師權限一律由補習班繼承。
 if(role==="teacher" || target.role==="teacher"){
  const {error:classError}=await supabaseAdmin.from("admin_user_classes").delete().eq("admin_user_id",id);
  if(classError)return fail(classError.message,500);
 }
 return NextResponse.json({success:true});
}

// 軟刪除：撤銷登入權限、保留校正與稽核紀錄，不連帶刪除學生資料。
export async function DELETE(request:NextRequest){
 const actor=await requireAdminSession(request);
 if(!actor)return fail("未登入。",401);
 if(!canManageAccounts(actor.role))return fail("權限不足。");
 const body=await request.json().catch(()=>null);
 const id=clean(body?.id);
 if(!id)return fail("缺少帳號 ID。",400);
 if(id===actor.userId)return fail("不可刪除目前登入的帳號。",403);
 const {data:target,error:te}=await supabaseAdmin.from("admin_users")
  .select("id,username,role,active,deleted_at").eq("id",id).maybeSingle();
 if(te||!target||target.deleted_at)return fail("找不到有效帳號。",404);
 if(!(await mayManageTarget(actor,target)))return fail("不可刪除管理範圍以外的帳號。",403);
 const {error}=await supabaseAdmin.from("admin_users")
  .update({active:false,deleted_at:new Date().toISOString(),deleted_by:actor.userId,password_changed_at:new Date().toISOString()})
  .eq("id",id).is("deleted_at",null);
 if(error)return fail(error.message,500);
 await supabaseAdmin.from("admin_account_audit").insert({actor_id:actor.userId,target_id:id,action:"delete",details:{username:target.username,role:target.role}});
 return NextResponse.json({success:true});
}
