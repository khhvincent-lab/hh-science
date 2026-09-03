import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  DEFAULT_AI_MODEL,
  DEFAULT_ARBITER_MODEL,
  DEFAULT_FOLLOWUP_MODEL,
  DEFAULT_GATE_MODEL,
  DEFAULT_PRIMARY_MODEL,
  DEFAULT_VERIFIER_MODEL,
  getAIModel,
  isAIModelId,
  type AIModelId,
  type AIProvider,
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


export type AISolverMode =
  | "single"
  | "multi";


export type ModelSlot = {
  provider:
    AIProvider;

  model:
    AIModelId;

  reasoning:
    ReasoningEffort;
};


export type AISolverSettings = {
  mode:
    AISolverMode;

  primary:
    ModelSlot;

  verifier:
    ModelSlot;

  arbiter:
    ModelSlot;

  scienceGate:
    ModelSlot;

  arbitration: {
    confidenceThreshold:
      number;
  };

  followup: {
    enabled:
      boolean;

    model:
      ModelSlot;

    maxPerQuestion:
      number;
  };

  dailyLimit:
    number;
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


function normalizeReasoning(
  value: unknown,
  fallback:
    ReasoningEffort
): ReasoningEffort {
  const candidate =
    String(
      value || ""
    ) as ReasoningEffort;

  return VALID_REASONING.has(
    candidate
  )
    ? candidate
    : fallback;
}


function normalizeSlot(
  value: any,
  fallbackModel:
    AIModelId,
  fallbackReasoning:
    ReasoningEffort
): ModelSlot {

  const rawModel =
    String(
      value?.model || ""
    );

  const model =
    isAIModelId(
      rawModel
    )
      ? rawModel
      : fallbackModel;

  const definition =
    getAIModel(
      model
    );

  return {
    provider:
      definition.provider,

    model,

    reasoning:
      normalizeReasoning(
        value?.reasoning ??
          value?.reasoning_effort,
        fallbackReasoning
      ),
  };
}


/**
 * 舊版 API 相容層。
 *
 * 現在 production 的 /api/solve 仍使用這個函式，
 * 所以 v1.1 Router 尚未接管前，保留原本 ai_model 行為。
 */
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
    if (error) {
      console.error(
        "AI settings read error:",
        error
      );
    }

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
    normalizeReasoning(
      data.value
        ?.reasoning_effort,
      "medium"
    );


  return {
    model:
      isAIModelId(
        rawModel
      )
        ? rawModel
        : DEFAULT_AI_MODEL,

    reasoningEffort:
      rawReasoning,
  };
}


/**
 * v1.1 Router 使用的新設定。
 *
 * app_settings.id = "ai_solver"
 * 尚未建立時，會自動使用安全預設值，
 * 不影響目前 production 的 ai_model。
 */
export async function getAISolverSettings():
  Promise<AISolverSettings> {

  const defaults:
    AISolverSettings = {
    mode:
      "multi",

    primary:
      normalizeSlot(
        null,
        DEFAULT_PRIMARY_MODEL,
        "medium"
      ),

    verifier:
      normalizeSlot(
        null,
        DEFAULT_VERIFIER_MODEL,
        "low"
      ),

    arbiter:
      normalizeSlot(
        null,
        DEFAULT_ARBITER_MODEL,
        "high"
      ),

    scienceGate:
      normalizeSlot(
        null,
        DEFAULT_GATE_MODEL,
        "low"
      ),

    arbitration: {
      confidenceThreshold:
        85,
    },

    followup: {
      enabled:
        true,

      model:
        normalizeSlot(
          null,
          DEFAULT_FOLLOWUP_MODEL,
          "low"
        ),

      maxPerQuestion:
        3,
    },

    dailyLimit:
      10,
  };


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
        "ai_solver"
      )
      .maybeSingle();


  if (
    error ||
    !data?.value
  ) {
    if (error) {
      console.error(
        "AI solver settings read error:",
        error
      );
    }

    return defaults;
  }


  const value:
    any =
    data.value;


  const confidence =
    Number(
      value
        ?.arbitration
        ?.confidenceThreshold ??
      value
        ?.arbitration
        ?.confidence_threshold ??
      85
    );


  const dailyLimit =
    Number(
      value
        ?.dailyLimit ??
      value
        ?.daily_limit ??
      10
    );


  const maxPerQuestion =
    Number(
      value
        ?.followup
        ?.maxPerQuestion ??
      value
        ?.followup
        ?.max_per_question ??
      3
    );


  return {
    mode:
      value?.mode ===
      "single"
        ? "single"
        : "multi",

    primary:
      normalizeSlot(
        value?.primary,
        DEFAULT_PRIMARY_MODEL,
        "medium"
      ),

    verifier:
      normalizeSlot(
        value?.verifier,
        DEFAULT_VERIFIER_MODEL,
        "low"
      ),

    arbiter:
      normalizeSlot(
        value?.arbiter,
        DEFAULT_ARBITER_MODEL,
        "high"
      ),

    scienceGate:
      normalizeSlot(
        value?.scienceGate ??
          value?.science_gate,
        DEFAULT_GATE_MODEL,
        "low"
      ),

    arbitration: {
      confidenceThreshold:
        Number.isFinite(
          confidence
        )
          ? Math.min(
              100,
              Math.max(
                50,
                Math.round(
                  confidence
                )
              )
            )
          : 85,
    },

    followup: {
      enabled:
        value
          ?.followup
          ?.enabled !== false,

      model:
        normalizeSlot(
          value
            ?.followup
            ?.model,
          DEFAULT_FOLLOWUP_MODEL,
          "low"
        ),

      maxPerQuestion:
        Number.isFinite(
          maxPerQuestion
        )
          ? Math.min(
              10,
              Math.max(
                1,
                Math.round(
                  maxPerQuestion
                )
              )
            )
          : 3,
    },

    dailyLimit:
      Number.isFinite(
        dailyLimit
      )
        ? Math.min(
            100,
            Math.max(
              1,
              Math.round(
                dailyLimit
              )
            )
          )
        : 10,
  };
}
