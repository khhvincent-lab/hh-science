import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/admin-session";
import {
  appendInputGuardRule,
  getInputGuardSettings,
  saveInputGuardSettings,
} from "@/lib/input-guard";

function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("hh_science_admin_session")?.value;
  return token ? verifyAdminSessionToken(token) : null;
}

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  return NextResponse.json({ settings: await getInputGuardSettings() });
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
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
