import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { getAISolverSettings } from "@/lib/ai-settings";
import { runSolver } from "@/lib/ai/solver";
import { saveSolverUsage } from "@/lib/ai/usage-log";
import { parseAIJson } from "@/lib/ai/json";
import { buildTeachingContext } from "@/lib/teaching-engine";
import type { ScienceDiagram, ScienceDiagramPrimitive } from "@/lib/ai/types";

function clampDiagramNumber(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, n));
}

function normalizeFollowupDiagram(value: any): ScienceDiagram | null {
  if (!value || typeof value !== "object") return null;

  const allowedTypes = new Set([
    "force", "incline", "circular_motion", "spring", "pulley", "optics", "circuit",
    "earth_layers", "fault", "plate_boundary", "sun_angle", "earth_moon_sun",
    "atmosphere", "ocean_circulation", "chemistry_apparatus", "motion_graph",
    "coordinate_graph", "wave", "vector", "phase_diagram", "generic",
  ]);
  const type = String(value.type || "generic");
  const confidenceRaw = Number(value.confidence ?? 0);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(100, confidenceRaw)) : 0;
  if (!allowedTypes.has(type) || confidence < 55 || !Array.isArray(value.primitives)) return null;

  const allowedKinds = new Set(["line", "arrow", "circle", "rect", "label", "polyline", "arc"]);
  const allowedRoles = new Set(["primary", "secondary", "accent", "muted"]);

  const primitives: ScienceDiagramPrimitive[] = value.primitives.slice(0, 24).flatMap((item: any) => {
    if (!item || typeof item !== "object") return [];
    const kind = String(item.kind || "") as ScienceDiagramPrimitive["kind"];
    if (!allowedKinds.has(kind)) return [];
    const primitive: ScienceDiagramPrimitive = { kind };

    for (const key of ["x1", "y1", "x2", "y2", "x", "y", "cx", "cy", "r", "width", "height"] as const) {
      const n = clampDiagramNumber(item[key]);
      if (n !== undefined) (primitive as any)[key] = n;
    }
    if (Array.isArray(item.points)) {
      primitive.points = item.points.slice(0, 20).map((point: any) => ({
        x: clampDiagramNumber(point?.x) ?? 0,
        y: clampDiagramNumber(point?.y) ?? 0,
      }));
    }
    const startAngle = Number(item.startAngle);
    const endAngle = Number(item.endAngle);
    if (Number.isFinite(startAngle)) primitive.startAngle = Math.max(-360, Math.min(360, startAngle));
    if (Number.isFinite(endAngle)) primitive.endAngle = Math.max(-360, Math.min(360, endAngle));
    if (item.text != null) primitive.text = String(item.text).slice(0, 48);
    if (item.note != null) primitive.note = String(item.note).slice(0, 180);
    const role = String(item.role || "primary") as ScienceDiagramPrimitive["role"];
    primitive.role = allowedRoles.has(String(role)) ? role : "primary";
    primitive.dashed = Boolean(item.dashed);
    return [primitive];
  });

  if (primitives.length < 2) return null;
  return {
    type: type as ScienceDiagram["type"],
    title: String(value.title || "追問圖解").slice(0, 36),
    caption: String(value.caption || "").slice(0, 160),
    confidence,
    primitives,
  };
}

