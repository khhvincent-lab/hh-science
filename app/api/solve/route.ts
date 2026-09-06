import {
  createHash,
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
  runAIRouter,
  runScienceGate,
} from "@/lib/ai/router";


/* =========================================================
   Anti double-submit
   Same student can start at most one solve every 10 seconds.
========================================================= */

function hashSolveRateKey(
  studentId: string
) {
  return createHash("sha256")
    .update(`solve-submit|${studentId}`)
    .digest("hex");
}


async function consumeSolveSubmitGuard(
  studentId: string
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin.rpc(
      "consume_auth_rate_limit",
      {
        p_rate_key:
          hashSolveRateKey(studentId),
        p_limit:
          1,
        p_window_seconds:
          10,
      }
    );

  if (error) {
    console.error(
      "Solve submit guard RPC error:",
      error
    );

    // 防重複機制故障時不阻斷正常解題。
    return {
      allowed: true,
      retryAfter: 0,
    };
  }

  const result =
    Array.isArray(data)
      ? data[0]
      : data;

  return {
    allowed:
      Boolean(result?.allowed),
    retryAfter:
      Number(
        result?.retry_after_seconds ??
        10
      ),
  };
}


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
        item.type ===
        "year"
    )?.value;

  const month =
    parts.find(
      (item) =>
        item.type ===
        "month"
    )?.value;

  const day =
    parts.find(
      (item) =>
        item.type ===
        "day"
    )?.value;

  return `${year}-${month}-${day}`;
}


/* =========================================================
   Reserve one question
========================================================= */

