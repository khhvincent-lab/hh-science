import { NextRequest, NextResponse } from "next/server";
import { jobStudent, SolveInputError } from "@/lib/solve-jobs";
import { getTeachingEngineSettings } from "@/lib/teaching-engine";
import { studentDefaultMode } from "@/lib/teaching-modes";

export async function GET(request: NextRequest) {
  try {
    await jobStudent(request);
    const settings = await getTeachingEngineSettings();
    // Expose only the public depth, never teacher rules, examples or credentials.
    return NextResponse.json({ mode: studentDefaultMode(settings.mode) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "無法讀取預設解說深度。" }, { status: error instanceof SolveInputError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
