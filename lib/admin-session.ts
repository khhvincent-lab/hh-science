import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) throw new Error("Missing SESSION_SECRET");

export const ADMIN_SESSION_COOKIE = "hh_science_admin_session";
export const ADMIN_SCOPE_COOKIE = "hh_science_admin_scope";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type AdminRole = "teacher" | "super_admin" | "platform_admin";
export type AdminSessionPayload = {
  role: AdminRole;
  userId: string;
  username: string;
  displayName: string;
  exp: number;
  legacy?: boolean;
};

function sign(value: string) {
  return crypto.createHmac("sha256", SESSION_SECRET as string).update(value).digest("base64url");
}

export function createAdminSessionToken(input?: Partial<Omit<AdminSessionPayload, "exp">>) {
  const payload: AdminSessionPayload = {
    role: input?.role ?? "super_admin",
    userId: input?.userId ?? "legacy-admin",
    username: input?.username ?? "admin",
    displayName: input?.displayName ?? "總管理員",
    legacy: input?.legacy ?? false,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;
    const expected = sign(encoded);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as any;
    // 向下相容舊版 role=admin session，部署後既有瀏覽器不會被立即踢出。
    if (raw.role === "admin") {
      return {
        role: "super_admin",
        userId: "legacy-admin",
        username: "admin",
        displayName: "總管理員",
        legacy: true,
        exp: raw.exp,
      };
    }
    if (!["teacher", "super_admin", "platform_admin"].includes(raw.role)) return null;
    if (typeof raw.exp !== "number" || raw.exp < Math.floor(Date.now() / 1000)) return null;
    return raw as AdminSessionPayload;
  } catch {
    return null;
  }
}
