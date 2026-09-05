import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminSessionToken } from "@/lib/admin-session";

const USD_TO_TWD_RATE = 32.5;

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("hh_science_admin_session")?.value;
  return token ? verifyAdminSessionToken(token) : null;
}

function taipeiDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const today = `${map.year}-${map.month}-${map.day}`;
  const monthStart = `${map.year}-${map.month}-01T00:00:00+08:00`;
  return { today, monthStart };
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });

  const { today, monthStart } = taipeiDateParts();
  const [{ data: classes, error: classError }, { data: students, error: studentError }] = await Promise.all([
    supabaseAdmin.from("classes").select("id,name,academic_year,institution_id,institutions(name,region_id,regions(name))").order("academic_year", { ascending: false }).order("name"),
    supabaseAdmin.from("students").select("id,class_id,last_login_at,active"),
  ]);
  if (classError || studentError) return NextResponse.json({ error: classError?.message || studentError?.message || "讀取班級統計失敗。" }, { status: 500 });

  const studentRows = students ?? [];
  const ids = studentRows.map((s) => s.id as string);
  const [{ data: todayUsage }, { data: monthHistory }, { data: monthApi }] = await Promise.all([
    supabaseAdmin.from("daily_usage").select("student_id,count").eq("usage_date", today),
    ids.length ? supabaseAdmin.from("solve_history").select("student_id").in("student_id", ids).gte("created_at", monthStart) : Promise.resolve({ data: [] as any[] }),
    ids.length ? supabaseAdmin.from("api_usage").select("student_id,estimated_cost_usd").in("student_id", ids).gte("created_at", monthStart) : Promise.resolve({ data: [] as any[] }),
  ]);

  const todayMap = new Map<string, number>();
  for (const row of todayUsage ?? []) todayMap.set(row.student_id as string, Number(row.count || 0));
  const monthQMap = new Map<string, number>();
  for (const row of monthHistory ?? []) monthQMap.set(row.student_id as string, (monthQMap.get(row.student_id as string) || 0) + 1);
  const monthCostMap = new Map<string, number>();
  for (const row of monthApi ?? []) monthCostMap.set(row.student_id as string, (monthCostMap.get(row.student_id as string) || 0) + Number(row.estimated_cost_usd || 0));

  const todayKey = today;
  const currentYear = Number(today.slice(0, 4));
  const rows = (classes ?? []).map((klass: any) => {
    const members = studentRows.filter((student: any) => student.class_id === klass.id);
    const institution = Array.isArray(klass.institutions) ? klass.institutions[0] : klass.institutions;
    const region = institution ? (Array.isArray(institution.regions) ? institution.regions[0] : institution.regions) : null;
    const yearPrefix = klass.academic_year && Number(klass.academic_year) !== currentYear ? `${klass.academic_year} · ` : "";
    return {
      classId: klass.id,
      label: `${yearPrefix}${region?.name || "未分區"} · ${institution?.name || "未指定單位"} · ${klass.name}`,
      students: members.length,
      todayActive: members.filter((s: any) => s.last_login_at && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date(s.last_login_at)) === todayKey).length,
      todayQuestions: members.reduce((sum: number, s: any) => sum + (todayMap.get(s.id) || 0), 0),
      monthQuestions: members.reduce((sum: number, s: any) => sum + (monthQMap.get(s.id) || 0), 0),
      monthCostTwd: Number((members.reduce((sum: number, s: any) => sum + (monthCostMap.get(s.id) || 0), 0) * USD_TO_TWD_RATE).toFixed(2)),
    };
  });

  return NextResponse.json({ rows });
}
