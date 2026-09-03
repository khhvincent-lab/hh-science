import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error("Missing SESSION_SECRET");
}

const COOKIE_NAME = "hh_science_admin_session";

const SESSION_MAX_AGE_SECONDS =
  60 * 60 * 24 * 7;

type AdminSessionPayload = {
  role: "admin";
  exp: number;
};

function sign(value: string) {
  return crypto
    .createHmac(
      "sha256",
      SESSION_SECRET as string
    )
    .update(value)
    .digest("base64url");
}

export function createAdminSessionToken() {
  const payload: AdminSessionPayload = {
    role: "admin",
    exp:
      Math.floor(Date.now() / 1000) +
      SESSION_MAX_AGE_SECONDS,
  };

  const encoded =
    Buffer.from(
      JSON.stringify(payload)
    ).toString("base64url");

  const signature =
    sign(encoded);

  return `${encoded}.${signature}`;
}

export function verifyAdminSessionToken(
  token: string
): AdminSessionPayload | null {
  try {
    const parts =
      token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const encoded =
      parts[0];

    const signature =
      parts[1];

    if (
      !encoded ||
      !signature
    ) {
      return null;
    }

    const expected =
      sign(encoded);

    const signatureBuffer =
      Buffer.from(signature);

    const expectedBuffer =
      Buffer.from(expected);

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
      Buffer.from(
        encoded,
        "base64url"
      ).toString("utf8");

    const payload =
      JSON.parse(
        decoded
      ) as AdminSessionPayload;

    if (
      payload.role !== "admin"
    ) {
      return null;
    }

    if (
      typeof payload.exp !==
      "number"
    ) {
      return null;
    }

    if (
      payload.exp <
      Math.floor(
        Date.now() / 1000
      )
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export {
  COOKIE_NAME as ADMIN_SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS as ADMIN_SESSION_MAX_AGE,
};