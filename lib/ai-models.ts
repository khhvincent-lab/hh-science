export type AIProvider =
  | "openai"
  | "gemini";

export type ModelReasoningLevel =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type AIModelDefinition = {
  id: string;
  provider: AIProvider;
  name: string;
  description: string;

  // USD / 1M tokens
  inputPrice: number;
  cachedInputPrice: number;
  outputPrice: number;

  reasoningLevels: readonly ModelReasoningLevel[];
};

export const AI_MODELS = {
  "gpt-5.6-luna": {
    id: "gpt-5.6-luna",
    provider: "openai",
    name: "GPT-5.6 Luna",
    description: "高流量／低成本",
    inputPrice: 0.2,
    cachedInputPrice: 0.02,
    outputPrice: 1.2,
    reasoningLevels: [
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ],
  },

  "gpt-5.6-terra": {
    id: "gpt-5.6-terra",
    provider: "openai",
    name: "GPT-5.6 Terra",
    description: "品質與成本平衡",
    inputPrice: 2.0,
    cachedInputPrice: 0.2,
    outputPrice: 12.0,
    reasoningLevels: [
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ],
  },

  "gpt-5.6-sol": {
    id: "gpt-5.6-sol",
    provider: "openai",
    name: "GPT-5.6 Sol",
    description: "最高品質",
    inputPrice: 4.0,
    cachedInputPrice: 0.4,
    outputPrice: 20.0,
    reasoningLevels: [
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ],
  },

  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    provider: "gemini",
    name: "Gemini 2.5 Flash",
    description: "舊版 Flash，相容保留",
    inputPrice: 0.30,
    cachedInputPrice: 0.03,
    outputPrice: 2.50,
    reasoningLevels: [
      "none",
      "low",
      "medium",
      "high",
    ],
  },

  "gemini-3.6-flash": {
    id: "gemini-3.6-flash",
    provider: "gemini",
    name: "Gemini 3.6 Flash",
    description: "穩定高效率多模態 Flash",
    inputPrice: 0.75,
    cachedInputPrice: 0.075,
    outputPrice: 3.75,
    reasoningLevels: [
      "low",
      "medium",
      "high",
    ],
  },

  "gemini-3.8-flash": {
    id: "gemini-3.8-flash",
    provider: "gemini",
    name: "Gemini 3.8 Flash",
    description: "最新高品質多模態 Flash",
    inputPrice: 0.75,
    cachedInputPrice: 0.075,
    outputPrice: 3.75,
    reasoningLevels: [
      "low",
      "medium",
      "high",
    ],
  },
} as const satisfies Record<string, AIModelDefinition>;

export type AIModelId =
  keyof typeof AI_MODELS;

export const DEFAULT_AI_MODEL:
  AIModelId =
  "gpt-5.6-luna";

/**
 * v1.1 預設模型配置
 *
 * Primary:
 * Gemini 3.8 Flash
 *
 * Science Gate:
 * Gemini 3.6 Flash
 *
 * Verifier:
 * GPT-5.6 Luna
 *
 * Arbiter:
 * GPT-5.6 Sol
 */
export const DEFAULT_PRIMARY_MODEL:
  AIModelId =
  "gemini-3.8-flash";

export const DEFAULT_VERIFIER_MODEL:
  AIModelId =
  "gpt-5.6-luna";

export const DEFAULT_ARBITER_MODEL:
  AIModelId =
  "gpt-5.6-sol";

export const DEFAULT_GATE_MODEL:
  AIModelId =
  "gemini-3.6-flash";

export const DEFAULT_FOLLOWUP_MODEL:
  AIModelId =
  "gpt-5.6-luna";


export function isAIModelId(
  value: string
): value is AIModelId {
  return value in AI_MODELS;
}


export function getAIModel(
  value: string
): AIModelDefinition {
  if (
    isAIModelId(
      value
    )
  ) {
    return AI_MODELS[
      value
    ];
  }

  return AI_MODELS[
    DEFAULT_AI_MODEL
  ];
}


export function getModelsByProvider(
  provider: AIProvider
) {
  return Object.values(
    AI_MODELS
  ).filter(
    (model) =>
      model.provider ===
      provider
  );
}