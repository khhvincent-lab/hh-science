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

import {
  getStudentAuthSettings,
  hashStudentPin,
  isValidStudentPin,
  verifyStudentPin,
} from "@/lib/student-auth";


export async function POST(
  request:
    NextRequest
) {

  const token =
    request.cookies.get(
      "hh_science_session"
    )?.value;

  if (
    !token
  ) {
    return NextResponse.json(
      {
        error:
          "請先登入。",
      },
      {
        status:
          401,
      }
    );
  }


  const session =
    verifySessionToken(
      token
    );

  if (
    !session
  ) {
    return NextResponse.json(
      {
        error:
          "登入狀態已失效，請重新登入。",
      },
      {
        status:
          401,
      }
    );
  }


  let body: {
    currentPin?:
      string;

    newPin?:
      string;

    confirmPin?:
      string;
  };

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "密碼資料格式錯誤。",
      },
      {
        status:
          400,
      }
    );
  }


  const currentPin =
    body.currentPin
      ?.trim() ??
    "";

  const newPin =
    body.newPin
      ?.trim() ??
    "";

  const confirmPin =
    body.confirmPin
      ?.trim() ??
    "";


  if (
    !isValidStudentPin(
      newPin
    )
  ) {
    return NextResponse.json(
      {
        error:
          "新密碼必須為 4～6 位數字。",
      },
      {
        status:
          400,
      }
    );
  }


  if (
    newPin !==
    confirmPin
  ) {
    return NextResponse.json(
      {
        error:
          "兩次輸入的新密碼不一致。",
      },
      {
        status:
          400,
      }
    );
  }


  const {
    data:
      student,
    error:
      studentError,
  } =
    await supabaseAdmin
      .from(
        "students"
      )
      .select(
        "id,pin_hash,must_change_pin,active"
      )
      .eq(
        "id",
        session.studentId
      )
      .single();


  if (
    studentError ||
    !student ||
    !student.active
  ) {
    return NextResponse.json(
      {
        error:
          "學生帳號無法使用。",
      },
      {
        status:
          403,
      }
    );
  }


  const settings =
    await getStudentAuthSettings();


  // 個人密碼不可設成共用初始密碼，
  // 否則失去「個人密碼」的意義。
  if (
    newPin ===
    settings.initialPin
  ) {
    return NextResponse.json(
      {
        error:
          "新密碼不可與共用初始密碼相同。",
      },
      {
        status:
          400,
      }
    );
  }


  if (
    !student.must_change_pin
  ) {

    if (
      !isValidStudentPin(
        currentPin
      )
    ) {
      return NextResponse.json(
        {
          error:
            "請輸入目前密碼。",
        },
        {
          status:
            400,
        }
      );
    }


    const currentMatched =
      await verifyStudentPin(
        currentPin,
        student.pin_hash ||
        ""
      );

    if (
      !currentMatched
    ) {
      return NextResponse.json(
        {
          error:
            "目前密碼不正確。",
        },
        {
          status:
            401,
        }
      );
    }
  }


  const pinHash =
    await hashStudentPin(
      newPin
    );


  const {
    error:
      updateError,
  } =
    await supabaseAdmin
      .from(
        "students"
      )
      .update({
        pin_hash:
          pinHash,

        must_change_pin:
          false,

        pin_changed_at:
          new Date()
            .toISOString(),

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        session.studentId
      );


  if (
    updateError
  ) {
    return NextResponse.json(
      {
        error:
          `更新登入密碼失敗：${updateError.message}`,
      },
      {
        status:
          500,
      }
    );
  }


  return NextResponse.json({
    success:
      true,

    mustChangePin:
      false,
  });
}
