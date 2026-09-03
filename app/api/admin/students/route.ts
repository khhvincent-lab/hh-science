import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminSessionToken } from "@/lib/admin-session";

const CAMPUSES = ["高雄班", "嘉義班", "員林班"] as const;

function getTaiwanDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("hh_science_admin_session")?.value;
  if (!token) return null;
  return verifyAdminSessionToken(token);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  }

  const { data: students, error: studentError } = await supabaseAdmin
    .from("students")
    .select("id,campus,name,active,created_at,updated_at")
    .order("campus", { ascending: true })
    .order("name", { ascending: true });

  if (studentError) {
    return NextResponse.json(
      { error: `讀取學生資料失敗：${studentError.message}` },
      { status: 500 },
    );
  }

  const today = getTaiwanDateString();

  const { data: usages, error: usageError } = await supabaseAdmin
    .from("daily_usage")
    .select("student_id,count")
    .eq("usage_date", today);

  if (usageError) {
    return NextResponse.json(
      { error: `讀取今日額度失敗：${usageError.message}` },
      { status: 500 },
    );
  }

  const usageMap = new Map(
    (usages ?? []).map((row) => [row.student_id as string, Number(row.count ?? 0)]),
  );

  const rows = (students ?? []).map((student) => ({
    ...student,
    todayCount: usageMap.get(student.id) ?? 0,
  }));

  return NextResponse.json({
    students: rows,
    today,
    summary: {
      total: rows.length,
      active: rows.filter((row) => row.active).length,
      inactive: rows.filter((row) => !row.active).length,
      campuses: CAMPUSES.map((campus) => ({
        campus,
        count: rows.filter((row) => row.campus === campus).length,
      })),
    },
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  }

  let body: { campus?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "資料格式錯誤。" }, { status: 400 });
  }

  const campus = body.campus?.trim() ?? "";
  const name = body.name?.trim() ?? "";

  if (!CAMPUSES.includes(campus as (typeof CAMPUSES)[number])) {
    return NextResponse.json({ error: "請選擇正確班級。" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "請輸入學生姓名。" }, { status: 400 });
  }

  if (name.length > 40) {
    return NextResponse.json({ error: "學生姓名過長。" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("campus", campus)
    .eq("name", name)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: `檢查學生資料失敗：${existingError.message}` },
      { status: 500 },
    );
  }

  if (existing) {
    return NextResponse.json(
      { error: `${campus} 已經有一位「${name}」。` },
      { status: 409 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("students")
    .insert({
      campus,
      name,
      active: true,
    })
    .select("id,campus,name,active,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: `新增學生失敗：${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ student: { ...data, todayCount: 0 } });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  }

  let body: { id?: string; active?: boolean; campus?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "資料格式錯誤。" }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "缺少學生 ID。" }, { status: 400 });
  }

  const updates: Record<string, string | boolean> = {};

  if (typeof body.active === "boolean") {
    updates.active = body.active;
  }

  if (typeof body.campus === "string") {
    const campus = body.campus.trim();
    if (!CAMPUSES.includes(campus as (typeof CAMPUSES)[number])) {
      return NextResponse.json({ error: "班級格式錯誤。" }, { status: 400 });
    }
    updates.campus = campus;
  }

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "學生姓名不可空白。" }, { status: 400 });
    }
    if (name.length > 40) {
      return NextResponse.json({ error: "學生姓名過長。" }, { status: 400 });
    }
    updates.name = name;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "沒有需要更新的內容。" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("students")
    .update(updates)
    .eq("id", id)
    .select("id,campus,name,active,created_at,updated_at")
    .single();

  if (error) {
    const duplicate =
      error.code === "23505" ||
      error.message.toLowerCase().includes("duplicate") ||
      error.message.toLowerCase().includes("unique");

    return NextResponse.json(
      {
        error: duplicate
          ? "同一班級已經有同名學生。"
          : `更新學生失敗：${error.message}`,
      },
      { status: duplicate ? 409 : 500 },
    );
  }

  return NextResponse.json({ student: data });
}
