import {
  getAIModel,
  isAIModelId,
} from "@/lib/ai-models";

import {
  runGeminiSolver,
} from "@/lib/solvers/gemini";

import {
  runOpenAISolver,
} from "@/lib/solvers/openai";

import type {
  SolverRequest,
  SolverResponse,
} from "@/lib/ai/types";


const GEMINI_TRANSIENT_STATUSES =
  new Set([
    408,
    409,
    425,
    429,
    500,
    502,
    503,
    504,
  ]);


function sleep(
  ms:
    number,
) {
  return new Promise<void>(
    (
      resolve,
    ) => {
      setTimeout(
        resolve,
        ms,
      );
    },
  );
}


function errorStatus(
  error:
    unknown,
) {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return null;
  }

  const candidate =
    error as {
      status?:
        unknown;
      statusCode?:
        unknown;
      code?:
        unknown;
      response?: {
        status?:
          unknown;
      };
    };

  const values = [
    candidate.status,
    candidate.statusCode,
    candidate.response
      ?.status,
    candidate.code,
  ];

  for (
    const value of
    values
  ) {
    const numeric =
      Number(
        value,
      );

    if (
      Number.isFinite(
        numeric,
      ) &&
      numeric >=
        100 &&
      numeric <=
        599
    ) {
      return numeric;
    }
  }

  return null;
}


function errorMessage(
  error:
    unknown,
) {
  if (
    error instanceof
    Error
  ) {
    return error.message;
  }

  return String(
    error ||
    "",
  );
}


function isTransientGeminiError(
  error:
    unknown,
) {
  const status =
    errorStatus(
      error,
    );

  if (
    status !==
      null &&
    GEMINI_TRANSIENT_STATUSES.has(
      status,
    )
  ) {
    return true;
  }

  const message =
    errorMessage(
      error,
    ).toLowerCase();

  return (
    /\b408\b/.test(
      message,
    ) ||
    /\b409\b/.test(
      message,
    ) ||
    /\b425\b/.test(
      message,
    ) ||
    /\b429\b/.test(
      message,
    ) ||
    /\b500\b/.test(
      message,
    ) ||
    /\b502\b/.test(
      message,
    ) ||
    /\b503\b/.test(
      message,
    ) ||
    /\b504\b/.test(
      message,
    ) ||
    message.includes(
      "high demand",
    ) ||
    message.includes(
      "resource exhausted",
    ) ||
    message.includes(
      "temporarily unavailable",
    ) ||
    message.includes(
      "service unavailable",
    ) ||
    message.includes(
      "internal server error",
    ) ||
    message.includes(
      "deadline exceeded",
    ) ||
    message.includes(
      "timeout",
    ) ||
    message.includes(
      "timed out",
    ) ||
    message.includes(
      "try again",
    ) ||
    message.includes(
      "overloaded",
    )
  );
}


function fallbackModelFor(
  model:
    SolverRequest[
      "model"
    ],
) {
  /*
   * 目前的正式策略：
   *
   * Gemini 3.8 Flash
   *   ↓ 暫時性錯誤且重試仍失敗
   * Gemini 3.6 Flash
   *
   * 3.6 本身只做短重試，不再反向 fallback 3.8，
   * 避免 Science Gate 在供應商壅塞時來回切換造成更長延遲。
   */
  if (
    model ===
      "gemini-3.8-flash" &&
    isAIModelId(
      "gemini-3.6-flash",
    )
  ) {
    return "gemini-3.6-flash";
  }

  return null;
}


async function runGeminiWithRetry(
  request:
    SolverRequest,
  {
    retryDelayMs,
  }: {
    retryDelayMs:
      number;
  },
): Promise<SolverResponse> {
  try {
    return await runGeminiSolver(
      request,
    );

  } catch (
    firstError
  ) {
    if (
      !isTransientGeminiError(
        firstError,
      )
    ) {
      throw firstError;
    }

    console.warn(
      `[AI] Gemini temporary failure on ${request.model}; retrying once.`,
      {
        status:
          errorStatus(
            firstError,
          ),
        message:
          errorMessage(
            firstError,
          ),
      },
    );

    await sleep(
      retryDelayMs,
    );

    return runGeminiSolver(
      request,
    );
  }
}


export async function runSolver(
  request:
    SolverRequest,
): Promise<SolverResponse> {
  const model =
    getAIModel(
      request.model,
    );

  if (
    model.provider !==
    "gemini"
  ) {
    return runOpenAISolver(
      request,
    );
  }

  try {
    /*
     * 第一次失敗若屬於 429 / 5xx / timeout 類暫時性問題，
     * 先對原模型做一次短重試。
     */
    return await runGeminiWithRetry(
      request,
      {
        retryDelayMs:
          450,
      },
    );

  } catch (
    originalModelError
  ) {
    /*
     * 只有「原模型最後仍是暫時性錯誤」才允許 fallback。
     *
     * 400、401、403、404、圖片格式錯誤、參數錯誤等
     * 都直接拋出，避免用 fallback 掩蓋真正的設定問題。
     */
    if (
      !isTransientGeminiError(
        originalModelError,
      )
    ) {
      throw originalModelError;
    }

    const fallbackModel =
      fallbackModelFor(
        request.model,
      );

    if (
      !fallbackModel
    ) {
      throw originalModelError;
    }

    console.warn(
      `[AI] Gemini ${request.model} remained unavailable; falling back to ${fallbackModel}.`,
      {
        status:
          errorStatus(
            originalModelError,
          ),
        message:
          errorMessage(
            originalModelError,
          ),
      },
    );

    /*
     * fallback 模型也允許一次短重試。
     *
     * runGeminiSolver 最終回傳的 response.model
     * 會是實際使用的 fallbackModel，
     * 因此 api_usage / solve_history / Analytics
     * 都會記錄真正執行的模型。
     */
    return runGeminiWithRetry(
      {
        ...request,
        model:
          fallbackModel,
      },
      {
        retryDelayMs:
          350,
      },
    );
  }
}
