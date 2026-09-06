import {
  randomUUID,
} from "crypto";

import {
  answersMatch,
} from "@/lib/ai/answer-normalization";

import {
  parseAIJson,
} from "@/lib/ai/json";

import {
  buildArbiterPrompt,
  buildPrimaryPrompt,
  buildScienceGatePrompt,
  buildVerifierPrompt,
} from "@/lib/ai/prompts";

import {
  runSolver,
} from "@/lib/ai/solver";

import {
  saveSolverUsage,
} from "@/lib/ai/usage-log";

import {
  getAISolverSettings,
} from "@/lib/ai-settings";

import { buildTeachingContext } from "@/lib/teaching-engine";
import {
  buildInputGuardPrompt,
  getInputGuardSettings,
  inspectImageMetrics,
  type ImageQualityMetric,
} from "@/lib/input-guard";

import type {
  Annotation,
  ScienceGateResult,
  SolveResult,
  SolverResponse,
  VerificationResult,
} from "@/lib/ai/types";


export type RouterInput = {
  studentId:
    string;

  campus:
    string;

  images:
    string[];

  subject:
    string;

  referenceAnswer?:
    string;

  questionNote?:
    string;

  imageQuality?:
    ImageQualityMetric[];
};


export type ScienceGateCheck = {
  requestId:
    string;

  gate:
    ScienceGateResult;
};


export type RouterResult = {
  requestId:
    string;

  result:
    SolveResult;

  route: {
    mode:
      "single" |
      "multi";

    referenceProvided:
      boolean;

    referenceMatchedPrimary:
      boolean | null;

    verifierTriggered:
      boolean;

    arbiterTriggered:
      boolean;

    arbitrationTrigger:
      | "reference_mismatch"
      | "verifier_major_error"
      | null;

    disputeStatus:
      "normal"
      | "resolved"
      | "disputed";

    gate:
      ScienceGateResult;
  };

  models: {
    primary: {
      provider:
        string;

      model:
        string;
    };

    verifier:
      | {
          provider:
            string;

          model:
            string;
        }
      | null;

    arbiter:
      | {
          provider:
            string;

          model:
            string;
        }
      | null;
  };

  trace: {
    primaryAnswer:
      string;

    verifier:
      VerificationResult |
      null;

    arbiterAnswer:
      string | null;
  };
};


function normalizeSolveResult(
  value:
    any
): SolveResult {

  const annotations:
    Annotation[] =
    Array.isArray(
      value
        ?.annotations
    )
      ? value
          .annotations
          .filter(
            (item: any) =>
              item &&
              typeof item ===
                "object"
          )
          .map(
            (item: any) => ({
              id:
                String(
                  item.id ||
                  ""
                ),

              display:
                String(
                  item.display ||
                  ""
                ),

              label:
                String(
                  item.label ||
                  ""
                ),

              meaning:
                String(
                  item.meaning ||
                  ""
                ),

              source:
                String(
                  item.source ||
                  ""
                ),

              usage:
                String(
                  item.usage ||
                  ""
                ),
            })
          )
      : [];

  return {
    answer:
      String(
        value
          ?.answer ||
        ""
      ).trim(),

    explanation:
      String(
        value
          ?.explanation ||
        ""
      ).trim(),

    options:
      String(
        value
          ?.options ||
        ""
      ).trim(),

    annotations,
  };
}


function normalizeGate(
  value:
    any
): ScienceGateResult {

  const rawCategory =
    String(
      value
        ?.category ||
      "unclear"
    );

  const allowedCategories =
    new Set([
      "physics",
      "chemistry",
      "biology",
      "earth",
      "mixed_science",
      "non_science",
      "unclear",
    ]);

  const category =
    allowedCategories.has(
      rawCategory
    )
      ? rawCategory as
          ScienceGateResult[
            "category"
          ]
      : "unclear";

  const rawConfidence =
    Number(
      value
        ?.confidence ??
      0
    );

  const confidence =
    Number.isFinite(
      rawConfidence
    )
      ? Math.max(
          0,
          Math.min(
            100,
            rawConfidence
          )
        )
      : 0;

  return {
    allowed:
      value
        ?.allowed !== false,

    category,

    confidence,

    reason:
      String(
        value
          ?.reason ||
        ""
      ),

    rejectionType:
      value?.rejectionType === "invalid_image" || value?.rejectionType === "non_science"
        ? value.rejectionType
        : null,
  };
}


