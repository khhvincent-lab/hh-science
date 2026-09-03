import crypto from "crypto";

export type StudentSessionPayload = {
  studentId: string;
  campus: string;
  name: string;
};

const SESSION_DURATION =
  60 * 60 * 24 * 30;

function getSecret() {
  const secret =
    process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "Missing SESSION_SECRET"
    );
  }

  return secret;
}


function base64UrlEncode(
  input: string
) {
  return Buffer
    .from(input)
    .toString("base64url");
}


function base64UrlDecode(
  input: string
) {
  return Buffer
    .from(
      input,
      "base64url"
    )
    .toString("utf8");
}


export function createSessionToken(
  payload: StudentSessionPayload
) {
  const expiresAt =
    Math.floor(
      Date.now() / 1000
    ) +
    SESSION_DURATION;

  const data = {
    ...payload,
    exp: expiresAt,
  };

  const encoded =
    base64UrlEncode(
      JSON.stringify(data)
    );

  const signature =
    crypto
      .createHmac(
        "sha256",
        getSecret()
      )
      .update(encoded)
      .digest("base64url");

  return `${encoded}.${signature}`;
}


export function verifySessionToken(
  token: string
):
  | StudentSessionPayload
  | null {
  try {
    const [
      encoded,
      signature,
    ] =
      token.split(".");

    if (
      !encoded ||
      !signature
    ) {
      return null;
    }

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          getSecret()
        )
        .update(encoded)
        .digest("base64url");

    const signatureBuffer =
      Buffer.from(signature);

    const expectedBuffer =
      Buffer.from(
        expectedSignature
      );

    if (
      signatureBuffer.length !==
      expectedBuffer.length
    ) {
      return null;
    }

    const valid =
      crypto.timingSafeEqual(
        signatureBuffer,
        expectedBuffer
      );

    if (!valid) {
      return null;
    }

    const decoded =
      JSON.parse(
        base64UrlDecode(
          encoded
        )
      );

    if (
      !decoded.studentId ||
      !decoded.campus ||
      !decoded.name ||
      !decoded.exp
    ) {
      return null;
    }

    const now =
      Math.floor(
        Date.now() / 1000
      );

    if (
      decoded.exp <
      now
    ) {
      return null;
    }

    return {
      studentId:
        decoded.studentId,

      campus:
        decoded.campus,

      name:
        decoded.name,
    };
  } catch {
    return null;
  }
}