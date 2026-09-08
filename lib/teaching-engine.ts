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
    annotationDensity: "light" | "standard" | "rich";
    diagramMode: "auto" | "off";
  };
  subjects: Record<"physics" | "chemistry" | "biology" | "earth", string>;
};

export type TeachingRetrievalInput = {
  topic?: string;
  keywords?: string[];
  questionSignature?: string;
  referenceAnswer?: string;
  questionNote?: string;
};

export type TeacherRule = {
  id: string;
  title: string;
  content: string;
  scope: "global" | "subject" | "topic";
  subject: string;
  topic: string;
  keywords: string[];
  priority: number;
  enabled: boolean;
};

export type TeacherExample = {
  id: string;
  solveHistoryId: string;
  subject: string;
  topic: string;
  keywords: string[];
  questionSignature: string;
  teacherAnswer: string;
  teacherExplanation: string;
  teacherOptions: string;
  teacherStrategy: string;
  teacherNote: string;
  annotations: any[];
  applyScope: "same" | "similar" | "both";
  enabled: boolean;
  similarity?: number;
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
    annotationDensity: "rich",
    diagramMode: "auto",
  },
  subjects: {
    physics: "先整理已知條件與方向，再選公式；所有物理量保留單位；圖像題先說明圖意。若受力、幾何、光學、圓周、彈簧或電路關係用簡圖會明顯更清楚，可附精確 SVG 圖解。",
    chemistry: "優先列出必要反應式；計量題先處理莫耳關係；酸鹼、平衡與氧化還原先判斷核心物種與方向。",
    biology: "使用高中課綱術語；先說清楚機制或因果，再判斷選項；避免不必要的大學程度延伸。",
    earth: "圖表題先讀座標與位置；氣象題先判斷氣壓、氣團與風向；天文題先建立觀測位置與尺度。板塊、地層、日地月、太陽入射角、大氣或海洋環流若簡圖能幫助理解，可附精確 SVG 圖解。",
  },
};

function normalizeSettings(raw: any): TeachingEngineSettings {
  const mode: TeachingMode = ["concise", "standard", "deep", "correction"].includes(String(raw?.mode))
    ? raw.mode
    : DEFAULT_TEACHING_ENGINE_SETTINGS.mode;
  const annotationDensity = ["light", "standard", "rich"].includes(String(raw?.general?.annotationDensity))
    ? raw.general.annotationDensity
    : DEFAULT_TEACHING_ENGINE_SETTINGS.general.annotationDensity;
  const diagramMode = ["auto", "off"].includes(String(raw?.general?.diagramMode))
    ? raw.general.diagramMode
    : DEFAULT_TEACHING_ENGINE_SETTINGS.general.diagramMode;
  return {
    mode,
    general: {
      ...DEFAULT_TEACHING_ENGINE_SETTINGS.general,
      ...(raw?.general || {}),
      annotationDensity,
      diagramMode,
    },
    subjects: {
      ...DEFAULT_TEACHING_ENGINE_SETTINGS.subjects,
      ...(raw?.subjects || {}),
    },
  };
}

function norm(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("zh-Hant");
}

function tokenSet(values: unknown[]) {
  const set = new Set<string>();
  for (const value of values) {
    const text = norm(value);
    if (!text) continue;
    for (const token of text.split(/[\s、，,。；;：:／/()（）\[\]{}「」『』]+/g)) {
      const cleaned = token.trim();
      if (cleaned.length >= 2) set.add(cleaned);
    }
  }
  return set;
}

function lexicalScore(target: Set<string>, candidate: string[]) {
  if (!target.size || !candidate.length) return 0;
  let hit = 0;
  for (const raw of candidate) {
    const c = norm(raw);
    if (!c) continue;
    if (target.has(c)) hit += 1;
    else if ([...target].some((t) => t.includes(c) || c.includes(t))) hit += 0.55;
  }
  return Math.min(1, hit / Math.max(2, Math.min(candidate.length, 6)));
}

function mapRule(row: any): TeacherRule {
  return {
    id: String(row.id || ""),
    title: String(row.title || ""),
    content: String(row.content || ""),
    scope: ["global", "subject", "topic"].includes(String(row.scope)) ? row.scope : "subject",
    subject: String(row.subject || ""),
    topic: String(row.topic || ""),
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    priority: Number(row.priority || 50),
    enabled: row.enabled !== false,
  };
}

