import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import { requireAdminSession, isSuperAdmin } from "@/lib/admin-access";

import {
  getStudentAuthSettings,
  isValidStudentPin,
} from "@/lib/student-auth";



export async function GET(
  request: NextRequest,
) {
  const admin =
    await requireAdminSession(
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
    await requireAdminSession(
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

  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "此設定僅總管理員可以修改。" }, { status: 403 });

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
