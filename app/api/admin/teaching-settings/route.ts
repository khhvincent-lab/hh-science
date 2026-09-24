import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, isSuperAdmin } from "@/lib/admin-access";
import { getTeachingEngineSettings, saveTeachingEngineSettings } from "@/lib/teaching-engine";

async 
export async function GET(request: NextRequest) {
  if (!(await requireAdminSession(request))) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  return NextResponse.json({ settings: await getTeachingEngineSettings() });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "此設定僅總管理員可以修改。" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    const settings = await saveTeachingEngineSettings(body?.settings || body);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json({ error: `儲存教學引擎設定失敗：${error instanceof Error ? error.message : "未知錯誤"}` }, { status: 500 });
  }
}
