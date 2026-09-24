import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, isSuperAdmin } from "@/lib/admin-access";
import { getAllowedHistoryIds, mayViewHistory } from "@/lib/admin-history-access";
import { supabaseAdmin } from "@/lib/supabase-admin";


function strings(value: unknown, max = 12) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, max)
    : [];
}

function annotations(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item: any, index) => ({
      id: String(item.id || `t${index + 1}`).trim(),
      display: String(item.display || "").trim(),
      label: String(item.label || "").trim(),
      meaning: String(item.meaning || "").trim(),
      source: String(item.source || "").trim(),
      usage: String(item.usage || "").trim(),
    }))
    .filter((item) => item.id && item.display && item.meaning)
    .slice(0, 12);
}

function mapRule(row: any) {
  return {
    id: row.id,
    title: row.title || "",
    content: row.content || "",
    scope: row.scope || "subject",
    subject: row.subject || "",
    topic: row.topic || "",
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    priority: Number(row.priority || 50),
    enabled: row.enabled !== false,
    sourceHistoryId: row.source_history_id || "",
    updatedAt: row.updated_at,
  };
}

function mapExample(row: any) {
  return {
    id: row.id,
    solveHistoryId: row.solve_history_id || "",
    subject: row.subject || "",
    topic: row.topic || "",
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    questionSignature: row.question_signature || "",
    teacherAnswer: row.teacher_answer || "",
    teacherExplanation: row.teacher_explanation || "",
    teacherOptions: row.teacher_options || "",
    teacherStrategy: row.teacher_strategy || "",
    teacherNote: row.teacher_note || "",
    annotations: Array.isArray(row.annotations) ? row.annotations : [],
    applyScope: row.apply_scope || "similar",
    enabled: row.enabled !== false,
    updatedAt: row.updated_at,
  };
}

async function overview(allowed: Set<string> | null) {
  const [rules, examples, queue, sessions] = await Promise.all([
    supabaseAdmin.from("teacher_rules").select("id,enabled,subject,scope", { count: "exact" }),
    supabaseAdmin.from("teacher_examples").select("id,solve_history_id,enabled,subject,annotations", { count: "exact" }),
    supabaseAdmin.from("teacher_correction_queue").select("id,solve_history_id,status", { count: "exact" }),
    supabaseAdmin.from("teacher_coach_sessions").select("id,solve_history_id", { count: "exact" }),
  ]);

  const firstError = rules.error || examples.error || queue.error || sessions.error;
  if (firstError) throw firstError;

  const exampleRows = (examples.data || []).filter(row=>mayViewHistory(allowed,row.solve_history_id));
  const queueRows = (queue.data || []).filter(row=>mayViewHistory(allowed,row.solve_history_id));
  const sessionRows = (sessions.data || []).filter(row=>mayViewHistory(allowed,row.solve_history_id));
  return {
    rules: rules.count || 0,
    enabledRules: (rules.data || []).filter((row: any) => row.enabled !== false).length,
    examples: exampleRows.length,
    enabledExamples: exampleRows.filter((row: any) => row.enabled !== false).length,
    annotatedExamples: exampleRows.filter((row: any) => Array.isArray(row.annotations) && row.annotations.length > 0).length,
    pendingCorrections: queueRows.filter((row: any) => row.status === "pending").length,
    coachSessions: sessionRows.length,
    subjects: ["physics", "chemistry", "biology", "earth"].map((subject) => ({
      subject,
      rules: (rules.data || []).filter((row: any) => row.subject === subject).length,
      examples: exampleRows.filter((row: any) => row.subject === subject).length,
    })),
  };
}

