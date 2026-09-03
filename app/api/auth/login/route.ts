import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSessionToken } from "@/lib/session";

const CAMPUSES = ["高雄班", "嘉義班", "員林班"] as const;
const STUDENT_RATE_LIMIT = { attempts: 6, windowSeconds: 10 * 60 };

function getTaiwanDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

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
    p_limit: STUDENT_RATE_LIMIT.attempts,
    p_window_seconds: STUDENT_RATE_LIMIT.windowSeconds,
  });

  if (error) {
    console.error("Student rate limit RPC error:", error);
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
  if (error) console.error("Clear student rate limit error:", error);
}

export async function POST(request: NextRequest) {
  let body: { campus?: string; name?: string; pin?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "登入資料格式錯誤。" }, { status: 400 });
  }

  const campus = body.campus?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";

  if (!CAMPUSES.includes(campus as (typeof CAMPUSES)[number])) {
    return NextResponse.json({ error: "請選擇正確班級。" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "請輸入學生姓名。" }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "班級 PIN 必須為四位數字。" }, { status: 400 });
  }

  const clientIp = getClientIp(request);
  const rateKey = hashRateKey([
    "student-login",
    clientIp,
    campus,
    name.toLocaleLowerCase("zh-Hant"),
  ]);

  const rateLimit = await consumeRateLimit(rateKey);
  if (!rateLimit.ok) {
    if (rateLimit.serviceError) {
      return NextResponse.json(
        { error: "登入服務暫時無法使用，請稍後再試。" },
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

  const { data: student, error: studentError } = await supabaseAdmin
    .from("students")
    .select("id,campus,name,active")
    .eq("campus", campus)
    .eq("name", name)
    .eq("active", true)
    .maybeSingle();

  if (studentError) {
    console.error("Student login query error:", studentError);
    return NextResponse.json(
      { error: "登入資料讀取失敗，請稍後再試。" },
      { status: 500 },
    );
  }

  if (!student) {
    return NextResponse.json(
      { error: "班級、姓名或 PIN 不正確。" },
      { status: 401 },
    );
  }

  const today = getTaiwanDateString();
  const { data: classCodes, error: classCodeError } = await supabaseAdmin
    .from("class_access_codes")
    .select("id,pin_hash,valid_from,valid_until")
    .eq("campus", campus)
    .eq("active", true)
    .lte("valid_from", today)
    .gte("valid_until", today);

  if (classCodeError) {
    console.error("Class PIN query error:", classCodeError);
    return NextResponse.json(
      { error: "班級 PIN 服務暫時無法使用。" },
      { status: 500 },
    );
  }

  let pinMatched = false;
  for (const code of classCodes ?? []) {
    if (await bcrypt.compare(pin, code.pin_hash)) {
      pinMatched = true;
      break;
    }
  }

  if (!pinMatched) {
    return NextResponse.json(
      { error: "班級、姓名或 PIN 不正確。" },
      { status: 401 },
    );
  }

  const token = createSessionToken({
    studentId: student.id,
    campus: student.campus,
    name: student.name,
  });

  const response = NextResponse.json({
    student: {
      id: student.id,
      campus: student.campus,
      name: student.name,
    },
  });

  response.cookies.set("hh_science_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  await clearRateLimit(rateKey);
  return response;
}
