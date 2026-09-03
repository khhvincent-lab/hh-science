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


const USD_TO_TWD =
  32.5;

const DEFAULT_MONTHLY_THRESHOLD_TWD =
  650;


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

  const {
    data,
    error,
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
        "api_cost_alert",
      )
      .maybeSingle();


  if (error) {
    return NextResponse.json(
      {
        error:
          `讀取 API 成本警示設定失敗：${error.message}`,
      },
      {
        status:
          500,
      },
    );
  }


  const value =
    (data?.value as any) ||
    {};

  const savedTwd =
    Number(
      value.monthly_threshold_twd,
    );

  const oldUsd =
    Number(
      value.monthly_threshold_usd,
    );


  const monthlyThresholdTwd =
    Number.isFinite(
      savedTwd,
    ) &&
    savedTwd >
      0
      ? savedTwd
      : Number.isFinite(
            oldUsd,
          ) &&
          oldUsd >
            0
        ? Math.round(
            oldUsd *
              USD_TO_TWD,
          )
        : DEFAULT_MONTHLY_THRESHOLD_TWD;


  return NextResponse.json({
    monthlyThresholdTwd,
    usdToTwd:
      USD_TO_TWD,
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
    monthlyThresholdTwd?:
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


  const monthlyThresholdTwd =
    Number(
      body.monthlyThresholdTwd,
    );


  if (
    !Number.isFinite(
      monthlyThresholdTwd,
    ) ||
    monthlyThresholdTwd <=
      0 ||
    monthlyThresholdTwd >
      1000000
  ) {
    return NextResponse.json(
      {
        error:
          "警示金額必須大於 0，且不超過 NT$1,000,000。",
      },
      {
        status:
          400,
      },
    );
  }


  const normalized =
    Math.round(
      monthlyThresholdTwd,
    );


  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "app_settings",
      )
      .upsert(
        {
          id:
            "api_cost_alert",

          value: {
            monthly_threshold_twd:
              normalized,
            usd_to_twd:
              USD_TO_TWD,
          },
        },
        {
          onConflict:
            "id",
        },
      );


  if (error) {
    return NextResponse.json(
      {
        error:
          `儲存 API 成本警示設定失敗：${error.message}`,
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

    monthlyThresholdTwd:
      normalized,

    usdToTwd:
      USD_TO_TWD,
  });
}
