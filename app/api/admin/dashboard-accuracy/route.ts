import { NextRequest, NextResponse } from "next/server";
import { getAccessibleStudentIds, requireAdminSession } from "@/lib/admin-access";
import { answerReviewState, getAccuracyReviews } from "@/lib/accuracy-review";
import { supabaseAdmin } from "@/lib/supabase-admin";

type SolveAnswer = { id: string; answer: string | null; reference_answer: string | null; options: string | null };

function taiwanTodayStart() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (key: string) => parts.find((part) => part.type === key)?.value;
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00+08:00`);
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminSession(request);
    if (!admin) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });

    const range = request.nextUrl.searchParams.get("range") || "30";
    if (!["1", "7", "30", "all"].includes(range)) {
      return NextResponse.json({ error: "統計期間無效。" }, { status: 400 });
    }

    const studentIds = await getAccessibleStudentIds(request, admin);
    if (studentIds?.length === 0) return NextResponse.json({ referenceCases: 0, referenceMatches: 0, pendingReview: 0, reviewedCases: 0, reviewedCorrect: 0, automaticCases: 0, automaticMatches: 0, invalidCases: 0 });
    const days = range === "all" ? null : Number(range);
    const since = days === null ? null : new Date(taiwanTodayStart().getTime() - (days - 1) * 86_400_000).toISOString();
    const groups = studentIds === null ? [null] : Array.from(
      { length: Math.ceil(studentIds.length / 100) }, (_, index) => studentIds.slice(index * 100, (index + 1) * 100),
    );
    let referenceCases = 0;
    let referenceMatches = 0;
    let pendingReview = 0;
    let reviewedCases = 0;
    let reviewedCorrect = 0;
    let automaticCases = 0;
    let automaticMatches = 0;
    let invalidCases = 0;
    for (const group of groups) {
      for (let offset = 0; ; offset += 1000) {
        let query = supabaseAdmin.from("solve_history")
          .select("id,answer,reference_answer,options")
          .not("reference_answer", "is", null);
        if (group) query = query.in("student_id", group);
        if (since) query = query.gte("created_at", since);
        const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 999);
        if (error) throw error;
        const rows = (data || []) as SolveAnswer[];
        const reviewMap = await getAccuracyReviews(rows.map((row) => row.id));
        for (const row of rows) {
          if (!row.reference_answer?.trim()) continue;
          const review = reviewMap.get(row.id);
          const state = answerReviewState(row.answer, row.reference_answer, review, row.options);
          if (review?.verdict === "invalid_question") invalidCases++;
          else { automaticCases++; if (state.automaticMatch) automaticMatches++; }
          if (review?.verdict === "ai_correct") reviewedCorrect++;
          if (state.needsReview) pendingReview++;
          if (state.excluded) continue;
          referenceCases++;
          const verdict = review?.verdict;
          if (verdict === "ai_correct" || verdict === "ai_incorrect") reviewedCases++;
          if (state.countsCorrect) referenceMatches++;
        }
        if (rows.length < 1000) break;
      }
    }
    return NextResponse.json({ referenceCases, referenceMatches, pendingReview, reviewedCases, reviewedCorrect, automaticCases, automaticMatches, invalidCases });
  } catch (error) {
    console.error("Dashboard accuracy error:", error);
    return NextResponse.json({ error: "讀取解題正確率失敗。" }, { status: 500 });
  }
}
