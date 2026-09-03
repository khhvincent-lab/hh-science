import OpenAI from "openai";

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
  getAISettings,
} from "@/lib/ai-settings";

import {
  getAIModel,
} from "@/lib/ai-models";


/* =========================================================
   Settings
========================================================= */

const DAILY_LIMIT = 10;


const openai =
  new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY,
  });


/* =========================================================
   Types
========================================================= */

type UsageInfo = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};


/* =========================================================
   Taiwan date
========================================================= */

function getTaiwanDate() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Taipei",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      }
    ).formatToParts(
      new Date()
    );


  const year =
    parts.find(
      (item) =>
        item.type === "year"
    )?.value;


  const month =
    parts.find(
      (item) =>
        item.type === "month"
    )?.value;


  const day =
    parts.find(
      (item) =>
        item.type === "day"
    )?.value;


  return `${year}-${month}-${day}`;
}


/* =========================================================
   API cost calculator
========================================================= */

function calculateUsage(
  response: any,
  modelId: string
): UsageInfo {

  const model =
    getAIModel(
      modelId
    );


  const inputTokens =
    Number(
      response?.usage
        ?.input_tokens ||
        0
    );


  const cachedInputTokens =
    Number(
      response?.usage
        ?.input_tokens_details
        ?.cached_tokens ||
        0
    );


  const cacheWriteTokens =
    Number(
      response?.usage
        ?.input_tokens_details
        ?.cache_write_tokens ||
        0
    );


  const outputTokens =
    Number(
      response?.usage
        ?.output_tokens ||
        0
    );


  const totalTokens =
    Number(
      response?.usage
        ?.total_tokens ||
        inputTokens +
          outputTokens
    );


  /*
   * cached tokens 與 cache-write tokens
   * 都包含在 input_tokens 裡，
   * 所以先扣掉，再計算一般 input。
   */

  const regularInputTokens =
    Math.max(
      0,
      inputTokens -
        cachedInputTokens -
        cacheWriteTokens
    );


  const inputCost =
    (
      regularInputTokens /
      1_000_000
    ) *
    model.inputPrice;


  const cachedCost =
    (
      cachedInputTokens /
      1_000_000
    ) *
    model.cachedInputPrice;


  /*
   * GPT-5.6 cache write：
   * 官方目前按一般 uncached input
   * 的 1.25 倍計價。
   */

  const cacheWriteCost =
    (
      cacheWriteTokens /
      1_000_000
    ) *
    (
      model.inputPrice *
      1.25
    );


  const outputCost =
    (
      outputTokens /
      1_000_000
    ) *
    model.outputPrice;


  const estimatedCostUsd =
    inputCost +
    cachedCost +
    cacheWriteCost +
    outputCost;


  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    totalTokens,

    estimatedCostUsd:
      Number(
        estimatedCostUsd
          .toFixed(6)
      ),
  };
}


/* =========================================================
   Save API usage
========================================================= */

async function saveApiUsage({
  studentId,
  campus,
  model,
  usage,
  success,
  errorMessage,
}: {
  studentId:
    string;

  campus:
    string;

  model:
    string;

  usage:
    UsageInfo;

  success:
    boolean;

  errorMessage?:
    string | null;
}) {

  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "api_usage"
      )
      .insert({
        student_id:
          studentId,

        campus,

        model,

        input_tokens:
          usage.inputTokens,

        cached_input_tokens:
          usage.cachedInputTokens,

        cache_write_tokens:
          usage.cacheWriteTokens,

        output_tokens:
          usage.outputTokens,

        total_tokens:
          usage.totalTokens,

        estimated_cost_usd:
          usage.estimatedCostUsd,

        success,

        error_message:
          errorMessage ||
          null,
      });


  if (error) {
    console.error(
      "API usage insert error:",
      error
    );
  }
}


/* =========================================================
   Reserve one question
========================================================= */

