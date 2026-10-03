import { normalizeScienceDiagram, SCIENCE_TEMPLATE_PROMPT } from "@/lib/science/diagram-engine";
import { retrieveTeachingImages } from "@/lib/teaching-images";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { getAISolverSettings } from "@/lib/ai-settings";
import { runSolver } from "@/lib/ai/solver";
import { saveSolverUsage } from "@/lib/ai/usage-log";
import { parseFollowupResponse, unwrapStoredScienceAnswer } from "@/lib/ai/json";
import { buildTeachingContext } from "@/lib/teaching-engine";
import { classifyFollowup, checkLanguageState } from "@/lib/followup-moderation";
import { languageWarning } from "@/lib/followup-moderation-rules";
import { loadFollowupImages } from "@/lib/followup-images";

export const maxDuration = 120;

function buildFollowupPrompt({
  subject,
  answer,
  explanation,
  options,
  previousFollowups,
  question,
  teachingContext,
  originalImageCount,
  referenceAnswer,
  questionNote,
}: {
  subject: string;
  answer: string;
  explanation: string;
  options: string;
  previousFollowups: Array<{ question: string; answer: string }>;
  question: string;
  teachingContext?: string;
  originalImageCount: number;
  referenceAnswer: string;
  questionNote: string;
}) {
  const prior = previousFollowups.length
    ? previousFollowups.map((item, index) => `追問 ${index + 1}：${item.question}\n回答 ${index + 1}：${item.answer}`).join("\n\n")
    : "無";

  return `
你是 H.H. Science Lab 的自然科追問老師。
學生已完成一題自然科解題。現在只回答學生針對「這一題」的追問，不要重新寫完整詳解。

科目：${subject}

【原始題目】
${originalImageCount ? `附圖前 ${originalImageCount} 張就是學生原本上傳的題目，依原始順序排列。必須實際檢查圖片，不能聲稱看不到已附上的原圖。後續如有教學圖庫圖片，只是輔助教材，不是原題。` : '此筆舊紀錄沒有可用原圖。不得假裝看過圖片；若問題需要圖片才能確認，明確說明缺少原圖並請學生重新上傳。'}
學生原始補充：${questionNote || '無'}
學生提供參考答案（可能有誤）：${referenceAnswer || '無'}
原先解答與追問回答可能有錯，不是判定依據。學生要求重查時，先重新辨識原圖的標示、箭頭、方向、選項，再核對原先解法；有錯就清楚指出並修正，不要只迎合學生。不清楚的局部如實說明，禁止猜測代號。

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
1. 使用繁體中文，直接回答這次問題，通常 1～3 個短段落；學生要求詳細才展開。追問範圍以最新訊息為準，不被原題補充或既有詳解限制。
   若只問 BD、B跟D不懂、為什麼B錯，只解釋這些選項，不重貼整題答案、其他選項或完整觀念複習；必要時簡短引用共用條件。依原圖分辨選項代號與線段、變數，不猜測不存在的選項。「我的答案是BD」不等於只問BD。學生改問其他選項或要求整題時，依最新需求回答。
2. 公式一定使用 $...$ 或 $$...$$；不要把 LaTeX 裸露在一般文字中。
3. 不要輸出 Markdown code block，也不要用 ASCII art 畫圖。
4. 若學生明確要求「畫圖、作圖、示意、v-t 圖、x-t 圖、a-t 圖、向量圖、波形圖」而且可由題目資料確定，必須優先產生 diagram；不要只用文字說「可以畫」。
5. 即使學生沒有明確要求，如果一張簡單圖能明顯降低理解門檻，也可以產生 diagram。
6. 如果圖的科學關係不確定，diagram=null；不要猜。

【Science Diagram 格式】
- 使用 0～100 座標，左上 (0,0)、右下 (100,100)。
- 畫座標圖時畫面 y 座標向下增加，所以「數值越大」要放得越靠上。
- 坐標軸：arrow；直線：line；折線／曲線近似：polyline；文字／刻度／單位：label。
- primitives 最多 160 個，標籤保持簡潔。
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

  let body: { historyId?: string; question?: string; requestId?: string; recheckImage?: boolean };
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ error: "追問資料格式錯誤。" }, { status: 400 });
  }

  const historyId = String(body.historyId || "").trim();
  const question = String(body.question || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(historyId)) return NextResponse.json({ error: "缺少原始解題紀錄。" }, { status: 400 });
  if (!question) return NextResponse.json({ error: "請輸入追問內容。" }, { status: 400 });
  if (question.length > 1200) return NextResponse.json({ error: "單次追問請控制在 1200 字以內。" }, { status: 400 });

  const settings = await getAISolverSettings();
  if (!settings.followup.enabled) return NextResponse.json({ error: "目前追問功能尚未開啟。" }, { status: 403 });

  const { data: history, error: historyError } = await supabaseAdmin
    .from("solve_history")
    .select("id,student_id,subject,answer,explanation,options,followup_count,image_paths,reference_answer,question_note")
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

  const requestId = typeof body.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(body.requestId) ? body.requestId : randomUUID();
  try {
    const state = await checkLanguageState(session.studentId, historyId, requestId);
    if (state.blockedUntil || state.duplicate) return NextResponse.json({
      error: languageWarning(state.count, state.blockedUntil), code: 'LANGUAGE_WARNING', moderation: state,
    }, { status: state.blockedUntil ? 429 : 422 });
    const { verdict, response: moderationResponse } = await classifyFollowup(question, previous.map(item => String(item.question || '')), settings.scienceGate);
    if (moderationResponse) await saveSolverUsage({ requestId, solveHistoryId: historyId, studentId: session.studentId, campus: session.campus, role: 'science_gate', response: moderationResponse, reasoningEffort: settings.scienceGate.reasoning, success: true, metadata: { purpose: 'followup_language_check' } });
    const checked = await checkLanguageState(session.studentId, historyId, requestId, question, verdict);
    if (verdict || checked.blockedUntil || checked.duplicate) return NextResponse.json({
      error: languageWarning(checked.count, checked.blockedUntil, verdict?.category === 'threat' || verdict?.category === 'insult'),
      code: 'LANGUAGE_WARNING', moderation: checked,
    }, { status: checked.blockedUntil ? 429 : 422 });
  } catch (error) {
    console.error('Followup language check failed', error);
    return NextResponse.json({ error: '用語檢查暫時無法完成，請稍後再試；未記違規，也未扣追問次數。', code: 'LANGUAGE_CHECK_UNAVAILABLE' }, { status: 503 });
  }

  let originalImages: string[];
  try {
    originalImages = await loadFollowupImages(history.image_paths, session.studentId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '原題圖片讀取失敗，本次未扣追問次數。', code: 'ORIGINAL_IMAGE_UNAVAILABLE' }, { status: 503 });
  }
  if (body.recheckImage === true && !originalImages.length) return NextResponse.json({ error: '這筆舊紀錄沒有保存原題圖片，請回主頁重新上傳題目；本次未扣追問次數。', code: 'ORIGINAL_IMAGE_MISSING' }, { status: 422 });

  const imageContext = await retrieveTeachingImages(String(history.subject || ""), question + " " + String(history.explanation || "").slice(0,2000), 0);
  const teachingContext = await buildTeachingContext(String(history.subject || "")) + "\n" + SCIENCE_TEMPLATE_PROMPT + imageContext.prompt;
  const prompt = buildFollowupPrompt({
    subject: String(history.subject || "自然科"),
    answer: String(history.answer || ""),
    explanation: String(history.explanation || ""),
    options: String(history.options || ""),
    previousFollowups: previous.map((item) => ({ question: String(item.question || ""), answer: unwrapStoredScienceAnswer(String(item.answer || "")) })),
    question,
    teachingContext,
    originalImageCount: originalImages.length,
    referenceAnswer: String(history.reference_answer || ""),
    questionNote: String(history.question_note || ""),
  });

  try {
    const response = await runSolver({
      model: settings.followup.model.model,
      reasoning: settings.followup.model.reasoning,
      prompt,
      images: [...originalImages, ...imageContext.images],
      expectJson: true,
    });

    const parsed = parseFollowupResponse(String(response.text || ""));

    const answer = String(parsed?.answer || "").trim();
    const diagram = normalizeScienceDiagram(parsed?.diagram, imageContext.refs);
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
        originalImageCount: originalImages.length,
        recheckImage: body.recheckImage === true,
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

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hh_science_session')?.value;
  const session = token ? verifySessionToken(token) : null;
  if (!session) return NextResponse.json({ error: '請先登入。' }, { status: 401 });
  const historyId = request.nextUrl.searchParams.get('historyId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(historyId)) return NextResponse.json({ error: '缺少原始紀錄。' }, { status: 400 });
  try {
    const { data: history, error } = await supabaseAdmin.from('solve_history').select('id').eq('id', historyId).eq('student_id', session.studentId).maybeSingle();
    if (error) throw error;
    if (!history) return NextResponse.json({ error: '找不到這筆紀錄。' }, { status: 404 });
    const [state, settings, rows] = await Promise.all([
      checkLanguageState(session.studentId, historyId, randomUUID()), getAISolverSettings(),
      supabaseAdmin.from('solve_followups').select('id,question,answer,diagram,created_at').eq('solve_history_id', historyId).eq('student_id', session.studentId).order('created_at', { ascending: true }),
    ]);
    if (rows.error) throw rows.error;
    return NextResponse.json({ moderation: state, enabled: settings.followup.enabled, maxPerQuestion: settings.followup.maxPerQuestion,
      followups: (rows.data || []).map(row => ({ ...row, answer: unwrapStoredScienceAnswer(row.answer), createdAt: row.created_at })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Followup state read failed', error);
    return NextResponse.json({ error: '追問狀態讀取失敗，請稍後重試。' }, { status: 503 });
  }
}
