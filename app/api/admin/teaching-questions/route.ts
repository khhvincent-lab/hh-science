import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SOLVE_COST_ROLES = ["science_gate", "primary", "verifier", "arbiter"] as const;
type SolveCostRole = (typeof SOLVE_COST_ROLES)[number];

type UsageCostRow = {
  solve_history_id: string | null;
  provider: string | null;
  model: string | null;
  role: string | null;
  estimated_cost_usd: number | string | null;
};

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("hh_science_admin_session")?.value;
  return token ? verifyAdminSessionToken(token) : null;
}

function sanitizeImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item: any) => item && typeof item.path === "string")
    .map((item: any, index) => ({ path: String(item.path), order: Number(item.order ?? index) }))
    .sort((a, b) => a.order - b.order);
}

async function signFirstImage(value: unknown) {
  const first = sanitizeImages(value)[0];
  if (!first) return null;
  const { data, error } = await supabaseAdmin.storage.from("solve-images").createSignedUrl(first.path, 60 * 60);
  return error ? null : data?.signedUrl || null;
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
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "未登入管理員。" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const subject = params.get("subject") || "";
  const q = (params.get("q") || "").trim().toLocaleLowerCase("zh-Hant");
  const onlyIssues = params.get("issues") === "true";
  const range = params.get("range") === "all" ? "all" : "today";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  let query = supabaseAdmin
    .from("solve_history")
    .select(`
      id,student_id,subject,reference_answer,question_note,answer,explanation,options,annotations,image_paths,created_at,
      primary_provider,primary_model,primary_answer,verifier_provider,verifier_model,verifier_result,
      arbiter_provider,arbiter_model,arbiter_answer,arbitration_trigger,dispute_status,
      students(name,campus,regions(name),institutions(name),classes(name))
    `)
    .order("created_at", { ascending: false })
    .limit(300);

  if (range === "today") query = query.gte("created_at", `${today}T00:00:00+08:00`);
  if (subject) query = query.eq("subject", subject);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: `讀取全站題目失敗：${error.message}` }, { status: 500 });
  }

  const rows = (data || []).filter((row: any) => {
    const verifierVerdict = String(row.verifier_result?.verdict || "");
    const isIssue =
      row.dispute_status === "disputed" ||
      Boolean(row.arbitration_trigger) ||
      verifierVerdict === "major_error" ||
      (row.reference_answer &&
        row.primary_answer &&
        String(row.reference_answer).trim() !== String(row.primary_answer).trim());

    if (onlyIssues && !isIssue) return false;
    if (!q) return true;

    const student = Array.isArray(row.students) ? row.students[0] : row.students;
    const haystack = [
      student?.name,
      student?.campus,
      row.question_note,
      row.answer,
      row.reference_answer,
      row.explanation,
      row.options,
    ]
      .map((v) => String(v || ""))
      .join("\n")
      .toLocaleLowerCase("zh-Hant");

    return haystack.includes(q);
  });

  let costMap = new Map<string, any>();
  try {
    costMap = await fetchQuestionCosts(rows.map((row: any) => String(row.id)));
  } catch (costError) {
    console.error("Teaching question cost load error:", costError);
  }

  const items = await Promise.all(
    rows.map(async (row: any) => {
      const student = Array.isArray(row.students) ? row.students[0] : row.students;
      const region = Array.isArray(student?.regions) ? student.regions[0] : student?.regions;
      const institution = Array.isArray(student?.institutions) ? student.institutions[0] : student?.institutions;
      const klass = Array.isArray(student?.classes) ? student.classes[0] : student?.classes;
      const verifierVerdict = String(row.verifier_result?.verdict || "");
      const issue =
        row.dispute_status === "disputed" ||
        Boolean(row.arbitration_trigger) ||
        verifierVerdict === "major_error" ||
        (row.reference_answer &&
          row.primary_answer &&
          String(row.reference_answer).trim() !== String(row.primary_answer).trim());

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
        imageUrl: await signFirstImage(row.image_paths),
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
        cost: {
          hasCostRecord: Boolean(costBucket),
          totalCostUsd: costBucket ? Number(Number(costBucket.totalCostUsd || 0).toFixed(8)) : null,
          totalCalls: costBucket ? Number(costBucket.totalCalls || 0) : 0,
          roles: costRoles,
        },
      };
    }),
  );

  return NextResponse.json({ items });
}
