import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session";


export async function GET(
  request: NextRequest
) {

  const token =
    request.cookies.get(
      ADMIN_SESSION_COOKIE
    )?.value;


  if (!token) {
    return NextResponse.json({
      authenticated:
        false,
    });
  }


  const session =
    verifyAdminSessionToken(
      token
    );


  if (!session) {

    const response =
      NextResponse.json({
        authenticated:
          false,
      });


    response.cookies.delete(
      ADMIN_SESSION_COOKIE
    );


    return response;
  }


  return NextResponse.json({
    authenticated:
      true,

    role:
      "admin",
  });
}