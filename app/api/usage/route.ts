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


const DAILY_LIMIT = 10;


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
   GET
========================================================= */

export async function GET(
  request: NextRequest
) {
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
            "尚未登入",
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
            "登入狀態已失效",
        },
        {
          status:
            401,
        }
      );
    }


    /* -----------------------------------------------------
       Read today's usage
    ----------------------------------------------------- */

    const usageDate =
      getTaiwanDate();


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
          session.studentId
        )
        .eq(
          "usage_date",
          usageDate
        )
        .maybeSingle();


    if (error) {

      console.error(
        "Usage read error:",
        error
      );


      return NextResponse.json(
        {
          error:
            "讀取今日使用量失敗",
        },
        {
          status:
            500,
        }
      );
    }


    const count =
      Number(
        data?.count ||
        0
      );


    return NextResponse.json({
      count,

      limit:
        DAILY_LIMIT,

      remaining:
        Math.max(
          0,
          DAILY_LIMIT -
            count
        ),
    });

  } catch (
    error
  ) {

    console.error(
      "Usage API error:",
      error
    );


    return NextResponse.json(
      {
        error:
          "讀取使用量時發生錯誤",
      },
      {
        status:
          500,
      }
    );
  }
}