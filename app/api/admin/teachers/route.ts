import bcrypt from "bcryptjs";
import { NextRequest,NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminSession } from "@/lib/admin-access";
import { canCreateRole,canManageAccounts,institutionGrants,mayManageTarget } from "@/lib/admin-account-policy";
import type { AdminRole } from "@/lib/admin-session";
const clean=(v:unknown)=>typeof v==="string"?v.trim():"";
const roles:AdminRole[]=["super_admin","platform_admin","institution_admin","teacher"];
const unique=(v:unknown)=>Array.isArray(v)?[...new Set(v.map(clean).filter(Boolean))]:[];
const fail=(msg:string,status=403)=>NextResponse.json({error:msg},{status});
async function within(actor:{role:AdminRole;userId:string},ids:string[]){
 if(actor.role==="super_admin")return true;
 const allowed=await institutionGrants(actor.userId);
 return ids.length>0&&ids.every(id=>allowed.includes(id));
}
async function classesWithinInstitutions(classIds:string[],institutionIds:string[]){
 if(!classIds.length)return true;
 const {data,error}=await supabaseAdmin.from("classes").select("id,institution_id").in("id",classIds);
 return !error&&(data??[]).length===classIds.length&&(data??[]).every((c:any)=>institutionIds.includes(String(c.institution_id)));
}
export async function GET(request:NextRequest){
 const actor=await requireAdminSession(request);
 if(!actor)return fail("未登入。",401);
 if(!canManageAccounts(actor.role))return fail("權限不足。");
 const [{data:users,error:ue},{data:links,error:le},{data:grants,error:ge}]=await Promise.all([
  supabaseAdmin.from("admin_users").select("id,username,display_name,role,active,created_at,last_login_at").order("display_name"),
  supabaseAdmin.from("admin_user_classes").select("admin_user_id,class_id"),
  supabaseAdmin.from("admin_user_institutions").select("admin_user_id,institution_id"),
 ]);
 if(ue||le||ge)return fail(ue?.message||le?.message||ge?.message||"讀取失敗",500);
 const mine=actor.role==="super_admin"?null:await institutionGrants(actor.userId);
 const output=(users??[]).filter((u:any)=>{
  if(!mine)return true;
  if(u.id===actor.userId)return true;
  if(!canCreateRole(actor.role,u.role))return false;
  const theirs=(grants??[]).filter((x:any)=>x.admin_user_id===u.id).map((x:any)=>String(x.institution_id));
  return theirs.length>0&&theirs.every((id:string)=>mine.includes(id));
 }).map((u:any)=>({...u,classIds:(links??[]).filter((x:any)=>x.admin_user_id===u.id).map((x:any)=>x.class_id),institutionIds:(grants??[]).filter((x:any)=>x.admin_user_id===u.id).map((x:any)=>x.institution_id)}));
 return NextResponse.json({teachers:output});
}
export async function POST(request:NextRequest){
 const actor=await requireAdminSession(request);
 if(!actor)return fail("未登入。",401);
 if(!canManageAccounts(actor.role))return fail("權限不足。");
 const b=await request.json().catch(()=>null);
 const username=clean(b?.username).toLowerCase(), displayName=clean(b?.displayName), password=String(b?.password??"");
 const role=(b?.role||"teacher") as AdminRole, institutionIds=unique(b?.institutionIds),classIds=unique(b?.classIds);
 if(!roles.includes(role)||!canCreateRole(actor.role,role))return fail("不能建立此層級帳號。");
 if(!/^[a-z0-9._-]{3,40}$/.test(username)||!displayName||displayName.length>40||password.length<10||password.length>128)return fail("帳號需 3–40 字、姓名最多 40 字、密碼 10–128 碼。",400);
 if(role!=="super_admin"&&!institutionIds.length)return fail("請選擇至少一間補習班。",400);
 if(role==="institution_admin"&&institutionIds.length!==1)return fail("補習班管理員只能管理一間補習班。",400);
 if(!(await within(actor,institutionIds)))return fail("不可授權自己管理範圍以外的補習班。");
 if(role==="teacher"&&!(await classesWithinInstitutions(classIds,institutionIds)))return fail("班級不屬於所選補習班。",400);
 if(role!=="teacher"&&classIds.length)return fail("管理員請設定補習班授權，無需設定班級。",400);
 const {data,error}=await supabaseAdmin.from("admin_users").insert({username,display_name:displayName,password_hash:await bcrypt.hash(password,12),role,active:true}).select("id,username,display_name,role,active").single();
 if(error)return fail(error.code==="23505"?"帳號已存在。":error.message,error.code==="23505"?409:500);
 const {error:ge}=institutionIds.length?await supabaseAdmin.from("admin_user_institutions").insert(institutionIds.map(id=>({admin_user_id:data.id,institution_id:id}))):{error:null};
 const {error:ce}=!ge&&classIds.length?await supabaseAdmin.from("admin_user_classes").insert(classIds.map(id=>({admin_user_id:data.id,class_id:id}))):{error:null};
 if(ge||ce){await supabaseAdmin.from("admin_users").delete().eq("id",data.id);return fail(`授權失敗，已回復帳號建立：${(ge||ce)?.message}`,500);}
 return NextResponse.json({teacher:{...data,institutionIds,classIds}});
}
export async function PATCH(request:NextRequest){
 const actor=await requireAdminSession(request);if(!actor)return fail("未登入。",401);
 if(!canManageAccounts(actor.role))return fail("權限不足。");
 const b=await request.json().catch(()=>null),id=clean(b?.id);
 if(!id)return fail("缺少 ID。",400);
 const {data:target,error:te}=await supabaseAdmin.from("admin_users").select("id,role,active").eq("id",id).maybeSingle();
 if(te||!target)return fail("找不到帳號。",404);
 if(id===actor.userId)return fail("請使用個人密碼設定；不可變更自身權限或停用自己。");
 if(!(await mayManageTarget(actor,target)))return fail("不可修改超出管理範圍的帳號。");
 const role=(b?.role??target.role) as AdminRole;
 if(!roles.includes(role)||!canCreateRole(actor.role,role))return fail("不可指派此角色。");
 const institutionIds=Array.isArray(b?.institutionIds)?unique(b.institutionIds):null;
 const classIds=Array.isArray(b?.classIds)?unique(b.classIds):null;
 const effectiveInstitutions=institutionIds??await institutionGrants(id);
 if(role!=="super_admin"&&!effectiveInstitutions.length)return fail("請先選擇補習班。",400);
 if(role==="institution_admin"&&effectiveInstitutions.length!==1)return fail("補習班管理員限一間補習班。",400);
 if(!(await within(actor,effectiveInstitutions)))return fail("不可授權管理範圍以外的補習班。");
 if(classIds&&!(await classesWithinInstitutions(classIds,effectiveInstitutions)))return fail("班級不屬於授權補習班。",400);
 if(institutionIds&&!classIds&&role==="teacher"){
  const {data:links}=await supabaseAdmin.from("admin_user_classes").select("class_id").eq("admin_user_id",id);
  if(!(await classesWithinInstitutions((links??[]).map((x:any)=>String(x.class_id)),effectiveInstitutions)))return fail("請先同步調整教師班級，不能保留超出補習班範圍的班級。",400);
 }
 const update:Record<string,unknown>={};
 if(role!==target.role)update.role=role;
 if(typeof b?.displayName==="string") { const name=clean(b.displayName);if(!name||name.length>40)return fail("姓名長度不正確。",400);update.display_name=name; }
 if(typeof b?.active==="boolean")update.active=b.active;
 if(typeof b?.password==="string"&&b.password){if(b.password.length<10||b.password.length>128)return fail("密碼需 10–128 碼。",400);update.password_hash=await bcrypt.hash(b.password,12);update.password_changed_at=new Date().toISOString();}
 if(Object.keys(update).length){const {error}=await supabaseAdmin.from("admin_users").update(update).eq("id",id);if(error)return fail(error.message,500);}
 if(institutionIds){const {error:de}=await supabaseAdmin.from("admin_user_institutions").delete().eq("admin_user_id",id);if(de)return fail(de.message,500);
  if(institutionIds.length){const {error}=await supabaseAdmin.from("admin_user_institutions").insert(institutionIds.map(i=>({admin_user_id:id,institution_id:i})));if(error)return fail(error.message,500);}}
 if(classIds){const {error:de}=await supabaseAdmin.from("admin_user_classes").delete().eq("admin_user_id",id);if(de)return fail(de.message,500);
  if(classIds.length){const {error}=await supabaseAdmin.from("admin_user_classes").insert(classIds.map(i=>({admin_user_id:id,class_id:i})));if(error)return fail(error.message,500);}}
 return NextResponse.json({success:true});
}
