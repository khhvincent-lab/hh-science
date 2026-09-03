import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  verifyAdminSessionToken,
} from "@/lib/admin-session";

import {
  getAISolverSettings,
} from "@/lib/ai-settings";


async function requireAdmin(
  request:
    NextRequest,
) {
  const token =
    request.cookies.get(
      "hh_science_admin_session",
    )?.value;

  if (!token) {
    return null;
  }

  return verifyAdminSessionToken(
    token,
  );
}


export async function GET(
  request:
    NextRequest,
) {
  const admin =
    await requireAdmin(
      request,
    );

  if (!admin) {
    return NextResponse.json(
      {
        error:
          "未登入管理員。",
      },
      {
        status:
          401,
      },
    );
  }

  const settings =
    await getAISolverSettings();

  return NextResponse.json({
    dailyLimit:
      settings.dailyLimit,
  });
}


export async function POST(
  request:
    NextRequest,
) {
  const admin =
    await requireAdmin(
      request,
    );

  if (!admin) {
    return NextResponse.json(
      {
        error:
          "未登入管理員。",
      },
      {
        status:
          401,
      },
    );
  }

  let body: {
    dailyLimit?:
      number;
  };

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "資料格式錯誤。",
      },
      {
        status:
          400,
      },
    );
  }

  const dailyLimit =
    Number(
      body.dailyLimit,
    );

  if (
    !Number.isInteger(
      dailyLimit,
    ) ||
    dailyLimit < 1 ||
    dailyLimit > 100
  ) {
    return NextResponse.json(
      {
        error:
          "每日解題額度必須是 1～100 的整數。",
      },
      {
        status:
          400,
      },
    );
  }

  const {
    data:
      current,
    error:
      readError,
  } =
    await supabaseAdmin
      .from(
        "app_settings",
      )
      .select(
        "value",
      )
      .eq(
        "id",
        "ai_solver",
      )
      .maybeSingle();

  if (readError) {
    return NextResponse.json(
      {
        error:
          `讀取 AI 設定失敗：${readError.message}`,
      },
      {
        status:
          500,
      },
    );
  }

  const existingValue =
    current?.value &&
    typeof current.value ===
      "object"
      ? current.value
      : {};

  const nextValue = {
    ...existingValue,
    dailyLimit,
  };

  const {
    error:
      saveError,
  } =
    await supabaseAdmin
      .from(
        "app_settings",
      )
      .upsert(
        {
          id:
            "ai_solver",
          value:
            nextValue,
        },
        {
          onConflict:
            "id",
        },
      );

  if (saveError) {
    return NextResponse.json(
      {
        error:
          `儲存每日解題額度失敗：${saveError.message}`,
      },
      {
        status:
          500,
      },
    );
  }

  return NextResponse.json({
    success:
      true,
    dailyLimit,
  });
}
