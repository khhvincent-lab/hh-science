import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import type {
  SolverResponse,
  SolverRole,
} from "@/lib/ai/types";


export async function saveSolverUsage({
  requestId,
  solveHistoryId,
  studentId,
  campus,
  role,
  response,
  reasoningEffort,
  success,
  errorMessage,
  metadata,
}: {
  requestId:
    string;

  solveHistoryId?:
    string | null;

  studentId:
    string;

  campus:
    string;

  role:
    SolverRole;

  response:
    SolverResponse;

  reasoningEffort?:
    string | null;

  success:
    boolean;

  errorMessage?:
    string | null;

  metadata?:
    Record<
      string,
      unknown
    >;
}) {

  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "api_usage"
      )
      .insert({
        request_id:
          requestId,

        solve_history_id:
          solveHistoryId ||
          null,

        student_id:
          studentId,

        campus,

        provider:
          response.provider,

        role,

        model:
          response.model,

        reasoning_effort:
          reasoningEffort ||
          null,

        input_tokens:
          response.usage
            .inputTokens,

        cached_input_tokens:
          response.usage
            .cachedInputTokens,

        cache_write_tokens:
          response.usage
            .cacheWriteTokens,

        output_tokens:
          response.usage
            .outputTokens,

        total_tokens:
          response.usage
            .totalTokens,

        estimated_cost_usd:
          response.usage
            .estimatedCostUsd,

        latency_ms:
          response.latencyMs,

        metadata:
          metadata ||
          {},

        success,

        error_message:
          errorMessage ||
          null,
      });


  if (error) {
    console.error(
      "Solver usage insert error:",
      error
    );
  }
}