function mapExample(row: any): TeacherExample {
  return {
    id: String(row.id || ""),
    solveHistoryId: String(row.solve_history_id || ""),
    subject: String(row.subject || ""),
    topic: String(row.topic || ""),
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    questionSignature: String(row.question_signature || ""),
    teacherAnswer: String(row.teacher_answer || ""),
    teacherExplanation: String(row.teacher_explanation || ""),
    teacherOptions: String(row.teacher_options || ""),
    teacherStrategy: String(row.teacher_strategy || ""),
    teacherNote: String(row.teacher_note || ""),
    annotations: Array.isArray(row.annotations) ? row.annotations : [],
    applyScope: ["same", "similar", "both"].includes(String(row.apply_scope)) ? row.apply_scope : "similar",
    enabled: row.enabled !== false,
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

export async function getTeacherRules(subject = "", input: TeachingRetrievalInput = {}, limit = 10) {
  let query = supabaseAdmin
    .from("teacher_rules")
    .select("id,title,content,scope,subject,topic,keywords,priority,enabled")
    .eq("enabled", true)
    .order("priority", { ascending: false })
    .limit(120);

  const { data, error } = await query;
  if (error) {
    console.error("Teacher rules read error:", error);
    return [] as TeacherRule[];
  }

  const topic = norm(input.topic);
  const queryTokens = tokenSet([input.topic, input.questionSignature, input.questionNote, ...(input.keywords || [])]);

  return (data || [])
    .map(mapRule)
    .filter((rule) => {
      if (rule.scope === "global") return true;
      if (rule.subject && subject && rule.subject !== subject) return false;
      if (rule.scope === "subject") return !rule.subject || !subject || rule.subject === subject;
      if (!topic) return rule.subject === subject;
      const rt = norm(rule.topic);
      return !rt || topic.includes(rt) || rt.includes(topic) || lexicalScore(queryTokens, rule.keywords) > 0;
    })
    .map((rule) => ({
      ...rule,
      _score:
        rule.priority / 100 +
        (rule.scope === "global" ? 0.1 : 0.25) +
        (rule.subject === subject ? 0.3 : 0) +
        (topic && norm(rule.topic) && (topic.includes(norm(rule.topic)) || norm(rule.topic).includes(topic)) ? 0.5 : 0) +
        lexicalScore(queryTokens, rule.keywords),
    }))
    .sort((a: any, b: any) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rule }: any) => rule as TeacherRule);
}

export async function getTeacherExamples(subject = "", input: TeachingRetrievalInput = {}, limit = 4) {
  const { data, error } = await supabaseAdmin
    .from("teacher_examples")
    .select("id,solve_history_id,subject,topic,keywords,question_signature,teacher_answer,teacher_explanation,teacher_options,teacher_strategy,teacher_note,annotations,apply_scope,enabled,updated_at")
    .eq("enabled", true)
    .order("updated_at", { ascending: false })
    .limit(160);

  if (error) {
    console.error("Teacher examples read error:", error);
    return [] as TeacherExample[];
  }

  const sig = norm(input.questionSignature);
  const topic = norm(input.topic);
  const queryTokens = tokenSet([input.topic, input.questionSignature, input.questionNote, input.referenceAnswer, ...(input.keywords || [])]);

  return (data || [])
    .map(mapExample)
    .filter((item) => !subject || !item.subject || item.subject === subject)
    .map((item) => {
      const candidateSig = norm(item.questionSignature);
      const exact = Boolean(sig && candidateSig && sig === candidateSig);
      const nearSig = Boolean(sig && candidateSig && (sig.includes(candidateSig) || candidateSig.includes(sig)));
      const topicHit = Boolean(topic && norm(item.topic) && (topic.includes(norm(item.topic)) || norm(item.topic).includes(topic)));
      const keywordScore = lexicalScore(queryTokens, item.keywords);
      const similarity = Math.min(1, (exact ? 1 : nearSig ? 0.82 : 0) + (topicHit ? 0.3 : 0) + keywordScore * 0.55);
      return { ...item, similarity };
    })
    .filter((item) => item.similarity! > 0.08 || (!input.topic && !input.questionSignature && item.subject === subject))
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, limit);
}

// Legacy fallback so existing teacher_correction_queue data remains useful before it is migrated.
async function getLegacyTeacherExamples(subject: string, limit = 3) {
  const { data, error } = await supabaseAdmin
    .from("teacher_correction_queue")
    .select("teacher_note,corrected_answer,corrected_explanation,status,solve_history(subject,answer,explanation)")
    .in("status", ["reviewed", "applied"])
    .not("corrected_explanation", "is", null)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) return [];
  return (data || [])
    .map((row: any) => {
      const history = Array.isArray(row.solve_history) ? row.solve_history[0] : row.solve_history;
      return {
        subject: String(history?.subject || ""),
        correctedAnswer: String(row.corrected_answer || ""),
        correctedExplanation: String(row.corrected_explanation || ""),
        teacherNote: String(row.teacher_note || ""),
      };
    })
    .filter((item) => !subject || item.subject === subject)
    .slice(0, limit);
}

