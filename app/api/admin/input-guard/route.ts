import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, isSuperAdmin } from "@/lib/admin-access";
import {
  appendInputGuardRule,
  getInputGuardSettings,
  saveInputGuardSettings,
} from "@/lib/input-guard";


export async function GET(request: NextRequest) {
  if (!await requireAdminSession(request)) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  return NextResponse.json({ settings: await getInputGuardSettings() });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "此設定僅總管理員可以修改。" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    const settings = body?.appendRule
      ? await appendInputGuardRule(String(body.appendRule))
      : await saveInputGuardSettings(body?.settings || body);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "儲存阻擋規則失敗。" }, { status: 500 });
  }
}
