import bcrypt from "bcryptjs";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session";

import {
  AI_MODELS,
  isAIModelId,
} from "@/lib/ai-models";


/* =========================================================
   Admin check
========================================================= */

function isAdmin(
  request: NextRequest
) {
  const token =
    request.cookies.get(
      ADMIN_SESSION_COOKIE
    )?.value;

  if (!token) {
    return false;
  }

  return Boolean(
    verifyAdminSessionToken(
      token
    )
  );
}


/* =========================================================
   Taiwan date helpers
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


function getPinValidUntil() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Taipei",

        year:
          "numeric",

        month:
          "numeric",
      }
    ).formatToParts(
      new Date()
    );

  const year =
    Number(
      parts.find(
        (item) =>
          item.type ===
          "year"
      )?.value
    );

  const month =
    Number(
      parts.find(
        (item) =>
          item.type ===
          "month"
      )?.value
    );

  /*
   * 下個月 3 號 00:00
   * = 本月 PIN 到下個月 2 日仍有效
   */

  const nextMonthThird =
    new Date(
      Date.UTC(
        month === 12
          ? year + 1
          : year,

        month === 12
          ? 0
          : month,

        3
      )
    );

  return nextMonthThird
    .toISOString()
    .slice(
      0,
      10
    );
}


/* =========================================================
   GET
========================================================= */

export async function GET(
  request: NextRequest
) {
  try {

    if (
      !isAdmin(
        request
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        {
          status:
            401,
        }
      );
    }


    const [
      aiResult,
      pinsResult,
    ] =
      await Promise.all([
        supabaseAdmin
          .from(
            "app_settings"
          )
          .select(
            "value, updated_at"
          )
          .eq(
            "id",
            "ai_model"
          )
          .maybeSingle(),

        supabaseAdmin
          .from(
            "class_access_codes"
          )
          .select(
            `
            id,
            campus,
            valid_from,
            valid_until,
            active,
            updated_at
            `
          )
          .eq(
            "active",
            true
          )
          .order(
            "valid_from",
            {
              ascending:
                false,
            }
          ),
      ]);


    if (
      aiResult.error
    ) {
      throw aiResult.error;
    }


    if (
      pinsResult.error
    ) {
      throw pinsResult.error;
    }


    const aiValue =
      aiResult.data
        ?.value as
        | {
            model?: string;
            reasoning_effort?: string;
          }
        | undefined;


    const campuses = [
      "高雄班",
      "嘉義班",
      "員林班",
    ];


    const classPins =
      campuses.map(
        (
          campus
        ) => {

          const code =
            (
              pinsResult.data ||
              []
            ).find(
              (
                row
              ) =>
                row.campus ===
                campus
            );


          return {
            campus,

            configured:
              Boolean(
                code
              ),

            validFrom:
              code?.valid_from ||
              null,

            validUntil:
              code?.valid_until ||
              null,

            updatedAt:
              code?.updated_at ||
              null,
          };
        }
      );


    return NextResponse.json({
      ai: {
        model:
          aiValue?.model ||
          "gpt-5.6-luna",

        reasoningEffort:
          aiValue
            ?.reasoning_effort ||
          "medium",
      },

      models:
        Object.values(
          AI_MODELS
        ),

      classPins,
    });

  } catch (
    error
  ) {

    console.error(
      "Admin settings GET error:",
      error
    );


    return NextResponse.json(
      {
        error:
          "讀取系統設定失敗",
      },
      {
        status:
          500,
      }
    );
  }
}


/* =========================================================
   POST
========================================================= */

export async function POST(
  request: NextRequest
) {
  try {

    if (
      !isAdmin(
        request
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        {
          status:
            401,
        }
      );
    }


    const body =
      await request.json();


    const action =
      String(
        body.action ||
        ""
      );


    /* =====================================================
       Update AI
    ===================================================== */

    if (
      action ===
      "update_ai"
    ) {

      const model =
        String(
          body.model ||
          ""
        );


      const reasoningEffort =
        String(
          body.reasoningEffort ||
          ""
        );


      if (
        !isAIModelId(
          model
        )
      ) {
        return NextResponse.json(
          {
            error:
              "不支援此 AI 模型。",
          },
          {
            status:
              400,
          }
        );
      }


      const allowedReasoning = [
        "low",
        "medium",
        "high",
      ];


      if (
        !allowedReasoning.includes(
          reasoningEffort
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Reasoning 設定不正確。",
          },
          {
            status:
              400,
          }
        );
      }


      const {
        error,
      } =
        await supabaseAdmin
          .from(
            "app_settings"
          )
          .upsert({
            id:
              "ai_model",

            value: {
              model,

              reasoning_effort:
                reasoningEffort,
            },
          });


      if (error) {
        throw error;
      }


      return NextResponse.json({
        success:
          true,

        ai: {
          model,

          reasoningEffort,
        },
      });
    }


    /* =====================================================
       Update class PIN
    ===================================================== */

    if (
      action ===
      "update_class_pin"
    ) {

      const campus =
        String(
          body.campus ||
          ""
        );


      const pin =
        String(
          body.pin ||
          ""
        ).trim();


      const allowedCampuses = [
        "高雄班",
        "嘉義班",
        "員林班",
      ];


      if (
        !allowedCampuses.includes(
          campus
        )
      ) {
        return NextResponse.json(
          {
            error:
              "班級資料不正確。",
          },
          {
            status:
              400,
          }
        );
      }


      if (
        !/^\d{4}$/.test(
          pin
        )
      ) {
        return NextResponse.json(
          {
            error:
              "班級 PIN 必須為四位數字。",
          },
          {
            status:
              400,
          }
        );
      }


      const hash =
        await bcrypt.hash(
          pin,
          12
        );


      /*
       * 將目前該班的登入碼停用。
       */

      const {
        error:
          deactivateError,
      } =
        await supabaseAdmin
          .from(
            "class_access_codes"
          )
          .update({
            active:
              false,
          })
          .eq(
            "campus",
            campus
          )
          .eq(
            "active",
            true
          );


      if (
        deactivateError
      ) {
        throw deactivateError;
      }


      /*
       * 建立新登入碼。
       */

      const today =
        getTaiwanDate();


      const validUntil =
        getPinValidUntil();


      const {
        error:
          insertError,
      } =
        await supabaseAdmin
          .from(
            "class_access_codes"
          )
          .insert({
            campus,

            pin_hash:
              hash,

            valid_from:
              today,

            valid_until:
              validUntil,

            active:
              true,
          });


      if (
        insertError
      ) {
        throw insertError;
      }


      return NextResponse.json({
        success:
          true,

        campus,

        validFrom:
          today,

        validUntil,
      });
    }


    return NextResponse.json(
      {
        error:
          "Unknown action",
      },
      {
        status:
          400,
      }
    );

  } catch (
    error
  ) {

    console.error(
      "Admin settings POST error:",
      error
    );


    return NextResponse.json(
      {
        error:
          "更新系統設定失敗",
      },
      {
        status:
          500,
      }
    );
  }
}