export async function GET(request: NextRequest) {
  const admin=await requireAdminSession(request);
  if(!admin)return NextResponse.json({error:"未登入管理員。"},{status:401});
  const view = request.nextUrl.searchParams.get("view") || "overview";
  try {
    const allowed=await getAllowedHistoryIds(request,admin);
    if (view === "overview") return NextResponse.json({ overview: await overview(allowed) });

    if (view === "example") {
      const historyId = request.nextUrl.searchParams.get("historyId") || "";
      if (!historyId) return NextResponse.json({ item: null });
      if(!mayViewHistory(allowed,historyId))return NextResponse.json({error:"無權查看此題目。"},{status:403});
      const { data, error } = await supabaseAdmin
        .from("teacher_examples")
        .select("*")
        .eq("solve_history_id", historyId)
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ item: data ? mapExample(data) : null });
    }

    if (view === "rules") {
      const { data, error } = await supabaseAdmin
        .from("teacher_rules")
        .select("*")
        .order("priority", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return NextResponse.json({ items: (data || []).map(mapRule) });
    }

    if (view === "examples") {
      const { data, error } = await supabaseAdmin
        .from("teacher_examples")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return NextResponse.json({ items: (data || []).filter(row=>mayViewHistory(allowed,row.solve_history_id)).map(mapExample) });
    }

    if (view === "sessions") {
      const { data, error } = await supabaseAdmin
        .from("teacher_coach_sessions")
        .select("id,solve_history_id,subject,title,messages,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return NextResponse.json({ items: (data || []).filter(row=>mayViewHistory(allowed,row.solve_history_id)) });
    }

    return NextResponse.json({ error: "未知的教學資料檢視。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: `讀取教師知識庫失敗：${error instanceof Error ? error.message : "未知錯誤"}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin=await requireAdminSession(request);
  if(!admin)return NextResponse.json({error:"未登入管理員。"},{status:401});
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  try {
    const allowed=await getAllowedHistoryIds(request,admin);
    if (action === "createRule") {
      if(!isSuperAdmin(admin))return NextResponse.json({error:"全站規則僅總管理員可新增。"},{status:403});
      const content = String(body.content || "").trim();
      if (!content) return NextResponse.json({ error: "規則內容不可空白。" }, { status: 400 });
      const scope = ["global", "subject", "topic"].includes(String(body.scope)) ? String(body.scope) : "subject";
      const { data, error } = await supabaseAdmin.from("teacher_rules").insert({
        title: String(body.title || "").trim(),
        content,
        scope,
        subject: scope === "global" ? null : String(body.subject || "").trim() || null,
        topic: scope === "topic" ? String(body.topic || "").trim() || null : null,
        keywords: strings(body.keywords),
        priority: Math.max(0, Math.min(100, Number(body.priority ?? 60))),
        enabled: body.enabled !== false,
        source_history_id: String(body.sourceHistoryId || "").trim() || null,
        updated_at: new Date().toISOString(),
      }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, item: mapRule(data) });
    }

    if (action === "saveCalibration") {
      const solveHistoryId = String(body.solveHistoryId || "").trim();
      if (!solveHistoryId) return NextResponse.json({ error: "缺少題目紀錄 ID。" }, { status: 400 });
      if(!mayViewHistory(allowed,solveHistoryId))return NextResponse.json({error:"無權校正此題目。"},{status:403});
      const teacherAnswer = String(body.teacherAnswer || "").trim();
      const teacherExplanation = String(body.teacherExplanation || "").trim();
      if (!teacherExplanation) return NextResponse.json({ error: "請先填寫老師版詳解。" }, { status: 400 });

      const row = {
        solve_history_id: solveHistoryId,
        subject: String(body.subject || "").trim(),
        topic: String(body.topic || "").trim(),
        keywords: strings(body.keywords),
        question_signature: String(body.questionSignature || "").trim(),
        teacher_answer: teacherAnswer,
        teacher_explanation: teacherExplanation,
        teacher_options: String(body.teacherOptions || "").trim(),
        teacher_strategy: String(body.teacherStrategy || "").trim(),
        teacher_note: String(body.teacherNote || "").trim(),
        annotations: annotations(body.annotations),
        apply_scope: ["same", "similar", "both"].includes(String(body.applyScope)) ? body.applyScope : "similar",
        enabled: body.enabled !== false,
        updated_at: new Date().toISOString(),
      };

      const { data: example, error: exampleError } = await supabaseAdmin
        .from("teacher_examples")
        .upsert(row, { onConflict: "solve_history_id" })
        .select("*")
        .single();
      if (exampleError) throw exampleError;

      if (body.updateCurrentAnswer !== false) {
        const solveUpdates: Record<string, any> = {
          answer: teacherAnswer || undefined,
          explanation: teacherExplanation,
          options: String(body.teacherOptions || "").trim(),
          annotations: annotations(body.annotations),
        };
        Object.keys(solveUpdates).forEach((key) => solveUpdates[key] === undefined && delete solveUpdates[key]);
        const { error: solveError } = await supabaseAdmin.from("solve_history").update(solveUpdates).eq("id", solveHistoryId);
        if (solveError) throw solveError;
      }

      const studentId = String(body.studentId || "").trim();
      if (studentId) {
        const {data:historyStudent}=await supabaseAdmin.from("solve_history").select("student_id").eq("id",solveHistoryId).maybeSingle();
        if(historyStudent?.student_id!==studentId)return NextResponse.json({error:"題目與學生不一致。"},{status:400});
        const { data: correction, error: correctionError } = await supabaseAdmin.from("teacher_correction_queue").upsert({
          solve_history_id: solveHistoryId,
          student_id: studentId,
          status: "applied",
          issue_type: String(body.issueType || "better_method"),
          teacher_note: String(body.teacherNote || "").trim(),
          corrected_answer: teacherAnswer,
          corrected_explanation: teacherExplanation,
          updated_at: new Date().toISOString(),
        }, { onConflict: "solve_history_id" }).select("id").single();
        if (correctionError) throw correctionError;
        void correction;
      }

      const requestedRules = isSuperAdmin(admin) && Array.isArray(body.rules) ? body.rules : [];
      const createdRules: any[] = [];
      for (const raw of requestedRules.slice(0, 8)) {
        const content = String(raw?.content || "").trim();
        if (!content) continue;
        const scope = ["global", "subject", "topic"].includes(String(raw?.scope)) ? String(raw.scope) : "topic";
        const { data: created, error } = await supabaseAdmin.from("teacher_rules").insert({
          title: String(raw?.title || "").trim(),
          content,
          scope,
          subject: scope === "global" ? null : String(body.subject || "").trim() || null,
          topic: scope === "topic" ? String(raw?.topic || body.topic || "").trim() || null : null,
          keywords: strings(raw?.keywords || body.keywords),
          priority: Math.max(0, Math.min(100, Number(raw?.priority ?? 65))),
          enabled: true,
          source_history_id: solveHistoryId,
          source_example_id: example.id,
          updated_at: new Date().toISOString(),
        }).select("*").single();
        if (error) throw error;
        createdRules.push(mapRule(created));
      }

      return NextResponse.json({ ok: true, example: mapExample(example), rules: createdRules, rulesReadOnly:!isSuperAdmin(admin) });
    }

    if (action === "saveCoachSession") {
      const messages = Array.isArray(body.messages) ? body.messages.slice(-80) : [];
      const id = String(body.id || "").trim();
      const linkedHistoryId=String(body.solveHistoryId||"").trim()||null;
      if(!mayViewHistory(allowed,linkedHistoryId))return NextResponse.json({error:"教師教練紀錄須連結授權班級題目。"},{status:403});
      if(id&&!isSuperAdmin(admin)){
        const {data:previous}=await supabaseAdmin.from("teacher_coach_sessions").select("solve_history_id").eq("id",id).maybeSingle();
        if(!previous||!mayViewHistory(allowed,previous.solve_history_id))return NextResponse.json({error:"無權修改此教練紀錄。"},{status:403});
      }
      const payload = {
        solve_history_id: linkedHistoryId,
        subject: String(body.subject || "").trim(),
        title: String(body.title || "AI 教練對話").trim(),
        messages,
        updated_at: new Date().toISOString(),
      };
      const query = id
        ? supabaseAdmin.from("teacher_coach_sessions").update(payload).eq("id", id).select("*").single()
        : supabaseAdmin.from("teacher_coach_sessions").insert(payload).select("*").single();
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ ok: true, session: data });
    }

    return NextResponse.json({ error: "未知的教師知識庫操作。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: `儲存教師知識失敗：${error instanceof Error ? error.message : "未知錯誤"}` }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin=await requireAdminSession(request);
  if(!admin)return NextResponse.json({error:"未登入管理員。"},{status:401});
  const body = await request.json().catch(() => ({}));
  const resource = String(body.resource || "");
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "缺少資料 ID。" }, { status: 400 });
  try {
    const allowed=await getAllowedHistoryIds(request,admin);
    if(resource==="rule"&&!isSuperAdmin(admin))return NextResponse.json({error:"全站規則僅總管理員可修改。"},{status:403});
    if(resource==="example"&&!isSuperAdmin(admin)){
      const {data:example}=await supabaseAdmin.from("teacher_examples").select("solve_history_id").eq("id",id).maybeSingle();
      if(!example||!mayViewHistory(allowed,example.solve_history_id))return NextResponse.json({error:"無權修改此範例。"},{status:403});
    }
    if (resource === "rule") {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const [camel, db] of [["title","title"],["content","content"],["scope","scope"],["subject","subject"],["topic","topic"]] as const) {
        if (typeof body[camel] === "string") updates[db] = body[camel].trim() || null;
      }
      if (Array.isArray(body.keywords)) updates.keywords = strings(body.keywords);
      if (typeof body.priority !== "undefined") updates.priority = Math.max(0, Math.min(100, Number(body.priority || 0)));
      if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
      const { data, error } = await supabaseAdmin.from("teacher_rules").update(updates).eq("id", id).select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, item: mapRule(data) });
    }
    if (resource === "example") {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
      if (typeof body.applyScope === "string") updates.apply_scope = body.applyScope;
      const { data, error } = await supabaseAdmin.from("teacher_examples").update(updates).eq("id", id).select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, item: mapExample(data) });
    }
    return NextResponse.json({ error: "未知的更新資源。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: `更新教師知識失敗：${error instanceof Error ? error.message : "未知錯誤"}` }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin=await requireAdminSession(request);
  if(!admin)return NextResponse.json({error:"未登入管理員。"},{status:401});
  const body = await request.json().catch(() => ({}));
  const resource = String(body.resource || "");
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "缺少資料 ID。" }, { status: 400 });
  if(resource==="rule"&&!isSuperAdmin(admin))return NextResponse.json({error:"全站規則僅總管理員可刪除。"},{status:403});
  if(resource==="example"&&!isSuperAdmin(admin)){
    const allowed=await getAllowedHistoryIds(request,admin);
    const {data:example}=await supabaseAdmin.from("teacher_examples").select("solve_history_id").eq("id",id).maybeSingle();
    if(!example||!mayViewHistory(allowed,example.solve_history_id))return NextResponse.json({error:"無權刪除此範例。"},{status:403});
  }
  const table = resource === "rule" ? "teacher_rules" : resource === "example" ? "teacher_examples" : "";
  if (!table) return NextResponse.json({ error: "未知的刪除資源。" }, { status: 400 });
  const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: `刪除失敗：${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
