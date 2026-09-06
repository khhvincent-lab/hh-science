import { supabaseAdmin } from "@/lib/supabase-admin";

export type TeachingMode = "concise" | "standard" | "deep" | "correction";

export type TeachingEngineSettings = {
  mode: TeachingMode;
  general: {
    noGuessing: boolean;
    requestRetakeWhenIncomplete: boolean;
    highSchoolFirst: boolean;
    keepUnits: boolean;
    keepKeySteps: boolean;
    avoidOverreach: boolean;
  };
  subjects: Record<"physics" | "chemistry" | "biology" | "earth", string>;
};

export const DEFAULT_TEACHING_ENGINE_SETTINGS: TeachingEngineSettings = {
  mode: "standard",
  general: {
    noGuessing: true,
    requestRetakeWhenIncomplete: true,
    highSchoolFirst: true,
    keepUnits: true,
    keepKeySteps: true,
    avoidOverreach: true,
  },
  subjects: {
    physics: "先整理已知條件與方向，再選公式；所有物理量保留單位；圖像題先說明圖意。",
    chemistry: "優先列出必要反應式；計量題先處理莫耳關係；酸鹼、平衡與氧化還原先判斷核心物種與方向。",
    biology: "使用高中課綱術語；先說清楚機制或因果，再判斷選項；避免不必要的大學程度延伸。",
    earth: "圖表題先讀座標與位置；氣象題先判斷氣壓、氣團與風向；天文題先建立觀測位置與尺度。",
  },
};

function normalizeSettings(raw: any): TeachingEngineSettings {
  const mode: TeachingMode = ["concise", "standard", "deep", "correction"].includes(String(raw?.mode))
    ? raw.mode
    : DEFAULT_TEACHING_ENGINE_SETTINGS.mode;
  return {
    mode,
    general: {
      ...DEFAULT_TEACHING_ENGINE_SETTINGS.general,
      ...(raw?.general || {}),
    },
    subjects: {
      ...DEFAULT_TEACHING_ENGINE_SETTINGS.subjects,
      ...(raw?.subjects || {}),
    },
  };
}

export async function getTeachingEngineSettings(): Promise<TeachingEngineSettings> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("id", "teaching_engine")
    .maybeSingle();

  if (error) {
    console.error("Teaching engine settings read error:", error);
    return DEFAULT_TEACHING_ENGINE_SETTINGS;
  }
  return normalizeSettings(data?.value);
}

export async function saveTeachingEngineSettings(value: unknown) {
  const normalized = normalizeSettings(value);
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    {
      id: "teaching_engine",
      value: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  return normalized;
}

export async function getTeacherExamples(subject: string, limit = 4) {
  const { data, error } = await supabaseAdmin
    .from("teacher_correction_queue")
    .select("teacher_note,corrected_answer,corrected_explanation,status,solve_history(subject,answer,explanation)")
    .in("status", ["reviewed", "applied"])
    .not("corrected_explanation", "is", null)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Teacher examples read error:", error);
    return [];
  }

  return (data || [])
    .map((row: any) => {
      const history = Array.isArray(row.solve_history) ? row.solve_history[0] : row.solve_history;
      return {
        subject: String(history?.subject || ""),
        aiAnswer: String(history?.answer || ""),
        aiExplanation: String(history?.explanation || ""),
        teacherNote: String(row.teacher_note || ""),
        correctedAnswer: String(row.corrected_answer || ""),
        correctedExplanation: String(row.corrected_explanation || ""),
      };
    })
    .filter((item) => !subject || item.subject === subject)
    .slice(0, limit);
}

export async function buildTeachingContext(subject: string) {
  const settings = await getTeachingEngineSettings();
  const examples = await getTeacherExamples(subject);
  const modeText: Record<TeachingMode, string> = {
    concise: "精簡解題：只保留必要觀念、核心列式與關鍵步驟，避免冗長。",
    standard: "標準教學：答案 → 觀念解析 → 選項分析 → 關鍵觀念，兼顧精簡與可教學性。",
    deep: "深度解析：先整理條件與核心觀念，再完整推導，必要時補充常見錯誤。",
    correction: "訂正模式：若與參考答案或既有結果衝突，優先找出錯誤點並重建正確解法。",
  };

  const rules = [
    settings.general.noGuessing && "資訊不足時不得猜測。",
    settings.general.requestRetakeWhenIncomplete && "題目或圖片不完整時，明確要求學生重新拍攝完整內容。",
    settings.general.highSchoolFirst && "優先使用高中課綱內最直觀的方法。",
    settings.general.keepUnits && "計算與物理量保留必要單位。",
    settings.general.keepKeySteps && "不得省略會影響學生理解的關鍵中間步驟。",
    settings.general.avoidOverreach && "避免不必要的超綱或大學程度延伸。",
  ].filter(Boolean);

  const subjectRule = settings.subjects[subject as keyof typeof settings.subjects] || "";
  const examplesText = examples.length
    ? examples.map((item, index) => `案例 ${index + 1}\n老師認定答案：${item.correctedAnswer || "未指定"}\n老師解法：${item.correctedExplanation}\n老師備註：${item.teacherNote || "無"}`).join("\n\n")
    : "目前沒有可用的教師案例。";

  return `\n━━━━━━━━━━━━━━━━━━\n【H.H. 教學引擎】\n━━━━━━━━━━━━━━━━━━\n解題模式：${modeText[settings.mode]}\n\n通用規則：\n${rules.map((rule) => `- ${rule}`).join("\n")}\n\n本科補充規則：\n${subjectRule || "無"}\n\n可參考的老師案例（只學習解題順序與表達方式，不可照抄題目內容）：\n${examplesText}\n`.trim();
}
