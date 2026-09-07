import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("hh_science_admin_session")?.value;
  return token ? verifyAdminSessionToken(token) : null;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("teacher_examples")
    .select("subject,topic,keywords,question_signature,teacher_answer,teacher_explanation,teacher_options,teacher_strategy,teacher_note,annotations")
    .eq("enabled", true)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: `匯出訓練資料失敗：${error.message}` }, { status: 500 });

  const lines = (data || []).map((row: any) => JSON.stringify({
    input: {
      subject: row.subject || "",
      topic: row.topic || "",
      keywords: row.keywords || [],
      questionSignature: row.question_signature || "",
    },
    ideal_output: {
      answer: row.teacher_answer || "",
      explanation: row.teacher_explanation || "",
      options: row.teacher_options || "",
      annotations: row.annotations || [],
    },
    teacher_strategy: row.teacher_strategy || "",
    teacher_note: row.teacher_note || "",
  }));

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="hh-science-teacher-training-${new Date().toISOString().slice(0, 10)}.jsonl"`,
      "Cache-Control": "no-store",
    },
  });
}
