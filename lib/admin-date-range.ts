export type AdminDateRange = "today" | "yesterday" | "7d" | "30d" | "month" | "all";

/** Calendar days in Taiwan; null means there is no lower time boundary. */
export function resolveAdminDateRange(value: string | null, now = new Date()) {
  const range: AdminDateRange = ["today", "yesterday", "7d", "30d", "month", "all"].includes(value || "")
    ? value as AdminDateRange : "7d";
  const taiwan = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const midnight = Date.UTC(taiwan.getUTCFullYear(), taiwan.getUTCMonth(), taiwan.getUTCDate());
  const day = 86400000;
  const start = range === "all" ? null : range === "month"
    ? Date.UTC(taiwan.getUTCFullYear(), taiwan.getUTCMonth(), 1)
    : midnight - (range === "yesterday" ? 1 : range === "7d" ? 6 : range === "30d" ? 29 : 0) * day;
  const startDay = start === null ? null : new Date(start).toISOString().slice(0, 10);
  const endDayExclusive = new Date(midnight + (range === "yesterday" ? 0 : day)).toISOString().slice(0, 10);
  const labels = { today: "今天（台灣時間）", yesterday: "昨天（台灣時間）", "7d": "最近 7 天（含今天）", "30d": "最近 30 天（含今天）", month: `${taiwan.getUTCFullYear()} 年 ${taiwan.getUTCMonth() + 1} 月`, all: "全部時間" };
  return { range, label: labels[range], startDay, endDayExclusive,
    startAt: startDay === null ? null : `${startDay}T00:00:00+08:00`, endAt: `${endDayExclusive}T00:00:00+08:00` };
}
