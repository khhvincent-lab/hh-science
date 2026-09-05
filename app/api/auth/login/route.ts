import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSessionToken } from "@/lib/session";

const STUDENT_RATE_LIMIT = { attempts: 10, windowSeconds: 10 * 60 };

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
  let body: { classId?: string; name?: string; pin?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "登入資料格式錯誤。" }, { status: 400 });
  }

  const classId = body.classId?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";

  if (!classId) {
    return NextResponse.json({ error: "請先選擇班級。" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "請輸入學生姓名。" }, { status: 400 });
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ error: "個人 PIN 必須為 4～6 位數字。" }, { status: 400 });
  }

  const clientIp = getClientIp(request);
  const rateKey = hashRateKey([
    "student-login",
    clientIp,
    classId,
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

  const { data: classRow, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id,active")
    .eq("id", classId)
    .eq("active", true)
    .maybeSingle();

  if (classError) {
    console.error("Student class lookup error:", classError);
    return NextResponse.json({ error: "班級資料讀取失敗，請稍後再試。" }, { status: 500 });
  }
  if (!classRow) {
    return NextResponse.json({ error: "選擇的班級不存在或已停用。" }, { status: 400 });
  }

  const { data: student, error: studentError } = await supabaseAdmin
    .from("students")
    .select("id,campus,name,active,class_id,pin_hash,must_change_pin")
    .eq("class_id", classId)
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

  let pinMatched = false;

  // 新版個人 PIN：優先以 students.pin_hash 驗證。
  if (student.pin_hash) {
    pinMatched = await bcrypt.compare(pin, student.pin_hash);
  } else {
    // 舊資料相容：尚未建立個人 PIN hash 時，仍可暫時使用既有班級 PIN。
    const today = getTaiwanDateString();
    const { data: classCodes, error: classCodeError } = await supabaseAdmin
      .from("class_access_codes")
      .select("id,pin_hash,valid_from,valid_until")
      .eq("campus", student.campus)
      .eq("active", true)
      .lte("valid_from", today)
      .gte("valid_until", today);

    if (classCodeError) {
      console.error("Legacy class PIN query error:", classCodeError);
      return NextResponse.json(
        { error: "PIN 驗證服務暫時無法使用。" },
        { status: 500 },
      );
    }

    for (const code of classCodes ?? []) {
      if (await bcrypt.compare(pin, code.pin_hash)) {
        pinMatched = true;
        break;
      }
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
      classId: student.class_id,
      mustChangePin: Boolean(student.must_change_pin),
    },
  });

  response.cookies.set("hh_science_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  await supabaseAdmin
    .from("students")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", student.id);

  await clearRateLimit(rateKey);
  return response;
}
