import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminSession, getAccessibleStudentIds, assertClassAccess } from "@/lib/admin-access";


export async function GET(request: NextRequest) {
  const session=await requireAdminSession(request);
  if(!session)return NextResponse.json({error:"未登入管理員。"},{status:401});
  const ids=await getAccessibleStudentIds(request,session);
  if(ids!==null&&!ids.length)return NextResponse.json({items:[]});
  let query=supabaseAdmin
    .from("teacher_correction_queue")
    .select("id,status,issue_type,teacher_note,corrected_answer,corrected_explanation,created_at,student_id,solve_history_id,students(name),solve_history(subject,answer,explanation,image_paths)")
    .order("created_at", { ascending: false });
  if(ids!==null)query=query.in("student_id",ids);
  const {data,error}=await query;
  if (error) return NextResponse.json({ error: `讀取待修正題庫失敗：${error.message}` }, { status: 500 });

  const items = await Promise.all((data ?? []).map(async (row: any) => {
    const history = Array.isArray(row.solve_history) ? row.solve_history[0] : row.solve_history;
    const student = Array.isArray(row.students) ? row.students[0] : row.students;
    let imageUrl: string | null = null;
    const first = Array.isArray(history?.image_paths) ? history.image_paths[0] : null;
    const path = typeof first === "string" ? first : first?.path;
    if (path) {
      const { data: signed } = await supabaseAdmin.storage.from("solve-images").createSignedUrl(path, 3600);
      imageUrl = signed?.signedUrl || null;
    }
    return {
      id: row.id,
      status: row.status,
      issueType: row.issue_type,
      teacherNote: row.teacher_note || "",
      correctedAnswer: row.corrected_answer || "",
      correctedExplanation: row.corrected_explanation || "",
      createdAt: row.created_at,
      studentName: student?.name || "學生",
      subject: history?.subject || "",
      answer: history?.answer || "",
      explanation: history?.explanation || "",
      imageUrl,
    };
  }));
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const session=await requireAdminSession(request);
  if(!session)return NextResponse.json({error:"未登入管理員。"},{status:401});
  const body = await request.json().catch(() => ({}));
  const solveHistoryId = String(body.solveHistoryId || "").trim();
  const studentId = String(body.studentId || "").trim();
  if (!solveHistoryId || !studentId) return NextResponse.json({ error: "缺少解題紀錄資料。" }, { status: 400 });
  const {data:student}=await supabaseAdmin.from("students").select("id,class_id").eq("id",studentId).maybeSingle();
  if(!student||!(await assertClassAccess(request,session,student.class_id)))return NextResponse.json({error:"無法操作這位學生。"},{status:403});
  const {data:history}=await supabaseAdmin.from("solve_history").select("id").eq("id",solveHistoryId).eq("student_id",studentId).maybeSingle();
  if(!history)return NextResponse.json({error:"題目與學生不符。"},{status:400});
  const { data, error } = await supabaseAdmin.from("teacher_correction_queue").upsert({
    solve_history_id: solveHistoryId, student_id: studentId, status: "pending", issue_type: "better_method", updated_at: new Date().toISOString(),
  }, { onConflict: "solve_history_id" }).select("id").single();
  if (error) return NextResponse.json({ error: `加入待修正失敗：${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: NextRequest) {
  const session=await requireAdminSession(request);
  if(!session)return NextResponse.json({error:"未登入管理員。"},{status:401});
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "缺少修正項目 ID。" }, { status: 400 });
  const {data:item}=await supabaseAdmin.from("teacher_correction_queue").select("student_id").eq("id",id).maybeSingle();
  if(!item)return NextResponse.json({error:"找不到修正項目。"},{status:404});
  const {data:student}=await supabaseAdmin.from("students").select("class_id").eq("id",item.student_id).maybeSingle();
  if(!student||!(await assertClassAccess(request,session,student.class_id)))return NextResponse.json({error:"無法操作這位學生的題目。"},{status:403});
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof body.status === "string") updates.status = body.status;
  if (typeof body.issueType === "string") updates.issue_type = body.issueType;
  if (typeof body.teacherNote === "string") updates.teacher_note = body.teacherNote;
  if (typeof body.correctedAnswer === "string") updates.corrected_answer = body.correctedAnswer;
  if (typeof body.correctedExplanation === "string") updates.corrected_explanation = body.correctedExplanation;
  const { error } = await supabaseAdmin.from("teacher_correction_queue").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: `儲存修正內容失敗：${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