async function reserveQuota(
  studentId: string
) {

  const usageDate =
    getTaiwanDate();


  const {
    error:
      insertError,
  } =
    await supabaseAdmin
      .from(
        "daily_usage"
      )
      .upsert(
        {
          student_id:
            studentId,

          usage_date:
            usageDate,

          count:
            0,
        },
        {
          onConflict:
            "student_id,usage_date",

          ignoreDuplicates:
            true,
        }
      );


  if (insertError) {
    throw new Error(
      "建立每日額度資料失敗。"
    );
  }


  for (
    let attempt = 0;
    attempt < 6;
    attempt++
  ) {

    const {
      data:
        currentData,
      error:
        readError,
    } =
      await supabaseAdmin
        .from(
          "daily_usage"
        )
        .select(
          "count"
        )
        .eq(
          "student_id",
          studentId
        )
        .eq(
          "usage_date",
          usageDate
        )
        .single();


    if (readError) {
      throw new Error(
        "讀取每日解題額度失敗。"
      );
    }


    const current =
      Number(
        currentData.count
      );


    if (
      current >=
      DAILY_LIMIT
    ) {
      return {
        allowed:
          false,

        count:
          current,
      };
    }


    const next =
      current + 1;


    const {
      data:
        updateData,
      error:
        updateError,
    } =
      await supabaseAdmin
        .from(
          "daily_usage"
        )
        .update({
          count:
            next,
        })
        .eq(
          "student_id",
          studentId
        )
        .eq(
          "usage_date",
          usageDate
        )
        .eq(
          "count",
          current
        )
        .select(
          "count"
        )
        .maybeSingle();


    if (updateError) {
      throw new Error(
        "更新每日解題額度失敗。"
      );
    }


    if (updateData) {
      return {
        allowed:
          true,

        count:
          Number(
            updateData.count
          ),
      };
    }
  }


  throw new Error(
    "額度更新發生衝突，請重新嘗試。"
  );
}


/* =========================================================
   Release question quota
========================================================= */

async function releaseQuota(
  studentId: string
) {

  const usageDate =
    getTaiwanDate();


  for (
    let attempt = 0;
    attempt < 5;
    attempt++
  ) {

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "daily_usage"
        )
        .select(
          "count"
        )
        .eq(
          "student_id",
          studentId
        )
        .eq(
          "usage_date",
          usageDate
        )
        .maybeSingle();


    if (
      error ||
      !data
    ) {
      return;
    }


    const current =
      Number(
        data.count
      );


    if (
      current <= 0
    ) {
      return;
    }


    const {
      data:
        updated,
    } =
      await supabaseAdmin
        .from(
          "daily_usage"
        )
        .update({
          count:
            current - 1,
        })
        .eq(
          "student_id",
          studentId
        )
        .eq(
          "usage_date",
          usageDate
        )
        .eq(
          "count",
          current
        )
        .select(
          "count"
        )
        .maybeSingle();


    if (updated) {
      return;
    }
  }
}


/* =========================================================
   POST
========================================================= */

