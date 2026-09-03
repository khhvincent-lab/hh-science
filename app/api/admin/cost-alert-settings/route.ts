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


const USD_TO_TWD_RATE = 32.5;
const DEFAULT_MONTHLY_THRESHOLD_TWD = 500;


async function requireAdmin(
  request: NextRequest,
) {
  const token =
    request.cookies.get(
      "hh_science_admin_session",
    )?.value;

  if (!token) return null;
  return verifyAdminSessionToken(token);
}


export async function GET(
  request: NextRequest,
) {
  const admin = await requireAdmin(request);

  if (!admin) {
    return NextResponse.json(
      { error: "未登入管理員。" },
      { status: 401 },
    );
  }

  const { data, error } =
    await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("id", "api_cost_alert")
      .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: `讀取 API 成本警示設定失敗：${error.message}`,
      },
      { status: 500 },
    );
  }

  const value =
    (data?.value || {}) as Record<string, unknown>;

  const storedTwd =
    Number(value.monthly_threshold_twd);

  const legacyUsd =
    Number(value.monthly_threshold_usd);

  const monthlyThresholdTwd =
    Number.isFinite(storedTwd) && storedTwd > 0
      ? storedTwd
      : Number.isFinite(legacyUsd) && legacyUsd > 0
        ? Math.round(legacyUsd * USD_TO_TWD_RATE)
        : DEFAULT_MONTHLY_THRESHOLD_TWD;

  return NextResponse.json({
    monthlyThresholdTwd,
    usdToTwdRate: USD_TO_TWD_RATE,
  });
}


export async function POST(
  request: NextRequest,
) {
  const admin = await requireAdmin(request);

  if (!admin) {
    return NextResponse.json(
      { error: "未登入管理員。" },
      { status: 401 },
    );
  }

  let body: {
    monthlyThresholdTwd?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "資料格式錯誤。" },
      { status: 400 },
    );
  }

  const monthlyThresholdTwd =
    Number(body.monthlyThresholdTwd);

  if (
    !Number.isFinite(monthlyThresholdTwd) ||
    monthlyThresholdTwd <= 0 ||
    monthlyThresholdTwd > 3000000
  ) {
    return NextResponse.json(
      {
        error: "警示金額必須大於 0，且不超過 NT$3,000,000。",
      },
      { status: 400 },
    );
  }

  const normalized =
    Math.round(monthlyThresholdTwd);

  const { error } =
    await supabaseAdmin
      .from("app_settings")
      .upsert(
        {
          id: "api_cost_alert",
          value: {
            monthly_threshold_twd: normalized,
            monthly_threshold_usd:
              Number(
                (normalized / USD_TO_TWD_RATE).toFixed(4),
              ),
            usd_to_twd_rate: USD_TO_TWD_RATE,
          },
        },
        { onConflict: "id" },
      );

  if (error) {
    return NextResponse.json(
      {
        error: `儲存 API 成本警示設定失敗：${error.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    monthlyThresholdTwd: normalized,
    usdToTwdRate: USD_TO_TWD_RATE,
  });
}
