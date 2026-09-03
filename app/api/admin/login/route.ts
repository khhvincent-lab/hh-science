import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { createAdminSessionToken } from "@/lib/admin-session";

const ADMIN_RATE_LIMIT = { attempts: 5, windowSeconds: 15 * 60 };

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function hashRateKey(parts: string[]) {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

async function consumeRateLimit(rateKey: string) {
  const { data, error } = await supabaseAdmin.rpc("consume_auth_rate_limit", {
    p_rate_key: rateKey,
    p_limit: ADMIN_RATE_LIMIT.attempts,
    p_window_seconds: ADMIN_RATE_LIMIT.windowSeconds,
  });

  if (error) {
    console.error("Admin rate limit RPC error:", error);
    return { ok: false as const, serviceError: true as const, retryAfter: 0 };
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed) {
    return {
      ok: false as const,
      serviceError: false as const,
      retryAfter: Number(result?.retry_after_seconds ?? 60),
    };
  }

  return { ok: true as const, serviceError: false as const, retryAfter: 0 };
}

async function clearRateLimit(rateKey: string) {
  const { error } = await supabaseAdmin
    .from("auth_rate_limits")
    .delete()
    .eq("rate_key", rateKey);
  if (error) console.error("Clear admin rate limit error:", error);
}

function safePasswordEqual(input: string, expected: string) {
  const inputBuffer = Buffer.from(input, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (inputBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(inputBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json(
      { error: "伺服器尚未設定 ADMIN_PASSWORD。" },
      { status: 500 },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "登入資料格式錯誤。" }, { status: 400 });
  }

  const password = body.password ?? "";
  if (!password) {
    return NextResponse.json({ error: "請輸入管理員密碼。" }, { status: 400 });
  }

  const clientIp = getClientIp(request);
  const rateKey = hashRateKey(["admin-login", clientIp]);

  const rateLimit = await consumeRateLimit(rateKey);
  if (!rateLimit.ok) {
    if (rateLimit.serviceError) {
      return NextResponse.json(
        { error: "管理員登入服務暫時無法使用，請稍後再試。" },
        { status: 503 },
      );
    }

    const minutes = Math.max(1, Math.ceil(rateLimit.retryAfter / 60));
    return NextResponse.json(
      { error: `登入嘗試次數過多，請約 ${minutes} 分鐘後再試。` },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      },
    );
  }

  if (!safePasswordEqual(password, adminPassword)) {
    return NextResponse.json({ error: "管理員密碼錯誤。" }, { status: 401 });
  }

  const token = createAdminSessionToken();
  const response = NextResponse.json({ success: true });

  response.cookies.set("hh_science_admin_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  await clearRateLimit(rateKey);
  return response;
}