export async function POST(
  request: NextRequest
) {

  let reservedStudentId:
    string | null =
    null;


  let currentStudentId:
    string | null =
    null;


  let currentCampus =
    "";


  let currentModel =
    "";


  let responseUsage:
    UsageInfo | null =
    null;


  let usageSaved =
    false;


  try {

    /* -----------------------------------------------------
       OpenAI key
    ----------------------------------------------------- */

    if (
      !process.env
        .OPENAI_API_KEY
    ) {
      return NextResponse.json(
        {
          error:
            "伺服器尚未設定 OPENAI_API_KEY",
        },
        {
          status:
            500,
        }
      );
    }


    /* -----------------------------------------------------
       Session
    ----------------------------------------------------- */

    const token =
      request.cookies.get(
        "hh_science_session"
      )?.value;


    if (!token) {
      return NextResponse.json(
        {
          error:
            "請先登入後再使用 AI 解題。",
        },
        {
          status:
            401,
        }
      );
    }


    const session =
      verifySessionToken(
        token
      );


    if (!session) {
      return NextResponse.json(
        {
          error:
            "登入狀態已失效，請重新登入。",
        },
        {
          status:
            401,
        }
      );
    }


    currentStudentId =
      session.studentId;


    currentCampus =
      session.campus;


    /* -----------------------------------------------------
       Read current AI model settings
    ----------------------------------------------------- */

    const aiSettings =
      await getAISettings();


    currentModel =
      aiSettings.model;


    /* -----------------------------------------------------
       Request body
    ----------------------------------------------------- */

    const body =
      await request.json();


    const {
      image,
      subject,
      referenceAnswer,
      questionNote,
    } =
      body;


    if (!image) {
      return NextResponse.json(
        {
          error:
            "缺少題目圖片",
        },
        {
          status:
            400,
        }
      );
    }


    /* -----------------------------------------------------
       Reserve quota
    ----------------------------------------------------- */

    const reservation =
      await reserveQuota(
        session.studentId
      );


    if (
      !reservation.allowed
    ) {
      return NextResponse.json(
        {
          error:
            "今日 10 題 AI 解題額度已使用完畢。",

          usage: {
            count:
              reservation.count,

            limit:
              DAILY_LIMIT,

            remaining:
              0,
          },
        },
        {
          status:
            429,
        }
      );
    }


    reservedStudentId =
      session.studentId;


    /* -----------------------------------------------------
       Subject
    ----------------------------------------------------- */

    const subjectMap:
      Record<
        string,
        string
      > = {

      auto:
        "請自行判斷物理、化學、生物或地球科學",

      physics:
        "物理",

      chemistry:
        "化學",

      biology:
        "生物",

      earth:
        "地球科學",
    };


    const subjectText =
      subjectMap[
        subject
      ] ||
      "自然科";


    /* -----------------------------------------------------
       Prompt
    ----------------------------------------------------- */

    const prompt = `
你是 H.H. Science Lab 解題實驗室的高中自然科解題老師。

請仔細辨識學生上傳的題目圖片，並以繁體中文完成解題。

指定科目：
${subjectText}

參考答案：
${referenceAnswer || "未提供"}

學生補充敘述：
${questionNote || "未提供"}

━━━━━━━━━━━━━━━━━━
【核心解題原則】
━━━━━━━━━━━━━━━━━━

1. 先自行完整判斷題意並解題。
2. 參考答案只能交叉檢查，不可以盲目迎合。
3. 若與參考答案不同，重新檢查題目、圖表、單位、選項與計算。
4. 圖片真的無法辨識時要明確說明，不得自行捏造。
5. 使用高中生最容易理解的方法。
6. 不要使用不必要的大學程度解法。

━━━━━━━━━━━━━━━━━━
【詳解必須精簡】
━━━━━━━━━━━━━━━━━━

詳解要像高中老師的講義解答，不是長篇文章。

請遵守：

1. 原則上控制在 4～7 個重點步驟。
2. 不重複相同計算。
3. 短公式直接放在句子中。
4. 只有重要推導、真正分數、多步驟計算才獨立成行。
5. 不要每一個公式都獨立一行。
6. 選項分析每一個選項以 1～2 句為原則。
7. 已經在詳解算過的內容，選項分析直接引用結果。
8. 不使用 Markdown 粗體 **。
9. 不使用 Markdown 分隔線 ---。

例如：

在稀水溶液中，$1\\ \\mathrm{ppm}\\approx1\\ \\mathrm{mg/L}$，
因此有機物濃度為
$3.24\\times10^{-3}\\ \\mathrm{g/L}$。

莫耳質量為 $162\\ \\mathrm{g/mol}$，故

$$
[\\mathrm{C_6H_{10}O_5}]
=
\\frac{
3.24\\times10^{-3}
}{
162
}
=
2.0\\times10^{-5}\\ \\mathrm{M}
$$

━━━━━━━━━━━━━━━━━━
【LaTeX 規則】
━━━━━━━━━━━━━━━━━━

行內公式：
$...$

獨立公式：
$$...$$

化學式：
$\\mathrm{H_2O}$

$\\mathrm{C_6H_{10}O_5}$

離子：
$\\mathrm{Ca^{2+}}$

$\\mathrm{SO_4^{2-}}$

科學記號：
$3.24\\times10^{-3}$

分數必須使用：

$\\frac{192}{162}$

不可用普通斜線表示數學除法。

━━━━━━━━━━━━━━━━━━
【公式內可點擊數字】
━━━━━━━━━━━━━━━━━━

挑選真正具有教學價值的重要數字，例如：

162
192
3.24
25%
0.96
3.84×10^-3

並建立 annotations。

每個 annotation 必須包含：

id
display
label
meaning
source
usage

例如：

{
  "id": "a1",
  "display": "162",
  "label": "莫耳質量",
  "meaning": "C6H10O5 的莫耳質量，單位為 g/mol",
  "source": "6×12 + 10×1 + 5×16 = 162",
  "usage": "用來將質量濃度換算成莫耳濃度"
}

━━━━━━━━━━━━━━━━━━
【公式 annotation 標記】
━━━━━━━━━━━━━━━━━━

若重要數字出現在 LaTeX 公式中，
請直接使用 KaTeX 的 \\htmlData 標記。

例如 annotation id 是 a1：

$\\htmlData{annotation=a1}{162}\\ \\mathrm{g/mol}$

如果是：

3.24×10^-3

可寫：

$\\htmlData{annotation=a2}{3.24\\times10^{-3}}\\ \\mathrm{g/L}$

如果分母 162 要可以點：

$$
\\frac{
3.24\\times10^{-3}
}{
\\htmlData{annotation=a1}{162}
}
$$

只有真正有教學意義的數字才標記。
不要標題號、選項編號、步驟編號。

━━━━━━━━━━━━━━━━━━
【各選項分析格式】
━━━━━━━━━━━━━━━━━━

各選項必須每個選項獨立一行。

格式固定：

(A) 錯：……
(B) 對：……
(C) 對：……
(D) 錯：……
(E) 錯：……

請使用真正的換行字元。

不要輸出字面上的 \\n。

━━━━━━━━━━━━━━━━━━
【輸出格式】
━━━━━━━━━━━━━━━━━━

只能輸出合法 JSON。

不要使用 Markdown code block。

格式：

{
  "answer": "答案",
  "explanation": "精簡詳解，可含 LaTeX 與 htmlData annotation",
  "options": "(A)...\\n(B)...\\n(C)...",
  "annotations": [
    {
      "id": "a1",
      "display": "162",
      "label": "莫耳質量",
      "meaning": "這個數字代表什麼",
      "source": "這個數字如何得到",
      "usage": "為什麼這裡要使用它"
    }
  ]
}
`;


    /* -----------------------------------------------------
       OpenAI
    ----------------------------------------------------- */

    const response =
      await openai.responses.create({
        model:
          aiSettings.model,

        reasoning: {
          effort:
            aiSettings.reasoningEffort,
        },

        input: [
          {
            role:
              "user",

            content: [
              {
                type:
                  "input_text",

                text:
                  prompt,
              },

              {
                type:
                  "input_image",

                image_url:
                  image,

                detail:
                  "high",
              },
            ],
          },
        ],
      });


    /*
     * OpenAI 已完成這次 request，
     * 立刻取得 usage。
     */

    responseUsage =
      calculateUsage(
        response,
        aiSettings.model
      );


    const raw =
      response.output_text
        .trim();


    let parsed;


    try {
      parsed =
        JSON.parse(
          raw
        );
    } catch {

      const firstBrace =
        raw.indexOf(
          "{"
        );


      const lastBrace =
        raw.lastIndexOf(
          "}"
        );


      if (
        firstBrace === -1 ||
        lastBrace === -1
      ) {
        throw new Error(
          "AI 回覆格式不正確，請重新解題。"
        );
      }


      parsed =
        JSON.parse(
          raw.slice(
            firstBrace,
            lastBrace + 1
          )
        );
    }


    const annotations =
      Array.isArray(
        parsed.annotations
      )
        ? parsed.annotations
        : [];


    /* -----------------------------------------------------
       Save solve history
    ----------------------------------------------------- */

    const {
      error:
        historyError,
    } =
      await supabaseAdmin
        .from(
          "solve_history"
        )
        .insert({
          student_id:
            session.studentId,

          subject:
            String(
              subject ||
              "auto"
            ),

          question_image_url:
            null,

          reference_answer:
            referenceAnswer ||
            null,

          question_note:
            questionNote ||
            null,

          answer:
            parsed.answer ||
            "",

          explanation:
            parsed.explanation ||
            "",

          options:
            parsed.options ||
            "",

          annotations,
        });


    if (
      historyError
    ) {
      console.error(
        "History insert error:",
        historyError
      );
    }


    /* -----------------------------------------------------
       Save API usage
    ----------------------------------------------------- */

    await saveApiUsage({
      studentId:
        session.studentId,

      campus:
        session.campus,

      model:
        aiSettings.model,

      usage:
        responseUsage,

      success:
        true,

      errorMessage:
        null,
    });


    usageSaved =
      true;


    reservedStudentId =
      null;


    /* -----------------------------------------------------
       Response
    ----------------------------------------------------- */

    return NextResponse.json({
      answer:
        parsed.answer ||
        "",

      explanation:
        parsed.explanation ||
        "",

      options:
        parsed.options ||
        "",

      annotations,

      usage: {
        count:
          reservation.count,

        limit:
          DAILY_LIMIT,

        remaining:
          Math.max(
            0,
            DAILY_LIMIT -
              reservation.count
          ),
      },

      ai: {
        model:
          aiSettings.model,

        reasoningEffort:
          aiSettings.reasoningEffort,
      },
    });


  } catch (
    error
  ) {

    /*
     * OpenAI 已經回應，
     * 但 JSON parsing 等後續流程失敗，
     * 仍然要保存實際 API 成本。
     */

    if (
      currentStudentId &&
      currentModel &&
      responseUsage &&
      !usageSaved
    ) {

      await saveApiUsage({
        studentId:
          currentStudentId,

        campus:
          currentCampus,

        model:
          currentModel,

        usage:
          responseUsage,

        success:
          false,

        errorMessage:
          error instanceof Error
            ? error.message
            : "Unknown error",
      });

    }


    /*
     * 學生沒有得到有效解答，
     * 所以退還每日解題額度。
     */

    if (
      reservedStudentId
    ) {
      await releaseQuota(
        reservedStudentId
      );
    }


    console.error(
      "Solve API error:",
      error
    );


    const message =
      error instanceof Error
        ? error.message
        : "AI 解題發生錯誤";


    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status:
          500,
      }
    );
  }
}