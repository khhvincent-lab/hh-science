import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ADMIN_SCOPE_COOKIE, ADMIN_SESSION_COOKIE, type AdminSessionPayload, verifyAdminSessionToken } from "@/lib/admin-session";

export async function requireAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = token ? verifyAdminSessionToken(token) : null;
  if (!session) return null;
  if (session.legacy) return null;
  const { data, error } = await supabaseAdmin.from("admin_users")
    .select("id,role,active,password_changed_at").eq("id", session.userId).maybeSingle();
  if (error || !data?.active || data.role !== session.role) return null;
  if (data.password_changed_at && (!session.issuedAt || session.issuedAt * 1000 + 999 < new Date(data.password_changed_at).getTime())) return null;
  return session;
}

export function isSuperAdmin(session: AdminSessionPayload | null) {
  return session?.role === "super_admin";
}

export async function getEffectiveTeacherId(request: NextRequest, session: AdminSessionPayload) {
  if (session.role === "teacher") return session.userId;
  return request.cookies.get(ADMIN_SCOPE_COOKIE)?.value || null;
}

export async function getAccessibleClassIds(request: NextRequest, session: AdminSessionPayload): Promise<string[] | null> {
  if (isSuperAdmin(session) && !request.cookies.get(ADMIN_SCOPE_COOKIE)?.value) return null;
  const viewerId = session.role === "super_admin" ? (await getEffectiveTeacherId(request, session)) : session.userId;
  if (!viewerId) return [];
  if (session.role === "platform_admin" || session.role === "institution_admin") {
    const { data: grants, error: ge } = await supabaseAdmin.from("admin_user_institutions").select("institution_id").eq("admin_user_id", viewerId);
    if (ge) throw new Error(`讀取補習班授權失敗：${ge.message}`);
    const ids = (grants ?? []).map((g: any) => String(g.institution_id));
    if (!ids.length) return [];
    const { data: classes, error: ce } = await supabaseAdmin.from("classes").select("id").in("institution_id", ids);
    if (ce) throw new Error(`讀取班級權限失敗：${ce.message}`);
    return (classes ?? []).map((row: any) => String(row.id));
  }
  const { data, error } = await supabaseAdmin.from("admin_user_classes").select("class_id").eq("admin_user_id", viewerId);
  if (error) throw new Error(`讀取教師班級權限失敗：${error.message}`);
  return (data ?? []).map((row: any) => String(row.class_id));
}

export async function assertClassAccess(request: NextRequest, session: AdminSessionPayload, classId: string | null | undefined) {
  if (!classId) return isSuperAdmin(session);
  const allowed = await getAccessibleClassIds(request, session);
  return allowed === null || allowed.includes(classId);
}

export async function getAccessibleStudentIds(request: NextRequest, session: AdminSessionPayload): Promise<string[] | null> {
  const classIds = await getAccessibleClassIds(request, session);
  if (classIds === null) return null;
  if (!classIds.length) return [];
  const { data, error } = await supabaseAdmin.from("students").select("id").in("class_id", classIds);
  if (error) throw new Error(`讀取學生權限失敗：${error.message}`);
  return (data ?? []).map((row: any) => String(row.id));
}
