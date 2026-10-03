/** Shared, browser-safe definitions. Never import server settings into the client. */
export type StudentTeachingMode = "concise" | "standard" | "deep";
export type TeachingMode = StudentTeachingMode | "correction";

export const STUDENT_TEACHING_MODES = [
  { value: "concise", label: "精簡解答", description: "直接看結論、關鍵理由與必要算式。" },
  { value: "standard", label: "標準詳解", description: "用少量步驟說清楚主要解法。" },
  { value: "deep", label: "深度解析", description: "完整解析觀念、推導、選項與易錯點。" },
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
    concise: `精簡解答：快速看懂答案，只留最必要內容。
- explanation 通常 1～2 個短句或步驟，文字以約 40～100 字為目標；計算只留「必要列式與代入 → 結果」，保留單位。不重述題幹、不另列已知與所求、不推導公式、不加其他解法或易錯點。
- options 只列本次要講解的選項，每項「對／錯＋一句短理由」，以約 10～25 字為目標，必要算式可超出。若理由已在 options 說清楚，explanation 只需一句共通判斷，不再逐項講一次。
- annotations 以 0～2 個為限，可為空；不得為了互動重點擴寫正文。
- 字數是精簡目標，不得截斷算式或刪除影響正確性的必要條件。`,
    standard: `標準詳解：簡單清楚的主要解法，不寫成完整講義。
- explanation 通常 2～4 個短步驟：關鍵依據、列式代入、結果；文字以約 100～220 字為目標。簡單題可更短，不湊步驟。
- 關鍵轉折用一句白話說明；省略例行代數展開、重複計算、其他解法與延伸補充，必要條件與單位仍須保留。
- options 只列本次要講解的選項，每項通常 1 句；需要比較時可用 2 句，不重複 explanation。
- annotations 以 0～4 個為限，不為湊數增加內容。`,
    deep: `深度解析：講得更細，不是講得更難。
- explanation 先整理已知條件與所求，再逐步說明為何選用該觀念或公式，以及公式適用條件。
- 展開必要的代入、代數變形、單位換算與中間計算，每個關鍵轉折都說明「為什麼」。不受精簡版或 4～7 步限制，也不要為了增加篇幅硬湊步驟。
- 結尾檢查答案的單位、正負或合理性；有真正相關的易錯點時，補充 1～2 點。
- options 逐項說明成立或不成立的原因，必要時拆解錯誤觀念；不限於 1～2 句。
- annotations 依教學需要標註，不湊數。
- 這是三種模式中最完整的版本；但學生指定只問部分選項時，只對指定範圍提供完整解析。
- 維持高中課綱內直觀方法，不因深度模式加入不必要的超綱解法。`,
    correction: `訂正模式：有學生解法、既有結果或參考答案衝突時，先指出具體錯誤或衝突步驟，再重建正確解法。
- 不盲目迎合參考答案，不捏造學生犯過的錯誤。若沒有可訂正的內容，採標準詳解。
- 保留完整關鍵步驟與選項理由。`,
  };
  return `【本題解說深度契約：${teachingModeLabel(mode)}】
${instructions[mode]}
所有模式都必須先獨立完整判斷題目與驗算，確保答案正確；對學生顯示的講解範圍遵守學生指定範圍，不要求展示未被詢問的選項。
所有模式保留原有 keyReview 關鍵觀念複習，不因正文精簡而縮減：精簡版以 1～2 點為主，其他模式通常 1～4 點，每點 1～2 句，依題目需要調整；只複習本次講解範圍需要的知識。
互動重點的數量與正文篇幅以上方模式為準；教師設定的豐富標註密度不能把精簡或標準版擴寫為深度版。
以上契約統一控制本題篇幅與步驟；通用排版、教師範例或既有答案的長短不得將本題改回其他模式。
教師的學科規則、禁止猜測、科目限制、單位與安全要求仍須遵守。`;
}
