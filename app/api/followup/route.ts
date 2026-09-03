import {
  randomUUID,
} from "crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  verifySessionToken,
} from "@/lib/session";

import {
  getAISolverSettings,
} from "@/lib/ai-settings";

import {
  runSolver,
} from "@/lib/ai/solver";

import {
  saveSolverUsage,
} from "@/lib/ai/usage-log";


function buildFollowupPrompt({
  subject,
  answer,
  explanation,
  options,
  previousFollowups,
  question,
}: {
  subject: string;
  answer: string;
  explanation: string;
  options: string;
  previousFollowups: Array<{
    question: string;
    answer: string;
  }>;
  question: string;
}) {
  const prior =
    previousFollowups.length
      ? previousFollowups
          .map(
            (item, index) =>
              `追問 ${index + 1}：${item.question}\n回答 ${index + 1}：${item.answer}`,
          )
          .join("\n\n")
      : "無";

  return `
你是 H.H. Science Lab 的自然科追問老師。

學生已經完成一題自然科解題。
現在只回答學生針對「這一題」的追問，不要重新寫完整詳解。

科目：
${subject}

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

要求：
1. 使用繁體中文。
2. 直接回答問題，通常 2～6 個短段落即可。
3. 必要時可用行內 LaTeX $...$ 或獨立公式 $$...$$。
4. 不要重跑整題，不要重複原本所有內容。
5. 若學生的理解有誤，清楚指出錯在哪裡。
6. 不要輸出 JSON 或 Markdown code block。
`.trim();
}


export async function POST(
  request: NextRequest,
) {
  const token =
    request.cookies.get(
      "hh_science_session",
    )?.value;

  if (!token) {
    return NextResponse.json(
      { error: "請先登入。" },
      { status: 401 },
    );
  }

  const session =
    verifySessionToken(token);

  if (!session) {
    return NextResponse.json(
      { error: "登入狀態已失效，請重新登入。" },
      { status: 401 },
    );
  }

  let body: {
    historyId?: string;
    question?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "追問資料格式錯誤。" },
      { status: 400 },
    );
  }

  const historyId =
    String(body.historyId || "").trim();

  const question =
    String(body.question || "").trim();

  if (!historyId) {
    return NextResponse.json(
      { error: "缺少原始解題紀錄。" },
      { status: 400 },
    );
  }

  if (!question) {
    return NextResponse.json(
      { error: "請輸入追問內容。" },
      { status: 400 },
    );
  }

  if (question.length > 1200) {
    return NextResponse.json(
      { error: "單次追問請控制在 1200 字以內。" },
      { status: 400 },
    );
  }

  const settings =
    await getAISolverSettings();

  if (!settings.followup.enabled) {
    return NextResponse.json(
      { error: "目前追問功能尚未開啟。" },
      { status: 403 },
    );
  }

  const {
    data: history,
    error: historyError,
  } =
    await supabaseAdmin
      .from("solve_history")
      .select(
        `
        id,
        student_id,
        subject,
        answer,
        explanation,
        options,
        followup_count
        `,
      )
      .eq("id", historyId)
      .eq("student_id", session.studentId)
      .maybeSingle();

  if (historyError) {
    return NextResponse.json(
      {
        error:
          `讀取原始解題紀錄失敗：${historyError.message}`,
      },
      { status: 500 },
    );
  }

  if (!history) {
    return NextResponse.json(
      { error: "找不到這筆解題紀錄。" },
      { status: 404 },
    );
  }

  const {
    data: previousRows,
    error: previousError,
  } =
    await supabaseAdmin
      .from("solve_followups")
      .select(
        "id,question,answer,created_at",
      )
      .eq("solve_history_id", historyId)
      .eq("student_id", session.studentId)
      .order("created_at", {
        ascending: true,
      });

  if (previousError) {
    return NextResponse.json(
      {
        error:
          `讀取追問紀錄失敗：${previousError.message}`,
      },
      { status: 500 },
    );
  }

  const previous =
    previousRows || [];

  const maxPerQuestion =
    settings.followup.maxPerQuestion;

  if (previous.length >= maxPerQuestion) {
    return NextResponse.json(
      {
        error:
          `這題最多可追問 ${maxPerQuestion} 次。`,
        remaining: 0,
      },
      { status: 429 },
    );
  }

  const prompt =
    buildFollowupPrompt({
      subject:
        String(history.subject || "自然科"),
      answer:
        String(history.answer || ""),
      explanation:
        String(history.explanation || ""),
      options:
        String(history.options || ""),
      previousFollowups:
        previous.map((item) => ({
          question:
            String(item.question || ""),
          answer:
            String(item.answer || ""),
        })),
      question,
    });

  const requestId =
    randomUUID();

  try {
    const response =
      await runSolver({
        model:
          settings.followup.model.model,
        reasoning:
          settings.followup.model.reasoning,
        prompt,
        expectJson:
          false,
      });

    const answer =
      String(response.text || "").trim();

    if (!answer) {
      throw new Error(
        "追問模型沒有回傳內容。",
      );
    }

    const {
      data: inserted,
      error: insertError,
    } =
      await supabaseAdmin
        .from("solve_followups")
        .insert({
          solve_history_id:
            historyId,
          student_id:
            session.studentId,
          question,
          answer,
          provider:
            response.provider,
          model:
            response.model,
          input_tokens:
            response.usage.inputTokens,
          output_tokens:
            response.usage.outputTokens,
          estimated_cost_usd:
            response.usage.estimatedCostUsd,
        })
        .select(
          "id,question,answer,created_at",
        )
        .single();

    if (insertError) {
      throw new Error(
        `儲存追問紀錄失敗：${insertError.message}`,
      );
    }

    await supabaseAdmin
      .from("solve_history")
      .update({
        followup_count:
          previous.length + 1,
      })
      .eq("id", historyId)
      .eq("student_id", session.studentId);

    await saveSolverUsage({
      requestId,
      solveHistoryId:
        historyId,
      studentId:
        session.studentId,
      campus:
        session.campus,
      role:
        "followup",
      response,
      reasoningEffort:
        settings.followup.model.reasoning,
      success:
        true,
      metadata: {
        followupIndex:
          previous.length + 1,
        maxPerQuestion,
      },
    });

    return NextResponse.json({
      success:
        true,
      followup: {
        id:
          inserted.id,
        question:
          inserted.question,
        answer:
          inserted.answer,
        createdAt:
          inserted.created_at,
      },
      remaining:
        Math.max(
          0,
          maxPerQuestion -
            (previous.length + 1),
        ),
    });

  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "追問失敗，請稍後再試。",
      },
      {
        status: 500,
      },
    );
  }
}
