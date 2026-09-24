import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, getAccessibleStudentIds } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { answerReviewState, getAccuracyReviews } from "@/lib/accuracy-review";

const SOLVE_COST_ROLES = ["science_gate", "primary", "verifier", "arbiter"] as const;
type SolveCostRole = (typeof SOLVE_COST_ROLES)[number];

type UsageCostRow = {
  solve_history_id: string | null;
  provider: string | null;
  model: string | null;
  role: string | null;
  estimated_cost_usd: number | string | null;
};


function sanitizeImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item: any) => item && typeof item.path === "string")
    .map((item: any, index) => ({ path: String(item.path), order: Number(item.order ?? index) }))
    .sort((a, b) => a.order - b.order);
}

async function signImages(value: unknown) {
  const images = sanitizeImages(value);
  if (!images.length) return [];
  const signed = await Promise.all(images.map(async (image) => {
    const { data, error } = await supabaseAdmin.storage.from("solve-images").createSignedUrl(image.path, 60 * 60);
    return error || !data?.signedUrl ? null : data.signedUrl;
  }));
  return signed.filter((url): url is string => Boolean(url));
}

async function fetchQuestionCosts(historyIds: string[]) {
  const rows: UsageCostRow[] = [];
  const idChunkSize = 120;
  const pageSize = 1000;

  for (let start = 0; start < historyIds.length; start += idChunkSize) {
    const chunk = historyIds.slice(start, start + idChunkSize);
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseAdmin
        .from("api_usage")
        .select("solve_history_id,provider,model,role,estimated_cost_usd")
        .in("solve_history_id", chunk)
        .in("role", [...SOLVE_COST_ROLES])
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(`讀取題目成本失敗：${error.message}`);
      }

      const batch = (data || []) as UsageCostRow[];
      rows.push(...batch);
      if (batch.length < pageSize) break;
    }
  }

  const byHistory = new Map<
    string,
    {
      totalCostUsd: number;
      totalCalls: number;
      roleMap: Map<string, { role: SolveCostRole; provider: string; model: string; calls: number; costUsd: number }>;
    }
  >();

  for (const row of rows) {
    const historyId = String(row.solve_history_id || "");
    if (!historyId || !SOLVE_COST_ROLES.includes(row.role as SolveCostRole)) continue;

    const role = row.role as SolveCostRole;
    const provider = String(row.provider || "unknown");
    const model = String(row.model || "unknown");
    const costUsd = Number(row.estimated_cost_usd || 0);
    const bucket = byHistory.get(historyId) || {
      totalCostUsd: 0,
      totalCalls: 0,
      roleMap: new Map(),
    };

    bucket.totalCostUsd += Number.isFinite(costUsd) ? costUsd : 0;
    bucket.totalCalls += 1;

    const key = `${role}::${provider}::${model}`;
    const roleEntry = bucket.roleMap.get(key) || { role, provider, model, calls: 0, costUsd: 0 };
    roleEntry.calls += 1;
    roleEntry.costUsd += Number.isFinite(costUsd) ? costUsd : 0;
    bucket.roleMap.set(key, roleEntry);
    byHistory.set(historyId, bucket);
  }

  return byHistory;
}

