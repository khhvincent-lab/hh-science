import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, getAccessibleStudentIds } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Today uses Asia/Taipei calendar days, independently of the hosting server TZ. */
function taipeiDayWindow() {
  const items = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(items.map(item => [item.type, item.value]));
  const start = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+08:00`);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 86_400_000).toISOString(),
  };
}

type TodayHistory = {
  student_id: string | null;
  followup_count: number | null;
  dispute_status: string | null;
};

async function loadTodayHistory(start: string, end: string, scopedStudents: string[] | null) {
  const result: TodayHistory[] = [];
  // Supabase has a per-request row cap; page each slice to avoid undercounting.
  const studentChunks = scopedStudents === null
    ? [null]
    : Array.from({length: Math.ceil(scopedStudents.length / 120)}, (_, i) =>
      scopedStudents.slice(i * 120, (i + 1) * 120));
  for (const chunk of studentChunks) {
    for (let offset = 0;; offset += 1000) {
      let query = supabaseAdmin.from("solve_history")
        .select("student_id,followup_count,dispute_status")
        .gte("created_at", start).lt("created_at", end)
        .order("created_at", {ascending: false})
        .range(offset, offset + 999);
      if (chunk !== null) query = query.in("student_id", chunk);
      const {data,error} = await query;
      if (error) throw error;
      result.push(...(data || []));
      if ((data || []).length < 1000) break;
    }
  }
  return result;
}

async function countPendingCorrections(scopedStudents: string[] | null) {
  const chunks = scopedStudents === null
    ? [null]
    : Array.from({length: Math.ceil(scopedStudents.length / 120)}, (_, i) =>
      scopedStudents.slice(i * 120, (i + 1) * 120));
  let total = 0;
  for (const chunk of chunks) {
    let query = supabaseAdmin.from("teacher_correction_queue")
      .select("id", {count:"exact", head:true}).eq("status", "pending");
    if (chunk !== null) query = query.in("student_id", chunk);
    const {count,error} = await query;
    if (error) throw error;
    total += count || 0;
  }
  return total;
}

export async function GET(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) return NextResponse.json({error:"未登入管理員。"}, {status:401});
  try {
    const scopedStudents = await getAccessibleStudentIds(request,session);
    if (scopedStudents !== null && scopedStudents.length === 0) {
      return NextResponse.json({
        pendingCorrections:0, disputedToday:0, repeatedFollowupsToday:0,
        repeatStudentsToday:0, inspectedAt:new Date().toISOString(),
      }, {headers:{"Cache-Control":"private, no-store"}});
    }
    const {start,end} = taipeiDayWindow();
    const [todayHistory,pendingCorrections] = await Promise.all([
      loadTodayHistory(start,end,scopedStudents),
      countPendingCorrections(scopedStudents),
    ]);
    const repeated = todayHistory.filter(row => Number(row.followup_count || 0) >= 2);
    return NextResponse.json({
      pendingCorrections,
      disputedToday:todayHistory.filter(row => row.dispute_status === "disputed").length,
      repeatedFollowupsToday:repeated.length,
      repeatStudentsToday:new Set(repeated.map(row=>row.student_id).filter(Boolean)).size,
      inspectedAt:new Date().toISOString(),
    }, {headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    console.error("Admin smart overview:",error);
    return NextResponse.json({error:"讀取智慧關注資料失敗，請稍後再試。"}, {status:500});
  }
}
