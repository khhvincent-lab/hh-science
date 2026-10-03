import { isStudentTeachingMode, STUDENT_TEACHING_MODES, type StudentTeachingMode } from "./teaching-modes";

/** Only use recorded solver metadata; never infer depth from answer length. */
export function recordedTeachingMode(metadata: unknown): StudentTeachingMode | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).teachingMode;
  return isStudentTeachingMode(value) ? value : null;
}

export function summarizeModeCosts(items: readonly {
  teachingMode?: StudentTeachingMode | null;
  cost?: { hasCostRecord: boolean; totalCostUsd: number | null };
}[]) {
  return STUDENT_TEACHING_MODES.map(mode => {
    const questions = items.filter(item => item.teachingMode === mode.value);
    const costs = questions.flatMap(item => item.cost?.hasCostRecord &&
      typeof item.cost.totalCostUsd === "number" && Number.isFinite(item.cost.totalCostUsd) && item.cost.totalCostUsd >= 0
      ? [item.cost.totalCostUsd] : []);
    const totalCostUsd = costs.reduce((sum, cost) => sum + cost, 0);
    return { ...mode, questions: questions.length, costSamples: costs.length,
      totalCostUsd, averageCostUsd: costs.length ? totalCostUsd / costs.length : null };
  });
}
