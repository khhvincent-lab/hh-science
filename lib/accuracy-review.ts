import { referenceAnswersMatch, referencePartiallyMatches } from "@/lib/ai/answer-normalization";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AccuracyVerdict = "ai_correct" | "ai_incorrect" | "invalid_question" | "unreviewed";
export type AccuracyReview = {
  verdict: AccuracyVerdict;
  note: string;
  reviewedAt: string;
  reviewerName: string;
};

export async function getAccuracyReviews(ids: string[]) {
  const map = new Map<string, AccuracyReview>();
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await supabaseAdmin.from("solve_accuracy_reviews")
      .select("solve_history_id,verdict,note,reviewed_at,admin_users(display_name)")
      .in("solve_history_id", ids.slice(start, start + 100));
    if (error) throw error;
    for (const row of data || []) {
      const reviewer = Array.isArray(row.admin_users) ? row.admin_users[0] : row.admin_users;
      map.set(row.solve_history_id, {
        verdict: row.verdict as AccuracyVerdict,
        note: row.note || "",
        reviewedAt: row.reviewed_at,
        reviewerName: reviewer?.display_name || "總管理員",
      });
    }
  }
  return map;
}

export function answerReviewState(answer: string | null, reference: string | null, review?: AccuracyReview, options?: string | null) {
  const hasReference = Boolean(reference?.trim());
  const automaticMatch = hasReference && referenceAnswersMatch(answer || "", reference || "", options || "");
  const partialMatch = hasReference && !automaticMatch && referencePartiallyMatches(answer || "", reference || "");
  const excluded = review?.verdict === "invalid_question" || (partialMatch && (!review || review.verdict === "unreviewed"));
  return {
    excluded,
    partialMatch,
    automaticMatch,
    needsReview: hasReference && !automaticMatch && (!review || review.verdict === "unreviewed"),
    countsCorrect: hasReference && !excluded && (review?.verdict === "ai_correct" || (review?.verdict !== "ai_incorrect" && automaticMatch)),
  };
}
