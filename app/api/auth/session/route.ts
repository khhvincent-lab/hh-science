import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  verifySessionToken,
} from "@/lib/session";


export async function GET(
  request: NextRequest
) {
  const token =
    request.cookies.get(
      "hh_science_session"
    )?.value;


  if (!token) {
    return NextResponse.json({
      authenticated:
        false,
    });
  }


  const session =
    verifySessionToken(
      token
    );


  if (!session) {
    const response =
      NextResponse.json({
        authenticated:
          false,
      });

    response.cookies.delete(
      "hh_science_session"
    );

    return response;
  }


  return NextResponse.json({
    authenticated:
      true,

    student: {
      id:
        session.studentId,

      campus:
        session.campus,

      name:
        session.name,
    },
  });
}