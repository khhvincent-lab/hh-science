export type ReadingVisit = {
 id: string; slug: string; student_id: string | null;
 viewed_at: string; completed_at: string | null;
};
export function summarizeReading(visits: ReadingVisit[]) {
 const readers = new Set<string>();
 const completers = new Set<string>();
 let guestViews = 0;
 for (const visit of visits) {
  if (!visit.student_id) { guestViews++; continue; }
  readers.add(visit.student_id);
  if (visit.completed_at) completers.add(visit.student_id);
 }
 return {
  views: visits.length, studentViews: visits.length - guestViews, guestViews,
  readers: readers.size, completers: completers.size,
  conversion: readers.size ? Math.round(completers.size / readers.size * 1000) / 10 : null,
 };
}
export type ReadingSummary = ReturnType<typeof summarizeReading>;
export type ReadingReport = {
 range: string; startAt: string | null; endAt: string; includesGuests: boolean;
 totals: ReadingSummary;
 articles: (ReadingSummary & {slug:string;title:string})[];
};