export async function buildTeachingContext(subject: string, input: TeachingRetrievalInput = {}) {
  const settings = await getTeachingEngineSettings();
  const [rules, examples, legacy] = await Promise.all([
    getTeacherRules(subject, input, 10),
    getTeacherExamples(subject, input, 4),
    getLegacyTeacherExamples(subject, 2),
  ]);

  const modeText: Record<TeachingMode, string> = {
    concise: "精簡解題：只保留必要觀念、核心列式與關鍵步驟，避免冗長。",
    standard: "標準教學：答案 → 觀念解析 → 選項分析 → 關鍵觀念，兼顧精簡與可教學性。",
    deep: "深度解析：先整理條件與核心觀念，再完整推導，必要時補充常見錯誤。",
    correction: "訂正模式：若與參考答案或既有結果衝突，優先找出錯誤點並重建正確解法。",
  };

  const baseRules = [
    settings.general.noGuessing && "資訊不足時不得猜測。",
    settings.general.requestRetakeWhenIncomplete && "題目或圖片不完整時，明確要求學生重新拍攝完整內容。",
    settings.general.highSchoolFirst && "優先使用高中課綱內最直觀的方法。",
    settings.general.keepUnits && "計算與物理量保留必要單位。",
    settings.general.keepKeySteps && "不得省略會影響學生理解的關鍵中間步驟。",
    settings.general.avoidOverreach && "避免不必要的超綱或大學程度延伸。",
  ].filter(Boolean);

  const densityText = settings.general.annotationDensity === "rich"
    ? "互動式詳解偏豐富：若內容足夠，優先標出 6～10 個真正有學習價值的數值、變數、單位、公式片段、化學式或關鍵常數。"
    : settings.general.annotationDensity === "light"
      ? "互動式詳解精簡：只標 2～4 個最關鍵的數值、變數或公式片段。"
      : "互動式詳解標準：通常標 4～6 個最有學習價值的數值、變數、單位或公式片段。";

  const diagramText = settings.general.diagramMode === "off"
    ? "Science Diagram Engine：關閉。本題 diagram 必須為 null。"
    : "Science Diagram Engine：自動。只有物理／地科或少數實驗題在圖解能明顯降低理解門檻時才附精確簡圖；純計算題不要為了裝飾畫圖。教師規則若指定應附圖或指定圖中元素，優先遵循。";

  const chemicalStructureText = subject === "chemistry"
    ? "Chemical Structure Renderer：自動。只有在結構式本身能幫助辨識官能基、鍵結、異構物或反應位置時才附原子／鍵 SVG；不確定結構時禁止猜測。"
    : "Chemical Structure Renderer：非化學題通常不使用。";

  const subjectRule = settings.subjects[subject as keyof typeof settings.subjects] || "";
  const rulesText = rules.length
    ? rules.map((rule, index) => `R${index + 1} [${rule.scope}${rule.topic ? `/${rule.topic}` : ""}] ${rule.content}`).join("\n")
    : "目前沒有額外教師規則。";

  const examplesText = examples.length
    ? examples.map((item, index) => {
        const exact = (item.similarity || 0) >= 0.95;
        return `案例 ${index + 1}${exact ? "（高度相似／可能同題，核心解法優先遵循）" : "（相似題，只學習策略與表達）"}\n主題：${item.topic || "未標記"}\n教師答案：${item.teacherAnswer || "未指定"}\n教師解題策略：${item.teacherStrategy || "未填"}\n教師詳解：${item.teacherExplanation || "未填"}\n教師備註：${item.teacherNote || "無"}\n互動重點範例：${item.annotations?.length ? JSON.stringify(item.annotations) : "無"}`;
      }).join("\n\n")
    : legacy.length
      ? legacy.map((item, index) => `舊案例 ${index + 1}\n老師認定答案：${item.correctedAnswer || "未指定"}\n老師解法：${item.correctedExplanation}\n老師備註：${item.teacherNote || "無"}`).join("\n\n")
      : "目前沒有可用的教師案例。";

  return `
━━━━━━━━━━━━━━━━━━
【H.H. Teacher Knowledge Layer】
━━━━━━━━━━━━━━━━━━
解題模式：${modeText[settings.mode]}

通用規則：
${baseRules.map((rule) => `- ${rule}`).join("\n")}
- ${densityText}
- ${diagramText}
- ${chemicalStructureText}

本科既有規則：
${subjectRule || "無"}

教師規則庫（優先度高於一般模型偏好；但不可違反題目事實）：
${rulesText}

教師核准案例：
${examplesText}

套用原則：
- 高度相似／同題案例：答案與核心推理優先遵循教師版本；可重新措辭，但不得自行換成相反解法。
- 相似題案例：只能學習判斷順序、解題策略與說明方式，不得照抄數值或答案。
- 教師規則與題目事實衝突時，以題目事實為準，並保持可驗證的推理。
`.trim();
}
