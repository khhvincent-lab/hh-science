import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AdminRole, AdminSessionPayload } from "@/lib/admin-session";

export function canManageAccounts(role: AdminRole) {
  return role === "super_admin";
}
export function canCreateRole(actor: AdminRole, target: AdminRole) {
  // The sole existing super administrator is preserved; new accounts are teachers.
  return actor === "super_admin" && target === "teacher";
}
export async function institutionGrants(userId: string): Promise<string[]> {
  const {data,error}=await supabaseAdmin.from("admin_user_institutions").select("institution_id").eq("admin_user_id",userId);
  if(error) throw new Error(error.message);
  return (data??[]).map((r:any)=>String(r.institution_id));
}
export async function mayManageTarget(actor: AdminSessionPayload, target: { id: string; role: AdminRole }): Promise<boolean> {
  return actor.role === "super_admin" && target.role === "teacher";
}
