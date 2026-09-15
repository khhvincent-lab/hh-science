import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SCOPE_COOKIE } from "@/lib/admin-session";
import { isSuperAdmin, requireAdminSession } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "權限不足。" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const teacherId = typeof body.teacherId === "string" ? body.teacherId.trim() : "";
  if (teacherId) {
    const { data } = await supabaseAdmin.from("admin_users").select("id,role,active").eq("id", teacherId).maybeSingle();
    if (!data || data.role !== "teacher" || !data.active) return NextResponse.json({ error: "找不到可用的教師帳號。" }, { status: 404 });
  }
  const response = NextResponse.json({ success: true, teacherId: teacherId || null });
  if (teacherId) response.cookies.set(ADMIN_SCOPE_COOKIE, teacherId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  else response.cookies.delete(ADMIN_SCOPE_COOKIE);
  return response;
}