export async function GET(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  const accessible = await getAccessibleStudentIds(request, session);
  if (accessible !== null && !accessible.length) return NextResponse.json({ items: [] });

  const params = request.nextUrl.searchParams;
  const historyId = params.get("historyId");
  const subject = params.get("subject") || "";
  const q = (params.get("q") || "").trim().toLocaleLowerCase("zh-Hant");
  const onlyIssues = params.get("issues") === "true";
  const focus = params.get("focus") || "all";
  const page = Math.min(1000, Math.max(0, Number.parseInt(params.get("page") || "0", 10) || 0));
  const pageSize = 40;
  const range = params.get("range") === "all" ? "all" : "today";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const matched: any[] = [];
  for (let offset = 0; matched.length <= (page + 1) * pageSize; offset += 200) {
    let query = supabaseAdmin
      .from("solve_history")
      .select(`
      id,student_id,subject,reference_answer,question_note,answer,explanation,options,annotations,diagram,chemical_structure,image_paths,created_at,
      primary_provider,primary_model,primary_answer,verifier_provider,verifier_model,verifier_result,
      arbiter_provider,arbiter_model,arbiter_answer,arbitration_trigger,dispute_status,
      students(name,campus,regions(name),institutions(name),classes(name))
    `)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 199);

    if (accessible !== null) query = query.in("student_id", accessible);
    if (historyId) query = query.eq("id", historyId);
    if (!historyId && range === "today") query = query.gte("created_at", `${today}T00:00:00+08:00`);
    if (subject) query = query.eq("subject", subject);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: `讀取全站題目失敗：${error.message}` }, { status: 500 });
    const batch = data || [];
    const reviews = await getAccuracyReviews(batch.map((row: any) => String(row.id)));
    const batchIds = batch.map((row: any) => String(row.id));
    const followupIds = new Set<string>();
    if (focus === "followup" && batchIds.length) {
      const { data: followups, error: followupError } = await supabaseAdmin.from("solve_followups")
        .select("solve_history_id").in("solve_history_id", batchIds);
      if (followupError) throw followupError;
      for (const followup of followups || []) followupIds.add(String(followup.solve_history_id));
    }
    const batchCosts = focus === "highCost" ? await fetchQuestionCosts(batchIds) : null;
    for (const row of batch) {
      const review = reviews.get(String(row.id));
      const answerState = answerReviewState(row.answer, row.reference_answer, review);
      const verifierVerdict = String(row.verifier_result?.verdict || "");
      const issue = (review?.verdict === "ai_correct" || review?.verdict === "invalid_question") ? false : answerState.needsReview || review?.verdict === "ai_incorrect" ||
        (!answerState.automaticMatch && (row.dispute_status === "disputed" || Boolean(row.arbitration_trigger) || verifierVerdict === "major_error"));
      if ((onlyIssues || focus === "issue") && !issue) continue;
      if (focus === "pending" && !answerState.needsReview) continue;
      if (focus === "reviewed" && (!review || review.verdict === "unreviewed")) continue;
      if (focus === "followup" && !followupIds.has(String(row.id))) continue;
      if (focus === "verifier" && !row.verifier_model) continue;
      if (focus === "arbiter" && !row.arbiter_model) continue;
      if (focus === "highCost" && Number(batchCosts?.get(String(row.id))?.totalCostUsd || 0) < 0.006) continue;
      if (q) {
        const student = Array.isArray(row.students) ? row.students[0] : row.students;
        const haystack = [student?.name, student?.campus, row.question_note, row.answer, row.reference_answer, row.explanation, row.options]
          .map((value) => String(value || "")).join("\n").toLocaleLowerCase("zh-Hant");
        if (!haystack.includes(q)) continue;
      }
      matched.push({ ...row, review, issue, partialMatch: answerState.partialMatch, automaticMatch: answerState.automaticMatch, answerMismatch: answerState.needsReview });
      if (matched.length > (page + 1) * pageSize) break;
    }
    if (batch.length < 200) break;
  }
  const hasMore = matched.length > (page + 1) * pageSize;
  const rows = matched.slice(page * pageSize, (page + 1) * pageSize);

  let costMap = new Map<string, any>();
  try {
    costMap = await fetchQuestionCosts(rows.map((row: any) => String(row.id)));
  } catch (costError) {
    console.error("Teaching question cost load error:", costError);
  }

  const historyIds = rows.map((row: any) => String(row.id));
  const followupMap = new Map<string, any[]>();
  for (let start = 0; start < historyIds.length; start += 100) {
    const chunk = historyIds.slice(start, start + 100);
    const { data: followupRows, error: followupError } = await supabaseAdmin
      .from("solve_followups")
      .select("id,solve_history_id,question,answer,diagram,provider,model,created_at")
      .in("solve_history_id", chunk)
      .order("created_at", { ascending: true });
    if (followupError) {
      console.error("Teaching question followup load error:", followupError);
      continue;
    }
    for (const followup of followupRows || []) {
      const id = String((followup as any).solve_history_id || "");
      if (!id) continue;
      const bucket = followupMap.get(id) || [];
      bucket.push({
        id: (followup as any).id,
        question: (followup as any).question || "",
        answer: (followup as any).answer || "",
        diagram: (followup as any).diagram && typeof (followup as any).diagram === "object" ? (followup as any).diagram : null,
        provider: (followup as any).provider || null,
        model: (followup as any).model || null,
        createdAt: (followup as any).created_at,
      });
      followupMap.set(id, bucket);
    }
  }

  const items = await Promise.all(
    rows.map(async (row: any) => {
      const student = Array.isArray(row.students) ? row.students[0] : row.students;
      const region = Array.isArray(student?.regions) ? student.regions[0] : student?.regions;
      const institution = Array.isArray(student?.institutions) ? student.institutions[0] : student?.institutions;
      const klass = Array.isArray(student?.classes) ? student.classes[0] : student?.classes;
      const issue = Boolean(row.issue);

      const costBucket = costMap.get(String(row.id));
      const costRoles = costBucket
        ? Array.from(costBucket.roleMap.values()).map((entry: any) => ({
            ...entry,
            costUsd: Number(Number(entry.costUsd || 0).toFixed(8)),
          }))
        : [];

      return {
        id: row.id,
        studentId: row.student_id,
        studentName: student?.name || "未命名學生",
        campus: student?.campus || "",
        regionName: region?.name || "",
        institutionName: institution?.name || "",
        className: klass?.name || "",
        subject: row.subject || "auto",
        referenceAnswer: row.reference_answer || "",
        questionNote: row.question_note || "",
        answer: row.answer || "",
        explanation: row.explanation || "",
        options: row.options || "",
        annotations: Array.isArray(row.annotations) ? row.annotations : [],
        diagram: row.diagram && typeof row.diagram === "object" ? row.diagram : null,
        chemicalStructure: row.chemical_structure && typeof row.chemical_structure === "object" ? row.chemical_structure : null,
        imageUrls: await signImages(row.image_paths),
        createdAt: row.created_at,
        primaryProvider: row.primary_provider || null,
        primaryModel: row.primary_model || null,
        primaryAnswer: row.primary_answer || null,
        verifierProvider: row.verifier_provider || null,
        verifierModel: row.verifier_model || null,
        verifierResult: row.verifier_result || null,
        arbiterProvider: row.arbiter_provider || null,
        arbiterModel: row.arbiter_model || null,
        arbiterAnswer: row.arbiter_answer || null,
        disputeStatus: row.dispute_status || "normal",
        issue,
        partialMatch: row.partialMatch,
      automaticMatch: row.automaticMatch,
        answerMismatch: row.answerMismatch,
        review: row.review || null,
        followups: followupMap.get(String(row.id)) || [],
        cost: {
          hasCostRecord: Boolean(costBucket),
          totalCostUsd: costBucket ? Number(Number(costBucket.totalCostUsd || 0).toFixed(8)) : null,
          totalCalls: costBucket ? Number(costBucket.totalCalls || 0) : 0,
          roles: costRoles,
        },
      };
    }),
  );

  return NextResponse.json({ items, page, hasMore });
}
