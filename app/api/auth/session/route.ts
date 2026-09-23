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
        "id,campus,name,active,must_change_pin,class_id"
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


  // Subject permissions belong to the student's current class, not campus.
  // Read them on every session refresh so admin changes reach existing logins.
  let allowedSubjects: string[] | null = null;
  if (student.class_id) {
    const { data: classRow, error: classError } = await supabaseAdmin
      .from("classes")
      .select("allowed_subjects")
      .eq("id", student.class_id)
      .maybeSingle();
    if (classError || !classRow) {
      console.error("Student class subject lookup error:", classError);
      return NextResponse.json({ error: "班級科目設定讀取失敗。" }, { status: 500 });
    }
    allowedSubjects = Array.isArray(classRow.allowed_subjects)
      ? classRow.allowed_subjects
      : [];
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

      classId: student.class_id,
      allowedSubjects,

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
