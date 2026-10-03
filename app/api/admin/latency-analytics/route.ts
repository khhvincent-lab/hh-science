import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminSession, getAccessibleStudentIds } from "@/lib/admin-access";

import { resolveAdminDateRange } from "@/lib/admin-date-range";

export async function GET(request: NextRequest) {
  const admin = await requireAdminSession(request);
  if (!admin) {
    return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  }

  const { range, startAt, endAt, label } = resolveAdminDateRange(request.nextUrl.searchParams.get("range"));

  const allowedIds = await getAccessibleStudentIds(request, admin);
  if (allowedIds !== null && !allowedIds.length) {
    return NextResponse.json({range,label,totalCalls:0,averageMs:0,models:[]});
  }
  const data = [];
  for (let offset = 0;; offset += 1000) {
    let query = supabaseAdmin.from("api_usage")
      .select("student_id,provider,model,latency_ms,created_at,success")
      .lt("created_at", endAt).not("latency_ms", "is", null).eq("success", true)
      .order("created_at").order("id").range(offset, offset + 999);
    if (startAt !== null) query = query.gte("created_at", startAt);
    const { data: batch, error } = await query;
    if (error) return NextResponse.json({ error: `讀取 AI 解題時間失敗：${error.message}` }, { status: 500 });
    data.push(...(batch || []));
    if (!batch || batch.length < 1000) break;
  }

  const allowed = allowedIds === null ? null : new Set(allowedIds);
  const rows = (data || []).filter((row: any) => Number(row.latency_ms) > 0 && (!allowed || allowed.has(row.student_id)));
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
      minMs: Math.round(group.values.reduce((a, b) => Math.min(a, b), Infinity)),
      maxMs: Math.round(group.values.reduce((a, b) => Math.max(a, b), -Infinity)),
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
