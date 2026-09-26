/** Shared, browser-safe definitions. Never import server settings into the client. */
export type StudentTeachingMode = "concise" | "standard" | "deep";
export type TeachingMode = StudentTeachingMode | "correction";

export const STUDENT_TEACHING_MODES = [
  { value: "concise", label: "精簡解答", description: "掌握核心觀念與必要計算步驟。" },
  { value: "standard", label: "標準詳解", description: "完整說明觀念、解題步驟與選項。" },
  { value: "deep", label: "深度解析", description: "拆解中間步驟，說清楚每一步為什麼。" },
] as const;

export function isStudentTeachingMode(value: unknown): value is StudentTeachingMode {
  return value === "concise" || value === "standard" || value === "deep";
}

export function studentDefaultMode(value: unknown): StudentTeachingMode {
  // Correction requires an existing solution; it is not a student depth option.
  return isStudentTeachingMode(value) ? value : "standard";
}

export function teachingModeLabel(value: unknown): string {
  return STUDENT_TEACHING_MODES.find((mode) => mode.value === value)?.label
    || (value === "correction" ? "訂正模式" : "");
}

export function buildTeachingModeInstructions(mode: TeachingMode): string {
  const instructions: Record<TeachingMode, string> = {
    concise: `精簡解答：以最短但完整的方式解題。
- explanation 通常 2～4 個核心步驟：判斷依據、必要列式與代入、結果；複雜題可增加必要步驟，不硬截斷。
- 不展開已知公式的推導，不加額外解法或延伸；不得只給答案或省略必要單位。
- options 每個選項通常一句，指出對錯的關鍵理由，避免重複計算。`,
    standard: `標準詳解：以適合課後複習的完整教學方式解題。
- explanation 通常 4～7 個重點步驟：整理關鍵條件、說明選用觀念或公式、列式代入、必要運算、結論。簡單題不湊步驟。
- 說明關鍵轉折的理由，保留影響理解的中間步驟，但不重複相同計算。
- options 每個選項通常 1～2 句，交代判斷依據。`,
    deep: `深度解析：講得更細，不是講得更難。
- explanation 先整理已知條件與所求，再逐步說明為何選用該觀念或公式，以及公式適用條件。
- 展開必要的代入、代數變形、單位換算與中間計算，每個關鍵轉折都說明「為什麼」。不受精簡版或 4～7 步限制，也不要為了增加篇幅硬湊步驟。
- 結尾檢查答案的單位、正負或合理性；有真正相關的易錯點時，補充 1～2 點。
- options 逐項說明成立或不成立的原因，必要時拆解錯誤觀念；不限於 1～2 句。
- 維持高中課綱內直觀方法，不因深度模式加入不必要的超綱解法。`,
    correction: `訂正模式：有學生解法、既有結果或參考答案衝突時，先指出具體錯誤或衝突步驟，再重建正確解法。
- 不盲目迎合參考答案，不捏造學生犯過的錯誤。若沒有可訂正的內容，採標準詳解。
- 保留完整關鍵步驟與選項理由。`,
  };
  return `【本題解說深度契約：${teachingModeLabel(mode)}】
${instructions[mode]}
所有模式都必須先獨立完整解題與驗算；深度只改變對學生的講解，不降低正確性或省略選項。
所有模式保留 keyReview 關鍵觀念複習；精簡版以 1～2 點為主，其他模式通常 1～4 點，依題目需要調整。
以上契約統一控制本題篇幅與步驟；通用排版、教師範例或既有答案的長短不得將本題改回其他模式。
教師的學科規則、禁止猜測、科目限制、單位與安全要求仍須遵守。`;
}
