import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/admin-session";
import { getAISolverSettings } from "@/lib/ai-settings";
import { runSolver } from "@/lib/ai/solver";
import { parseAIJson } from "@/lib/ai/json";
import { buildTeachingContext } from "@/lib/teaching-engine";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("hh_science_admin_session")?.value;
  return token ? verifyAdminSessionToken(token) : null;
}

function cleanAnnotations(value: any) {
  if (!Array.isArray(value)) return [];
  return value.map((item: any, index: number) => ({
    id: String(item?.id || `t${index + 1}`),
    display: String(item?.display || ""),
    label: String(item?.label || ""),
    meaning: String(item?.meaning || ""),
    source: String(item?.source || ""),
    usage: String(item?.usage || ""),
  })).filter((item: any) => item.display && item.meaning).slice(0, 10);
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const task = String(body.task || "chat");
    const subject = String(body.subject || "").trim();
    const questionNote = String(body.questionNote || "").trim();
    const referenceAnswer = String(body.referenceAnswer || "").trim();
    const aiAnswer = String(body.aiAnswer || "").trim();
    const aiExplanation = String(body.aiExplanation || "").trim();
    const aiOptions = String(body.aiOptions || "").trim();
    const teacherAnswer = String(body.teacherAnswer || "").trim();
    const teacherExplanation = String(body.teacherExplanation || "").trim();
    const teacherOptions = String(body.teacherOptions || "").trim();
    const teacherStrategy = String(body.teacherStrategy || "").trim();
    const teacherNote = String(body.teacherNote || "").trim();
    const topic = String(body.topic || "").trim();
    const keywords = Array.isArray(body.keywords) ? body.keywords.map(String).slice(0, 10) : [];
    const questionSignature = String(body.questionSignature || "").trim();
    const images = Array.isArray(body.images) ? body.images.filter((v: unknown) => typeof v === "string" && String(v).startsWith("data:image/")).slice(0, 4) : [];

    const [settings, teachingContext] = await Promise.all([
      getAISolverSettings(),
      buildTeachingContext(subject, { topic, keywords, questionSignature, referenceAnswer, questionNote }),
    ]);

    let prompt = "";
    if (task === "annotations") {
      prompt = `你是 H.H. Science Lab 的互動詳解編輯器。老師希望詳解裡有更多「可點擊的重要數字」，但不能亂標。\n\n${teachingContext}\n\n【科目】${subject}\n【老師版詳解】\n${teacherExplanation || aiExplanation}\n\n請挑 4～8 個真正有教學價值的「互動重點」：可以是數值、變數、單位、公式片段、化學式、關鍵常數或臨界值。不要標步驟號、題號、選項編號，也不要為了湊數硬標。\n把標註直接嵌進詳解：若數字在 LaTeX 公式內，用 \\htmlData{annotation=t1}{數字}；若原本不是公式，可把該數字改成 $\\htmlData{annotation=t1}{數字}$。\n\n只輸出合法 JSON：\n{\n  "annotatedExplanation":"完整詳解，保留原意並嵌入 annotation",\n  "annotations":[{"id":"t1","display":"6.02×10^23","label":"亞佛加厥常數","meaning":"代表什麼","source":"如何得到／從哪裡來","usage":"這一步為何要用"}]\n}`;
    } else if (task === "revise") {
      prompt = `你是 H.H. Science Lab 的教師校正助手。請把 AI 原回答整理成老師可直接核准、之後可供相似題檢索學習的「教師版本」。\n\n${teachingContext}\n\n【科目】${subject}\n【學生補充】${questionNote || "未提供"}\n【學生標準答案】${referenceAnswer || "未提供"}\n【AI 答案】${aiAnswer || "未提供"}\n【AI 詳解】${aiExplanation || "未提供"}\n【AI 選項分析】${aiOptions || "未提供"}\n【老師目前答案】${teacherAnswer || "未填"}\n【老師目前詳解】${teacherExplanation || "未填"}\n【老師目前選項分析】${teacherOptions || "未填"}\n【老師解題策略】${teacherStrategy || "未填"}\n【老師備註】${teacherNote || "未填"}\n【教師詳解圖片】${images.length ? `老師另外上傳了 ${images.length} 張詳解圖片。請優先讀取圖片中的手寫步驟、公式、批註、箭頭與教學順序；看不清楚處請保守處理，不可自行猜字。` : "未上傳"}\n\n請協助：\n1. 保持答案正確，不盲目迎合。\n2. 用高中生容易理解、老師真正會教的順序重寫。\n3. 產生 4～8 個有價值的互動重點（數值／變數／單位／公式片段／化學式），並把 annotation 嵌進 explanation。\n4. 萃取主題、穩定關鍵詞、questionSignature。\n5. 提出最多 3 條「值得保存」的教學規則；特殊本題技巧不要誤升成全域規則。\n\n只輸出合法 JSON：\n{\n  "answer":"老師版答案",\n  "explanation":"老師版詳解，含 annotation",\n  "options":"老師版選項分析",\n  "strategy":"一句到三句解題策略",\n  "topic":"核心主題",\n  "keywords":["關鍵詞"],\n  "questionSignature":"不超過 60 字的穩定題目特徵摘要，不含解答",\n  "annotations":[{"id":"t1","display":"數字","label":"名稱","meaning":"代表什麼","source":"如何得到","usage":"為何使用"}],\n  "suggestedRules":[{"title":"規則名稱","content":"規則內容","scope":"global|subject|topic","topic":"適用主題；非 topic 可空白","keywords":["關鍵詞"],"priority":65}],\n  "note":"給老師的簡短提醒"\n}`;
    } else {
      const messages = Array.isArray(body.messages) ? body.messages.slice(-18) : [];
      const dialogue = messages.map((item: any) => `${item?.role === "assistant" ? "AI 教練" : "老師"}：${String(item?.content || "")}`).join("\n");
      prompt = `你是 H.H. Science Lab 的「教師 AI 教練」。你的工作不是教老師，而是聽老師說明他希望 AI 怎麼教學生，協助把口語意見轉成可重用的教學策略。\n\n${teachingContext}\n\n【目前題目上下文】\n科目：${subject}\n主題：${topic || "未標記"}\nAI 答案：${aiAnswer || "未提供"}\nAI 詳解：${aiExplanation || "未提供"}\n老師答案：${teacherAnswer || "未填"}\n老師詳解：${teacherExplanation || "未填"}\n老師策略：${teacherStrategy || "未填"}\n\n【對話】\n${dialogue || "老師尚未輸入內容。"}\n\n請回應老師最後一句，必要時指出你理解到的教學偏好。不要自動永久保存任何規則。若已形成穩定規則，可以提出建議讓老師勾選保存。\n只輸出合法 JSON：\n{\n  "reply":"自然、簡短的回應",\n  "suggestedRules":[{"title":"規則名稱","content":"規則內容","scope":"global|subject|topic","topic":"適用主題","keywords":["關鍵詞"],"priority":60}],\n  "strategy":"若對話使解題策略更清楚，填更新後策略；否則空字串"\n}`;
    }

    const response = await runSolver({ model: settings.primary.model, reasoning: settings.primary.reasoning, prompt, images, expectJson: true });
    const parsed = parseAIJson(response.text) as any;
    return NextResponse.json({
      reply: String(parsed?.reply || ""),
      answer: String(parsed?.answer || teacherAnswer || referenceAnswer || aiAnswer || ""),
      explanation: String(parsed?.annotatedExplanation || parsed?.explanation || teacherExplanation || aiExplanation || ""),
      options: String(parsed?.options || teacherOptions || aiOptions || ""),
      strategy: String(parsed?.strategy || ""),
      topic: String(parsed?.topic || topic || ""),
      keywords: Array.isArray(parsed?.keywords) ? parsed.keywords.map(String).slice(0, 10) : keywords,
      questionSignature: String(parsed?.questionSignature || questionSignature || ""),
      annotations: cleanAnnotations(parsed?.annotations),
      suggestedRules: Array.isArray(parsed?.suggestedRules) ? parsed.suggestedRules.slice(0, 5) : [],
      note: String(parsed?.note || ""),
      model: response.model,
    });
  } catch (error) {
    console.error("Teaching coach error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 教練處理失敗。" }, { status: 500 });
  }
}