function normalizeVerification(
  value:
    any
): VerificationResult {

  const verdict =
    value
      ?.verdict ===
      "major_error"
        ? "major_error"
        : "approve";

  const rawConfidence =
    Number(
      value
        ?.confidence ??
      0
    );

  return {
    verdict,

    confidence:
      Number.isFinite(
        rawConfidence
      )
        ? Math.max(
            0,
            Math.min(
              100,
              rawConfidence
            )
          )
        : 0,

    concern:
      String(
        value
          ?.concern ||
        ""
      ),

    suggestedAnswer:
      String(
        value
          ?.suggestedAnswer ||
        ""
      ),
  };
}


async function callAndLog({
  requestId,
  studentId,
  campus,
  role,
  model,
  reasoning,
  prompt,
  images,
  expectJson,
  metadata,
}: {
  requestId:
    string;

  studentId:
    string;

  campus:
    string;

  role:
    "science_gate"
    | "primary"
    | "verifier"
    | "arbiter";

  model:
    any;

  reasoning:
    any;

  prompt:
    string;

  images?:
    string[];

  expectJson?:
    boolean;

  metadata?:
    Record<
      string,
      unknown
    >;
}) {

  const response:
    SolverResponse =
    await runSolver({
      model,
      reasoning,
      prompt,
      images,
      expectJson,
    });

  await saveSolverUsage({
    requestId,
    studentId,
    campus,
    role,
    response,
    reasoningEffort:
      reasoning,
    success:
      true,
    metadata,
  });

  return response;
}


export async function runScienceGate(
  input:
    Pick<
      RouterInput,
      | "studentId"
      | "campus"
      | "images"
      | "imageQuality"
    >
): Promise<ScienceGateCheck> {

  if (
    !Array.isArray(
      input.images
    ) ||
    input.images.length ===
      0
  ) {
    throw new Error(
      "缺少題目圖片"
    );
  }

  if (
    input.images.length >
    5
  ) {
    throw new Error(
      "一次最多上傳 5 張圖片"
    );
  }

  const requestId =
    randomUUID();

  const guardSettings =
    await getInputGuardSettings();

  const metricCheck =
    inspectImageMetrics(
      input.imageQuality,
      guardSettings
    );

  if (metricCheck.blocked) {
    return {
      requestId,
      gate: {
        allowed: false,
        category: "unclear",
        confidence: 100,
        reason: metricCheck.reason,
        rejectionType: "invalid_image",
      },
    };
  }

  const settings =
    await getAISolverSettings();

  const gateResponse =
    await callAndLog({
      requestId,
      studentId:
        input.studentId,
      campus:
        input.campus,
      role:
        "science_gate",
      model:
        settings
          .scienceGate
          .model,
      reasoning:
        settings
          .scienceGate
          .reasoning,
      prompt:
        buildScienceGatePrompt(
          buildInputGuardPrompt(guardSettings)
        ),
      images:
        input.images,
      expectJson:
        true,
    });

  const gate =
    normalizeGate(
      parseAIJson(
        gateResponse.text
      )
    );

  return {
    requestId,
    gate,
  };
}


