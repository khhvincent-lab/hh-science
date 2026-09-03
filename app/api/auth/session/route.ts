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


export async function GET(
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
    return NextResponse.json({
      authenticated:
        false,
    });
  }


  const session =
    verifySessionToken(
      token
    );

  if (
    !session
  ) {
    return NextResponse.json({
      authenticated:
        false,
    });
  }


  const {
    data:
      student,
    error,
  } =
    await supabaseAdmin
      .from(
        "students"
      )
      .select(
        "id,campus,name,active,must_change_pin"
      )
      .eq(
        "id",
        session.studentId
      )
      .maybeSingle();


  if (
    error ||
    !student ||
    !student.active
  ) {
    return NextResponse.json({
      authenticated:
        false,
    });
  }


  return NextResponse.json({
    authenticated:
      true,

    student: {
      id:
        student.id,

      campus:
        student.campus,

      name:
        student.name,

      mustChangePin:
        Boolean(
          student.must_change_pin
        ),
    },

    mustChangePin:
      Boolean(
        student.must_change_pin
      ),
  });
}
