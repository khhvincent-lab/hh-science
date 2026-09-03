import OpenAI from "openai";

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
      .OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "伺服器尚未設定 OPENAI_API_KEY"
    );
  }

  return new OpenAI({
    apiKey,
  });
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

  const inputTokens =
    Number(
      response?.usage
        ?.input_tokens ||
      0
    );

  const cachedInputTokens =
    Number(
      response?.usage
        ?.input_tokens_details
        ?.cached_tokens ||
      0
    );

  const cacheWriteTokens =
    Number(
      response?.usage
        ?.input_tokens_details
        ?.cache_write_tokens ||
      0
    );

  const outputTokens =
    Number(
      response?.usage
        ?.output_tokens ||
      0
    );

  const totalTokens =
    Number(
      response?.usage
        ?.total_tokens ||
      inputTokens +
        outputTokens
    );

  const regularInputTokens =
    Math.max(
      0,
      inputTokens -
        cachedInputTokens -
        cacheWriteTokens
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
      cacheWriteTokens /
      1_000_000
    ) *
      (
        model.inputPrice *
        1.25
      ) +
    (
      outputTokens /
      1_000_000
    ) *
      model.outputPrice;

  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
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


export async function runOpenAISolver(
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
    "openai"
  ) {
    throw new Error(
      `${request.model} 不是 OpenAI 模型`
    );
  }

  const startedAt =
    Date.now();

  const content:
    any[] = [
    {
      type:
        "input_text",

      text:
        request.prompt,
    },
  ];

  for (
    const image of
    request.images || []
  ) {
    content.push({
      type:
        "input_image",

      image_url:
        image,

      detail:
        "high",
    });
  }

  const response =
    await client
      .responses
      .create({
        model:
          request.model,

        reasoning: {
          effort:
            request.reasoning,
        } as any,

        input: [
          {
            role:
              "user",

            content,
          },
        ],
      } as any);

  return {
    provider:
      "openai",

    model:
      request.model,

    text:
      String(
        response
          .output_text ||
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
