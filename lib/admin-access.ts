import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ADMIN_SCOPE_COOKIE, ADMIN_SESSION_COOKIE, type AdminSessionPayload, verifyAdminSessionToken } from "@/lib/admin-session";

export async function requireAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return token ? verifyAdminSessionToken(token) : null;
}

export function isSuperAdmin(session: AdminSessionPayload | null) {
  return session?.role === "super_admin" || session?.role === "platform_admin";
}

export async function getEffectiveTeacherId(request: NextRequest, session: AdminSessionPayload) {
  if (session.role === "teacher") return session.userId;
  return request.cookies.get(ADMIN_SCOPE_COOKIE)?.value || null;
}

export async function getAccessibleClassIds(request: NextRequest, session: AdminSessionPayload): Promise<string[] | null> {
  const teacherId = await getEffectiveTeacherId(request, session);
  if (!teacherId && isSuperAdmin(session)) return null; // null = all classes
  if (!teacherId) return [];
  const { data, error } = await supabaseAdmin.from("admin_user_classes").select("class_id").eq("admin_user_id", teacherId);
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