async function reserveQuota(
  studentId:
    string,
  dailyLimit:
    number
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
      dailyLimit
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
   Release one question
========================================================= */

async function releaseQuota(
  studentId:
    string
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
   Image helpers
========================================================= */

function normalizeImages(
  body:
    any
) {

  const rawImages =
    Array.isArray(
      body?.images
    )
      ? body.images
      : body?.image
        ? [
            body.image,
          ]
        : [];

  const images =
    rawImages
      .filter(
        (item: unknown) =>
          typeof item ===
            "string" &&
          item.length > 0
      )
      .slice(
        0,
        5
      );

  return images;
}


function parseDataUrl(
  value:
    string
) {

  const match =
    value.match(
      /^data:([^;,]+);base64,([\s\S]+)$/
    );

  if (!match) {
    return null;
  }

  const mimeType =
    match[1]
      .toLowerCase();

  const extension =
    mimeType ===
      "image/png"
      ? "png"
      : mimeType ===
          "image/webp"
        ? "webp"
        : mimeType ===
            "image/jpeg" ||
          mimeType ===
            "image/jpg"
          ? "jpg"
          : null;

  if (!extension) {
    return null;
  }

  return {
    mimeType,
    extension,
    buffer:
      Buffer.from(
        match[2],
        "base64"
      ),
  };
}


async function saveQuestionImages({
  studentId,
  requestId,
  images,
}: {
  studentId:
    string;

  requestId:
    string;

  images:
    string[];
}) {

  const saved:
    Array<{
      path:
        string;

      mimeType:
        string;

      order:
        number;
    }> = [];

  for (
    let index = 0;
    index <
      images.length;
    index++
  ) {

    const parsed =
      parseDataUrl(
        images[index]
      );

    if (!parsed) {
      console.error(
        "History image skipped: unsupported image data"
      );
      continue;
    }

    const path =
      `${studentId}/${getTaiwanDate()}/${requestId}/${index + 1}.${parsed.extension}`;

    const {
      error,
    } =
      await supabaseAdmin
        .storage
        .from(
          "solve-images"
        )
        .upload(
          path,
          parsed.buffer,
          {
            contentType:
              parsed.mimeType,

            upsert:
              false,
          }
        );

    if (error) {
      console.error(
        "History image upload error:",
        error
      );

      continue;
    }

    saved.push({
      path,
      mimeType:
        parsed.mimeType,
      order:
        index,
    });
  }

  return saved;
}


/* =========================================================
   POST
========================================================= */

export async function POST(
  request:
    NextRequest
) {

  let reservedStudentId:
    string |
    null =
    null;

  try {

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


    /* -----------------------------------------------------
       Anti double-submit
       在 Science Gate / AI 呼叫前擋掉連點與重複 request。
    ----------------------------------------------------- */

    const submitGuard =
      await consumeSolveSubmitGuard(
        session.studentId
      );

    if (!submitGuard.allowed) {
      return NextResponse.json(
        {
          error:
            "題目正在送出中，請稍候幾秒再試。",
          code:
            "DUPLICATE_SUBMIT",
          charged:
            false,
        },
        {
          status:
            429,
          headers: {
            "Retry-After":
              String(
                Math.max(
                  1,
                  submitGuard.retryAfter
                )
              ),
          },
        }
      );
    }


    /* -----------------------------------------------------
       Body
    ----------------------------------------------------- */

    let body:
      any;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "題目資料格式錯誤。",
        },
        {
          status:
            400,
        }
      );
    }

    const images =
      normalizeImages(
        body
      );

    if (
      images.length ===
      0
    ) {
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

    if (
      Array.isArray(
        body?.images
      ) &&
      body.images.length >
        5
    ) {
      return NextResponse.json(
        {
          error:
            "一次最多上傳 5 張圖片。",
        },
        {
          status:
            400,
        }
      );
    }

    const subject =
      String(
        body?.subject ||
        "auto"
      );

    const referenceAnswer =
      String(
        body
          ?.referenceAnswer ||
        ""
      ).trim();

    const questionNote =
      String(
        body
          ?.questionNote ||
        ""
      ).trim();

    const imageQuality =
      Array.isArray(body?.imageQuality)
        ? body.imageQuality.slice(0, images.length)
        : [];


    /* -----------------------------------------------------
       Settings
    ----------------------------------------------------- */

    const settings =
      await getAISolverSettings();

    const dailyLimit =
      settings.dailyLimit;


    /* -----------------------------------------------------
       Science Gate
       IMPORTANT:
       先檢查自然科，再扣每日額度。
    ----------------------------------------------------- */

    const gateCheck =
      await runScienceGate({
        studentId:
          session.studentId,

        campus:
          session.campus,

        images,

        imageQuality,
      });

    if (
      !gateCheck
        .gate
        .allowed
    ) {
      const invalidImage = gateCheck.gate.rejectionType === "invalid_image";
      return NextResponse.json(
        {
          error:
            invalidImage
              ? `圖片未通過有效性檢查：${gateCheck.gate.reason || "請重新拍攝清楚完整的題目。"}`
              : "目前僅支援物理、化學、生物與地球科學題目。",

          code:
            invalidImage ? "INVALID_IMAGE" : "NON_SCIENCE",

          gate:
            gateCheck.gate,

          usage: {
            limit:
              dailyLimit,

            charged:
              false,
          },
        },
        {
          status:
            422,
        }
      );
    }


    /* -----------------------------------------------------
       Reserve quota
    ----------------------------------------------------- */

    const reservation =
      await reserveQuota(
        session.studentId,
        dailyLimit
      );

    if (
      !reservation.allowed
    ) {
      return NextResponse.json(
        {
          error:
            `今日 ${dailyLimit} 題 AI 解題額度已使用完畢。`,

          usage: {
            count:
              reservation.count,

            limit:
              dailyLimit,

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
       AI Router
       Science Gate 已做過，不會再重跑。
    ----------------------------------------------------- */

    const routed =
      await runAIRouter(
        {
          studentId:
            session.studentId,

          campus:
            session.campus,

          images,

          subject,

          referenceAnswer,

          questionNote,

          imageQuality,
        },
        gateCheck
      );


    /* -----------------------------------------------------
       Save question images
       Storage 失敗不讓學生失去已完成的 AI 解答。
    ----------------------------------------------------- */

    const imagePaths =
      await saveQuestionImages({
        studentId:
          session.studentId,

        requestId:
          routed.requestId,

        images,
      });


    /* -----------------------------------------------------
       Save history
    ----------------------------------------------------- */

    const {
      data:
        historyData,
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

          subject,

          question_image_url:
            null,

          image_paths:
            imagePaths,

          reference_answer:
            referenceAnswer ||
            null,

          question_note:
            questionNote ||
            null,

          answer:
            routed
              .result
              .answer,

          explanation:
            routed
              .result
              .explanation,

          options:
            routed
              .result
              .options,

          annotations:
            routed
              .result
              .annotations,

          primary_provider:
            routed
              .models
              .primary
              .provider,

          primary_model:
            routed
              .models
              .primary
              .model,

          primary_answer:
            routed
              .trace
              .primaryAnswer,

          verifier_provider:
            routed
              .models
              .verifier
              ?.provider ||
            null,

          verifier_model:
            routed
              .models
              .verifier
              ?.model ||
            null,

          verifier_result:
            routed
              .trace
              .verifier ||
            null,

          arbiter_provider:
            routed
              .models
              .arbiter
              ?.provider ||
            null,

          arbiter_model:
            routed
              .models
              .arbiter
              ?.model ||
            null,

          arbiter_answer:
            routed
              .trace
              .arbiterAnswer,

          arbitration_trigger:
            routed
              .route
              .arbitrationTrigger,

          dispute_status:
            routed
              .route
              .disputeStatus,
        })
        .select(
          "id"
        )
        .single();

    let historyId:
      string |
      null =
      null;

    if (historyError) {
      console.error(
        "History insert error:",
        historyError
      );
    } else {
      historyId =
        String(
          historyData.id
        );

      const {
        error:
          usageLinkError,
      } =
        await supabaseAdmin
          .from(
            "api_usage"
          )
          .update({
            solve_history_id:
              historyId,
          })
          .eq(
            "request_id",
            routed.requestId
          );

      if (
        usageLinkError
      ) {
        console.error(
          "API usage history link error:",
          usageLinkError
        );
      }
    }


    /* -----------------------------------------------------
       Success:
       一題不論跑 1 / 2 / 3 個模型，都只扣 1 題。
    ----------------------------------------------------- */

    reservedStudentId =
      null;

    return NextResponse.json({
      answer:
        routed
          .result
          .answer,

      explanation:
        routed
          .result
          .explanation,

      options:
        routed
          .result
          .options,

      annotations:
        routed
          .result
          .annotations,

      historyId,

      usage: {
        count:
          reservation.count,

        limit:
          dailyLimit,

        remaining:
          Math.max(
            0,
            dailyLimit -
              reservation.count
          ),
      },

      ai: {
        mode:
          routed
            .route
            .mode,

        // 舊學生端相容欄位
        model:
          routed
            .models
            .primary
            .model,

        reasoningEffort:
          settings
            .primary
            .reasoning,

        primary:
          routed
            .models
            .primary,

        verifier:
          routed
            .models
            .verifier,

        arbiter:
          routed
            .models
            .arbiter,

        verifierTriggered:
          routed
            .route
            .verifierTriggered,

        arbiterTriggered:
          routed
            .route
            .arbiterTriggered,

        disputeStatus:
          routed
            .route
            .disputeStatus,
      },
    });

  } catch (
    error
  ) {

    /*
     * Science Gate 是在 reserveQuota 前執行；
     * 非自然科不會走到這裡的 quota refund。
     *
     * Primary / Verifier / Arbiter 後續若失敗，
     * 學生沒有得到有效解答，所以退還 1 題。
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
