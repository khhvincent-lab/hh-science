import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminSessionToken } from "@/lib/admin-session";

type RangeKey = "today" | "7d" | "30d" | "month";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("hh_science_admin_session")?.value;
  return token ? verifyAdminSessionToken(token) : null;
}

function taipeiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

function taipeiMidnightUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0));
}

function resolveRange(range: RangeKey) {
  const now = new Date();
  const { year, month, day } = taipeiParts(now);
  let start: Date;
  let label: string;
  if (range === "today") {
    start = taipeiMidnightUtc(year, month, day);
    label = "今天";
  } else if (range === "month") {
    start = taipeiMidnightUtc(year, month, 1);
    label = "本月";
  } else {
    const days = range === "30d" ? 30 : 7;
    start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    label = `最近 ${days} 天`;
  }
  return { start, end: now, label };
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("range") || "7d";
  const range: RangeKey = raw === "today" || raw === "30d" || raw === "month" ? raw : "7d";
  const { start, end, label } = resolveRange(range);

  const { data, error } = await supabaseAdmin
    .from("api_usage")
    .select("provider,model,latency_ms,created_at,success")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .not("latency_ms", "is", null)
    .eq("success", true);

  if (error) {
    return NextResponse.json({ error: `讀取 AI 解題時間失敗：${error.message}` }, { status: 500 });
  }

  const rows = (data || []).filter((row: any) => Number(row.latency_ms) > 0);
  const groups = new Map<string, { model: string; provider: string; values: number[] }>();

  for (const row of rows as any[]) {
    const model = String(row.model || "unknown");
    const provider = String(row.provider || "unknown");
    const key = `${provider}:${model}`;
    const current = groups.get(key) || { model, provider, values: [] };
    current.values.push(Number(row.latency_ms));
    groups.set(key, current);
  }

  const models = [...groups.values()].map((group) => {
    const sum = group.values.reduce((a, b) => a + b, 0);
    return {
      model: group.model,
      provider: group.provider,
      calls: group.values.length,
      averageMs: Math.round(sum / group.values.length),
      minMs: Math.round(Math.min(...group.values)),
      maxMs: Math.round(Math.max(...group.values)),
    };
  }).sort((a, b) => a.averageMs - b.averageMs);

  const allValues = models.flatMap((model) => {
    const group = groups.get(`${model.provider}:${model.model}`);
    return group?.values || [];
  });
  const averageMs = allValues.length
    ? Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length)
    : 0;

  return NextResponse.json({
    range,
    label,
    totalCalls: allValues.length,
    averageMs,
    models,
  });
}
