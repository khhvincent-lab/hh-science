import { createHmac, timingSafeEqual } from "node:crypto";

export const HANDOFF_TTL = 24 * 60 * 60;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type HandoffClaim = { studentId: string; historyId: string; nonce: string; exp: number };
function sign(body: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET");
  return createHmac("sha256", secret).update("line-handoff-v1:" + body).digest("base64url");
}
export function createHandoffToken(claim: HandoffClaim) {
  const body = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return body + "." + sign(body);
}
export function verifyHandoffToken(token: string): HandoffClaim | null {
  try {
    if (token.length > 1024) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const expected = Buffer.from(sign(parts[0]));
    const actual = Buffer.from(parts[1]);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    if (!UUID.test(value.studentId) || !UUID.test(value.historyId) || !UUID.test(value.nonce) || !Number.isInteger(value.exp) || value.exp <= now || value.exp > now + HANDOFF_TTL) return null;
    return value;
  } catch { return null; }
}
