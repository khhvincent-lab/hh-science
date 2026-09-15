import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isSuperAdmin, requireAdminSession } from "@/lib/admin-access";

export async function GET(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("brand_settings").select("*").eq("id", "default").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brand: data });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "權限不足。" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "資料格式錯誤。" }, { status: 400 });
  const name = String(body.name || "").trim();
  const englishName = String(body.englishName || "").trim();
  const adminName = String(body.adminName || "").trim();
  const primaryColor = String(body.primaryColor || "#30463B").trim();
  if (!name || !englishName || !adminName) return NextResponse.json({ error: "品牌名稱、英文名稱與管理中心名稱不可空白。" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("brand_settings").upsert({ id: "default", name, english_name: englishName, admin_name: adminName, primary_color: primaryColor, updated_at: new Date().toISOString() }).select().single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ brand: data });
}
