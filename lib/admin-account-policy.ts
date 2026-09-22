import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AdminRole, AdminSessionPayload } from "@/lib/admin-session";

export function canManageAccounts(role: AdminRole) {
  return role === "super_admin" || role === "platform_admin" || role === "institution_admin";
}
export function canCreateRole(actor: AdminRole, target: AdminRole) {
  if (actor === "super_admin") return true;
  if (actor === "platform_admin") return target === "institution_admin" || target === "teacher";
  if (actor === "institution_admin") return target === "teacher";
  return false;
}
export async function institutionGrants(userId: string): Promise<string[]> {
  const {data,error}=await supabaseAdmin.from("admin_user_institutions").select("institution_id").eq("admin_user_id",userId);
  if(error) throw new Error(error.message);
  return (data??[]).map((r:any)=>String(r.institution_id));
}
export async function mayManageTarget(actor:AdminSessionPayload,target:{id:string;role:AdminRole}):Promise<boolean>{
  if(actor.role==="super_admin") return true;
  if(!canCreateRole(actor.role,target.role)) return false;
  const [mine,theirs]=await Promise.all([institutionGrants(actor.userId),institutionGrants(target.id)]);
  // 防止透過改動跨補習班帳號影響另一管理員的範圍
  return theirs.length>0 && theirs.every(id=>mine.includes(id));
}
