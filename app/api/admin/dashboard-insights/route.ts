import { NextRequest, NextResponse } from "next/server";
import { getAccessibleStudentIds, requireAdminSession } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

type History = { student_id: string; created_at: string };
type Usage = { student_id: string | null; role: string | null; created_at: string; estimated_cost_usd: number | string | null };
type Correction = { student_id: string; issue_type: string | null };

const dateInTaiwan = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

async function pages<T>(
  table: "solve_history" | "api_usage" | "teacher_correction_queue",
  select: string,
  start?: string,
  end?: string,
  studentIds?: string[] | null,
): Promise<T[]> {
  if (studentIds?.length === 0) return [];
  const result: T[] = [];
  const groups = studentIds === null || studentIds === undefined
    ? [null]
    : Array.from({ length: Math.ceil(studentIds.length / 100) }, (_, index) => studentIds.slice(index * 100, index * 100 + 100));
  for (const group of groups) {
    for (let offset = 0; ; offset += 1000) {
      let query = supabaseAdmin.from(table).select(select);
      if (group) query = query.in("student_id", group);
      if (start) query = query.gte("created_at", start);
      if (end) query = query.lt("created_at", end);
      if (table === "teacher_correction_queue") query = query.eq("status", "pending");
      const { data, error } = await query.order("created_at", { ascending: true }).range(offset, offset + 999);
      if (error) throw new Error(error.message);
      result.push(...((data ?? []) as T[]));
      if ((data ?? []).length < 1000) break;
    }
  }
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminSession(request);
    if (!session) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
    const days = request.nextUrl.searchParams.get("range") === "30" ? 30 : 7;
    const today = dateInTaiwan(new Date());
    const startDay = new Date(`${today}T00:00:00+08:00`);
    const from = new Date(startDay.getTime() - (days - 1) * 86_400_000).toISOString();
    const end = new Date(startDay.getTime() + 86_400_000).toISOString();
    const studentIds = await getAccessibleStudentIds(request, session);

    const [histories, usage, corrections, studentsResult] = await Promise.all([
      pages<History>("solve_history", "student_id,created_at", from, end, studentIds),
      pages<Usage>("api_usage", "student_id,role,created_at,estimated_cost_usd", from, end, studentIds),
      pages<Correction>("teacher_correction_queue", "student_id,issue_type", undefined, undefined, studentIds),
      studentIds?.length === 0
        ? Promise.resolve({ data: [] as { id: string; class_id: string | null }[], error: null })
        : supabaseAdmin.from("students").select("id,class_id"),
    ]);
    if (studentsResult.error) throw studentsResult.error;
    const allowed = studentIds === null ? null : new Set(studentIds);
    const studentClass = new Map((studentsResult.data ?? [])
      .filter((student) => allowed === null || allowed.has(student.id))
      .map((student) => [student.id, student.class_id]));
    const daily = Array.from({ length: days }, (_, i) => {
      const day = dateInTaiwan(new Date(startDay.getTime() - (days - 1 - i) * 86_400_000));
      return { day, questions: 0, costUsd: 0 };
    });
    const byDay = new Map(daily.map((entry) => [entry.day, entry]));
    const heat = new Map<string, Map<string, number>>();
    for (const item of histories) {
      const day = dateInTaiwan(new Date(item.created_at));
      const bucket = byDay.get(day);
      if (bucket) bucket.questions++;
      const classId = studentClass.get(item.student_id);
      if (classId) {
        if (!heat.has(classId)) heat.set(classId, new Map());
        const classDays = heat.get(classId)!;
        classDays.set(day, (classDays.get(day) ?? 0) + 1);
      }
    }
    const costByRole = { primary: 0, verifier: 0, other: 0 };
    for (const item of usage) {
      const day = dateInTaiwan(new Date(item.created_at));
      const cost = Number(item.estimated_cost_usd || 0);
      if (!Number.isFinite(cost)) continue;
      const bucket = byDay.get(day);
      if (bucket) bucket.costUsd += cost;
      if (day === today) {
        if (item.role === "primary") costByRole.primary += cost;
        else if (item.role === "verifier" || item.role === "arbiter") costByRole.verifier += cost;
        else costByRole.other += cost;
      }
    }
    return NextResponse.json({
      days,
      daily: daily.map((entry) => ({ ...entry, costUsd: Number(entry.costUsd.toFixed(6)) })),
      pending: corrections.length,
      pendingAnswerConflicts: corrections.filter((item) => item.issue_type === "wrong_answer").length,
      costByRole,
      heatmap: Object.fromEntries([...heat].map(([classId, dates]) => [classId, Object.fromEntries(dates)])),
    });
  } catch (error) {
    console.error("Dashboard insights error:", error);
    return NextResponse.json({ error: "讀取儀表板分析資料失敗。" }, { status: 500 });
  }
}
