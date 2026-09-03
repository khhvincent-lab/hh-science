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
      .limit(
        200,
      );


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


  const normalizedKeyword =
    keyword.toLocaleLowerCase(
      "zh-Hant",
    );


  const filtered =
    (
      data ||
      []
    ).filter(
      (row) => {

        if (
          !normalizedKeyword
        ) {
          return true;
        }

        const haystack = [
          row.answer,
          row.reference_answer,
          row.question_note,
          row.explanation,
          row.options,
        ]
          .map(
            (value) =>
              String(
                value ||
                "",
              ),
          )
          .join(
            "\n",
          )
          .toLocaleLowerCase(
            "zh-Hant",
          );

        return haystack.includes(
          normalizedKeyword,
        );
      },
    );


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
    count:
      items.length,
  });
}
