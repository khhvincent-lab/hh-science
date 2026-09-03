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


const DEFAULT_MONTHLY_THRESHOLD_USD =
  20;


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


  const raw =
    Number(
      (data?.value as any)
        ?.monthly_threshold_usd,
    );


  const monthlyThresholdUsd =
    Number.isFinite(
      raw,
    ) &&
    raw >
      0
      ? raw
      : DEFAULT_MONTHLY_THRESHOLD_USD;


  return NextResponse.json({
    monthlyThresholdUsd,
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
    monthlyThresholdUsd?:
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


  const monthlyThresholdUsd =
    Number(
      body.monthlyThresholdUsd,
    );


  if (
    !Number.isFinite(
      monthlyThresholdUsd,
    ) ||
    monthlyThresholdUsd <=
      0 ||
    monthlyThresholdUsd >
      100000
  ) {
    return NextResponse.json(
      {
        error:
          "警示金額必須大於 0，且不超過 100000 美元。",
      },
      {
        status:
          400,
      },
    );
  }


  const normalized =
    Number(
      monthlyThresholdUsd.toFixed(
        2,
      ),
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
            monthly_threshold_usd:
              normalized,
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

    monthlyThresholdUsd:
      normalized,
  });
}
