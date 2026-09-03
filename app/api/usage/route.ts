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
      },
    ).formatToParts(
      new Date(),
    );

  const year =
    parts.find(
      (part) =>
        part.type ===
        "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        "month",
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type ===
        "day",
    )?.value;

  return `${year}-${month}-${day}`;
}


export async function GET(
  request:
    NextRequest,
) {
  const token =
    request.cookies.get(
      "hh_science_session",
    )?.value;

  if (!token) {
    return NextResponse.json(
      {
        error:
          "請先登入。",
      },
      {
        status:
          401,
      },
    );
  }

  const session =
    verifySessionToken(
      token,
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
      },
    );
  }

  const settings =
    await getAISolverSettings();

  const limit =
    settings.dailyLimit;

  const today =
    getTaiwanDate();

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "daily_usage",
      )
      .select(
        "count",
      )
      .eq(
        "student_id",
        session.studentId,
      )
      .eq(
        "usage_date",
        today,
      )
      .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error:
          `讀取今日額度失敗：${error.message}`,
      },
      {
        status:
          500,
      },
    );
  }

  const count =
    Number(
      data?.count ??
      0,
    );

  return NextResponse.json({
    count,
    limit,
    remaining:
      Math.max(
        0,
        limit - count,
      ),
  });
}
