import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/admin-session";
import { getTeachingEngineSettings, saveTeachingEngineSettings } from "@/lib/teaching-engine";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("hh_science_admin_session")?.value;
  return token ? verifyAdminSessionToken(token) : null;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  return NextResponse.json({ settings: await getTeachingEngineSettings() });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const settings = await saveTeachingEngineSettings(body?.settings || body);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json({ error: `儲存教學引擎設定失敗：${error instanceof Error ? error.message : "未知錯誤"}` }, { status: 500 });
  }
}
