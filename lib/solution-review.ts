// Keep review and solution together in the existing explanation field so history,
// exports and teacher handoffs retain the same content without a schema change.
export const REVIEW_TITLE = "關鍵觀念複習";
const REVIEW_HEADER = `【${REVIEW_TITLE}】`;
const SOLUTION_HEADER = "【解題步驟】";

export function splitSolutionReview(text: string) {
  const source = text.trim();
  if (!source.startsWith(REVIEW_HEADER)) return { review: "", explanation: text };
  const boundary = source.indexOf(SOLUTION_HEADER, REVIEW_HEADER.length);
  if (boundary < 0) return { review: "", explanation: text };
  const review = source.slice(REVIEW_HEADER.length, boundary).trim();
  const explanation = source.slice(boundary + SOLUTION_HEADER.length).trim();
  if (!review || !explanation) return { review: "", explanation: text };
  return { review, explanation };
}

export function composeSolutionExplanation(explanation: string, keyReview: unknown) {
  const review = typeof keyReview === "string" ? keyReview.trim() : "";
  if (!review || !explanation.trim()) return explanation.trim();
  const body = splitSolutionReview(explanation).explanation.trim();
  return `${REVIEW_HEADER}\n${review}\n\n${SOLUTION_HEADER}\n${body}`;
}
