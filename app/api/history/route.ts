import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  verifySessionToken,
} from "@/lib/session";


function endOfTaiwanDate(
  value: string,
) {
  return `${value}T23:59:59.999+08:00`;
}


function startOfTaiwanDate(
  value: string,
) {
  return `${value}T00:00:00.000+08:00`;
}


function sanitizeImages(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item) =>
        item &&
        typeof item ===
          "object" &&
        typeof item.path ===
          "string",
    )
    .map(
      (item: any, index) => ({
        path:
          String(item.path),

        mimeType:
          item.mimeType
            ? String(item.mimeType)
            : undefined,

        order:
          Number.isFinite(
            Number(item.order),
          )
            ? Number(item.order)
            : index,
      }),
    )
    .sort(
      (a, b) =>
        a.order - b.order,
    );
}


async function signImages(
  rawImages:
    ReturnType<typeof sanitizeImages>,
) {
  const result = [];

  for (const image of rawImages) {
    const {
      data,
      error,
    } =
      await supabaseAdmin
        .storage
        .from(
          "solve-images",
        )
        .createSignedUrl(
          image.path,
          60 * 60,
        );

    result.push({
      ...image,
      url:
        error
          ? null
          : data?.signedUrl ||
            null,
    });
  }

  return result;
}


export async function GET(
  request:
    NextRequest,
) {
  const token =
    request.cookies.get(
      "hh_science_session",
    )?.value;

  if (!token) {
    return NextResponse.json(
      {
        error:
          "請先登入。",
      },
      {
        status:
          401,
      },
    );
  }

  const session =
    verifySessionToken(
      token,
    );

  if (!session) {
    return NextResponse.json(
      {
        error:
          "登入狀態已失效，請重新登入。",
      },
      {
        status:
          401,
      },
    );
  }

  const { data: account } = await supabaseAdmin.from("students").select("active,must_change_pin").eq("id",session.studentId).maybeSingle();
  if (!account?.active || account.must_change_pin) return NextResponse.json({error:"請重新登入並完成密碼設定。"},{status:403});

  const searchParams =
    request.nextUrl
      .searchParams;

  const subject =
    searchParams
      .get("subject")
      ?.trim() ||
    "";

  const from =
    searchParams
      .get("from")
      ?.trim() ||
    "";

  const to =
    searchParams
      .get("to")
      ?.trim() ||
    "";

  const keyword =
    searchParams
      .get("q")
      ?.trim() ||
    "";

  const favoriteOnly =
    searchParams.get(
      "favorite",
    ) === "true";


  const pageValue = Number(searchParams.get("page") || "0");
  const page = Number.isInteger(pageValue) && pageValue >= 0 ? Math.min(pageValue, 100000) : 0;
  const pageSize = 20;
  let query =
    supabaseAdmin
      .from(
        "solve_history",
      )
      .select(
        `
        id,
        subject,
        reference_answer,
        question_note,
        answer,
        explanation,
        options,
        annotations,
        diagram,
        chemical_structure,
        image_paths,
        favorite,
        created_at,
        primary_model,
        verifier_model,
        arbiter_model
        `,
      )
      .eq(
        "student_id",
        session.studentId,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .order("id", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize);


  if (subject) {
    query =
      query.eq(
        "subject",
        subject,
      );
  }


  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      from,
    )
  ) {
    query =
      query.gte(
        "created_at",
        startOfTaiwanDate(
          from,
        ),
      );
  }


  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      to,
    )
  ) {
    query =
      query.lte(
        "created_at",
        endOfTaiwanDate(
          to,
        ),
      );
  }


  if (
    favoriteOnly
  ) {
    query =
      query.eq(
        "favorite",
        true,
      );
  }


  if (keyword.trim()) {
    // Quoted PostgREST literal: user punctuation cannot introduce another filter.
    const escaped = keyword.trim().slice(0,200).replace(/[\\%_]/g, char => "\\" + char);
    const pattern = JSON.stringify("%" + escaped + "%");
    query = query.or(["answer","reference_answer","question_note","explanation","options"].map(column => `${column}.ilike.${pattern}`).join(","));
  }

  const {
    data,
    error,
  } =
    await query;


  if (error) {
    return NextResponse.json(
      {
        error:
          `讀取解題紀錄失敗：${error.message}`,
      },
      {
        status:
          500,
      },
    );
  }


  const hasMore = (data || []).length > pageSize;
  const filtered = (data || []).slice(0, pageSize);

  const items =
    await Promise.all(
      filtered.map(
        async (
          row,
        ) => {

          const images =
            sanitizeImages(
              row.image_paths,
            );

          return {
            id:
              row.id,

            subject:
              String(
                row.subject ||
                "auto",
              ),

            referenceAnswer:
              String(
                row.reference_answer ||
                "",
              ),

            questionNote:
              String(
                row.question_note ||
                "",
              ),

            answer:
              String(
                row.answer ||
                "",
              ),

            explanation:
              String(
                row.explanation ||
                "",
              ),

            options:
              String(
                row.options ||
                "",
              ),

            annotations:
              Array.isArray(
                row.annotations,
              )
                ? row.annotations
                : [],

            diagram:
              row.diagram && typeof row.diagram === "object"
                ? row.diagram
                : null,
            chemicalStructure:
              row.chemical_structure && typeof row.chemical_structure === "object"
                ? row.chemical_structure
                : null,

            imagePaths:
              await signImages(
                images,
              ),

            favorite:
              Boolean(
                row.favorite,
              ),

            createdAt:
              row.created_at,

            primaryModel:
              row.primary_model ||
              null,

            verifierModel:
              row.verifier_model ||
              null,

            arbiterModel:
              row.arbiter_model ||
              null,
          };
        },
      ),
    );


  return NextResponse.json({
    items,
    hasMore,
    page,
    count:
      items.length,
  });
}
