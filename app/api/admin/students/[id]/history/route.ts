import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  verifyAdminSessionToken,
} from "@/lib/admin-session";


function startOfTaiwanDate(value: string) {
  return `${value}T00:00:00.000+08:00`;
}

function endOfTaiwanDate(value: string) {
  return `${value}T23:59:59.999+08:00`;
}

function sanitizeImages(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as any).path === "string",
    )
    .map((item: any, index) => ({
      path: String(item.path),
      mimeType: item.mimeType ? String(item.mimeType) : undefined,
      order: Number.isFinite(Number(item.order))
        ? Number(item.order)
        : index,
    }))
    .sort((a, b) => a.order - b.order);
}

async function signImages(
  images: ReturnType<typeof sanitizeImages>,
) {
  const signed = [];

  for (const image of images) {
    const { data, error } =
      await supabaseAdmin.storage
        .from("solve-images")
        .createSignedUrl(image.path, 60 * 60);

    signed.push({
      ...image,
      url: error ? null : data?.signedUrl || null,
    });
  }

  return signed;
}

async function requireAdmin(request: NextRequest) {
  const token =
    request.cookies.get(
      "hh_science_admin_session",
    )?.value;

  if (!token) return null;

  return verifyAdminSessionToken(token);
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const admin =
    await requireAdmin(request);

  if (!admin) {
    return NextResponse.json(
      { error: "未登入管理員。" },
      { status: 401 },
    );
  }

  const { id: studentId } =
    await context.params;

  const {
    data: student,
    error: studentError,
  } =
    await supabaseAdmin
      .from("students")
      .select(
        "id,campus,name,active,must_change_pin,last_login_at",
      )
      .eq("id", studentId)
      .maybeSingle();

  if (studentError) {
    return NextResponse.json(
      {
        error:
          `讀取學生資料失敗：${studentError.message}`,
      },
      { status: 500 },
    );
  }

  if (!student) {
    return NextResponse.json(
      { error: "找不到這位學生。" },
      { status: 404 },
    );
  }

  const params =
    request.nextUrl.searchParams;

  const subject =
    params.get("subject")?.trim() || "";

  const from =
    params.get("from")?.trim() || "";

  const to =
    params.get("to")?.trim() || "";

  const keyword =
    params.get("q")?.trim() || "";

  let query =
    supabaseAdmin
      .from("solve_history")
      .select(
        `
        id,
        subject,
        reference_answer,
        question_note,
        answer,
        explanation,
        options,
        image_paths,
        favorite,
        created_at,
        primary_provider,
        primary_model,
        verifier_provider,
        verifier_model,
        verifier_result,
        arbiter_provider,
        arbiter_model,
        arbitration_trigger,
        dispute_status,
        followup_count
        `,
      )
      .eq("student_id", studentId)
      .order("created_at", {
        ascending: false,
      })
      .limit(200);

  if (subject) {
    query =
      query.eq("subject", subject);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    query =
      query.gte(
        "created_at",
        startOfTaiwanDate(from),
      );
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    query =
      query.lte(
        "created_at",
        endOfTaiwanDate(to),
      );
  }

  const {
    data: rows,
    error: historyError,
  } =
    await query;

  if (historyError) {
    return NextResponse.json(
      {
        error:
          `讀取學生解題紀錄失敗：${historyError.message}`,
      },
      { status: 500 },
    );
  }

  const normalizedKeyword =
    keyword.toLocaleLowerCase("zh-Hant");

  const filtered =
    (rows || []).filter((row) => {
      if (!normalizedKeyword) return true;

      const haystack = [
        row.answer,
        row.reference_answer,
        row.question_note,
        row.explanation,
        row.options,
      ]
        .map((value) => String(value || ""))
        .join("\n")
        .toLocaleLowerCase("zh-Hant");

      return haystack.includes(
        normalizedKeyword,
      );
    });

  const historyIds =
    filtered.map((row) => row.id);

  let followupMap =
    new Map<string, any[]>();

  if (historyIds.length > 0) {
    const {
      data: followups,
      error: followupError,
    } =
      await supabaseAdmin
        .from("solve_followups")
        .select(
          `
          id,
          solve_history_id,
          question,
          answer,
          provider,
          model,
          created_at
          `,
        )
        .in(
          "solve_history_id",
          historyIds,
        )
        .eq(
          "student_id",
          studentId,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        );

    if (followupError) {
      return NextResponse.json(
        {
          error:
            `讀取學生追問紀錄失敗：${followupError.message}`,
        },
        { status: 500 },
      );
    }

    followupMap =
      (followups || []).reduce(
        (map, row) => {
          const key =
            String(
              row.solve_history_id,
            );

          const current =
            map.get(key) || [];

          current.push({
            id: row.id,
            question:
              String(row.question || ""),
            answer:
              String(row.answer || ""),
            provider:
              row.provider || null,
            model:
              row.model || null,
            createdAt:
              row.created_at,
          });

          map.set(key, current);
          return map;
        },
        new Map<string, any[]>(),
      );
  }

  const items =
    await Promise.all(
      filtered.map(async (row) => {
        const images =
          sanitizeImages(
            row.image_paths,
          );

        const followups =
          followupMap.get(
            String(row.id),
          ) || [];

        return {
          id: row.id,
          subject:
            String(row.subject || "auto"),
          referenceAnswer:
            String(row.reference_answer || ""),
          questionNote:
            String(row.question_note || ""),
          answer:
            String(row.answer || ""),
          explanation:
            String(row.explanation || ""),
          options:
            String(row.options || ""),
          imagePaths:
            await signImages(images),
          favorite:
            Boolean(row.favorite),
          createdAt:
            row.created_at,
          primaryProvider:
            row.primary_provider || null,
          primaryModel:
            row.primary_model || null,
          verifierProvider:
            row.verifier_provider || null,
          verifierModel:
            row.verifier_model || null,
          verifierResult:
            row.verifier_result || null,
          arbiterProvider:
            row.arbiter_provider || null,
          arbiterModel:
            row.arbiter_model || null,
          arbitrationTrigger:
            row.arbitration_trigger || null,
          disputeStatus:
            row.dispute_status || "normal",
          followupCount:
            Math.max(
              Number(row.followup_count || 0),
              followups.length,
            ),
          followups,
        };
      }),
    );

  return NextResponse.json({
    student: {
      id: student.id,
      campus: student.campus,
      name: student.name,
      active: student.active,
      mustChangePin:
        Boolean(
          student.must_change_pin,
        ),
      lastLoginAt:
        student.last_login_at,
    },
    items,
    count: items.length,
  });
}
