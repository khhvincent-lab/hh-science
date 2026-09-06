import { supabaseAdmin } from "@/lib/supabase-admin";

export type ImageQualityMetric = {
  meanLuma?: number;
  lumaStdDev?: number;
  darkRatio?: number;
  lightRatio?: number;
  avgNeighborDiff?: number;
  width?: number;
  height?: number;
};

export type InputGuardSettings = {
  enabled: boolean;
  blockBlackImage: boolean;
  blockWhiteImage: boolean;
  blockNonQuestion: boolean;
  blockUnreadable: boolean;
  blockJokeOrIrrelevant: boolean;
  requireVisibleQuestionContent: boolean;
  customRules: string[];
};

export const DEFAULT_INPUT_GUARD_SETTINGS: InputGuardSettings = {
  enabled: true,
  blockBlackImage: true,
  blockWhiteImage: true,
  blockNonQuestion: true,
  blockUnreadable: true,
  blockJokeOrIrrelevant: true,
  requireVisibleQuestionContent: true,
  customRules: [],
};

function normalizeRules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeInputGuard(raw: any): InputGuardSettings {
  return {
    ...DEFAULT_INPUT_GUARD_SETTINGS,
    ...(raw || {}),
    customRules: normalizeRules(raw?.customRules),
  };
}

export async function getInputGuardSettings(): Promise<InputGuardSettings> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("id", "input_guard")
    .maybeSingle();

  if (error) {
    console.error("Input guard settings read error:", error);
    return DEFAULT_INPUT_GUARD_SETTINGS;
  }

  return normalizeInputGuard(data?.value);
}

export async function saveInputGuardSettings(value: unknown) {
  const normalized = normalizeInputGuard(value);
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    {
      id: "input_guard",
      value: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  return normalized;
}

export async function appendInputGuardRule(rule: string) {
  const clean = String(rule || "").trim();
  if (!clean) throw new Error("阻擋規則不可為空。\n");

  const current = await getInputGuardSettings();
  const exists = current.customRules.some(
    (item) => item.toLocaleLowerCase("zh-Hant") === clean.toLocaleLowerCase("zh-Hant"),
  );

  if (exists) return current;

  return saveInputGuardSettings({
    ...current,
    customRules: [clean, ...current.customRules].slice(0, 50),
  });
}

export function inspectImageMetrics(
  metrics: ImageQualityMetric[] | undefined,
  settings: InputGuardSettings,
): { blocked: boolean; reason: string; code: string | null } {
  if (!settings.enabled || !Array.isArray(metrics) || metrics.length === 0) {
    return { blocked: false, reason: "", code: null };
  }

  for (const metric of metrics) {
    const mean = Number(metric?.meanLuma);
    const sd = Number(metric?.lumaStdDev);
    const darkRatio = Number(metric?.darkRatio);
    const lightRatio = Number(metric?.lightRatio);
    const diff = Number(metric?.avgNeighborDiff);

    // These thresholds intentionally target only extreme cases to avoid
    // rejecting legitimate dark/bright textbook photos.
    if (
      settings.blockBlackImage &&
      Number.isFinite(mean) && Number.isFinite(sd) &&
      mean <= 8 && sd <= 6 &&
      (!Number.isFinite(darkRatio) || darkRatio >= 0.96)
    ) {
      return {
        blocked: true,
        code: "BLACK_IMAGE",
        reason: "圖片幾乎全黑，沒有足夠的可辨識題目內容。",
      };
    }

    if (
      settings.blockWhiteImage &&
      Number.isFinite(mean) && Number.isFinite(sd) &&
      mean >= 247 && sd <= 5 &&
      (!Number.isFinite(lightRatio) || lightRatio >= 0.97)
    ) {
      return {
        blocked: true,
        code: "WHITE_IMAGE",
        reason: "圖片幾乎全白，沒有足夠的可辨識題目內容。",
      };
    }

    if (
      settings.blockUnreadable &&
      Number.isFinite(sd) && Number.isFinite(diff) &&
      sd <= 3.5 && diff <= 1.2
    ) {
      return {
        blocked: true,
        code: "LOW_INFORMATION_IMAGE",
        reason: "圖片資訊量過低，無法辨識完整題目。",
      };
    }
  }

  return { blocked: false, reason: "", code: null };
}

export function buildInputGuardPrompt(settings: InputGuardSettings) {
  if (!settings.enabled) return "輸入阻擋規則目前停用。";

  const rules = [
    settings.blockBlackImage && "全黑、近乎全黑、只有大片純黑畫面：拒絕。",
    settings.blockWhiteImage && "全白、近乎全白、只有大片空白畫面：拒絕。",
    settings.blockUnreadable && "嚴重模糊、曝光失敗、遮擋嚴重、文字或圖表無法辨識：拒絕。",
    settings.blockNonQuestion && "沒有可辨識題目、題幹、選項、圖表、公式或明確學科問題：拒絕。",
    settings.blockJokeOrIrrelevant && "自拍、人物照、風景、梗圖、聊天畫面、無關截圖、刻意惡搞內容：拒絕。",
    settings.requireVisibleQuestionContent && "至少必須能看見足以判斷問題的題目內容；不能因為猜到可能是自然科就放行。",
    ...settings.customRules.map((rule) => `老師自訂阻擋規則：${rule}`),
  ].filter(Boolean);

  return rules.map((rule) => `- ${rule}`).join("\n");
}
