export const AI_MODELS = {
  "gpt-5.6-luna": {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    description:
      "高流量／低成本",
    inputPrice:
      0.2,
    cachedInputPrice:
      0.02,
    outputPrice:
      1.2,
  },

  "gpt-5.6-terra": {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    description:
      "品質與成本平衡",
    inputPrice:
      2.0,
    cachedInputPrice:
      0.2,
    outputPrice:
      12.0,
  },

  "gpt-5.6-sol": {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    description:
      "最高品質",
    inputPrice:
      4.0,
    cachedInputPrice:
      0.4,
    outputPrice:
      20.0,
  },
} as const;


export type AIModelId =
  keyof typeof AI_MODELS;


export const DEFAULT_AI_MODEL:
  AIModelId =
  "gpt-5.6-luna";


export function isAIModelId(
  value: string
): value is AIModelId {
  return (
    value in AI_MODELS
  );
}


export function getAIModel(
  value: string
) {
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