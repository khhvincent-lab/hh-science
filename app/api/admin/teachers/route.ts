import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isSuperAdmin, requireAdminSession } from "@/lib/admin-access";

const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";

export async function GET(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "權限不足。" }, { status: 403 });
  const [{ data: users, error: ue }, { data: links, error: le }] = await Promise.all([
    supabaseAdmin.from("admin_users").select("id,username,display_name,role,active,created_at,last_login_at").order("display_name"),
    supabaseAdmin.from("admin_user_classes").select("admin_user_id,class_id"),
  ]);
  if (ue || le) return NextResponse.json({ error: ue?.message || le?.message }, { status: 500 });
  return NextResponse.json({
    teachers: (users ?? []).map((u: any) => ({ ...u, classIds: (links ?? []).filter((x: any) => x.admin_user_id === u.id).map((x: any) => x.class_id) })),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "權限不足。" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const username = clean(body?.username).toLowerCase();
  const displayName = clean(body?.displayName);
  const password = clean(body?.password);
  const classIds = Array.isArray(body?.classIds) ? body.classIds.map(clean).filter(Boolean) : [];
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) return NextResponse.json({ error: "帳號需為 3–40 字英數、點、底線或連字號。" }, { status: 400 });
  if (!displayName || displayName.length > 40) return NextResponse.json({ error: "請輸入老師姓名。" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "密碼至少 8 碼。" }, { status: 400 });
  const passwordHash = await bcrypt.hash(password, 12);
  const { data, error } = await supabaseAdmin.from("admin_users").insert({ username, display_name: displayName, password_hash: passwordHash, role: "teacher", active: true }).select("id,username,display_name,role,active").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "此教師帳號已存在。" : error.message }, { status: error.code === "23505" ? 409 : 500 });
  if (classIds.length) {
    const { error: linkError } = await supabaseAdmin.from("admin_user_classes").insert(classIds.map((classId: string) => ({ admin_user_id: data.id, class_id: classId })));
    if (linkError) return NextResponse.json({ error: `教師已建立，但班級授權失敗：${linkError.message}` }, { status: 500 });
  }
  return NextResponse.json({ teacher: { ...data, classIds } });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "權限不足。" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = clean(body?.id);
  if (!id) return NextResponse.json({ error: "缺少教師 ID。" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (typeof body?.displayName === "string") updates.display_name = clean(body.displayName);
  if (typeof body?.active === "boolean") updates.active = body.active;
  if (typeof body?.password === "string" && clean(body.password)) {
    if (clean(body.password).length < 8) return NextResponse.json({ error: "新密碼至少 8 碼。" }, { status: 400 });
    updates.password_hash = await bcrypt.hash(clean(body.password), 12);
  }
  if (Object.keys(updates).length) {
    const { error } = await supabaseAdmin.from("admin_users").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (Array.isArray(body?.classIds)) {
    const classIds = body.classIds.map(clean).filter(Boolean);
    const { error: de } = await supabaseAdmin.from("admin_user_classes").delete().eq("admin_user_id", id);
    if (de) return NextResponse.json({ error: de.message }, { status: 500 });
    if (classIds.length) {
      const { error: ie } = await supabaseAdmin.from("admin_user_classes").insert(classIds.map((classId: string) => ({ admin_user_id: id, class_id: classId })));
      if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });
    }
  }
  return NextResponse.json({ success: true });
}
