import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  DEFAULT_AI_MODEL,
  isAIModelId,
  type AIModelId,
} from "@/lib/ai-models";


export type ReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";


export type AISettings = {
  model:
    AIModelId;

  reasoningEffort:
    ReasoningEffort;
};


const VALID_REASONING =
  new Set<
    ReasoningEffort
  >([
    "none",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);


export async function getAISettings():
  Promise<AISettings> {

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "app_settings"
      )
      .select(
        "value"
      )
      .eq(
        "id",
        "ai_model"
      )
      .maybeSingle();


  if (
    error ||
    !data
  ) {
    console.error(
      "AI settings read error:",
      error
    );

    return {
      model:
        DEFAULT_AI_MODEL,

      reasoningEffort:
        "medium",
    };
  }


  const rawModel =
    String(
      data.value
        ?.model ||
        ""
    );


  const rawReasoning =
    String(
      data.value
        ?.reasoning_effort ||
        "medium"
    ) as ReasoningEffort;


  return {
    model:
      isAIModelId(
        rawModel
      )
        ? rawModel
        : DEFAULT_AI_MODEL,

    reasoningEffort:
      VALID_REASONING.has(
        rawReasoning
      )
        ? rawReasoning
        : "medium",
  };
}