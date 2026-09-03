import {
  GoogleGenAI,
} from "@google/genai";

import {
  getAIModel,
} from "@/lib/ai-models";

import type {
  SolverRequest,
  SolverResponse,
  SolverUsage,
} from "@/lib/ai/types";


function getClient() {
  const apiKey =
    process.env
      .GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "伺服器尚未設定 GEMINI_API_KEY"
    );
  }

  return new GoogleGenAI({
    apiKey,
  });
}


function parseDataUrl(
  value:
    string
) {

  const match =
    value.match(
      /^data:([^;,]+);base64,([\s\S]+)$/
    );

  if (!match) {
    throw new Error(
      "Gemini 目前只接受已處理完成的 base64 圖片資料。"
    );
  }

  return {
    mimeType:
      match[1],

    data:
      match[2],
  };
}


function calculateUsage(
  response:
    any,
  modelId:
    string
): SolverUsage {

  const model =
    getAIModel(
      modelId
    );

  const usage =
    response
      ?.usageMetadata ||
    {};

  const inputTokens =
    Number(
      usage
        ?.promptTokenCount ||
      0
    );

  const cachedInputTokens =
    Number(
      usage
        ?.cachedContentTokenCount ||
      0
    );

  const candidateTokens =
    Number(
      usage
        ?.candidatesTokenCount ||
      0
    );

  const thoughtTokens =
    Number(
      usage
        ?.thoughtsTokenCount ||
      0
    );

  // Gemini 的 thinking tokens 以 output rate 計價。
  const outputTokens =
    candidateTokens +
    thoughtTokens;

  const totalTokens =
    Number(
      usage
        ?.totalTokenCount ||
      inputTokens +
        outputTokens
    );

  const regularInputTokens =
    Math.max(
      0,
      inputTokens -
        cachedInputTokens
    );

  const estimatedCostUsd =
    (
      regularInputTokens /
      1_000_000
    ) *
      model.inputPrice +
    (
      cachedInputTokens /
      1_000_000
    ) *
      model.cachedInputPrice +
    (
      outputTokens /
      1_000_000
    ) *
      model.outputPrice;

  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens:
      0,
    outputTokens,
    totalTokens,
    estimatedCostUsd:
      Number(
        estimatedCostUsd
          .toFixed(
            8
          )
      ),
  };
}


function buildThinkingConfig(
  modelId:
    string,
  reasoning:
    SolverRequest[
      "reasoning"
    ]
) {

  // Gemini 3.x 使用 thinkingLevel。
  // Gemini 2.5 使用 thinkingBudget；此共用版本先保留模型預設，
  // 避免把 3.x 的參數送給 2.5 而產生 400。
  if (
    !modelId.startsWith(
      "gemini-3"
    )
  ) {
    return undefined;
  }

  if (
    reasoning ===
    "low"
  ) {
    return {
      thinkingLevel:
        "low",
    };
  }

  if (
    reasoning ===
    "high" ||
    reasoning ===
    "xhigh" ||
    reasoning ===
    "max"
  ) {
    return {
      thinkingLevel:
        "high",
    };
  }

  return {
    thinkingLevel:
      "medium",
  };
}


export async function runGeminiSolver(
  request:
    SolverRequest
): Promise<SolverResponse> {

  const client =
    getClient();

  const model =
    getAIModel(
      request.model
    );

  if (
    model.provider !==
    "gemini"
  ) {
    throw new Error(
      `${request.model} 不是 Gemini 模型`
    );
  }

  const startedAt =
    Date.now();

  const contents:
    any[] = [];

  for (
    const image of
    request.images || []
  ) {
    const parsed =
      parseDataUrl(
        image
      );

    contents.push({
      inlineData: {
        mimeType:
          parsed.mimeType,

        data:
          parsed.data,
      },
    });
  }

  contents.push({
    text:
      request.prompt,
  });

  const thinkingConfig =
    buildThinkingConfig(
      request.model,
      request.reasoning
    );

  const response =
    await client
      .models
      .generateContent({
        model:
          request.model,

        contents,

        config: {
          ...(request
            .expectJson
            ? {
                responseMimeType:
                  "application/json",
              }
            : {}),

          ...(thinkingConfig
            ? {
                thinkingConfig,
              }
            : {}),
        },
      } as any);

  return {
    provider:
      "gemini",

    model:
      request.model,

    text:
      String(
        response.text ||
        ""
      ).trim(),

    usage:
      calculateUsage(
        response,
        request.model
      ),

    latencyMs:
      Date.now() -
      startedAt,
  };
}
