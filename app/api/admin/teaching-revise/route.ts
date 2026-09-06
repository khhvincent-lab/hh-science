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

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const subject = String(body.subject || "").trim();
    const questionNote = String(body.questionNote || "").trim();
    const referenceAnswer = String(body.referenceAnswer || "").trim();
    const aiAnswer = String(body.aiAnswer || "").trim();
    const aiExplanation = String(body.aiExplanation || "").trim();
    const aiOptions = String(body.aiOptions || "").trim();
    const teacherAnswer = String(body.teacherAnswer || "").trim();
    const teacherNote = String(body.teacherNote || "").trim();
    const teacherExplanation = String(body.teacherExplanation || "").trim();

    const [settings, teachingContext] = await Promise.all([
      getAISolverSettings(),
      buildTeachingContext(subject),
    ]);

    const prompt = `你是 H.H. Science Lab 的教師修正助手。請協助老師把既有 AI 解答改成更適合高中生閱讀、且符合老師教學邏輯的版本。\n\n${teachingContext}\n\n【學生補充敘述】\n${questionNote || "未提供"}\n\n【標準參考答案】\n${referenceAnswer || "未提供"}\n\n【原 AI 最終答案】\n${aiAnswer || "未提供"}\n\n【原 AI 觀念解析】\n${aiExplanation || "未提供"}\n\n【原 AI 選項分析】\n${aiOptions || "未提供"}\n\n【老師目前認定答案】\n${teacherAnswer || "未填"}\n\n【老師備註】\n${teacherNote || "未填"}\n\n【老師目前解法草稿】\n${teacherExplanation || "未填"}\n\n請只輸出 JSON，不要 markdown：\n{\n  "answer": "老師最適合採用的答案",\n  "explanation": "可直接給學生看的老師版解法",\n  "note": "給老師看的簡短修改建議"\n}\n\n要求：不要憑空改答案；若資料不足，保留老師認定答案並在 note 說明。解法要精準、可教學、避免冗長。`;

    const response = await runSolver({
      model: settings.primary.model,
      reasoning: settings.primary.reasoning,
      prompt,
      expectJson: true,
    });

    const parsed = parseAIJson(response.text) as any;
    return NextResponse.json({
      answer: String(parsed?.answer || teacherAnswer || referenceAnswer || aiAnswer || ""),
      explanation: String(parsed?.explanation || ""),
      note: String(parsed?.note || ""),
      model: response.model,
    });
  } catch (error) {
    console.error("Teaching revise error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 協助修正失敗。" }, { status: 500 });
  }
}
