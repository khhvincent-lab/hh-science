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


export async function PATCH(
  request:
    NextRequest,
  context: {
    params:
      Promise<{
        id: string;
      }>;
  },
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

  const {
    id,
  } =
    await context.params;


  let body: {
    favorite?:
      boolean;
  };


  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "收藏資料格式錯誤。",
      },
      {
        status:
          400,
      },
    );
  }


  if (
    typeof body.favorite !==
    "boolean"
  ) {
    return NextResponse.json(
      {
        error:
          "缺少收藏狀態。",
      },
      {
        status:
          400,
      },
    );
  }


  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "solve_history",
      )
      .update({
        favorite:
          body.favorite,
      })
      .eq(
        "id",
        id,
      )
      .eq(
        "student_id",
        session.studentId,
      )
      .select(
        "id,favorite",
      )
      .maybeSingle();


  if (error) {
    return NextResponse.json(
      {
        error:
          `更新收藏狀態失敗：${error.message}`,
      },
      {
        status:
          500,
      },
    );
  }


  if (!data) {
    return NextResponse.json(
      {
        error:
          "找不到這筆解題紀錄。",
      },
      {
        status:
          404,
      },
    );
  }


  return NextResponse.json({
    success:
      true,

    favorite:
      Boolean(
        data.favorite,
      ),
  });
}
