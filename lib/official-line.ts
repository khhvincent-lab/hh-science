/**
 * Public LINE Official Account destination.
 *
 * Set NEXT_PUBLIC_OFFICIAL_LINE_ID to the real @account ID to enable
 * the OA chat with a prefilled teacher message.
 * NEXT_PUBLIC_OFFICIAL_LINE_URL may be a verified lin.ee or line.me link
 * for the menu/profile when the ID is not yet available.
 * Never guess an official-account ID or route students to generic LINE share.
 */
// Confirmed by the site owner: 盧澔化學 LINE Official Account @199dbmdh.
// A deployment environment variable can override the default if the account changes.
const officialId = (process.env.NEXT_PUBLIC_OFFICIAL_LINE_ID || "@199dbmdh").trim();
const officialUrl = (process.env.NEXT_PUBLIC_OFFICIAL_LINE_URL || "").trim();

export function getOfficialLineProfileUrl(): string | null {
  if (officialId && /^@[a-zA-Z0-9._-]+$/.test(officialId)) {
    return `https://line.me/R/ti/p/${encodeURIComponent(officialId)}`;
  }
  if (/^https:\/\/(?:lin\.ee|line\.me|page\.line\.me)\//i.test(officialUrl)) {
    return officialUrl;
  }
  return null;
}

export function getOfficialLineChatUrl(message: string): string | null {
  if (!officialId || !/^@[a-zA-Z0-9._-]+$/.test(officialId)) return null;
  return `https://line.me/R/oaMessage/${encodeURIComponent(officialId)}/?${encodeURIComponent(message)}`;
}
