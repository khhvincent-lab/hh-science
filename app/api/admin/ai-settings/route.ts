import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import { requireAdminSession, isSuperAdmin } from "@/lib/admin-access";

import {
  AI_MODELS,
  getAIModel,
  isAIModelId,
  type AIModelId,
} from "@/lib/ai-models";

import {
  getAISolverSettings,
  type ReasoningEffort,
} from "@/lib/ai-settings";



function getPublicModels() {
  return Object.values(AI_MODELS)
    .filter(
      (model) =>
        model.id !==
        "gemini-2.5-flash",
    )
    .map((model) => ({
      id: model.id,
      provider: model.provider,
      name: model.name,
      description: model.description,
      inputPrice: model.inputPrice,
      cachedInputPrice: model.cachedInputPrice,
      outputPrice: model.outputPrice,
      reasoningLevels: Array.from(model.reasoningLevels),
    }));
}


function normalizeSlot(raw: any) {
  const rawModel =
    String(raw?.model || "");

  if (!isAIModelId(rawModel)) {
    throw new Error(
      `不支援的模型：${rawModel || "未指定"}`,
    );
  }

  if (rawModel === "gemini-2.5-flash") {
    throw new Error(
      "Gemini 2.5 Flash 對目前 API project 已不可用，請改用 Gemini 3.6 Flash 或 Gemini 3.8 Flash。",
    );
  }

  const model =
    getAIModel(rawModel);

  const allowed =
    Array.from(
      model.reasoningLevels,
    ) as ReasoningEffort[];

  const requested =
    String(
      raw?.reasoning || "",
    ) as ReasoningEffort;

  const reasoning =
    allowed.includes(requested)
      ? requested
      : allowed.includes("medium")
        ? "medium"
        : allowed[0] || "low";

  return {
    provider:
      model.provider,

    model:
      rawModel as AIModelId,

    reasoning,
  };
}


export async function GET(
  request: NextRequest,
) {
  const admin =
    await requireAdminSession(request);

  if (!admin) {
    return NextResponse.json(
      { error: "未登入管理員。" },
      { status: 401 },
    );
  }

  const settings =
    await getAISolverSettings();

  return NextResponse.json({
    settings,
    models:
      getPublicModels(),
  });
}


export async function POST(
  request: NextRequest,
) {
  const admin =
    await requireAdminSession(request);

  if (!admin) {
    return NextResponse.json(
      { error: "未登入管理員。" },
      { status: 401 },
    );
  }

  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "此設定僅總管理員可以修改。" }, { status: 403 });

  let body: any;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      { error: "AI 設定資料格式錯誤。" },
      { status: 400 },
    );
  }

  try {
    const primary =
      normalizeSlot(body?.primary);

    const verifier =
      normalizeSlot(body?.verifier);

    const arbiter =
      normalizeSlot(body?.arbiter);

    const scienceGate =
      normalizeSlot(body?.scienceGate);

    const followupModel =
      normalizeSlot(
        body?.followup?.model,
      );

    const confidenceThreshold =
      Math.max(
        50,
        Math.min(
          100,
          Math.round(
            Number(
              body?.arbitration?.confidenceThreshold ??
              85,
            ),
          ),
        ),
      );

    const dailyLimit =
      Math.max(
        1,
        Math.min(
          100,
          Math.round(
            Number(
              body?.dailyLimit ??
              10,
            ),
          ),
        ),
      );

    const maxPerQuestion =
      Math.max(
        1,
        Math.min(
          10,
          Math.round(
            Number(
              body?.followup?.maxPerQuestion ??
              3,
            ),
          ),
        ),
      );

    const value = {
      mode:
        body?.mode === "single"
          ? "single"
          : "multi",

      primary,
      verifier,
      arbiter,
      scienceGate,

      arbitration: {
        confidenceThreshold,
      },

      followup: {
        enabled:
          body?.followup?.enabled !== false,

        model:
          followupModel,

        maxPerQuestion,
      },

      dailyLimit,
    };

    const {
      error,
    } =
      await supabaseAdmin
        .from("app_settings")
        .upsert(
          {
            id:
              "ai_solver",

            value,
          },
          {
            onConflict:
              "id",
          },
        );

    if (error) {
      throw new Error(
        `儲存 AI Router 設定失敗：${error.message}`,
      );
    }

    return NextResponse.json({
      success: true,
      settings: value,
    });

  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "儲存 AI Router 設定失敗。",
      },
      {
        status: 400,
      },
    );
  }
}
