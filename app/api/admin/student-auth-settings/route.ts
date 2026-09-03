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

import {
  getStudentAuthSettings,
  isValidStudentPin,
} from "@/lib/student-auth";


async function requireAdmin(
  request: NextRequest,
) {
  const token =
    request.cookies.get(
      "hh_science_admin_session",
    )?.value;

  if (!token) {
    return null;
  }

  return verifyAdminSessionToken(
    token,
  );
}


export async function GET(
  request: NextRequest,
) {
  const admin =
    await requireAdmin(
      request,
    );

  if (!admin) {
    return NextResponse.json(
      {
        error:
          "未登入管理員。",
      },
      {
        status:
          401,
      },
    );
  }

  const settings =
    await getStudentAuthSettings();

  return NextResponse.json({
    initialPin:
      settings.initialPin,
  });
}


export async function POST(
  request: NextRequest,
) {
  const admin =
    await requireAdmin(
      request,
    );

  if (!admin) {
    return NextResponse.json(
      {
        error:
          "未登入管理員。",
      },
      {
        status:
          401,
      },
    );
  }

  let body: {
    initialPin?:
      string;
  };

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "資料格式錯誤。",
      },
      {
        status:
          400,
      },
    );
  }

  const initialPin =
    String(
      body.initialPin ||
      "",
    ).trim();

  if (
    !isValidStudentPin(
      initialPin,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "學生初始密碼必須為 4～6 位數字。",
      },
      {
        status:
          400,
      },
    );
  }

  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "app_settings",
      )
      .upsert(
        {
          id:
            "student_auth",

          value: {
            initial_pin:
              initialPin,
          },
        },
        {
          onConflict:
            "id",
        },
      );

  if (error) {
    return NextResponse.json(
      {
        error:
          `更新學生初始密碼失敗：${error.message}`,
      },
      {
        status:
          500,
      },
    );
  }

  return NextResponse.json({
    success:
      true,

    initialPin,
  });
}