function buildFollowupPrompt({
  subject,
  answer,
  explanation,
  options,
  previousFollowups,
  question,
  teachingContext,
}: {
  subject: string;
  answer: string;
  explanation: string;
  options: string;
  previousFollowups: Array<{ question: string; answer: string }>;
  question: string;
  teachingContext?: string;
}) {
  const prior = previousFollowups.length
    ? previousFollowups.map((item, index) => `追問 ${index + 1}：${item.question}\n回答 ${index + 1}：${item.answer}`).join("\n\n")
    : "無";

  return `
你是 H.H. Science Lab 的自然科追問老師。
學生已完成一題自然科解題。現在只回答學生針對「這一題」的追問，不要重新寫完整詳解。

科目：${subject}

原本最終答案：
${answer}

原本觀念解析：
${explanation}

原本選項分析：
${options || "無"}

先前追問：
${prior}

學生這次追問：
${question}

${teachingContext || ""}

【回答規則】
1. 使用繁體中文，直接回答問題，通常 2～6 個短段落。
2. 公式一定使用 $...$ 或 $$...$$；不要把 LaTeX 裸露在一般文字中。
3. 不要輸出 Markdown code block，也不要用 ASCII art 畫圖。
4. 若學生明確要求「畫圖、作圖、示意、v-t 圖、x-t 圖、a-t 圖、向量圖、波形圖」而且可由題目資料確定，必須優先產生 diagram；不要只用文字說「可以畫」。
5. 即使學生沒有明確要求，如果一張簡單圖能明顯降低理解門檻，也可以產生 diagram。
6. 如果圖的科學關係不確定，diagram=null；不要猜。

【Science Diagram 格式】
- 使用 0～100 座標，左上 (0,0)、右下 (100,100)。
- 畫座標圖時畫面 y 座標向下增加，所以「數值越大」要放得越靠上。
- 坐標軸：arrow；直線：line；折線／曲線近似：polyline；文字／刻度／單位：label。
- primitives 最多 24 個，標籤保持簡潔。
- type 可用：force, incline, circular_motion, spring, pulley, optics, circuit, motion_graph, coordinate_graph, wave, vector, phase_diagram, earth_layers, fault, plate_boundary, sun_angle, earth_moon_sun, atmosphere, ocean_circulation, chemistry_apparatus, generic。
- 每個 primitive 可附 note，學生點擊時顯示短說明。

例如學生要求 v-t 圖，應畫 t 軸、v 軸、起點、終點與連線，不要用文字排版假裝作圖。

只輸出合法 JSON，不要加任何其他文字：
{
  "answer": "追問回答，公式需用 $...$ 或 $$...$$",
  "diagram": null
}
`.trim();
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("hh_science_session")?.value;
  if (!token) return NextResponse.json({ error: "請先登入。" }, { status: 401 });

  const session = verifySessionToken(token);
  if (!session) return NextResponse.json({ error: "登入狀態已失效，請重新登入。" }, { status: 401 });

  let body: { historyId?: string; question?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "追問資料格式錯誤。" }, { status: 400 });
  }

  const historyId = String(body.historyId || "").trim();
  const question = String(body.question || "").trim();
  if (!historyId) return NextResponse.json({ error: "缺少原始解題紀錄。" }, { status: 400 });
  if (!question) return NextResponse.json({ error: "請輸入追問內容。" }, { status: 400 });
  if (question.length > 1200) return NextResponse.json({ error: "單次追問請控制在 1200 字以內。" }, { status: 400 });

  const settings = await getAISolverSettings();
  if (!settings.followup.enabled) return NextResponse.json({ error: "目前追問功能尚未開啟。" }, { status: 403 });

  const { data: history, error: historyError } = await supabaseAdmin
    .from("solve_history")
    .select("id,student_id,subject,answer,explanation,options,followup_count")
    .eq("id", historyId)
    .eq("student_id", session.studentId)
    .maybeSingle();

  if (historyError) return NextResponse.json({ error: `讀取原始解題紀錄失敗：${historyError.message}` }, { status: 500 });
  if (!history) return NextResponse.json({ error: "找不到這筆解題紀錄。" }, { status: 404 });

  const { data: previousRows, error: previousError } = await supabaseAdmin
    .from("solve_followups")
    .select("id,question,answer,created_at")
    .eq("solve_history_id", historyId)
    .eq("student_id", session.studentId)
    .order("created_at", { ascending: true });

  if (previousError) return NextResponse.json({ error: `讀取追問紀錄失敗：${previousError.message}` }, { status: 500 });

  const previous = previousRows || [];
  const maxPerQuestion = settings.followup.maxPerQuestion;
  if (previous.length >= maxPerQuestion) {
    return NextResponse.json({ error: `這題最多可追問 ${maxPerQuestion} 次。`, remaining: 0 }, { status: 429 });
  }

  const teachingContext = await buildTeachingContext(String(history.subject || ""));
  const prompt = buildFollowupPrompt({
    subject: String(history.subject || "自然科"),
    answer: String(history.answer || ""),
    explanation: String(history.explanation || ""),
    options: String(history.options || ""),
    previousFollowups: previous.map((item) => ({ question: String(item.question || ""), answer: String(item.answer || "") })),
    question,
    teachingContext,
  });

  const requestId = randomUUID();

  try {
    const response = await runSolver({
      model: settings.followup.model.model,
      reasoning: settings.followup.model.reasoning,
      prompt,
      expectJson: true,
    });

    let parsed: any;
    try {
      parsed = parseAIJson<any>(String(response.text || ""));
    } catch {
      // 圖解是輔助功能；即使 JSON 失敗，也不要讓學生整個追問失敗。
      parsed = { answer: String(response.text || "").trim(), diagram: null };
    }

    const answer = String(parsed?.answer || "").trim();
    const diagram = normalizeFollowupDiagram(parsed?.diagram);
    if (!answer) throw new Error("追問模型沒有回傳內容。");

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("solve_followups")
      .insert({
        solve_history_id: historyId,
        student_id: session.studentId,
        question,
        answer,
        diagram,
        provider: response.provider,
        model: response.model,
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        estimated_cost_usd: response.usage.estimatedCostUsd,
      })
      .select("id,question,answer,diagram,created_at")
      .single();

    if (insertError) throw new Error(`儲存追問紀錄失敗：${insertError.message}`);

    await supabaseAdmin
      .from("solve_history")
      .update({ followup_count: previous.length + 1 })
      .eq("id", historyId)
      .eq("student_id", session.studentId);

    await saveSolverUsage({
      requestId,
      solveHistoryId: historyId,
      studentId: session.studentId,
      campus: session.campus,
      role: "followup",
      response,
      reasoningEffort: settings.followup.model.reasoning,
      success: true,
      metadata: {
        followupIndex: previous.length + 1,
        maxPerQuestion,
        hasDiagram: Boolean(diagram),
      },
    });

    return NextResponse.json({
      success: true,
      followup: {
        id: inserted.id,
        question: inserted.question,
        answer: inserted.answer,
        diagram: inserted.diagram && typeof inserted.diagram === "object" ? inserted.diagram : null,
        createdAt: inserted.created_at,
      },
      remaining: Math.max(0, maxPerQuestion - (previous.length + 1)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "追問失敗，請稍後再試。" },
      { status: 500 },
    );
  }
}
