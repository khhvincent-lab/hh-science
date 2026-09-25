/** Compact the known legacy envelope without changing the student's question. */
export function compactHandoffText(text: string): string {
  const match = text.match(/^【解題實驗室｜真人導師求助】\n學生：([^\n]*)\n地區：([^\n]*)\n補習班：([^\n]*)\n班級：([^\n]*)\n題目編號：[^\n]+\n學生疑問：([\s\S]*)\nAI 答案：([\s\S]*)\n完整題目、觀念詳解與選項解析請見附圖。$/);
  if (!match) return text;
  const [, name, region, school, group, question, answer] = match;
  return [
    `學生：${name}`,
    `${region}／${school}／${group}`,
    "",
    `疑問：${question === "想請老師協助釐清這題的觀念與解法。" ? "想請老師再說明這題。" : question}`,
    `AI 答案：${answer}`,
    "題目與詳解見附圖。",
  ].join("\n");
}