export async function runAIRouter(
  input:
    RouterInput,
  precheckedGate?:
    ScienceGateCheck
): Promise<RouterResult> {

  if (
    !Array.isArray(
      input.images
    ) ||
    input.images.length ===
      0
  ) {
    throw new Error(
      "缺少題目圖片"
    );
  }

  if (
    input.images.length >
    5
  ) {
    throw new Error(
      "一次最多上傳 5 張圖片"
    );
  }

  const settings =
    await getAISolverSettings();

  const teachingContext = await buildTeachingContext(input.subject);

  const gateCheck =
    precheckedGate ||
    await runScienceGate({
      studentId:
        input.studentId,
      campus:
        input.campus,
      images:
        input.images,
      imageQuality:
        input.imageQuality,
    });

  const {
    requestId,
    gate,
  } =
    gateCheck;

  if (
    !gate.allowed
  ) {
    const error =
      new Error(
        "目前僅支援物理、化學、生物與地球科學題目。"
      );

    (
      error as
        Error & {
          code?: string;
          gate?:
            ScienceGateResult;
        }
    ).code =
      "NON_SCIENCE";

    (
      error as
        Error & {
          gate?:
            ScienceGateResult;
        }
    ).gate =
      gate;

    throw error;
  }

  const referenceAnswer =
    String(
      input
        .referenceAnswer ||
      ""
    ).trim();

  const referenceProvided =
    Boolean(
      referenceAnswer
    );


  /* =======================================================
     1. Primary
  ======================================================= */

  const primaryResponse =
    await callAndLog({
      requestId,
      studentId:
        input.studentId,
      campus:
        input.campus,
      role:
        "primary",
      model:
        settings
          .primary
          .model,
      reasoning:
        settings
          .primary
          .reasoning,
      prompt:
        buildPrimaryPrompt({
          subject:
            input.subject,
          referenceAnswer,
          questionNote:
            input.questionNote,
          teachingContext,
        }),
      images:
        input.images,
      expectJson:
        true,
      metadata: {
        referenceProvided,
      },
    });

  const primary =
    normalizeSolveResult(
      parseAIJson(
        primaryResponse.text
      )
    );

  if (
    !primary.answer
  ) {
    throw new Error(
      "主要解題模型沒有產生有效答案。"
    );
  }


  /* =======================================================
     2. 單模型模式
  ======================================================= */

  if (
    settings.mode ===
    "single"
  ) {
    return {
      requestId,

      result:
        primary,

      route: {
        mode:
          "single",

        referenceProvided,

        referenceMatchedPrimary:
          referenceProvided
            ? answersMatch(
                primary.answer,
                referenceAnswer
              )
            : null,

        verifierTriggered:
          false,

        arbiterTriggered:
          false,

        arbitrationTrigger:
          null,

        disputeStatus:
          "normal",

        gate,
      },

      models: {
        primary: {
          provider:
            primaryResponse
              .provider,

          model:
            primaryResponse
              .model,
        },

        verifier:
          null,

        arbiter:
          null,
      },

      trace: {
        primaryAnswer:
          primary.answer,

        verifier:
          null,

        arbiterAnswer:
          null,
      },
    };
  }


  /* =======================================================
     3. 有標準答案：
        Primary 相同 -> 直接輸出
        Primary 不同 -> Arbiter
  ======================================================= */

  if (
    referenceProvided
  ) {
    const matched =
      answersMatch(
        primary.answer,
        referenceAnswer
      );

    if (
      matched
    ) {
      return {
        requestId,

        result:
          primary,

        route: {
          mode:
            "multi",

          referenceProvided:
            true,

          referenceMatchedPrimary:
            true,

          verifierTriggered:
            false,

          arbiterTriggered:
            false,

          arbitrationTrigger:
            null,

          disputeStatus:
            "normal",

          gate,
        },

        models: {
          primary: {
            provider:
              primaryResponse
                .provider,

            model:
              primaryResponse
                .model,
          },

          verifier:
            null,

          arbiter:
            null,
        },

        trace: {
          primaryAnswer:
            primary.answer,

          verifier:
            null,

          arbiterAnswer:
            null,
        },
      };
    }

    const arbiterResponse =
      await callAndLog({
        requestId,
        studentId:
          input.studentId,
        campus:
          input.campus,
        role:
          "arbiter",
        model:
          settings
            .arbiter
            .model,
        reasoning:
          settings
            .arbiter
            .reasoning,
        prompt:
          buildArbiterPrompt({
            subject:
              input.subject,
            referenceAnswer,
            primaryAnswer:
              primary.answer,
            teachingContext,
          }),
        images:
          input.images,
        expectJson:
          true,
        metadata: {
          trigger:
            "reference_mismatch",
          primaryAnswer:
            primary.answer,
          referenceAnswer,
        },
      });

    const arbiter =
      normalizeSolveResult(
        parseAIJson(
          arbiterResponse.text
        )
      );

    const arbiterMatchesReference =
      answersMatch(
        arbiter.answer,
        referenceAnswer
      );

    return {
      requestId,

      result:
        arbiter,

      route: {
        mode:
          "multi",

        referenceProvided:
          true,

        referenceMatchedPrimary:
          false,

        verifierTriggered:
          false,

        arbiterTriggered:
          true,

        arbitrationTrigger:
          "reference_mismatch",

        disputeStatus:
          arbiterMatchesReference
            ? "resolved"
            : "disputed",

        gate,
      },

      models: {
        primary: {
          provider:
            primaryResponse
              .provider,

          model:
            primaryResponse
              .model,
        },

        verifier:
          null,

        arbiter: {
          provider:
            arbiterResponse
              .provider,

          model:
            arbiterResponse
              .model,
        },
      },

      trace: {
        primaryAnswer:
          primary.answer,

        verifier:
          null,

        arbiterAnswer:
          arbiter.answer,
      },
    };
  }


  /* =======================================================
     4. 無標準答案 -> Verifier
  ======================================================= */

  const verifierResponse =
    await callAndLog({
      requestId,
      studentId:
        input.studentId,
      campus:
        input.campus,
      role:
        "verifier",
      model:
        settings
          .verifier
          .model,
      reasoning:
        settings
          .verifier
          .reasoning,
      prompt:
        buildVerifierPrompt({
          primaryAnswer:
            primary.answer,
          primaryExplanation:
            primary.explanation,
          teachingContext,
        }),
      images:
        input.images,
      expectJson:
        true,
      metadata: {
        primaryAnswer:
          primary.answer,
      },
    });

  const verification =
    normalizeVerification(
      parseAIJson(
        verifierResponse.text
      )
    );

  const shouldArbitrate =
    verification.verdict ===
      "major_error" &&
    verification.confidence >=
      settings
        .arbitration
        .confidenceThreshold;


  if (
    !shouldArbitrate
  ) {
    return {
      requestId,

      result:
        primary,

      route: {
        mode:
          "multi",

        referenceProvided:
          false,

        referenceMatchedPrimary:
          null,

        verifierTriggered:
          true,

        arbiterTriggered:
          false,

        arbitrationTrigger:
          null,

        disputeStatus:
          "normal",

        gate,
      },

      models: {
        primary: {
          provider:
            primaryResponse
              .provider,

          model:
            primaryResponse
              .model,
        },

        verifier: {
          provider:
            verifierResponse
              .provider,

          model:
            verifierResponse
              .model,
        },

        arbiter:
          null,
      },

      trace: {
        primaryAnswer:
          primary.answer,

        verifier:
          verification,

        arbiterAnswer:
          null,
      },
    };
  }


  /* =======================================================
     5. Verifier 高信心重大錯誤 -> Arbiter
  ======================================================= */

  const arbiterResponse =
    await callAndLog({
      requestId,
      studentId:
        input.studentId,
      campus:
        input.campus,
      role:
        "arbiter",
      model:
        settings
          .arbiter
          .model,
      reasoning:
        settings
          .arbiter
          .reasoning,
      prompt:
        buildArbiterPrompt({
          subject:
            input.subject,
          primaryAnswer:
            primary.answer,
          verifierConcern:
            verification
              .concern,
          teachingContext,
        }),
      images:
        input.images,
      expectJson:
        true,
      metadata: {
        trigger:
          "verifier_major_error",
        verifierConfidence:
          verification
            .confidence,
        verifierConcern:
          verification
            .concern,
        primaryAnswer:
          primary.answer,
      },
    });

  const arbiter =
    normalizeSolveResult(
      parseAIJson(
        arbiterResponse.text
      )
    );

  return {
    requestId,

    result:
      arbiter,

    route: {
      mode:
        "multi",

      referenceProvided:
        false,

      referenceMatchedPrimary:
        null,

      verifierTriggered:
        true,

      arbiterTriggered:
        true,

      arbitrationTrigger:
        "verifier_major_error",

      disputeStatus:
        "resolved",

      gate,
    },

    models: {
      primary: {
        provider:
          primaryResponse
            .provider,

        model:
          primaryResponse
            .model,
      },

      verifier: {
        provider:
          verifierResponse
            .provider,

        model:
          verifierResponse
            .model,
      },

      arbiter: {
        provider:
          arbiterResponse
            .provider,

        model:
          arbiterResponse
            .model,
      },
    },

    trace: {
      primaryAnswer:
        primary.answer,

      verifier:
        verification,

      arbiterAnswer:
        arbiter.answer,
    },
  };
}
