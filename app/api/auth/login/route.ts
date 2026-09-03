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
  createSessionToken,
} from "@/lib/session";

import {
  getStudentAuthSettings,
  hashStudentPin,
  isValidStudentPin,
  verifyStudentPin,
} from "@/lib/student-auth";


const CAMPUSES = [
  "高雄班",
  "嘉義班",
  "員林班",
] as const;

const STUDENT_RATE_LIMIT = {
  attempts:
    10,

  windowSeconds:
    10 * 60,
};


function getClientIp(
  request:
    NextRequest
) {

  // Vercel 會提供 x-forwarded-for。
  // 只取最左側的原始 client IP。
  const forwarded =
    request.headers.get(
      "x-forwarded-for"
    );

  if (
    forwarded
  ) {
    return (
      forwarded
        .split(
          ","
        )[0]
        ?.trim() ||
      "unknown"
    );
  }

  return (
    request.headers
      .get(
        "x-real-ip"
      )
      ?.trim() ||
    "unknown"
  );
}


function hashRateKey(
  parts:
    string[]
) {
  return createHash(
    "sha256"
  )
    .update(
      parts.join(
        "|"
      )
    )
    .digest(
      "hex"
    );
}


async function consumeRateLimit(
  rateKey:
    string
) {

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .rpc(
        "consume_auth_rate_limit",
        {
          p_rate_key:
            rateKey,

          p_limit:
            STUDENT_RATE_LIMIT
              .attempts,

          p_window_seconds:
            STUDENT_RATE_LIMIT
              .windowSeconds,
        }
      );

  if (
    error
  ) {
    console.error(
      "Student rate limit RPC error:",
      error
    );

    return {
      ok:
        false as const,

      serviceError:
        true as const,

      retryAfter:
        0,
    };
  }

  const result =
    Array.isArray(
      data
    )
      ? data[0]
      : data;

  if (
    !result
      ?.allowed
  ) {
    return {
      ok:
        false as const,

      serviceError:
        false as const,

      retryAfter:
        Number(
          result
            ?.retry_after_seconds ??
          60
        ),
    };
  }

  return {
    ok:
      true as const,

    serviceError:
      false as const,

    retryAfter:
      0,
  };
}


async function clearRateLimit(
  rateKey:
    string
) {

  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "auth_rate_limits"
      )
      .delete()
      .eq(
        "rate_key",
        rateKey
      );

  if (
    error
  ) {
    console.error(
      "Clear student rate limit error:",
      error
    );
  }
}


