import { NextRequest, NextResponse } from "next/server";
import { getAccessibleStudentIds, isSuperAdmin, requireAdminSession } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(request: NextRequest) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "請重新登入管理中心。" }, { status: 401 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "只有總管理員可以覆核答案。" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body.solveHistoryId === "string" ? body.solveHistoryId.trim() : "";
  const verdict = typeof body.verdict === "string" ? body.verdict : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["ai_correct", "ai_incorrect", "unreviewed"].includes(verdict) || note.length > 500) {
    return NextResponse.json({ error: "覆核資料格式不正確。" }, { status: 400 });
  }

  try {
    const { data: history, error: historyError } = await supabaseAdmin.from("solve_history")
      .select("student_id,reference_answer").eq("id", id).maybeSingle();
    if (historyError) throw historyError;
    if (!history) return NextResponse.json({ error: "找不到題目。" }, { status: 404 });
    const accessible = await getAccessibleStudentIds(request, admin);
    if (accessible !== null && !accessible.includes(history.student_id)) {
      return NextResponse.json({ error: "沒有這題的查看權限。" }, { status: 403 });
    }
    if (!String(history.reference_answer || "").trim()) {
      return NextResponse.json({ error: "學生未填參考答案，這題不納入正確率。" }, { status: 400 });
    }
    const reviewedAt = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from("solve_accuracy_reviews")
      .upsert({ solve_history_id: id, verdict, note, reviewed_by: admin.userId, reviewed_at: reviewedAt }, { onConflict: "solve_history_id" })
      .select("verdict,note,reviewed_at").single();
    if (error) throw error;
    return NextResponse.json({ review: { verdict: data.verdict, note: data.note, reviewedAt: data.reviewed_at } });
  } catch (error) {
    console.error("Answer review error:", error);
    return NextResponse.json({ error: "儲存答案覆核失敗。" }, { status: 500 });
  }
}
