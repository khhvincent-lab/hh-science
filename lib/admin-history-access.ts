import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAccessibleStudentIds } from "@/lib/admin-access";
import type { AdminSessionPayload } from "@/lib/admin-session";

/** null denotes an unrestricted super administrator; a Set is teacher-scoped. */
export async function getAllowedHistoryIds(request: NextRequest, session: AdminSessionPayload): Promise<Set<string> | null> {
  const studentIds = await getAccessibleStudentIds(request, session);
  if (studentIds === null) return null;
  const ids = new Set<string>();
  for (let index = 0; index < studentIds.length; index += 120) {
    const chunk = studentIds.slice(index, index + 120);
    for (let offset = 0;; offset += 1000) {
      const { data, error } = await supabaseAdmin.from("solve_history")
        .select("id").in("student_id", chunk)
        .order("id").range(offset, offset + 999);
      if (error) throw new Error(`讀取教師班級題目權限失敗：${error.message}`);
      for (const row of data || []) ids.add(String(row.id));
      if ((data || []).length < 1000) break;
    }
  }
  return ids;
}
export function mayViewHistory(allowed: Set<string> | null, historyId: unknown): boolean {
  return allowed === null || (typeof historyId === "string" && allowed.has(historyId));
}