export async function POST(
  request:
    NextRequest
) {

  let body: {
    campus?:
      string;

    name?:
      string;

    pin?:
      string;
  };

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "登入資料格式錯誤。",
      },
      {
        status:
          400,
      }
    );
  }

  const campus =
    body.campus
      ?.trim() ??
    "";

  const name =
    body.name
      ?.trim() ??
    "";

  const pin =
    body.pin
      ?.trim() ??
    "";

  if (
    !CAMPUSES.includes(
      campus as
        (typeof CAMPUSES)[number]
    )
  ) {
    return NextResponse.json(
      {
        error:
          "請選擇正確班級。",
      },
      {
        status:
          400,
      }
    );
  }

  if (
    !name
  ) {
    return NextResponse.json(
      {
        error:
          "請輸入學生姓名。",
      },
      {
        status:
          400,
      }
    );
  }

  if (
    !isValidStudentPin(
      pin
    )
  ) {
    return NextResponse.json(
      {
        error:
          "個人登入密碼必須為 4～6 位數字。",
      },
      {
        status:
          400,
      }
    );
  }


  const clientIp =
    getClientIp(
      request
    );

  const rateKey =
    hashRateKey([
      "student-login",
      clientIp,
      campus,
      name.toLocaleLowerCase(
        "zh-Hant"
      ),
    ]);

  const rateLimit =
    await consumeRateLimit(
      rateKey
    );

  if (
    !rateLimit.ok
  ) {

    if (
      rateLimit.serviceError
    ) {
      return NextResponse.json(
        {
          error:
            "登入服務暫時無法使用，請稍後再試。",
        },
        {
          status:
            503,
        }
      );
    }

    const minutes =
      Math.max(
        1,
        Math.ceil(
          rateLimit.retryAfter /
          60
        )
      );

    return NextResponse.json(
      {
        error:
          `登入嘗試次數過多，請約 ${minutes} 分鐘後再試。`,
      },
      {
        status:
          429,

        headers: {
          "Retry-After":
            String(
              rateLimit.retryAfter
            ),
        },
      }
    );
  }


  const {
    data:
      student,
    error:
      studentError,
  } =
    await supabaseAdmin
      .from(
        "students"
      )
      .select(
        "id,campus,name,active,pin_hash,must_change_pin"
      )
      .eq(
        "campus",
        campus
      )
      .eq(
        "name",
        name
      )
      .eq(
        "active",
        true
      )
      .maybeSingle();

  if (
    studentError
  ) {
    console.error(
      "Student login query error:",
      studentError
    );

    return NextResponse.json(
      {
        error:
          "登入資料讀取失敗，請稍後再試。",
      },
      {
        status:
          500,
      }
    );
  }


  // 錯誤訊息統一，避免洩漏「姓名是否存在」。
  if (
    !student
  ) {
    return NextResponse.json(
      {
        error:
          "班級、姓名或登入密碼不正確。",
      },
      {
        status:
          401,
      }
    );
  }


  let matched =
    false;

  let mustChangePin =
    Boolean(
      student
        .must_change_pin
    );


  /* -----------------------------------------------------
     已經有個人 PIN hash
  ----------------------------------------------------- */

  if (
    student.pin_hash
  ) {
    matched =
      await verifyStudentPin(
        pin,
        student.pin_hash
      );
  }


  /* -----------------------------------------------------
     舊學生過渡機制

     Foundation Migration 後的既有學生 pin_hash 可能仍為 null。
     只要第一次使用「共用初始密碼」登入成功，
     立即建立 bcrypt hash 並標記 must_change_pin=true。

     因此不需要手動替每一位舊學生跑 migration。
  ----------------------------------------------------- */

  if (
    !student.pin_hash
  ) {

    const settings =
      await getStudentAuthSettings();

    if (
      pin ===
      settings.initialPin
    ) {

      const pinHash =
        await hashStudentPin(
          settings.initialPin
        );

      const {
        error:
          initializeError,
      } =
        await supabaseAdmin
          .from(
            "students"
          )
          .update({
            pin_hash:
              pinHash,

            must_change_pin:
              true,

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            student.id
          );

      if (
        initializeError
      ) {
        console.error(
          "Initialize student PIN error:",
          initializeError
        );

        return NextResponse.json(
          {
            error:
              "初始化登入密碼失敗，請稍後再試。",
          },
          {
            status:
              500,
          }
        );
      }

      matched =
        true;

      mustChangePin =
        true;
    }
  }


  if (
    !matched
  ) {
    return NextResponse.json(
      {
        error:
          "班級、姓名或登入密碼不正確。",
      },
      {
        status:
          401,
      }
    );
  }


  const token =
    createSessionToken({
      studentId:
        student.id,

      campus:
        student.campus,

      name:
        student.name,
    });


  await supabaseAdmin
    .from(
      "students"
    )
    .update({
      last_login_at:
        new Date()
          .toISOString(),
    })
    .eq(
      "id",
      student.id
    );


  const response =
    NextResponse.json({
      student: {
        id:
          student.id,

        campus:
          student.campus,

        name:
          student.name,

        mustChangePin,
      },

      mustChangePin,
    });


  response.cookies.set(
    "hh_science_session",
    token,
    {
      httpOnly:
        true,

      sameSite:
        "lax",

      secure:
        process.env
          .NODE_ENV ===
        "production",

      path:
        "/",

      maxAge:
        60 *
        60 *
        24 *
        30,
    }
  );


  await clearRateLimit(
    rateKey
  );

  return response;
}
