import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { getAllowedHistoryIds, mayViewHistory } from "@/lib/admin-history-access";
import { supabaseAdmin } from "@/lib/supabase-admin";


export async function GET(request: NextRequest) {
  const admin=await requireAdminSession(request);
  if(!admin)return NextResponse.json({error:"未登入管理員。"},{status:401});
  const allowed=await getAllowedHistoryIds(request,admin);
  const { data, error } = await supabaseAdmin
    .from("teacher_examples")
    .select("solve_history_id,subject,topic,keywords,question_signature,teacher_answer,teacher_explanation,teacher_options,teacher_strategy,teacher_note,annotations")
    .eq("enabled", true)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: `匯出訓練資料失敗：${error.message}` }, { status: 500 });

  const lines = (data || []).filter(row=>mayViewHistory(allowed,row.solve_history_id)).map((row: any) => JSON.stringify({
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
