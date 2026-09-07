"use client";

import { useEffect, useRef, useState } from "react";
import { Cropper } from "react-cropper";
import katex from "katex";
import { toPng } from "html-to-image";
import ThemeToggle from "@/components/theme-toggle";
import "cropperjs/dist/cropper.css";
import "katex/dist/katex.min.css";

type Campus = "高雄班" | "嘉義班" | "員林班";

type LoginRegion = {
  id: string;
  name: string;
};

type LoginInstitution = {
  id: string;
  region_id: string;
  name: string;
};

type LoginClass = {
  id: string;
  institution_id: string;
  name: string;
  academic_year?: number | null;
  allowed_subjects?: string[] | null;
};

type StudentSession = {
  id: string;
  campus: Campus;
  name: string;
  classId?: string | null;
  allowedSubjects?: string[] | null;
  mustChangePin: boolean;
};

type SubjectOption = {
  value: string;
  label: string;
};

type Annotation = {
  id: string;
  display: string;
  label: string;
  meaning: string;
  source: string;
  usage: string;
};

type SolveData = {
  answer: string;
  explanation: string;
  options: string;
  annotations: Annotation[];
  historyId?: string | null;
};

type FollowupMessage = {
  id?: string;
  question: string;
  answer: string;
  createdAt?: string;
};

type UsageData = {
  count: number;
  limit: number;
  remaining: number;
};

type ImageQualityMetric = {
  meanLuma: number;
  lumaStdDev: number;
  darkRatio: number;
  lightRatio: number;
  avgNeighborDiff: number;
  width: number;
  height: number;
};

async function analyzeImageQuality(dataUrl: string): Promise<ImageQualityMetric | null> {
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const sampleWidth = 48;
        const sampleHeight = Math.max(24, Math.round(sampleWidth * img.naturalHeight / Math.max(1, img.naturalWidth)));
        const canvas = document.createElement("canvas");
        canvas.width = sampleWidth;
        canvas.height = Math.min(72, sampleHeight);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const lumas: number[] = [];
        let dark = 0;
        let light = 0;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const y = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
          lumas.push(y);
          sum += y;
          if (y <= 18) dark++;
          if (y >= 238) light++;
        }
        const mean = sum / Math.max(1, lumas.length);
        let variance = 0;
        for (const y of lumas) variance += (y - mean) ** 2;
        const sd = Math.sqrt(variance / Math.max(1, lumas.length));
        let diffSum = 0;
        let diffCount = 0;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 1; x < canvas.width; x++) {
            const idx = y * canvas.width + x;
            diffSum += Math.abs(lumas[idx] - lumas[idx - 1]);
            diffCount++;
          }
        }
        resolve({
          meanLuma: Number(mean.toFixed(2)),
          lumaStdDev: Number(sd.toFixed(2)),
          darkRatio: Number((dark / Math.max(1, lumas.length)).toFixed(4)),
          lightRatio: Number((light / Math.max(1, lumas.length)).toFixed(4)),
          avgNeighborDiff: Number((diffSum / Math.max(1, diffCount)).toFixed(2)),
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

type HistoryImage = {
  path: string;
  mimeType?: string;
  order?: number;
  url?: string | null;
};

type SolveHistoryItem = {
  id: string;
  subject: string;
  referenceAnswer: string;
  questionNote: string;
  answer: string;
  explanation: string;
  options: string;
  annotations: Annotation[];
  imagePaths: HistoryImage[];
  favorite: boolean;
  createdAt: string;
  primaryModel?: string | null;
  verifierModel?: string | null;
  arbiterModel?: string | null;
};

const subjectPermissions: Record<Campus, SubjectOption[]> = {
  高雄班: [
    { value: "physics", label: "物理" },
    { value: "chemistry", label: "化學" },
    { value: "biology", label: "生物" },
    { value: "earth", label: "地球科學" },
  ],
  嘉義班: [{ value: "chemistry", label: "化學" }],
  員林班: [{ value: "chemistry", label: "化學" }],
};

const allSubjectOptions: SubjectOption[] = [
  { value: "physics", label: "物理" },
  { value: "chemistry", label: "化學" },
  { value: "biology", label: "生物" },
  { value: "earth", label: "地球科學" },
];

function subjectsForStudent(student: StudentSession | null) {
  if (!student) return [];
  const configured = Array.isArray(student.allowedSubjects) ? student.allowedSubjects : [];
  if (configured.length) {
    const allowed = new Set(configured);
    return allSubjectOptions.filter((item) => allowed.has(item.value));
  }
  return subjectPermissions[student.campus] || allSubjectOptions;
}

function normalizeScienceMarkup(text: string) {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\*\*/g, "")
    .replace(/^---+$/gm, "")
    .trim();
}

function displayClassName(name: string) {
  return name
    .replace(/(?:19|20)\d{2}\s*年?/gu, "")
    .replace(/^\s*[·・\-–—|｜/]+\s*/u, "")
    .replace(/\s*[·・\-–—|｜/]+\s*$/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function regionSortWeight(name: string) {
  const normalized = name.replace(/班$/u, "").trim();
  if (normalized.includes("高雄")) return 0;
  if (normalized.includes("嘉義")) return 1;
  if (normalized.includes("員林")) return 2;
  return 99;
}

function renderKatex(formula: string, displayMode: boolean) {
  try {
    return katex.renderToString(formula, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: (context) => context.command === "\\htmlData",
    });
  } catch {
    return formula;
  }
}

function stripExportAnnotationCommands(formula: string) {
  // 匯出 PNG 時把互動標註完全還原成純公式內容。
  // 不能只用 regex，因為被標註的內容常包含 \frac、\sqrt 等巢狀大括號。
  // 逐字解析才能避免 htmlData 樣式在輸出圖片中變成深綠色方框。
  let result = formula;

  for (let pass = 0; pass < 24; pass += 1) {
    const marker = "\\htmlData{annotation=";
    const start = result.indexOf(marker);
    if (start < 0) break;

    const metaEnd = result.indexOf("}", start + marker.length);
    if (metaEnd < 0 || result[metaEnd + 1] !== "{") break;

    let depth = 1;
    let cursor = metaEnd + 2;
    for (; cursor < result.length && depth > 0; cursor += 1) {
      if (result[cursor] === "{") depth += 1;
      else if (result[cursor] === "}") depth -= 1;
    }

    if (depth !== 0) break;

    const inner = result.slice(metaEnd + 2, cursor - 1);
    result = result.slice(0, start) + inner + result.slice(cursor);
  }

  return result;
}

function formatOptionAnalysis(text: string) {
  if (!text) return "";

  return text
    .replace(/^\s*\(([A-Z])\)\s*對[：:]\s*/gm, "✓ ($1) ")
    .replace(/^\s*\(([A-Z])\)\s*錯[：:]\s*/gm, "✕ ($1) ")
    .replace(/^\s*([A-Z])[.、]\s*對[：:]\s*/gm, "✓ ($1) ")
    .replace(/^\s*([A-Z])[.、]\s*錯[：:]\s*/gm, "✕ ($1) ");
}

function ScienceText({
  text,
  annotations,
  onAnnotationClick,
  stripAnnotations = false,
}: {
  text: string;
  annotations?: Annotation[];
  onAnnotationClick?: (annotation: Annotation) => void;
  stripAnnotations?: boolean;
}) {
  if (!text) return null;

  const cleaned = normalizeScienceMarkup(text);

  const annotationMap = new Map((annotations || []).map((item) => [item.id, item]));

  function handleFormulaClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const element = target.closest("[data-annotation]") as HTMLElement | null;
    if (!element) return;
    const id = element.dataset.annotation;
    if (!id) return;
    const annotation = annotationMap.get(id);
    if (annotation && onAnnotationClick) onAnnotationClick(annotation);
  }

  const blocks = cleaned.split(/(\$\$[\s\S]*?\$\$)/);

  return (
    <div className="student-science-text" onClick={handleFormulaClick}>
      {blocks.map((block, blockIndex) => {
        if (block.startsWith("$$") && block.endsWith("$$")) {
          const formula = block.slice(2, -2).trim();
          return (
            <div
              key={blockIndex}
              className="student-display-formula"
              dangerouslySetInnerHTML={{
                __html: renderKatex(
                  stripAnnotations ? stripExportAnnotationCommands(formula) : formula,
                  true,
                ),
              }}
            />
          );
        }

        return block.split("\n").map((line, lineIndex) => {
          if (!line.trim()) return <div key={`${blockIndex}-${lineIndex}`} className="student-text-gap" />;
          const pieces = line.split(/(\$[^$\n]+\$)/);

          const optionLine = /^[✓✕]\s*\([A-Z]\)/.test(line.trim());

          return (
            <p
              key={`${blockIndex}-${lineIndex}`}
              className={optionLine ? "student-option-line" : undefined}
            >
              {pieces.map((piece, pieceIndex) => {
                if (piece.startsWith("$") && piece.endsWith("$")) {
                  return (
                    <span
                      key={pieceIndex}
                      className="student-inline-formula"
                      dangerouslySetInnerHTML={{
                        __html: renderKatex(
                          stripAnnotations
                            ? stripExportAnnotationCommands(piece.slice(1, -1))
                            : piece.slice(1, -1),
                          false,
                        ),
                      }}
                    />
                  );
                }
                return <span key={pieceIndex}>{piece}</span>;
              })}
            </p>
          );
        });
      })}
    </div>
  );
}

function ModalScienceText({ text }: { text: string }) {
  if (!text) return null;
  const cleaned = normalizeScienceMarkup(text);
  const blocks = cleaned.split(/(\$\$[\s\S]*?\$\$)/);

  return (
    <div className="student-modal-science">
      {blocks.map((block, blockIndex) => {
        if (block.startsWith("$$") && block.endsWith("$$")) {
          return (
            <div
              key={blockIndex}
              className="student-modal-formula"
              dangerouslySetInnerHTML={{ __html: renderKatex(block.slice(2, -2).trim(), true) }}
            />
          );
        }

        return block.split("\n").map((line, lineIndex) => {
          if (!line.trim()) return null;
          const pieces = line.split(/(\$[^$\n]+\$)/);
          return (
            <p key={`${blockIndex}-${lineIndex}`}>
              {pieces.map((piece, pieceIndex) =>
                piece.startsWith("$") && piece.endsWith("$") ? (
                  <span
                    key={pieceIndex}
                    dangerouslySetInnerHTML={{ __html: renderKatex(piece.slice(1, -1), false) }}
                  />
                ) : (
                  <span key={pieceIndex}>{piece}</span>
                )
              )}
            </p>
          );
        });
      })}
    </div>
  );
}

function StepHeader({
  number,
  title,
  description,
  tone = "sage",
}: {
  number: string;
  title: string;
  description: string;
  tone?: "sage" | "gold" | "terra";
}) {
  return (
    <div className="student-step-header">
      <div className={`student-step-number student-step-number-${tone} hh-number`}>{number}</div>
      <div>
        <h2 className="hh-display student-step-title">{title}</h2>
        <p className="student-step-description">{description}</p>
      </div>
    </div>
  );
}


type FirstUsePlatform = "ios" | "android";

type FirstUseTutorialStep = {
  eyebrow: string;
  title: string;
  description: string;
  previewLabel: string;
  previewValue: string;
  tips: string[];
};

type TutorialPhase = "setup" | "results" | "full";

type TutorialTargetRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

const ONBOARDING_VERSION = "v2.4";
const FIRST_USE_TOUR_KEY_PREFIX = `hh-science:first-use-tour:${ONBOARDING_VERSION}:`;
const FIRST_USE_SETUP_KEY_PREFIX = `hh-science:first-use-setup:${ONBOARDING_VERSION}:`;
const FIRST_USE_RESULT_PENDING_KEY_PREFIX = `hh-science:first-use-result-pending:${ONBOARDING_VERSION}:`;
const ADD_HOME_GUIDE_KEY = "hh-science:add-home-guide-seen";

const SETUP_TUTORIAL_SEQUENCE = [1, 0, 4, 5, 6];
const RESULT_TUTORIAL_SEQUENCE = [7, 8, 9, 10, 11, 12];
const FULL_TUTORIAL_SEQUENCE = [1, 0, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const tutorialTargetSelectors: Record<number, string[]> = {
  0: ['[data-tour="subject-picker"]'],
  1: ['[data-tour="upload-zone"]', '[data-tour="upload-panel"]'],
  2: ['[data-tour="crop-frame"]', '[data-tour="image-editor"]'],
  3: ['[data-tour="rotate-button"]', '[data-tour="image-editor"]'],
  4: ['[data-tour="reference-answer"]'],
  5: ['[data-tour="question-note"]'],
  6: ['[data-tour="solve-button"]'],
  7: ['[data-tour="concept-analysis"]'],
  8: ['[data-tour="concept-analysis"] [data-annotation]'],
  9: ['[data-tour="option-analysis"]'],
  10: ['[data-tour="followup"]'],
  11: ['[data-tour="result-actions"]'],
  12: ['[data-tour="menu-panel"]', '[data-tour="menu-button"]'],
};

const firstUseTutorialSteps: FirstUseTutorialStep[] = [
  {
    eyebrow: "準備題目 · 2/5",
    title: "再選擇題目科目",
    description: "選擇物理、化學、生物或地球科學，系統會依科目調整解題方式。",
    previewLabel: "科目",
    previewValue: "選擇科目",
    tips: ["確認科目後再繼續"],
  },
  {
    eyebrow: "準備題目 · 1/5",
    title: "先從這裡加入題目圖片",
    description: "之後解題時，從這裡拍照或選擇相簿圖片；導覽中不需要真的上傳。",
    previewLabel: "題目圖片",
    previewValue: "拍照／相簿",
    tips: ["正式使用時再上傳即可"],
  },
  {
    eyebrow: "準備題目 · 3/7",
    title: "用裁切框留下真正的題目",
    description: "拖曳圖片與裁切框，只留下題目、選項和必要附圖。把無關背景裁掉，AI 會更容易抓到真正要解的內容。",
    previewLabel: "圖片裁切",
    previewValue: "拖曳／縮放裁切框",
    tips: ["不要裁掉題號、選項或圖表", "題目已經很乾淨時維持原範圍即可"],
  },
  {
    eyebrow: "準備題目 · 4/7",
    title: "方向不對就先旋轉",
    description: "照片橫著、倒著或方向不正確時，點「旋轉 90°」調整。調整完成後，請在圖片編輯器按「確認完成」再繼續。",
    previewLabel: "旋轉圖片",
    previewValue: "↻ 旋轉 90°",
    tips: ["可以連續旋轉多次", "方向正確有助於文字與公式辨識"],
  },
  {
    eyebrow: "準備題目 · 3/5",
    title: "有答案就填上",
    description: "已知標準答案時建議填入，可提高解析穩定度；不知道就留白。",
    previewLabel: "標準參考答案",
    previewValue: "例如：B、ACD、2.5 mol",
    tips: ["這個欄位不是必填"],
  },
  {
    eyebrow: "準備題目 · 4/5",
    title: "需要時再補充",
    description: "可補充卡住的位置或想特別釐清的選項；一般題目可以不填。",
    previewLabel: "補充敘述",
    previewValue: "例如：想特別問 C 選項",
    tips: ["一句話說明重點就夠"],
  },
  {
    eyebrow: "準備題目 · 5/5",
    title: "開始解題",
    description: "確認圖片與科目後按下開始解題，完成後會接著教你怎麼看解析。",
    previewLabel: "開始解題",
    previewValue: "開始解題",
    tips: ["完成第一題後會自動接續結果頁導覽"],
  },
  {
    eyebrow: "看懂解析 · 1/6",
    title: "先讀觀念解析與解題脈絡",
    description: "這裡會整理關鍵觀念、公式與解題步驟，先理解再看答案。",
    previewLabel: "觀念解析",
    previewValue: "詳解與解題步驟",
    tips: ["先理解為什麼，再記答案", "公式與重要數值會保留在解題流程中"],
  },
  {
    eyebrow: "看懂解析 · 2/6",
    title: "詳解裡的數字可以點",
    description: "詳解中有標記的數字可以直接點擊，查看數值來源與用途。",
    previewLabel: "互動數字",
    previewValue: "點擊詳解中的數字",
    tips: ["適合追公式中的數值來源", "若這題沒有互動數字，導覽會自動略過這一步"],
  },
  {
    eyebrow: "看懂解析 · 3/6",
    title: "選擇題再看選項分析",
    description: "選擇題可逐項查看為什麼正確或錯誤。",
    previewLabel: "選項分析",
    previewValue: "A / B / C / D",
    tips: ["特別適合訂正選擇題", "非選擇題沒有這區時會自動略過"],
  },
  {
    eyebrow: "看懂解析 · 4/6",
    title: "看不懂的地方直接追問",
    description: "看不懂某一步或公式，可以直接針對同一題繼續追問。",
    previewLabel: "還有疑問？",
    previewValue: "同一題繼續追問",
    tips: ["可以直接指定『第 2 步看不懂』", "同題追問不需要重新上傳圖片"],
  },
  {
    eyebrow: "看懂解析 · 5/6",
    title: "最後兩個按鈕也很重要",
    description: "可用 LINE 詢問老師，也能產生解析圖片收藏或分享。",
    previewLabel: "題目工具",
    previewValue: "詢問老師／產生解析圖片",
    tips: ["LINE：把疑問帶去給老師確認", "解析圖片：方便收藏、傳送與複習"],
  },
  {
    eyebrow: "看懂解析 · 6/6",
    title: "之後都可以從右上角選單回來",
    description: "右上角選單可查看解題紀錄、重播教學與加入主畫面。",
    previewLabel: "功能選單",
    previewValue: "☰",
    tips: ["歷史題目可以重新打開複習", "忘記操作時可隨時重播使用教學"],
  },
];

function detectFirstUsePlatform(): FirstUsePlatform | null {
  if (typeof navigator === "undefined") return null;

  const userAgent = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return null;
}

function isRunningStandalone() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    navigatorWithStandalone.standalone === true
  );
}

export default function Home() {
  const [campus, setCampus] = useState<Campus | "">("");
  const [regionId, setRegionId] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [classId, setClassId] = useState("");
  const [loginRegions, setLoginRegions] = useState<LoginRegion[]>([]);
  const [loginInstitutions, setLoginInstitutions] = useState<LoginInstitution[]>([]);
  const [loginClasses, setLoginClasses] = useState<LoginClass[]>([]);
  const [loginOptionsLoading, setLoginOptionsLoading] = useState(true);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [student, setStudent] = useState<StudentSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinChangeLoading, setPinChangeLoading] = useState(false);
  const [pinChangeError, setPinChangeError] = useState("");

  const [usage, setUsage] = useState<UsageData>({ count: 0, limit: 10, remaining: 10 });

  const [images, setImages] = useState<string[]>([]);
  const [editQueue, setEditQueue] = useState<string[]>([]);
  const [editQueueIndex, setEditQueueIndex] = useState(0);
  const [editingImage, setEditingImage] = useState("");
  const [editingExistingIndex, setEditingExistingIndex] = useState<number | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const cropperRef = useRef<any>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<"solve" | "history">("solve");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialPhase, setTutorialPhase] = useState<TutorialPhase>("setup");
  const [tutorialAutoFlow, setTutorialAutoFlow] = useState(false);
  const [tutorialTargetRect, setTutorialTargetRect] = useState<TutorialTargetRect | null>(null);
  const [tutorialAnimating, setTutorialAnimating] = useState(false);
  const [firstActionNudge, setFirstActionNudge] = useState(false);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [installPlatform, setInstallPlatform] = useState<FirstUsePlatform>("ios");

  const [historyItems, setHistoryItems] = useState<SolveHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historySubject, setHistorySubject] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyKeyword, setHistoryKeyword] = useState("");
  const [historyFavoritesOnly, setHistoryFavoritesOnly] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<SolveHistoryItem | null>(null);
  const [historyFavoriteBusyId, setHistoryFavoriteBusyId] = useState<string | null>(null);

  const image = images[0] || "";

  const [subject, setSubject] = useState("");
  const [referenceAnswer, setReferenceAnswer] = useState("");
  const [questionNote, setQuestionNote] = useState("");
  const [questionError, setQuestionError] = useState("");

  const [isSolving, setIsSolving] = useState(false);
  const [solveData, setSolveData] = useState<SolveData | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);

  const [followupQuestion, setFollowupQuestion] = useState("");
  const [followups, setFollowups] = useState<FollowupMessage[]>([]);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [preparedShareFile, setPreparedShareFile] = useState<File | null>(null);
  const [exportQuestionImage, setExportQuestionImage] = useState("");
  const resultRef = useRef<HTMLElement | null>(null);
  const exportCardRef = useRef<HTMLDivElement | null>(null);
  const exportQuestionImageRef = useRef<HTMLImageElement | null>(null);

  const hasInteractiveAnnotations = Boolean(solveData?.annotations?.length);
  const tutorialSequenceBase = tutorialPhase === "setup"
    ? SETUP_TUTORIAL_SEQUENCE
    : tutorialPhase === "results"
      ? RESULT_TUTORIAL_SEQUENCE
      : FULL_TUTORIAL_SEQUENCE;
  const tutorialSequence = tutorialSequenceBase.filter((step) => {
    if (step === 8 && !hasInteractiveAnnotations) return false;
    if (step === 9 && !solveData?.options) return false;
    return true;
  });
  const activeTutorialStepIndex = tutorialSequence[Math.min(tutorialStep, Math.max(0, tutorialSequence.length - 1))] ?? 0;
  const activeTutorialStep = firstUseTutorialSteps[activeTutorialStepIndex];

  useEffect(() => {
    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await response.json();
        if (data.authenticated && data.student) {
          const restored: StudentSession = {
            id: data.student.id,
            campus: data.student.campus,
            name: data.student.name,
            mustChangePin: Boolean(data.student.mustChangePin ?? data.mustChangePin),
          };
          setStudent(restored);
          setupSubject(restored);
          await loadUsage();
        }
      } catch (error) {
        console.error("Restore session:", error);
      } finally {
        setAuthLoading(false);
      }
    }
    restoreSession();
  }, []);

  useEffect(() => {
    async function loadLoginOptions() {
      try {
        const response = await fetch("/api/auth/login-options", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "讀取班級資料失敗。");
        }

        const regions = (Array.isArray(data.regions) ? data.regions : [])
          .slice()
          .sort(
            (a: LoginRegion, b: LoginRegion) =>
              regionSortWeight(a.name) - regionSortWeight(b.name) ||
              a.name.localeCompare(b.name, "zh-Hant"),
          );

        const institutions = Array.isArray(data.institutions)
          ? data.institutions
          : [];

        const classes = Array.isArray(data.classes) ? data.classes : [];

        setLoginRegions(regions);
        setLoginInstitutions(institutions);
        setLoginClasses(classes);
        setRegionId((current) => current || regions[0]?.id || "");
      } catch (error) {
        setLoginError(
          error instanceof Error ? error.message : "讀取班級資料失敗。",
        );
      } finally {
        setLoginOptionsLoading(false);
      }
    }

    void loadLoginOptions();
  }, []);

  useEffect(() => {
    const available = loginInstitutions.filter(
      (item) => item.region_id === regionId,
    );

    if (!available.some((item) => item.id === institutionId)) {
      setInstitutionId(available[0]?.id || "");
    }
  }, [regionId, institutionId, loginInstitutions]);

  useEffect(() => {
    const available = loginClasses.filter(
      (item) => item.institution_id === institutionId,
    );

    if (!available.some((item) => item.id === classId)) {
      setClassId(available[0]?.id || "");
    }
  }, [institutionId, classId, loginClasses]);

  useEffect(() => {
    if (!student || student.mustChangePin || authLoading || tutorialOpen) return;

    const timer = window.setTimeout(() => {
      try {
        const tutorialSeen = window.localStorage.getItem(
          `${FIRST_USE_TOUR_KEY_PREFIX}${student.id}`,
        );
        const setupSeen = window.localStorage.getItem(
          `${FIRST_USE_SETUP_KEY_PREFIX}${student.id}`,
        );

        if (!tutorialSeen && !setupSeen) {
          startTutorial("setup", true);
          return;
        }

        maybeOpenInstallGuide();
      } catch {
        // localStorage 可能因瀏覽器隱私設定不可用；不影響主要解題流程。
      }
    }, 120);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, student?.id, student?.mustChangePin, tutorialOpen]);

  useEffect(() => {
    if (!student || !solveData || student.mustChangePin || tutorialOpen) return;

    let shouldResume = false;

    try {
      const tutorialSeen = window.localStorage.getItem(
        `${FIRST_USE_TOUR_KEY_PREFIX}${student.id}`,
      );
      const resultPending = window.localStorage.getItem(
        `${FIRST_USE_RESULT_PENDING_KEY_PREFIX}${student.id}`,
      );
      shouldResume = !tutorialSeen && Boolean(resultPending);
    } catch {}

    if (!shouldResume) return;

    const timer = window.setTimeout(() => {
      startTutorial("results", true);
    }, 520);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, student?.mustChangePin, solveData?.historyId, tutorialOpen]);

  useEffect(() => {
    if (!tutorialOpen) {
      setTutorialTargetRect(null);
      return;
    }

    if (activeTutorialStepIndex === 12) {
      setMenuOpen(true);
    } else {
      setMenuOpen(false);
    }

    let cancelled = false;
    let measureTimer = 0;
    let scrollAnimationFrame = 0;
    let measureAnimationFrame = 0;

    const isMobileViewport = () => window.innerWidth <= 760;
    const mobileSheetReserve = () => Math.min(236, Math.max(184, window.innerHeight * 0.28));

    const findTarget = () => {
      const selectors = tutorialTargetSelectors[activeTutorialStepIndex] || [];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element instanceof HTMLElement) return element;
      }
      return null;
    };

    const measure = () => {
      if (cancelled) return;
      const target = findTarget();
      if (!target) {
        setTutorialTargetRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 8;
      const usableBottom = isMobileViewport()
        ? Math.max(112, viewportHeight - mobileSheetReserve() - 12)
        : viewportHeight - 8;
      const left = Math.max(8, rect.left - padding);
      const top = Math.max(8, Math.min(rect.top - padding, usableBottom - 30));
      const right = Math.min(viewportWidth - 8, rect.right + padding);
      const bottom = Math.max(top + 24, Math.min(usableBottom, rect.bottom + padding));

      setTutorialTargetRect({
        top,
        left,
        right,
        bottom,
        width: Math.max(1, right - left),
        height: Math.max(24, bottom - top),
        viewportWidth,
        viewportHeight,
      });
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(measureAnimationFrame);
      measureAnimationFrame = window.requestAnimationFrame(measure);
    };

    const prepareTarget = () => {
      const target = findTarget();
      if (!target) {
        setTutorialTargetRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const scrollingElement = document.scrollingElement || document.documentElement;
      const startY = scrollingElement.scrollTop || window.scrollY || 0;
      const viewportHeight = window.innerHeight;
      const mobile = isMobileViewport();
      const reservedBottom = mobile ? mobileSheetReserve() + 26 : 0;
      const usableHeight = Math.max(180, viewportHeight - reservedBottom);
      const targetVisualHeight = Math.min(rect.height, usableHeight * 0.68);
      const desiredTop = activeTutorialStepIndex === 12
        ? 72
        : mobile
          ? Math.max(64, Math.min(usableHeight * 0.32, usableHeight - targetVisualHeight - 28))
          : Math.max(80, (viewportHeight - targetVisualHeight) / 2);
      const rawTargetY = Math.max(0, startY + rect.top - desiredTop);
      const maxScrollY = Math.max(0, scrollingElement.scrollHeight - viewportHeight);
      const targetY = Math.min(rawTargetY, maxScrollY);
      const distance = targetY - startY;
      const duration = Math.min(900, Math.max(460, Math.abs(distance) * 0.58));
      const startedAt = performance.now();

      const animateScroll = (now: number) => {
        if (cancelled) return;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const nextY = startY + distance * eased;
        scrollingElement.scrollTop = nextY;
        measure();
        if (progress < 1) {
          scrollAnimationFrame = window.requestAnimationFrame(animateScroll);
        } else {
          measureTimer = window.setTimeout(measure, 110);
        }
      };

      scrollAnimationFrame = window.requestAnimationFrame(animateScroll);
    };

    // Give result cards/menu enough time to render before measuring.
    const prepareTimer = window.setTimeout(prepareTarget, activeTutorialStepIndex >= 7 ? 260 : 120);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);

    return () => {
      cancelled = true;
      window.clearTimeout(prepareTimer);
      window.clearTimeout(measureTimer);
      window.cancelAnimationFrame(scrollAnimationFrame);
      window.cancelAnimationFrame(measureAnimationFrame);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [tutorialOpen, activeTutorialStepIndex, solveData?.historyId]);

  useEffect(() => {
    if (!tutorialOpen) {
      setTutorialAnimating(false);
      return;
    }
    setTutorialAnimating(true);
    const timer = window.setTimeout(() => setTutorialAnimating(false), 430);
    return () => window.clearTimeout(timer);
  }, [tutorialOpen, tutorialStep, tutorialPhase]);

  useEffect(() => {
    if (student && activeView === "history") {
      void loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, student?.id]);

  function setupSubject(currentStudent: StudentSession) {
    const classConfigured = loginClasses.find((item) => item.id === currentStudent.classId)?.allowed_subjects;
    const configured = Array.isArray(currentStudent.allowedSubjects) && currentStudent.allowedSubjects.length
      ? currentStudent.allowedSubjects
      : Array.isArray(classConfigured) && classConfigured.length
        ? classConfigured
        : null;
    const allowed = configured
      ? allSubjectOptions.filter((item) => configured.includes(item.value))
      : subjectPermissions[currentStudent.campus] || allSubjectOptions;
    setSubject(allowed.length === 1 ? allowed[0].value : "");
  }

  async function loadUsage() {
    try {
      const response = await fetch("/api/usage", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setUsage({
        count: data.count || 0,
        limit: data.limit || 10,
        remaining: data.remaining ?? 10,
      });
    } catch (error) {
      console.error("Load usage:", error);
    }
  }

  function maybeOpenInstallGuide(force = false) {
    if (typeof window === "undefined") return;

    const platform = detectFirstUsePlatform();

    if (!force) {
      if (!platform || isRunningStandalone()) return;

      try {
        if (window.localStorage.getItem(ADD_HOME_GUIDE_KEY)) return;
      } catch {}
    }

    setInstallPlatform(platform || "ios");
    setInstallGuideOpen(true);
  }

  function startTutorial(phase: TutorialPhase, autoFlow = false) {
    setActiveView("solve");
    setMenuOpen(false);
    setTutorialPhase(phase);
    setTutorialStep(0);
    setTutorialAutoFlow(autoFlow);
    setTutorialTargetRect(null);
    setTutorialOpen(true);
  }

  function openTutorialFromMenu() {
    startTutorial(solveData ? "full" : "setup", false);
  }

  function closeTutorialSurface() {
    setTutorialOpen(false);
    setTutorialAutoFlow(false);
    setTutorialTargetRect(null);
    setMenuOpen(false);
  }

  function skipTutorial() {
    const continueFirstUseFlow = tutorialAutoFlow;

    if (student && continueFirstUseFlow) {
      try {
        window.localStorage.setItem(
          `${FIRST_USE_TOUR_KEY_PREFIX}${student.id}`,
          "1",
        );
        window.localStorage.setItem(
          `${FIRST_USE_SETUP_KEY_PREFIX}${student.id}`,
          "1",
        );
        window.localStorage.removeItem(
          `${FIRST_USE_RESULT_PENDING_KEY_PREFIX}${student.id}`,
        );
      } catch {}
    }

    closeTutorialSurface();

    if (continueFirstUseFlow) {
      maybeOpenInstallGuide();
    }
  }

  function finishTutorial() {
    const continueFirstUseFlow = tutorialAutoFlow;
    const completedPhase = tutorialPhase;

    if (student && continueFirstUseFlow) {
      try {
        if (completedPhase === "setup") {
          window.localStorage.setItem(
            `${FIRST_USE_SETUP_KEY_PREFIX}${student.id}`,
            "1",
          );
          window.localStorage.setItem(
            `${FIRST_USE_RESULT_PENDING_KEY_PREFIX}${student.id}`,
            "1",
          );
        } else if (completedPhase === "results") {
          window.localStorage.setItem(
            `${FIRST_USE_TOUR_KEY_PREFIX}${student.id}`,
            "1",
          );
          window.localStorage.setItem(
            `${FIRST_USE_SETUP_KEY_PREFIX}${student.id}`,
            "1",
          );
          window.localStorage.removeItem(
            `${FIRST_USE_RESULT_PENDING_KEY_PREFIX}${student.id}`,
          );
        }
      } catch {}
    }

    closeTutorialSurface();

    if (continueFirstUseFlow && completedPhase === "setup") {
      setFirstActionNudge(true);
      window.setTimeout(() => {
        const target = document.querySelector(images.length ? '[data-tour="solve-button"]' : '[data-tour="upload-zone"]');
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 160);
    } else if (continueFirstUseFlow && completedPhase === "results") {
      maybeOpenInstallGuide();
    }
  }

  function closeInstallGuide() {
    try {
      window.localStorage.setItem(ADD_HOME_GUIDE_KEY, "1");
    } catch {}

    setInstallGuideOpen(false);
  }

  async function handleLogin() {
    setLoginError("");

    if (!regionId) return setLoginError("請先選擇地區。");
    if (!institutionId) return setLoginError("請先選擇補習班。");
    if (!classId) return setLoginError("請先選擇班級。");
    if (!name.trim()) return setLoginError("請輸入學生姓名。");
    if (!/^\d{4,6}$/.test(pin.trim())) {
      return setLoginError("個人 PIN 必須為 4～6 位數字。");
    }

    setLoginLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          name: name.trim(),
          pin: pin.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "登入失敗。");
      }

      const loggedIn: StudentSession = {
        id: data.student.id,
        campus: data.student.campus,
        name: data.student.name,
        mustChangePin: Boolean(data.student.mustChangePin ?? data.mustChangePin),
      };

      setStudent(loggedIn);
      setCampus(loggedIn.campus);
      setupSubject(loggedIn);
      setPin("");
      await loadUsage();
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "登入發生錯誤。",
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleFirstPinChange() {
    setPinChangeError("");

    if (!student) {
      setPinChangeError("請先登入。");
      return;
    }

    if (!/^\d{4,6}$/.test(newPin)) {
      setPinChangeError("新密碼必須為 4～6 位數字。");
      return;
    }

    if (newPin !== confirmPin) {
      setPinChangeError("兩次輸入的新密碼不一致。");
      return;
    }

    setPinChangeLoading(true);

    try {
      const response = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPin,
          confirmPin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "更新登入密碼失敗。");
      }

      setStudent((current) =>
        current
          ? {
              ...current,
              mustChangePin: false,
            }
          : current,
      );

      setNewPin("");
      setConfirmPin("");
      setPinChangeError("");
      await loadUsage();

      // 初次密碼設定完成後直接啟動 V2.2 導覽。
      // 使用新的版本化 localStorage key，避免舊版導覽紀錄讓新版完全不出現。
      window.setTimeout(() => {
        startTutorial("setup", true);
      }, 260);
    } catch (error) {
      setPinChangeError(
        error instanceof Error
          ? error.message
          : "更新登入密碼失敗。",
      );
    } finally {
      setPinChangeLoading(false);
    }
  }

  async function handleLogout() {
    if (!window.confirm("確定要切換學生嗎？")) return;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}

    setStudent(null);
    setCampus("");
    setInstitutionId("");
    setClassId("");
    setName("");
    setPin("");
    setNewPin("");
    setConfirmPin("");
    setPinChangeError("");
    setMenuOpen(false);
    setActiveView("solve");
    setHistoryItems([]);
    setSelectedHistory(null);
    setHistoryError("");
    clearHistoryFilters();
    setSubject("");
    setUsage({ count: 0, limit: 10, remaining: 10 });
    clearQuestion();
  }

  function historySubjectLabel(value: string) {
    if (value === "physics") return "物理";
    if (value === "chemistry") return "化學";
    if (value === "biology") return "生物";
    if (value === "earth") return "地球科學";
    return "自然科";
  }

  function formatHistoryDate(value: string) {
    try {
      return new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  async function loadHistory() {
    if (!student) return;

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const params = new URLSearchParams();

      if (historySubject) params.set("subject", historySubject);
      if (historyFrom) params.set("from", historyFrom);
      if (historyTo) params.set("to", historyTo);
      if (historyKeyword.trim()) params.set("q", historyKeyword.trim());
      if (historyFavoritesOnly) params.set("favorite", "true");

      const response = await fetch(
        `/api/history${params.toString() ? `?${params.toString()}` : ""}`,
        {
          cache: "no-store",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "讀取解題紀錄失敗。");
      }

      setHistoryItems(Array.isArray(data.items) ? data.items : []);

      if (
        selectedHistory &&
        !data.items?.some((item: SolveHistoryItem) => item.id === selectedHistory.id)
      ) {
        setSelectedHistory(null);
      }
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "讀取解題紀錄失敗。",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function toggleHistoryFavorite(item: SolveHistoryItem) {
    setHistoryFavoriteBusyId(item.id);
    setHistoryError("");

    try {
      const response = await fetch(`/api/history/${item.id}/favorite`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          favorite: !item.favorite,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "更新收藏狀態失敗。");
      }

      setHistoryItems((current) =>
        current.map((history) =>
          history.id === item.id
            ? {
                ...history,
                favorite: Boolean(data.favorite),
              }
            : history,
        ),
      );

      setSelectedHistory((current) =>
        current?.id === item.id
          ? {
              ...current,
              favorite: Boolean(data.favorite),
            }
          : current,
      );
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "更新收藏狀態失敗。",
      );
    } finally {
      setHistoryFavoriteBusyId(null);
    }
  }

  function clearHistoryFilters() {
    setHistorySubject("");
    setHistoryFrom("");
    setHistoryTo("");
    setHistoryKeyword("");
    setHistoryFavoritesOnly(false);
  }

  function normalizeImageFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("圖片無法讀取。"));
          return;
        }

        const sourceImage = new Image();

        sourceImage.onload = () => {
          const maxDimension = 2200;
          let width = sourceImage.width;
          let height = sourceImage.height;

          if (width > maxDimension || height > maxDimension) {
            const scale = Math.min(
              maxDimension / width,
              maxDimension / height,
            );

            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext("2d");

          if (!context) {
            reject(new Error("圖片處理失敗。"));
            return;
          }

          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(sourceImage, 0, 0, width, height);

          resolve(canvas.toDataURL("image/jpeg", 0.92));
        };

        sourceImage.onerror = () => {
          reject(new Error(`圖片「${file.name}」無法讀取。`));
        };

        sourceImage.src = reader.result;
      };

      reader.onerror = () => {
        reject(new Error(`圖片「${file.name}」讀取失敗。`));
      };

      reader.readAsDataURL(file);
    });
  }

  async function handleImageUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (!selectedFiles.length) return;

    const remaining = 5 - images.length;

    if (remaining <= 0) {
      setQuestionError("一次最多上傳 5 張圖片。");
      return;
    }

    if (selectedFiles.length > remaining) {
      setQuestionError(`目前最多還能加入 ${remaining} 張圖片。`);
      return;
    }

    setQuestionError("");
    setSolveData(null);
    setPreparedShareFile(null);

    try {
      const processed = await Promise.all(
        selectedFiles.map((file) => normalizeImageFile(file)),
      );

      setEditQueue(processed);
      setEditQueueIndex(0);
      setEditingExistingIndex(null);
      setEditingImage(processed[0]);
      setIsCropping(true);
    } catch (error) {
      setQuestionError(
        error instanceof Error
          ? error.message
          : "圖片處理失敗，請重新選擇。",
      );
    }
  }

  function startEditExisting(index: number) {
    const target = images[index];
    if (!target) return;

    setEditQueue([]);
    setEditQueueIndex(0);
    setEditingExistingIndex(index);
    setEditingImage(target);
    setIsCropping(true);
    setSolveData(null);
    setPreparedShareFile(null);
  }

  function rotateEditingImage() {
    if (!editingImage) return;

    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.height;
      canvas.height = img.width;

      const context = canvas.getContext("2d");
      if (!context) return;

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(Math.PI / 2);
      context.drawImage(img, -img.width / 2, -img.height / 2);

      setEditingImage(canvas.toDataURL("image/jpeg", 0.95));
    };

    img.src = editingImage;
  }

  function finishCurrentImageEdit() {
    if (!editingImage) return;

    let finalImage = editingImage;
    const cropper = cropperRef.current?.cropper;

    if (cropper) {
      const canvas = cropper.getCroppedCanvas({
        maxWidth: 1800,
        maxHeight: 1800,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      });

      if (canvas) {
        finalImage = canvas.toDataURL("image/jpeg", 0.95);
      }
    }

    if (editingExistingIndex !== null) {
      setImages((current) =>
        current.map((item, index) =>
          index === editingExistingIndex ? finalImage : item,
        ),
      );

      setEditingExistingIndex(null);
      setEditingImage("");
      setIsCropping(false);
      setQuestionError("");
      return;
    }

    setImages((current) => [...current, finalImage]);

    const nextIndex = editQueueIndex + 1;

    if (nextIndex < editQueue.length) {
      setEditQueueIndex(nextIndex);
      setEditingImage(editQueue[nextIndex]);
      setIsCropping(true);
      return;
    }

    setEditQueue([]);
    setEditQueueIndex(0);
    setEditingImage("");
    setIsCropping(false);
    setQuestionError("");
  }

  function cancelImageEdit() {
    setEditQueue([]);
    setEditQueueIndex(0);
    setEditingExistingIndex(null);
    setEditingImage("");
    setIsCropping(false);
  }

  function removeImage(index: number) {
    setImages((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
    setSolveData(null);
    setPreparedShareFile(null);
    setExportQuestionImage("");
  }

  function clearQuestion() {
    setImages([]);
    setEditQueue([]);
    setEditQueueIndex(0);
    setEditingImage("");
    setEditingExistingIndex(null);
    setIsCropping(false);
    setReferenceAnswer("");
    setQuestionNote("");
    setQuestionError("");
    setSolveData(null);
    setSelectedAnnotation(null);
    setFollowupQuestion("");
    setFollowups([]);
    setFollowupError("");
    setPreparedShareFile(null);
    setExportQuestionImage("");

    if (student) setupSubject(student);
    else setSubject("");
  }

  async function handleStartSolve() {
    setFirstActionNudge(false);
    setQuestionError("");
    if (!student) return setQuestionError("請先登入。");
    if (usage.remaining <= 0) {
      return setQuestionError(`今日 ${usage.limit} 題 AI 解題額度已使用完畢。`);
    }
    if (!images.length) return setQuestionError("請先上傳題目圖片。");
    if (!subject) return setQuestionError("請先選擇科目。");

    setIsSolving(true);
    setPreparedShareFile(null);
    setExportQuestionImage("");
    setSolveData(null);
    setFollowupQuestion("");
    setFollowups([]);
    setFollowupError("");
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

    try {
      const imageQuality = (await Promise.all(images.map((item) => analyzeImageQuality(item))))
        .filter((item): item is ImageQualityMetric => Boolean(item));

      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          subject,
          referenceAnswer,
          questionNote,
          imageQuality,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.usage) setUsage(data.usage);
        throw new Error(data.error || "AI 解題失敗");
      }

      setSolveData({
        answer: data.answer || "",
        explanation: data.explanation || "",
        options: data.options || "",
        annotations: Array.isArray(data.annotations) ? data.annotations : [],
        historyId: data.historyId || null,
      });

      if (data.usage) setUsage(data.usage);
      else await loadUsage();
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : "AI 解題發生錯誤");
      await loadUsage();
    } finally {
      setIsSolving(false);
    }
  }

  const availableSubjects = (() => {
    if (!student) return [];
    const classConfigured = loginClasses.find((item) => item.id === student.classId)?.allowed_subjects;
    const configured = Array.isArray(student.allowedSubjects) && student.allowedSubjects.length
      ? student.allowedSubjects
      : Array.isArray(classConfigured) && classConfigured.length
        ? classConfigured
        : null;
    if (configured) return allSubjectOptions.filter((item) => configured.includes(item.value));
    return subjectsForStudent(student);
  })();

  async function handleFollowupSubmit() {
    const question = followupQuestion.trim();

    if (!solveData?.historyId) {
      setFollowupError("這筆解題尚未建立追問紀錄，請重新解題後再追問。");
      return;
    }

    if (!question) {
      setFollowupError("請先輸入想追問的內容。");
      return;
    }

    setFollowupLoading(true);
    setFollowupError("");

    try {
      const response = await fetch("/api/followup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          historyId: solveData.historyId,
          question,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "追問失敗。");
      }

      setFollowups((current) => [
        ...current,
        {
          id: data.followup?.id,
          question,
          answer: data.followup?.answer || "",
          createdAt: data.followup?.createdAt,
        },
      ]);

      setFollowupQuestion("");
    } catch (error) {
      setFollowupError(
        error instanceof Error
          ? error.message
          : "追問發生錯誤。",
      );
    } finally {
      setFollowupLoading(false);
    }
  }

  function handleLineAsk() {
    if (!student) return;
    const subjectLabel = availableSubjects.find((item) => item.value === subject)?.label || "自然科";
    const message = [
      "【H.H. Science Lab 詢問老師】",
      "",
      `班級：${student.campus}`,
      `學生：${student.name}`,
      `科目：${subjectLabel}`,
      "",
      questionNote ? `學生補充：${questionNote}` : "想詢問題目解析中的內容。",
      "",
      "我已使用 H.H. Science Lab 解題，想請老師協助確認。",
    ].join("\n");
    window.open("https://line.me/R/msg/text/?" + encodeURIComponent(message), "_blank");
  }

  async function normalizeQuestionImageForExport(source: string) {
    const sourceImage = new Image();
    sourceImage.decoding = "async";

    await new Promise<void>((resolve, reject) => {
      sourceImage.onload = () => resolve();
      sourceImage.onerror = () => reject(new Error("題目圖片載入失敗"));
      sourceImage.src = source;
    });

    const maxWidth = 1600;
    const ratio = Math.min(1, maxWidth / sourceImage.naturalWidth);
    const width = Math.max(1, Math.round(sourceImage.naturalWidth * ratio));
    const height = Math.max(1, Math.round(sourceImage.naturalHeight * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法建立題目圖片畫布");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(sourceImage, 0, 0, width, height);

    return canvas.toDataURL("image/png", 0.96);
  }

  async function waitForExportImages(root: HTMLElement) {
    const images = Array.from(root.querySelectorAll("img"));

    await Promise.all(
      images.map(async (img) => {
        if (img.complete && img.naturalWidth > 0) {
          try {
            await img.decode();
          } catch {}
          return;
        }

        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(
            () => reject(new Error("題目圖片載入逾時")),
            12000,
          );

          img.addEventListener(
            "load",
            () => {
              window.clearTimeout(timer);
              resolve();
            },
            { once: true },
          );

          img.addEventListener(
            "error",
            () => {
              window.clearTimeout(timer);
              reject(new Error("題目圖片載入失敗"));
            },
            { once: true },
          );
        });
      }),
    );
  }

  async function waitForNextPaint() {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }

  async function loadCanvasImage(source: string) {
    const img = new Image();
    img.decoding = "async";

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("匯出圖片載入失敗"));
      img.src = source;
    });

    return img;
  }

  async function buildSolutionImageFile() {
    if (!exportCardRef.current || !exportQuestionImageRef.current || !solveData) {
      throw new Error("目前沒有可匯出的解析內容");
    }

    if ("fonts" in document) {
      await document.fonts.ready;
    }

    // 先把原始題目圖轉成標準 PNG。
    const normalizedQuestionImage = await normalizeQuestionImageForExport(image);

    // 題目圖在 html-to-image / Safari clone 時可能會變成空白，
    // 因此這一版不再要求匯出引擎負責畫題目圖。
    // html-to-image 只負責「文字＋版面」，最後再用原生 Canvas
    // 把題目圖直接合成到正確位置，避開 Safari 的 DOM 圖片 clone 問題。
    const card = exportCardRef.current;
    const questionElement = exportQuestionImageRef.current;

    const cardRect = card.getBoundingClientRect();
    const questionRect = questionElement.getBoundingClientRect();

    if (
      cardRect.width <= 0 ||
      cardRect.height <= 0 ||
      questionRect.width <= 0 ||
      questionRect.height <= 0
    ) {
      throw new Error("無法取得解析圖片版面尺寸");
    }

    const isIOS =
      /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const pixelRatio = isIOS ? 1.35 : 1.8;

    // 先暫時讓題目 img 本身透明，保留它佔用的版面位置。
    // 這樣 html-to-image 產生的底圖只會留下乾淨的白色題目框。
    const previousOpacity = questionElement.style.opacity;
    questionElement.style.opacity = "0";

    let baseDataUrl: string;

    try {
      await waitForNextPaint();

      baseDataUrl = await toPng(card, {
        backgroundColor: "#f8f7f2",
        pixelRatio,
        cacheBust: true,
        skipAutoScale: true,
        style: {
          background: "#f8f7f2",
          color: "#27332d",
        },
      });
    } finally {
      questionElement.style.opacity = previousOpacity;
    }

    const baseImage = await loadCanvasImage(baseDataUrl);
    const questionImage = await loadCanvasImage(normalizedQuestionImage);

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = baseImage.naturalWidth;
    finalCanvas.height = baseImage.naturalHeight;

    const context = finalCanvas.getContext("2d");
    if (!context) {
      throw new Error("無法建立最終解析圖片");
    }

    // 先畫 html-to-image 產生的完整文字與版面。
    context.drawImage(baseImage, 0, 0);

    // 由實際輸出尺寸反推 DOM → PNG 的縮放比例，
    // 不依賴 pixelRatio 猜測，因此桌機 / iPhone 都能對準。
    const scaleX = baseImage.naturalWidth / cardRect.width;
    const scaleY = baseImage.naturalHeight / cardRect.height;

    const targetX = (questionRect.left - cardRect.left) * scaleX;
    const targetY = (questionRect.top - cardRect.top) * scaleY;
    const targetWidth = questionRect.width * scaleX;
    const targetHeight = questionRect.height * scaleY;

    const sourceWidth = questionImage.naturalWidth;
    const sourceHeight = questionImage.naturalHeight;

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error("原題目圖片尺寸異常");
    }

    // 等比例 contain，完整顯示題目，不裁切。
    const containScale = Math.min(
      targetWidth / sourceWidth,
      targetHeight / sourceHeight,
    );

    const drawWidth = sourceWidth * containScale;
    const drawHeight = sourceHeight * containScale;
    const drawX = targetX + (targetWidth - drawWidth) / 2;
    const drawY = targetY + (targetHeight - drawHeight) / 2;

    context.drawImage(
      questionImage,
      drawX,
      drawY,
      drawWidth,
      drawHeight,
    );

    const blob: Blob | null = await new Promise((resolve) => {
      finalCanvas.toBlob(resolve, "image/png", 1);
    });

    if (!blob || blob.size === 0) {
      throw new Error("解析圖片建立失敗");
    }

    const safeStudent = student
      ? student.name.replace(/[\\/:*?"<>|]/g, "")
      : "學生";

    const fileName = `HH-Science-${safeStudent}-${Date.now()}.png`;

    return new File([blob], fileName, {
      type: "image/png",
      lastModified: Date.now(),
    });
  }

  function downloadPreparedFile(file: File) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = file.name;
    anchor.rel = "noopener";
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  async function handleSaveImage() {
    if (!exportCardRef.current || !solveData) return;

    // 第二次點擊：這一段不先做任何 await，讓 iOS 保留「使用者手勢」，
    // navigator.share 才能直接打開系統分享表。
    if (preparedShareFile) {
      try {
        if (
          navigator.share &&
          navigator.canShare?.({ files: [preparedShareFile] })
        ) {
          await navigator.share({
            title: "H.H. Science Lab 題目解析",
            text: "觀念解析與選項分析",
            files: [preparedShareFile],
          });
          return;
        }

        downloadPreparedFile(preparedShareFile);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Share solution image failed:", error);
        alert("系統分享沒有成功，將改用下載方式儲存。");
        downloadPreparedFile(preparedShareFile);
        return;
      }
    }

    // 第一次點擊：先可靠地生成完整 PNG。
    setIsSaving(true);

    try {
      const file = await buildSolutionImageFile();
      setPreparedShareFile(file);
    } catch (error) {
      console.error("Build solution image failed:", error);

      const message =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : "未知錯誤";

      alert(`解析圖片建立失敗。\n\n${message}`);
    } finally {
      setIsSaving(false);
    }
  }

  const limitReached = usage.remaining <= 0;
  const usageTone =
    usage.remaining <= 2
      ? "danger"
      : usage.remaining <= 5
        ? "warning"
        : "caution";

  const tutorialCardWidth = tutorialTargetRect
    ? Math.min(420, Math.max(280, tutorialTargetRect.viewportWidth - 24))
    : 420;
  const tutorialCardLeft = tutorialTargetRect
    ? Math.max(
        12,
        Math.min(
          tutorialTargetRect.left + tutorialTargetRect.width / 2 - tutorialCardWidth / 2,
          tutorialTargetRect.viewportWidth - tutorialCardWidth - 12,
        ),
      )
    : 12;
  const tutorialCardAbove = tutorialTargetRect
    ? tutorialTargetRect.top > tutorialTargetRect.viewportHeight * 0.48
    : false;
  const tutorialCardMaxHeight = tutorialTargetRect
    ? Math.max(
        190,
        tutorialCardAbove
          ? tutorialTargetRect.top - 26
          : tutorialTargetRect.viewportHeight - tutorialTargetRect.bottom - 26,
      )
    : 520;

  if (authLoading) {
    return (
      <main className="hh-page student-loading-page">
        <div className="student-loading-card">
          <div className="hh-eyebrow">H.H. SCIENCE LAB</div>
          <div className="hh-display student-loading-title">解題實驗室</div>
          <div className="student-muted">正在確認登入狀態…</div>
        </div>
      </main>
    );
  }

  return (
    <main className={`hh-page student-page ${tutorialOpen && tutorialPhase !== "setup" ? "student-tour-results-active" : ""}`}>
      <div className="student-top-glow" />

      <div className="student-container">
        <header className="student-app-header">
          <button
            type="button"
            className="student-app-brand"
            onClick={() => {
              setActiveView("solve");
              setMenuOpen(false);
            }}
          >
            <span className="student-app-brand-en">H.H. Science Lab</span>
            <span className="student-app-brand-zh">解題實驗室</span>
          </button>

          <div className="student-app-header-actions">
            <div className="student-header-theme" aria-label="選擇介面主題">
              <ThemeToggle />
            </div>

            <button
              type="button"
              data-tour="menu-button"
              className="student-menu-button"
              aria-label="開啟選單"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          {menuOpen && (
            <>
              <button
                type="button"
                className="student-menu-backdrop"
                aria-label="關閉選單"
                onClick={() => setMenuOpen(false)}
              />

              <div className="student-menu-panel" data-tour="menu-panel">
                <button
                  type="button"
                  className={activeView === "solve" ? "active" : ""}
                  onClick={() => {
                    setActiveView("solve");
                    setMenuOpen(false);
                  }}
                >
                  開始解題
                </button>

                <button
                  type="button"
                  className={activeView === "history" ? "active" : ""}
                  onClick={() => {
                    setActiveView("history");
                    setMenuOpen(false);
                  }}
                >
                  我的解題紀錄
                </button>

                <button
                  type="button"
                  onClick={openTutorialFromMenu}
                >
                  使用教學
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    maybeOpenInstallGuide(true);
                  }}
                >
                  加入主畫面
                </button>

                <div className="student-menu-separator" />

                {student && (
                  <div className="student-menu-account">
                    <strong>{student.campus}</strong>
                    <span>{student.name}</span>
                  </div>
                )}

                {student && (
                  <button
                    type="button"
                    className="student-menu-logout"
                    onClick={() => {
                      setMenuOpen(false);
                      void handleLogout();
                    }}
                  >
                    登出
                  </button>
                )}
              </div>
            </>
          )}
        </header>

        <section className="student-brand-intro">
          <div className="hh-eyebrow">H.H. SCIENCE LAB</div>
          <h1 className="hh-display">自然科解題實驗室</h1>
          <p>拆解步驟，訂正錯誤，清晰脈絡，梳理思路</p>
        </section>

        {student ? (
          <section className="student-welcome-card">
            <div className="student-welcome-main">
              <div className="student-avatar">{student.name.slice(0, 1)}</div>
              <div>
                <div className="student-welcome-label">WELCOME BACK</div>
                <h2 className="hh-display student-welcome-title">{student.name}</h2>
                <div className="student-muted">
                  {student.campus}
                  {student.mustChangePin
                    ? " · 請先設定個人登入密碼"
                    : ` · 今日剩餘 ${usage.remaining} 題`}
                </div>
              </div>
            </div>

            <div className="student-welcome-actions">
              <div className={`student-usage-pill student-usage-pill-${usageTone}`}>
                <span>剩餘</span>
                <span className="hh-number">{usage.remaining}</span>
                <span>題</span>
              </div>
            </div>
          </section>
        ) : (
          <section className="hh-card student-login-card">
            <div className="student-login-intro">
              <div className="student-feature-mark">01</div>
              <div>
                <div className="hh-eyebrow">STUDENT ACCESS</div>
                <h2 className="hh-display student-login-title">學生登入</h2>
              </div>
            </div>

            <div className="student-login-form">
              <div className="student-field">
                <span>地區</span>
                <div className="student-region-segment" role="group" aria-label="選擇地區">
                  {loginRegions.map((region) => (
                    <button
                      key={region.id}
                      type="button"
                      className={`student-region-button ${
                        regionId === region.id ? "is-active" : ""
                      }`}
                      onClick={() => setRegionId(region.id)}
                      disabled={loginOptionsLoading}
                      aria-pressed={regionId === region.id}
                    >
                      <span className="student-region-dot" aria-hidden="true" />
                      {region.name.replace(/班$/u, "")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="student-login-row student-login-row-org">
                <label className="student-field">
                  <span>補習班</span>
                  <div className="student-select-wrap">
                    <select
                      value={institutionId}
                      onChange={(event) => setInstitutionId(event.target.value)}
                      className="hh-select student-select"
                      disabled={loginOptionsLoading || !regionId}
                    >
                      <option value="">選擇補習班</option>
                      {loginInstitutions
                        .filter((item) => item.region_id === regionId)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    <span className="student-select-arrow" aria-hidden="true">⌄</span>
                  </div>
                </label>

                <label className="student-field">
                  <span>班級</span>
                  <div className="student-select-wrap">
                    <select
                      value={classId}
                      onChange={(event) => setClassId(event.target.value)}
                      className="hh-select student-select"
                      disabled={loginOptionsLoading || !institutionId}
                    >
                      <option value="">選擇班級</option>
                      {loginClasses
                        .filter((item) => item.institution_id === institutionId)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {displayClassName(item.name)}
                          </option>
                        ))}
                    </select>
                    <span className="student-select-arrow" aria-hidden="true">⌄</span>
                  </div>
                </label>
              </div>

              <div className="student-login-row student-login-row-identity">
                <label className="student-field">
                  <span>學生姓名</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    placeholder="輸入姓名"
                    className="hh-input"
                  />
                </label>

                <label className="student-field">
                  <span>個人 PIN</span>
                  <input
                    value={pin}
                    onChange={(event) =>
                      setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !loginLoading) {
                        void handleLogin();
                      }
                    }}
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="current-password"
                    placeholder="4～6 位數 PIN"
                    className="hh-input"
                  />
                </label>
              </div>
            </div>

            {loginError && (
              <div className="student-alert student-alert-danger">
                {loginError}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={loginLoading || loginOptionsLoading}
              className="hh-button-primary student-login-button"
            >
              {loginLoading
                ? "正在登入…"
                : loginOptionsLoading
                  ? "讀取班級資料…"
                  : "登入解題實驗室"}
              {!loginLoading && !loginOptionsLoading && (
                <span className="student-login-button-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </button>
          </section>
        )}

        {student?.mustChangePin && (
          <section className="hh-card student-pin-setup-card">
            <div className="student-pin-setup-mark">SECURE</div>

            <div className="student-pin-setup-head">
              <div>
                <div className="hh-eyebrow">FIRST LOGIN</div>
                <h2 className="hh-display student-pin-setup-title">
                  設定個人登入密碼
                </h2>
                <p className="student-muted">
                  這是首次登入或老師重設密碼後的必要步驟。完成設定後，才能進入解題實驗室。
                </p>
              </div>
            </div>

            <div className="student-pin-setup-grid">
              <label className="student-field">
                <span>新的個人密碼</span>
                <input
                  value={newPin}
                  onChange={(event) =>
                    setNewPin(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="new-password"
                  placeholder="4～6 位數字"
                  className="hh-input"
                />
              </label>

              <label className="student-field">
                <span>再次輸入新密碼</span>
                <input
                  value={confirmPin}
                  onChange={(event) =>
                    setConfirmPin(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !pinChangeLoading) {
                      void handleFirstPinChange();
                    }
                  }}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="new-password"
                  placeholder="再次輸入"
                  className="hh-input"
                />
              </label>
            </div>

            <div className="student-pin-setup-note">
              請設定只有自己知道的密碼，不要使用共用初始密碼。
            </div>

            {pinChangeError && (
              <div className="student-alert student-alert-danger">
                {pinChangeError}
              </div>
            )}

            <button
              type="button"
              onClick={handleFirstPinChange}
              disabled={pinChangeLoading}
              className="hh-button-primary student-pin-setup-button"
            >
              {pinChangeLoading ? "正在設定…" : "完成設定並進入"}
            </button>
          </section>
        )}

        {!student?.mustChangePin && activeView === "solve" && (
          <>
        <div className="student-workspace">
          <section data-tour="upload-panel" className={`hh-card student-panel student-panel-upload ${!student ? "student-panel-disabled" : ""}`}>
            <StepHeader
              number="1"
              title="上傳題目圖片"
              description="可上傳1～5張，題目與解答皆可上傳"
              tone="sage"
            />

            {images.length === 0 && (
              <label className={`student-upload-zone ${firstActionNudge && images.length === 0 ? "student-first-action-pulse" : ""}`} data-tour="upload-zone">
                <div className="student-upload-mainline">
                  <div className="student-upload-icon">＋</div>
                  <div className="student-upload-title">選擇題目圖片</div>
                </div>
                <div className="student-muted student-upload-short-note">
                  可上傳1～5張，題目與解答皆可上傳
                </div>
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  multiple
                  disabled={isCropping}
                  onChange={handleImageUpload}
                  hidden
                />
              </label>
            )}

            {images.length > 0 && (
              <>
                <div className="student-image-list">
                  {images.map((item, index) => (
                    <article key={`${index}-${item.slice(-24)}`} className="student-image-card">
                      <div className="student-image-order hh-number">
                        {String(index + 1).padStart(2, "0")}
                      </div>

                      <div className="student-image-card-preview">
                        <img src={item} alt={`題目圖片 ${index + 1}`} />
                      </div>

                      <div className="student-image-card-info">
                        <strong>圖片 {index + 1}</strong>
                        <span>
                          {index === 0
                            ? "主要題目圖片"
                            : "依此順序提供給 AI 閱讀"}
                        </span>
                      </div>

                      <div className="student-image-card-actions">
                        <button
                          type="button"
                          className="hh-button-secondary"
                          onClick={() => startEditExisting(index)}
                          disabled={isCropping}
                        >
                          編輯
                        </button>

                        <button
                          type="button"
                          className="student-image-delete"
                          onClick={() => removeImage(index)}
                          disabled={isCropping}
                        >
                          刪除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                {images.length < 5 && !isCropping && (
                  <label className="student-add-more-images">
                    <span className="student-add-more-plus">＋</span>
                    <span>
                      <strong>繼續加入圖片</strong>
                      <small>已加入 {images.length} / 5 張</small>
                    </span>
                    <span className="student-add-more-action">加入圖片</span>
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      multiple
                      onChange={handleImageUpload}
                      hidden
                    />
                  </label>
                )}
              </>
            )}

            {isCropping && editingImage && (
              <div className="student-image-editor" data-tour="image-editor">
                <div className="student-image-editor-head">
                  <div>
                    <div className="hh-eyebrow">
                      {editingExistingIndex !== null ? "EDIT IMAGE" : "IMAGE SETUP"}
                    </div>
                    <h3 className="hh-display">
                      {editingExistingIndex !== null
                        ? `重新編輯圖片 ${editingExistingIndex + 1}`
                        : `調整圖片 ${editQueueIndex + 1} / ${editQueue.length}`}
                    </h3>
                  </div>

                  <button
                    type="button"
                    className="hh-button-secondary"
                    data-tour="rotate-button"
                    onClick={rotateEditingImage}
                  >
                    ↻ 旋轉 90°
                  </button>
                </div>

                <div className="student-crop-frame" data-tour="crop-frame">
                  <Cropper
                    key={editingImage.slice(-40)}
                    ref={cropperRef}
                    src={editingImage}
                    style={{ height: 420, width: "100%" }}
                    viewMode={1}
                    dragMode="move"
                    responsive
                    autoCropArea={0.92}
                    background={false}
                  />
                </div>

                <div className="student-editor-tip">
                  拖曳圖片調整位置，拉動裁切框決定 AI 實際讀取的範圍。
                </div>

                <div className="student-two-actions">
                  <button
                    type="button"
                    onClick={finishCurrentImageEdit}
                    className="hh-button-primary"
                  >
                    {editingExistingIndex !== null
                      ? "確認修改"
                      : editQueueIndex + 1 < editQueue.length
                        ? "確認並編輯下一張"
                        : "確認完成"}
                  </button>

                  <button
                    type="button"
                    onClick={cancelImageEdit}
                    className="hh-button-secondary"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {images.length === 5 && !isCropping && (
              <div className="student-upload-limit-note">
                已達每題 5 張圖片上限。
              </div>
            )}
          </section>

          <section className={`hh-card student-panel student-panel-info ${!student ? "student-panel-disabled" : ""}`}>
            <StepHeader number="2" title="設定題目資訊" description="科目、參考答案與補充敘述" tone="gold" />

            <div className="student-form-grid">
              <div className="student-field">
                <span>科目</span>
                <div className="student-subject-picker" data-tour="subject-picker" role="group" aria-label="選擇科目">
                  {availableSubjects.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setSubject(item.value)}
                      className={`student-subject-option student-subject-${item.value} ${subject === item.value ? "student-subject-option-selected" : ""}`}
                      aria-pressed={subject === item.value}
                    >
                      <span className="student-subject-dot" />
                      <span>{item.label}</span>
                      {subject === item.value && (
                        <span className="student-subject-check" aria-hidden="true">已選</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <label className="student-field" data-tour="reference-answer">
                <span>標準參考答案 <em>選填</em></span>
                <input value={referenceAnswer} onChange={(event) => setReferenceAnswer(event.target.value)} placeholder="例如 B、ACD、2.5 mol..." className="hh-input" />
              </label>
            </div>

            <label className="student-field student-note-field" data-tour="question-note">
              <span>補充敘述 <em>選填</em></span>
              <textarea
                value={questionNote}
                onChange={(event) => setQuestionNote(event.target.value)}
                rows={1}
                placeholder="有需要再補充，例如：想特別問 C 選項"
                className="hh-textarea student-note-textarea"
              />
            </label>

            {limitReached && <div className="student-alert student-alert-danger">今日解題額度已使用完畢，明天會自動恢復為 {usage.limit} 題。</div>}
            {questionError && <div className="student-alert student-alert-danger">{questionError}</div>}

            <div className="student-two-actions student-solve-actions">
              <button type="button" data-tour="solve-button" onClick={handleStartSolve} disabled={isSolving || limitReached} className={`hh-button-primary student-solve-button ${firstActionNudge && images.length > 0 ? "student-first-action-pulse" : ""}`}>
                {limitReached ? "今日額度已使用完畢" : isSolving ? "分析題目中…" : "開始解題"}
              </button>
              <button type="button" onClick={clearQuestion} className="hh-button-secondary">清除目前題目</button>
            </div>
          </section>
        </div>

        <section ref={resultRef} className={`hh-card student-panel student-result-panel ${!student ? "student-panel-disabled" : ""}`}>
          <StepHeader number="3" title="觀念解析與選項分析" description="答案 → 觀念解析 → 選項判斷" tone="terra" />

          {!solveData && !isSolving && (
            <div className="student-result-empty">
              <div className="student-empty-symbol">∴</div>
              <div>尚未產生題目詳解</div>
              <div className="student-muted">完成上方步驟後，解析會顯示在這裡</div>
            </div>
          )}

          {isSolving && (
            <div className="student-solving-card student-solving-card-v11">
              <div className="student-solving-ring" aria-hidden="true">
                <span />
              </div>
              <div className="student-solving-title">分析題目中</div>
            </div>
          )}

          {solveData && !isSolving && (
            <div className="student-result-stack">
              <article className="student-answer-card">
                <div className="student-result-label">CORRECT ANSWER</div>
                <div className="student-answer-row">
                  <div className="student-answer-check">✓</div>
                  <div className="hh-display student-answer-text"><ScienceText text={solveData.answer} /></div>
                </div>
              </article>

              <article className="student-explanation-card">
                <div className="student-result-card-header" data-tour="concept-analysis">
                  <div className="student-result-index student-result-index-gold">01</div>
                  <div>
                    <div className="hh-eyebrow">CONCEPT ANALYSIS</div>
                    <h3 className="hh-display">觀念解析</h3>
                  </div>
                </div>
                <div className="student-result-content">
                  <ScienceText text={solveData.explanation} annotations={solveData.annotations} onAnnotationClick={setSelectedAnnotation} />
                </div>
              </article>

              {solveData.options && (
                <article className="student-options-card">
                  <div className="student-result-card-header" data-tour="option-analysis">
                    <div className="student-result-index student-result-index-red">02</div>
                    <div>
                      <div className="hh-eyebrow">OPTION ANALYSIS</div>
                      <h3 className="hh-display">選項分析</h3>
                    </div>
                  </div>
                  <div className="student-result-content">
                    <ScienceText
                      text={formatOptionAnalysis(solveData.options)}
                      annotations={solveData.annotations}
                      onAnnotationClick={setSelectedAnnotation}
                    />
                  </div>
                </article>
              )}

              <section className="student-followup-panel" data-tour="followup">
                <div className="student-followup-head">
                  <div>
                    <div className="hh-eyebrow">FOLLOW-UP</div>
                    <h3 className="hh-display">還有疑問？</h3>
                    <p>直接追問這一題，不會重新扣除每日解題額度。</p>
                  </div>

                  <div className="student-followup-count">
                    {followups.length} / 3
                  </div>
                </div>

                {followups.length > 0 && (
                  <div className="student-followup-thread">
                    {followups.map((item, index) => (
                      <article
                        key={item.id || `${index}-${item.question}`}
                        className="student-followup-item"
                      >
                        <div className="student-followup-question">
                          <span>你</span>
                          <p>{item.question}</p>
                        </div>

                        <div className="student-followup-answer">
                          <span>AI</span>
                          <ScienceText text={item.answer} />
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {followupError && (
                  <div className="student-alert student-alert-danger">
                    {followupError}
                  </div>
                )}

                <div className="student-followup-input-row">
                  <textarea
                    className="hh-textarea"
                    rows={2}
                    value={followupQuestion}
                    disabled={followupLoading || followups.length >= 3}
                    onChange={(event) => setFollowupQuestion(event.target.value)}
                    placeholder={
                      followups.length >= 3
                        ? "這題已達 3 次追問上限"
                        : "例如：為什麼這裡不能直接用理想氣體方程式？"
                    }
                  />

                  <button
                    type="button"
                    className="hh-button-primary"
                    disabled={
                      followupLoading ||
                      followups.length >= 3 ||
                      !followupQuestion.trim() ||
                      !solveData.historyId
                    }
                    onClick={() => void handleFollowupSubmit()}
                  >
                    {followupLoading ? "追問中…" : "送出追問"}
                  </button>
                </div>
              </section>

              <div className="student-result-actions" data-tour="result-actions">
                <button type="button" onClick={handleLineAsk} className="student-line-button">LINE 詢問老師</button>
                <button type="button" onClick={handleSaveImage} disabled={isSaving} className="student-save-button">
                  {isSaving
                    ? "正在產生解析圖片…"
                    : preparedShareFile
                      ? "分享／存到照片"
                      : "產生解析圖片"}
                </button>
              </div>
              {preparedShareFile && (
                <div className="student-save-hint">
                  圖片已產生完成，再按一次「分享／存到照片」即可開啟系統分享表。
                </div>
              )}
            </div>
          )}
        </section>

          </>
        )}

        {!student?.mustChangePin && activeView === "history" && (
          <section className="student-history-shell">
            <div className="student-history-header">
              <div>
                <div className="hh-eyebrow">MY SOLVE HISTORY</div>
                <h2 className="hh-display">我的解題紀錄</h2>
                <p>搜尋過去題目、收藏重要題目，並重新查看完整觀念解析。</p>
              </div>

              <button
                type="button"
                className="hh-button-primary"
                onClick={() => setActiveView("solve")}
              >
                ＋ 開始解題
              </button>
            </div>

            <div className="hh-card student-history-filters">
              <div className="student-history-search">
                <label>
                  <span>關鍵字搜尋</span>
                  <input
                    className="hh-input"
                    type="search"
                    value={historyKeyword}
                    onChange={(event) => setHistoryKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void loadHistory();
                      }
                    }}
                    placeholder="搜尋答案、題目補充、解析內容…"
                  />
                </label>
              </div>

              <div className="student-history-filter-grid">
                <label>
                  <span>科目</span>
                  <select
                    className="hh-input"
                    value={historySubject}
                    onChange={(event) => setHistorySubject(event.target.value)}
                  >
                    <option value="">全部自然科</option>
                    <option value="physics">物理</option>
                    <option value="chemistry">化學</option>
                    <option value="biology">生物</option>
                    <option value="earth">地球科學</option>
                  </select>
                </label>

                <label>
                  <span>開始日期</span>
                  <input
                    className="hh-input"
                    type="date"
                    value={historyFrom}
                    onChange={(event) => setHistoryFrom(event.target.value)}
                  />
                </label>

                <label>
                  <span>結束日期</span>
                  <input
                    className="hh-input"
                    type="date"
                    value={historyTo}
                    onChange={(event) => setHistoryTo(event.target.value)}
                  />
                </label>

                <label className="student-history-favorite-filter">
                  <span>收藏</span>
                  <button
                    type="button"
                    className={historyFavoritesOnly ? "active" : ""}
                    onClick={() =>
                      setHistoryFavoritesOnly((current) => !current)
                    }
                  >
                    {historyFavoritesOnly ? "★ 只看收藏" : "☆ 只看收藏"}
                  </button>
                </label>
              </div>

              <div className="student-history-filter-actions">
                <button
                  type="button"
                  className="hh-button-primary"
                  onClick={() => void loadHistory()}
                  disabled={historyLoading}
                >
                  {historyLoading ? "搜尋中…" : "套用篩選"}
                </button>

                <button
                  type="button"
                  className="hh-button-secondary"
                  onClick={() => {
                    clearHistoryFilters();
                    setTimeout(() => void loadHistory(), 0);
                  }}
                >
                  清除條件
                </button>
              </div>
            </div>

            {historyError && (
              <div className="student-alert student-alert-danger">
                {historyError}
              </div>
            )}

            {selectedHistory ? (
              <div className="student-history-detail-wrap">
                <button
                  type="button"
                  className="student-history-back"
                  onClick={() => setSelectedHistory(null)}
                >
                  ← 返回解題紀錄
                </button>

                <article className="hh-card student-history-detail">
                  <div className="student-history-detail-head">
                    <div>
                      <div className="student-history-meta-row">
                        <span>{historySubjectLabel(selectedHistory.subject)}</span>
                        <span>{formatHistoryDate(selectedHistory.createdAt)}</span>
                      </div>
                      <h3 className="hh-display">解題紀錄</h3>
                    </div>

                    <button
                      type="button"
                      className={`student-favorite-button ${
                        selectedHistory.favorite ? "active" : ""
                      }`}
                      disabled={historyFavoriteBusyId === selectedHistory.id}
                      onClick={() => void toggleHistoryFavorite(selectedHistory)}
                    >
                      {selectedHistory.favorite ? "★ 已收藏" : "☆ 收藏"}
                    </button>
                  </div>

                  {selectedHistory.imagePaths.length > 0 && (
                    <div className="student-history-images">
                      {selectedHistory.imagePaths.map((historyImage, index) =>
                        historyImage.url ? (
                          <figure key={`${historyImage.path}-${index}`}>
                            <img
                              src={historyImage.url}
                              alt={`原始題目圖片 ${index + 1}`}
                            />
                            <figcaption>圖片 {index + 1}</figcaption>
                          </figure>
                        ) : null,
                      )}
                    </div>
                  )}

                  {(selectedHistory.referenceAnswer ||
                    selectedHistory.questionNote) && (
                    <div className="student-history-context-grid">
                      {selectedHistory.referenceAnswer && (
                        <div>
                          <span>標準答案</span>
                          <strong>{selectedHistory.referenceAnswer}</strong>
                        </div>
                      )}

                      {selectedHistory.questionNote && (
                        <div>
                          <span>學生補充</span>
                          <strong>{selectedHistory.questionNote}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  <section className="student-history-answer">
                    <div className="hh-eyebrow">FINAL ANSWER</div>
                    <span>AI 最終答案</span>
                    <strong>{selectedHistory.answer || "—"}</strong>
                  </section>

                  <section className="student-history-analysis-block">
                    <div className="student-result-section-head">
                      <div className="student-result-section-number hh-number">01</div>
                      <div>
                        <div className="hh-eyebrow">CONCEPT ANALYSIS</div>
                        <h3 className="hh-display">觀念解析</h3>
                      </div>
                    </div>

                    <ScienceText
                      text={selectedHistory.explanation}
                      annotations={selectedHistory.annotations}
                      onAnnotationClick={setSelectedAnnotation}
                    />
                  </section>

                  {selectedHistory.options && (
                    <section className="student-history-analysis-block">
                      <div className="student-result-section-head">
                        <div className="student-result-section-number hh-number">02</div>
                        <div>
                          <div className="hh-eyebrow">OPTION ANALYSIS</div>
                          <h3 className="hh-display">選項分析</h3>
                        </div>
                      </div>

                      <ScienceText
                        text={formatOptionAnalysis(selectedHistory.options)}
                        annotations={selectedHistory.annotations}
                        onAnnotationClick={setSelectedAnnotation}
                      />
                    </section>
                  )}
                </article>
              </div>
            ) : (
              <>
                <div className="student-history-result-count">
                  {historyLoading
                    ? "正在讀取解題紀錄…"
                    : `共 ${historyItems.length} 筆紀錄`}
                </div>

                {!historyLoading && historyItems.length === 0 ? (
                  <div className="hh-card student-history-empty">
                    <div className="student-history-symbol">⌁</div>
                    <h3 className="hh-display">目前沒有符合條件的紀錄</h3>
                    <p>可以清除篩選條件，或回到開始解題建立新的紀錄。</p>
                  </div>
                ) : (
                  <div className="student-history-list">
                    {historyItems.map((item) => (
                      <article
                        key={item.id}
                        className="hh-card student-history-item"
                      >
                        <button
                          type="button"
                          className="student-history-item-main"
                          onClick={() => setSelectedHistory(item)}
                        >
                          <div className="student-history-thumb">
                            {item.imagePaths[0]?.url ? (
                              <img
                                src={item.imagePaths[0].url || ""}
                                alt="題目縮圖"
                              />
                            ) : (
                              <span>SCI</span>
                            )}
                          </div>

                          <div className="student-history-item-content">
                            <div className="student-history-meta-row">
                              <span>{historySubjectLabel(item.subject)}</span>
                              <span>{formatHistoryDate(item.createdAt)}</span>
                            </div>

                            <strong className="student-history-item-answer">
                              {item.answer || "查看完整解析"}
                            </strong>

                            <p>
                              {item.questionNote ||
                                item.explanation
                                  .replace(/\$+/g, "")
                                  .replace(/\\htmlData\{[^}]+\}\{([^}]+)\}/g, "$1")
                                  .slice(0, 90) ||
                                "點擊查看完整解題紀錄"}
                            </p>

                            <div className="student-history-item-footer">
                              <span>
                                {item.imagePaths.length
                                  ? `${item.imagePaths.length} 張圖片`
                                  : "舊版紀錄"}
                              </span>

                              {item.referenceAnswer && (
                                <span>有標準答案</span>
                              )}
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          aria-label={item.favorite ? "取消收藏" : "加入收藏"}
                          className={`student-history-star ${
                            item.favorite ? "active" : ""
                          }`}
                          disabled={historyFavoriteBusyId === item.id}
                          onClick={() => void toggleHistoryFavorite(item)}
                        >
                          {item.favorite ? "★" : "☆"}
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <footer className="student-footer">
          <div className="hh-eyebrow">H.H. SCIENCE LAB</div>
          <div>自然科解題實驗室 v1.3.4</div>
        </footer>
      </div>

      {solveData && image && (
        <div aria-hidden="true" style={{ position: "fixed", left: "-12000px", top: 0, width: "860px", zIndex: -1000 }}>
          <div
            ref={exportCardRef}
            style={{
              width: "860px",
              background: "#f8f7f2",
              color: "#27332d",
              padding: "44px",
              fontFamily: '"Source Han Serif TC", "Noto Serif TC", "Songti TC", "PMingLiU", serif',
            }}
          >
            <div style={{ borderBottom: "2px solid #dce0da", paddingBottom: "18px", marginBottom: "24px" }}>
              <div style={{ fontFamily: '"Source Han Serif TC", "Noto Serif TC", "Songti TC", "PMingLiU", serif', fontSize: "32px", fontWeight: 700, color: "#30463b" }}>H.H. Science Lab 解題實驗室</div>
              <div style={{ marginTop: "6px", fontSize: "14px", color: "#747c77" }}>拆解步驟，訂正錯誤，清晰脈絡，梳理思路</div>
              {student && <div style={{ marginTop: "10px", fontSize: "13px", color: "#747c77" }}>{student.campus} ｜ {student.name}</div>}
            </div>

            <div style={{ marginBottom: "22px" }}>
              <div style={{ fontWeight: 700, fontSize: "17px", color: "#30463b", marginBottom: "10px" }}>題目</div>
              <div style={{ padding: "12px", background: "#fff", border: "1px solid #dde1db", borderRadius: "14px" }}>
                <img
                  ref={exportQuestionImageRef}
                  src={image}
                  alt="題目"
                  style={{
                    display: "block",
                    width: "100%",
                    height: "auto",
                    maxHeight: "680px",
                    objectFit: "contain",
                    margin: "0 auto",
                  }}
                />
              </div>
            </div>

            <div style={{ background: "#e8ece8", border: "1px solid #c8d3ca", borderRadius: "14px", padding: "14px 18px", marginBottom: "14px" }}>
              <div style={{ fontWeight: 700, color: "#30463b" }}>正確答案</div>
              <div style={{ marginTop: "6px" }}><ScienceText text={solveData.answer} stripAnnotations /></div>
            </div>

            <div style={{ background: "#fff", border: "1px solid #dde1db", borderRadius: "14px", padding: "18px", marginBottom: "14px" }}>
              <div style={{ fontFamily: '"Source Han Serif TC", "Noto Serif TC", "Songti TC", "PMingLiU", serif', fontWeight: 700, fontSize: "18px", color: "#30463b", marginBottom: "8px" }}>觀念解析</div>
              <ScienceText text={solveData.explanation} stripAnnotations />
            </div>

            {solveData.options && (
              <div style={{ background: "#fff", border: "1px solid #eadbd8", borderRadius: "14px", padding: "18px" }}>
                <div style={{ fontFamily: '"Source Han Serif TC", "Noto Serif TC", "Songti TC", "PMingLiU", serif', fontWeight: 700, fontSize: "18px", color: "#8e5752", marginBottom: "8px" }}>選項分析</div>
                <ScienceText text={solveData.options} stripAnnotations />
              </div>
            )}

            <div style={{ marginTop: "24px", paddingTop: "14px", borderTop: "1px solid #dde1db", textAlign: "center", fontSize: "12px", color: "#959c97" }}>H.H. Science Lab 解題實驗室</div>
          </div>
        </div>
      )}

      {tutorialOpen && (
        <div
          className={`student-guided-tour-layer ${tutorialTargetRect ? "has-target" : "no-target"}`}
          role="presentation"
        >
          {tutorialTargetRect && (
            <div
              className="student-guided-tour-spotlight"
              aria-hidden="true"
              style={{
                top: tutorialTargetRect.top,
                left: tutorialTargetRect.left,
                width: tutorialTargetRect.width,
                height: tutorialTargetRect.height,
              }}
            />
          )}

          <section
            className="student-firstuse-card student-guided-tour-card"
            role="dialog"
            aria-modal="true"
            aria-label="解題實驗室使用教學"
            style={
              tutorialTargetRect
                ? {
                    width: tutorialCardWidth,
                    left: tutorialCardLeft,
                    top: tutorialCardAbove
                      ? undefined
                      : tutorialTargetRect.bottom + 14,
                    bottom: tutorialCardAbove
                      ? tutorialTargetRect.viewportHeight - tutorialTargetRect.top + 14
                      : undefined,
                  }
                : undefined
            }
          >
            <div className="student-firstuse-topbar">
              <div>
                <div className="hh-eyebrow">
                  {tutorialPhase === "setup"
                    ? "QUICK START · BASIC"
                    : tutorialPhase === "results"
                      ? `QUICK START · RESULTS · ${ONBOARDING_VERSION.toUpperCase()}`
                      : `QUICK START · ${ONBOARDING_VERSION.toUpperCase()}`}
                </div>
                <strong>跟著畫面完成導覽</strong>
              </div>
              <button
                type="button"
                className="student-firstuse-skip"
                onClick={skipTutorial}
              >
                略過
              </button>
            </div>

            <div
              className="student-firstuse-progress"
              aria-hidden="true"
              style={{ gridTemplateColumns: `repeat(${tutorialSequence.length}, minmax(0, 1fr))` }}
            >
              {tutorialSequence.map((stepIndex, index) => (
                <span
                  key={`${tutorialPhase}-${stepIndex}`}
                  className={index <= tutorialStep ? "active" : ""}
                />
              ))}
            </div>

            <div className="student-firstuse-body student-guided-tour-body">
              <div className="student-guided-tour-heading">
                <div className="student-firstuse-count hh-number">
                  {String(tutorialStep + 1).padStart(2, "0")}
                  <span>/ {String(tutorialSequence.length).padStart(2, "0")}</span>
                </div>
                <div className="hh-eyebrow">{activeTutorialStep.eyebrow}</div>
              </div>

              <div className="student-firstuse-copy">
                <h2 className="hh-display">{activeTutorialStep.title}</h2>
                <p>{activeTutorialStep.description}</p>
              </div>

            </div>

            <div className="student-firstuse-actions">
              <button
                type="button"
                className="hh-button-secondary"
                disabled={tutorialStep === 0 || tutorialAnimating}
                onClick={() => setTutorialStep((current) => Math.max(0, current - 1))}
              >
                上一步
              </button>

              {tutorialStep < tutorialSequence.length - 1 ? (
                <button
                  type="button"
                  className="hh-button-primary"
                  disabled={tutorialAnimating}
                  onClick={() => setTutorialStep((current) => Math.min(tutorialSequence.length - 1, current + 1))}
                >
                  下一步
                </button>
              ) : (
                <button
                  type="button"
                  className="hh-button-primary"
                  disabled={tutorialAnimating}
                  onClick={finishTutorial}
                >
                  {tutorialPhase === "setup" ? "開始自己試試看" : "完成導覽"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {firstActionNudge && !tutorialOpen && (
        <div className="student-first-action-nudge" role="status">
          <div className="student-first-action-nudge-icon">→</div>
          <div>
            <strong>{images.length ? "題目準備好了，現在換你試試看！" : "教學完成，現在上傳一題試試看！"}</strong>
            <p>{images.length ? "確認科目與題目內容後，按下「開始解題」完成你的第一題。" : "點上傳區拍照或從相簿選題目，系統會陪你完成第一次解題。"}</p>
          </div>
          <button type="button" onClick={() => {
            const target = document.querySelector(images.length ? '[data-tour="solve-button"]' : '[data-tour="upload-zone"]');
            if (target instanceof HTMLElement) target.scrollIntoView({ behavior: "smooth", block: "center" });
          }}>{images.length ? "前往解題" : "前往上傳"}</button>
          <button type="button" className="student-first-action-nudge-close" aria-label="關閉提示" onClick={() => setFirstActionNudge(false)}>×</button>
        </div>
      )}

      {installGuideOpen && (
        <div
          className="student-firstuse-backdrop"
          role="presentation"
          onClick={closeInstallGuide}
        >
          <section
            className="student-install-card"
            role="dialog"
            aria-modal="true"
            aria-label="加入主畫面教學"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="student-firstuse-topbar">
              <div>
                <div className="hh-eyebrow">ADD TO HOME SCREEN</div>
                <strong>把解題實驗室放到主畫面</strong>
              </div>
              <button
                type="button"
                className="student-firstuse-skip"
                onClick={closeInstallGuide}
              >
                ×
              </button>
            </div>

            <p className="student-install-intro">
              下次可以像 App 一樣直接從手機主畫面開啟。選擇你的手機查看步驟：
            </p>

            <div className="student-install-tabs" role="tablist" aria-label="選擇手機系統">
              <button
                type="button"
                className={installPlatform === "ios" ? "active" : ""}
                onClick={() => setInstallPlatform("ios")}
              >
                iPhone / iPad
              </button>
              <button
                type="button"
                className={installPlatform === "android" ? "active" : ""}
                onClick={() => setInstallPlatform("android")}
              >
                Android
              </button>
            </div>

            {installPlatform === "ios" ? (
              <div className="student-install-steps">
                <div>
                  <span className="student-install-step-number">1</span>
                  <p><strong>用 Safari 開啟解題實驗室</strong><small>iPhone / iPad 建議使用 Safari。</small></p>
                </div>
                <div>
                  <span className="student-install-step-number">2</span>
                  <p><strong>點下方「分享」按鈕</strong><small>圖示是方框上方有一個向上的箭頭。</small></p>
                </div>
                <div>
                  <span className="student-install-step-number">3</span>
                  <p><strong>選「加入主畫面」</strong><small>若沒看到，可在分享選單往下滑。</small></p>
                </div>
                <div>
                  <span className="student-install-step-number">4</span>
                  <p><strong>右上角按「加入」</strong><small>完成後主畫面就會出現 H.H. Science Lab。</small></p>
                </div>
              </div>
            ) : (
              <div className="student-install-steps">
                <div>
                  <span className="student-install-step-number">1</span>
                  <p><strong>用 Chrome 開啟解題實驗室</strong><small>確認網址已載入完成。</small></p>
                </div>
                <div>
                  <span className="student-install-step-number">2</span>
                  <p><strong>點右上角「⋮」</strong><small>開啟 Chrome 功能選單。</small></p>
                </div>
                <div>
                  <span className="student-install-step-number">3</span>
                  <p><strong>選「加入主畫面」或「安裝應用程式」</strong><small>不同 Android / Chrome 版本文字可能略有不同。</small></p>
                </div>
                <div>
                  <span className="student-install-step-number">4</span>
                  <p><strong>確認「安裝／新增」</strong><small>完成後就能從手機主畫面直接開啟。</small></p>
                </div>
              </div>
            )}

            <div className="student-install-note">
              這個提示只會自動出現一次；之後仍可從右上角 ☰ →「加入主畫面」重新查看。
            </div>

            <button
              type="button"
              className="hh-button-primary student-install-done"
              onClick={closeInstallGuide}
            >
              我知道了
            </button>
          </section>
        </div>
      )}

      {selectedAnnotation && (
        <div className="student-modal-backdrop" onClick={() => setSelectedAnnotation(null)}>
          <div className="student-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="student-modal-header">
              <div>
                <div className="hh-eyebrow">NUMBER NOTE</div>
                <h3 className="hh-display student-modal-title">{selectedAnnotation.display}</h3>
                <div className="student-modal-subtitle">這個數字代表什麼？</div>
              </div>
              <button type="button" onClick={() => setSelectedAnnotation(null)} className="student-modal-close">×</button>
            </div>

            <div className="student-modal-stack">
              <div className="student-modal-info student-modal-info-green">
                <div className="student-modal-info-label">{selectedAnnotation.label}</div>
                <ModalScienceText text={selectedAnnotation.meaning} />
              </div>
              <div className="student-modal-info student-modal-info-gold">
                <div className="student-modal-info-label">從哪裡來？</div>
                <ModalScienceText text={selectedAnnotation.source} />
              </div>
              <div className="student-modal-info student-modal-info-red">
                <div className="student-modal-info-label">為什麼要用？</div>
                <ModalScienceText text={selectedAnnotation.usage} />
              </div>
            </div>

            <button type="button" onClick={() => setSelectedAnnotation(null)} className="hh-button-primary student-modal-done">看懂了</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        .student-page {
          position: relative;
          overflow-x: hidden;
          --student-blue: var(--info);
          --student-blue-soft: var(--info-soft);
          --student-sage: var(--action);
          --student-sage-soft: var(--action-soft);
          --student-gold: #c7902f;
          --student-gold-soft: #f7e9c8;
          --student-terra: #b7634d;
          --student-terra-soft: #f4dfd8;
          --subject-blue: #5f82a8;
          --subject-blue-soft: #e7eef6;
          --subject-red: #a96060;
          --subject-red-soft: #f4e6e5;
          --subject-yellow: #b48d34;
          --subject-yellow-soft: #f7efcf;
          --subject-purple: #806f9b;
          --subject-purple-soft: #eee8f4;
          --quota-caution: #b28a32;
          --quota-caution-soft: #f6edcf;
          --quota-warning: #c5753d;
          --quota-warning-soft: #f7e4d7;
          --quota-danger: #b95f59;
          --quota-danger-soft: #f5dfdd;
        }
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-page {
          --student-gold: #e1b457;
          --student-gold-soft: #3b301c;
          --student-terra: #dc8b72;
          --student-terra-soft: #3d2821;
          --subject-blue: #8ca9c7;
          --subject-blue-soft: #243445;
          --subject-red: #d58c8a;
          --subject-red-soft: #422a2c;
          --subject-yellow: #ddbb65;
          --subject-yellow-soft: #3d341f;
          --subject-purple: #b2a1cc;
          --subject-purple-soft: #332d43;
          --quota-caution: #e0ba61;
          --quota-caution-soft: #3a311f;
          --quota-warning: #e39a62;
          --quota-warning-soft: #422d20;
          --quota-danger: #e08d87;
          --quota-danger-soft: #432726;
        }
        .student-top-glow { position: fixed; inset: 0 0 auto; height: 290px; pointer-events: none; background: radial-gradient(circle at 18% -12%, color-mix(in srgb, var(--student-blue) 11%, transparent), transparent 52%), radial-gradient(circle at 86% -18%, color-mix(in srgb, var(--student-gold) 10%, transparent), transparent 48%); z-index: 0; }
        .student-container { position: relative; z-index: 1; width: min(900px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 72px; }
        .student-brand-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
        .student-brand-title { margin: 5px 0 0; font-size: clamp(34px, 5vw, 54px); line-height: 1.12; color: var(--primary); }
        .student-brand-title-en,
        .student-brand-title-zh { display: block; }
        .student-brand-title-en { white-space: nowrap; }
        .student-brand-title-zh { margin-top: 2px; }
        .student-brand-slogan { margin: 10px 0 0; color: var(--text-secondary); font-size: 14px; letter-spacing: .02em; }
        .student-muted { color: var(--text-muted); font-size: 13px; }
        .student-loading-page { min-height: 100vh; display: grid; place-items: center; }
        .student-loading-card { text-align: center; }
        .student-loading-title { margin-top: 6px; color: var(--primary); font-size: 28px; }
        .student-welcome-card { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 13px 15px; margin-bottom: 16px; border: 1px solid var(--border); border-radius: 16px; background: color-mix(in srgb, var(--surface) 94%, var(--primary-soft)); box-shadow: var(--shadow-sm); }
        .student-welcome-main { display: flex; align-items: center; gap: 13px; }
        .student-avatar { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; background: var(--primary); color: var(--action-text); font-family: var(--font-serif), serif; font-weight: 700; font-size: 16px; }
        .student-welcome-label { color: var(--text-muted); font: 700 10px/1 var(--font-inter), sans-serif; letter-spacing: .13em; }
        .student-welcome-title { margin: 3px 0 1px; font-size: 18px; }
        .student-welcome-actions { display: flex; align-items: center; gap: 9px; }
        .student-usage-pill { display: inline-flex; align-items: baseline; gap: 4px; padding: 9px 12px; border-radius: 999px; font-weight: 800; font-size: 12px; border: 1px solid transparent; }
        .student-usage-pill-caution { background: var(--quota-caution-soft); color: var(--quota-caution); border-color: color-mix(in srgb, var(--quota-caution) 34%, transparent); }
        .student-usage-pill-warning { background: var(--quota-warning-soft); color: var(--quota-warning); border-color: color-mix(in srgb, var(--quota-warning) 38%, transparent); }
        .student-usage-pill-danger { background: var(--quota-danger-soft); color: var(--quota-danger); border-color: color-mix(in srgb, var(--quota-danger) 42%, transparent); }
        .student-switch-button { border-radius: 999px; padding: 9px 13px; font-size: 12px; }
        .student-login-card {
          padding: 22px;
          margin-bottom: 18px;
          border-radius: 20px;
          background:
            linear-gradient(
              145deg,
              color-mix(in srgb, var(--surface) 98%, transparent),
              color-mix(in srgb, var(--surface-soft) 88%, var(--surface))
            );
        }
        .student-login-intro {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 16px;
        }
        .student-feature-mark, .student-step-number {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 34px;
          height: 34px;
          border-radius: 11px;
          color: var(--action-text);
          font-size: 12px;
          font-weight: 800;
          box-shadow: none;
        }
        .student-feature-mark {
          background: linear-gradient(145deg, var(--action), var(--action-hover));
        }
        .student-step-number-sage { background: var(--primary); }
        .student-step-number-gold { background: var(--primary); color: var(--action-text); }
        .student-step-number-terra { background: var(--primary); }
        .student-login-title {
          margin: 3px 0 0;
          font-size: clamp(25px, 3vw, 30px);
          line-height: 1.08;
        }
        .student-login-form {
          display: grid;
          gap: 13px;
        }
        .student-login-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .student-login-row-identity {
          gap: 10px;
        }
        .student-region-segment {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .student-region-button {
          position: relative;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: 13px;
          background: color-mix(in srgb, var(--surface-soft) 94%, var(--primary) 6%);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 780;
          cursor: pointer;
          transition:
            transform 130ms ease,
            border-color 130ms ease,
            background 130ms ease,
            color 130ms ease,
            box-shadow 130ms ease;
        }
        .student-region-button:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--action) 50%, var(--border));
        }
        .student-region-button:disabled {
          cursor: default;
          opacity: .55;
        }
        .student-region-button.is-active {
          border-color: transparent;
          background: linear-gradient(135deg, var(--action), var(--action-hover));
          color: var(--action-text);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.12),
            0 8px 18px color-mix(in srgb, var(--action) 18%, transparent);
        }
        .student-region-dot {
          width: 6px;
          height: 6px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: currentColor;
          opacity: .8;
        }
        .student-form-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        .student-field {
          display: grid;
          gap: 6px;
        }
        .student-field > span {
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 760;
        }
        .student-field em {
          font-style: normal;
          color: var(--text-muted);
          font-weight: 500;
        }
        .student-select-wrap {
          position: relative;
        }
        .student-select {
          appearance: none;
          -webkit-appearance: none;
          padding-right: 40px !important;
          background: var(--surface) !important;
          background-image: none !important;
          box-shadow: none !important;
        }
        .student-select:hover {
          border-color: color-mix(in srgb, var(--action) 50%, var(--border-strong));
        }
        .student-select:focus {
          border-color: var(--action) !important;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--action) 15%, transparent) !important;
        }
        .student-select option {
          background: var(--surface);
          color: var(--text);
        }
        .student-select-arrow {
          position: absolute;
          right: 13px;
          top: 50%;
          transform: translateY(-56%);
          pointer-events: none;
          color: var(--text-secondary);
          font-size: 15px;
          font-weight: 700;
        }
        .student-login-card .hh-input,
        .student-login-card .hh-select {
          min-height: 46px;
          border-radius: 13px;
          padding-top: 10px;
          padding-bottom: 10px;
        }
        .student-login-button {
          width: 100%;
          min-height: 48px;
          margin-top: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          border-radius: 14px;
        }
        .student-login-button-arrow {
          font-size: 17px;
          line-height: 1;
          transition: transform 140ms ease;
        }
        .student-login-button:hover .student-login-button-arrow {
          transform: translateX(3px);
        }

        .student-pin-setup-card {
          position: relative;
          overflow: hidden;
          padding: 26px;
          margin-bottom: 18px;
        }

        .student-pin-setup-card::before {
          content: "";
          position: absolute;
          width: 220px;
          height: 220px;
          right: -90px;
          top: -110px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(180, 146, 70, 0.12), transparent 68%);
          pointer-events: none;
        }

        .student-pin-setup-mark {
          display: inline-flex;
          align-items: center;
          min-height: 26px;
          padding: 0 10px;
          margin-bottom: 14px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--action) 9%, var(--surface));
          color: var(--action);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .14em;
        }

        .student-pin-setup-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
        }

        .student-pin-setup-title {
          margin: 4px 0 5px;
          font-size: 25px;
        }

        .student-pin-setup-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .student-pin-setup-note {
          margin-top: 12px;
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.65;
        }

        .student-pin-setup-button {
          width: 100%;
          min-height: 48px;
          margin-top: 16px;
        }
        .student-workspace { display: block; }
        .student-panel { padding: 24px 26px; margin-bottom: 14px; transition: opacity 160ms ease; }
        .student-panel-upload { background: var(--surface); }
        .student-panel-info { background: var(--surface); }
        .student-result-panel { background: var(--surface); }
        .student-panel-disabled { pointer-events: none; opacity: .42; filter: saturate(.65); }
        .student-step-header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
        .student-step-title { margin: 0; font-size: 22px; }
        .student-step-description { margin: 3px 0 0; color: var(--text-muted); font-size: 12px; }
        .student-upload-zone { min-height: 158px; padding: 18px 14px; border: 1px dashed var(--border-strong); border-radius: 16px; background: var(--surface-soft); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; cursor: pointer; transition: border-color 140ms ease, background-color 140ms ease; }
        .student-upload-zone:hover { border-color: var(--student-sage); background: color-mix(in srgb, var(--student-sage-soft) 46%, var(--surface)); }
        .student-upload-icon { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: var(--student-sage-soft); color: var(--student-sage); font-size: 21px; }
        .student-upload-mainline {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .student-upload-title { margin-top: 0; font-weight: 750; }
        .student-upload-short-note {
          margin-top: 7px;
          white-space: nowrap;
        }
        .student-upload-cta { margin-top: 10px; padding: 7px 11px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border-strong); color: var(--text-secondary); font-size: 11px; font-weight: 750; }
        .student-image-frame { padding: 10px; background: var(--surface-soft); border: 1px solid var(--border); border-radius: 18px; }
        .student-question-image { display: block; max-width: 100%; max-height: 470px; margin: 0 auto; border-radius: 12px; }
        .student-image-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-top: 10px; }
        .student-file-replace { min-height: 44px; display: grid; place-items: center; border-radius: 12px; background: var(--student-gold-soft); color: var(--student-gold); border: 1px solid color-mix(in srgb, var(--student-gold) 22%, var(--border)); font-size: 13px; font-weight: 750; cursor: pointer; }
        .student-crop-frame { overflow: hidden; border-radius: 14px; border: 1px solid var(--border); }
        .student-two-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 11px; }
        .student-note-field { margin-top: 10px; }
        .student-note-textarea {
          min-height: 44px;
          max-height: 120px;
          padding-top: 10px;
          padding-bottom: 10px;
          line-height: 1.45;
          resize: vertical;
        }
        .student-quota-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 16px; padding: 12px 14px; border-radius: 13px; background: var(--surface-soft); border: 1px solid var(--border); }
        .student-quota-label { font-size: 12px; font-weight: 750; }
        .student-remaining { padding: 7px 11px; border-radius: 999px; font-size: 12px; font-weight: 820; border: 1px solid transparent; }
        .student-remaining-caution { background: var(--quota-caution-soft); color: var(--quota-caution); border-color: color-mix(in srgb, var(--quota-caution) 34%, transparent); }
        .student-remaining-warning { background: var(--quota-warning-soft); color: var(--quota-warning); border-color: color-mix(in srgb, var(--quota-warning) 40%, transparent); }
        .student-remaining-danger { background: var(--quota-danger-soft); color: var(--quota-danger); border-color: color-mix(in srgb, var(--quota-danger) 45%, transparent); }
        .student-alert { margin-top: 12px; padding: 11px 13px; border-radius: 12px; font-size: 13px; }
        .student-alert-danger { background: var(--danger-soft); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 22%, transparent); }
        .student-solve-actions { margin-top: 15px; }
        .student-solve-button {
          min-height: 48px;
          background: linear-gradient(135deg, var(--action), var(--action-hover));
          color: var(--action-text);
          box-shadow: 0 8px 20px color-mix(in srgb, var(--action) 18%, transparent);
        }
        .student-result-panel { scroll-margin-top: 20px; margin-top: 2px; }
        .student-result-empty { min-height: 190px; display: grid; place-items: center; align-content: center; gap: 4px; border: 1px dashed var(--border-strong); border-radius: 16px; color: var(--text-secondary); text-align: center; }
        .student-empty-symbol { font: 700 30px/1 var(--font-serif), serif; color: var(--text-muted); margin-bottom: 5px; }
        .student-solving-card { display: flex; align-items: center; justify-content: center; gap: 16px; min-height: 150px; border-radius: 16px; background: var(--student-gold-soft); border: 1px solid color-mix(in srgb, var(--student-gold) 24%, transparent); }
        .student-solving-title { color: var(--student-gold); font-weight: 800; }
        .student-solving-orbit { width: 42px; height: 42px; border: 2px solid color-mix(in srgb, var(--student-gold) 30%, transparent); border-top-color: var(--student-gold); border-radius: 50%; animation: studentSpin 900ms linear infinite; }
        .student-solving-orbit span { display: none; }
        @keyframes studentSpin { to { transform: rotate(360deg); } }
        .student-result-stack { display: grid; gap: 12px; }
        .student-answer-card { padding: 17px 18px; border-radius: 17px; background: linear-gradient(135deg, var(--success-soft), var(--surface)); border: 1px solid color-mix(in srgb, var(--success) 25%, var(--border)); }
        .student-result-label { font: 700 10px/1 var(--font-inter), sans-serif; letter-spacing: .13em; color: var(--success); }
        .student-answer-row { display: flex; align-items: center; gap: 11px; margin-top: 8px; }
        .student-answer-check { width: 30px; height: 30px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 10px; background: var(--success); color: white; font-weight: 900; }
        .student-answer-text { font-size: 18px; font-weight: 750; }
        .student-explanation-card, .student-options-card { overflow: hidden; border-radius: 17px; background: var(--surface); border: 1px solid var(--border); }
        .student-result-card-header { display: flex; align-items: center; gap: 11px; padding: 14px 16px; background: var(--surface-soft); border-bottom: 1px solid var(--border); }
        .student-result-card-header h3 { margin: 2px 0 0; font-size: 18px; }
        .student-result-index { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 10px; font: 800 11px/1 var(--font-inter), sans-serif; }
        .student-result-index-gold { background: var(--student-gold-soft); color: var(--student-gold); }
        .student-result-index-red { background: var(--student-terra-soft); color: var(--student-terra); }
        .student-result-content { padding: 17px; color: var(--text); font-size: 15px; }
        .student-result-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .student-line-button, .student-save-button { min-height: 48px; border: 0; border-radius: 12px; font-weight: 750; cursor: pointer; }
        .student-line-button { background: var(--student-terra); color: white; }
        .student-save-button { background: var(--student-gold-soft); color: var(--student-gold); border: 1px solid color-mix(in srgb, var(--student-gold) 25%, transparent); }
        .student-save-button:disabled { opacity: .55; }
        .student-save-hint { margin-top: -2px; padding: 10px 12px; border-radius: 11px; background: var(--student-gold-soft); color: var(--student-gold); border: 1px solid color-mix(in srgb, var(--student-gold) 22%, transparent); font-size: 11px; line-height: 1.6; text-align: center; }
        .student-science-text { display: grid; gap: 3px; }
        .student-science-text p { margin: 0; line-height: 1.82; }
        .student-text-gap { height: 3px; }
        .student-display-formula { max-width: 100%; overflow-x: auto; overflow-y: hidden; padding: 7px 2px; }
        .student-inline-formula [data-annotation], .student-display-formula [data-annotation] { cursor: pointer; border-radius: 5px; padding: 1px 3px; background: var(--primary-soft); box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--primary) 30%, transparent); }
        .student-footer { display: flex; justify-content: space-between; gap: 20px; margin-top: 24px; padding: 18px 2px 0; color: var(--text-muted); font-size: 11px; border-top: 1px solid var(--border); }
        .student-modal-backdrop { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(9, 13, 10, .48); backdrop-filter: blur(8px); }
        .student-modal-card { width: min(500px, 100%); padding: 22px; border-radius: 22px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-lg); }
        .student-modal-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .student-modal-title { margin: 5px 0 0; font-size: 30px; color: var(--primary); }
        .student-modal-subtitle { color: var(--text-secondary); font-size: 12px; margin-top: 2px; }
        .student-modal-close { width: 38px; height: 38px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-soft); color: var(--text-secondary); font-size: 22px; cursor: pointer; }
        .student-modal-stack { display: grid; gap: 9px; margin-top: 18px; }
        .student-modal-info { padding: 13px 14px; border-radius: 14px; border: 1px solid var(--border); }
        .student-modal-info-green { background: var(--success-soft); color: var(--text); }
        .student-modal-info-gold { background: var(--student-gold-soft); color: var(--text); }
        .student-modal-info-red { background: var(--student-terra-soft); color: var(--text); }
        .student-modal-info-label { font-size: 11px; font-weight: 800; margin-bottom: 5px; }
        .student-modal-science { display: grid; gap: 2px; font-size: 13px; line-height: 1.65; }
        .student-modal-science p { margin: 0; }
        .student-modal-formula { overflow-x: auto; }
        .student-modal-done { width: 100%; margin-top: 16px; }

        @media (max-width: 820px) {
          .student-subject-picker { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .student-container { width: min(100% - 24px, 900px); padding-top: 28px; }
          .student-brand-title { font-size: 38px; }
          .student-workspace { display: block; }
          .student-pin-setup-grid { grid-template-columns: 1fr; }
          .student-welcome-card { align-items: center; flex-direction: row; }
          .student-welcome-actions { width: auto; justify-content: flex-end; }
        }

        @media (max-width: 600px) {
          .student-subject-picker { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .student-container { width: min(100% - 20px, 900px); padding-top: 22px; padding-bottom: 48px; }
          .student-brand-header { align-items: flex-start; margin-bottom: 20px; }
          .student-brand-title { font-size: 31px; }
          .student-brand-slogan { font-size: 11px; white-space: nowrap; }
          .student-login-card { padding: 16px; border-radius: 17px; }
          .student-panel { padding: 18px; border-radius: 17px; }
          .student-login-intro { margin-bottom: 14px; }
          .student-login-row-identity { grid-template-columns: 1fr; }
          .student-region-segment { gap: 6px; }
          .student-region-button { min-height: 42px; padding-inline: 7px; font-size: 11px; }
          .student-form-grid, .student-two-actions, .student-result-actions { grid-template-columns: 1fr; }
          .student-image-actions { grid-template-columns: 1fr 1fr; }
          .student-image-actions .student-file-replace { grid-column: 1 / -1; }
          .student-step-title {
            font-size: 16px;
            line-height: 1.25;
          }

          .student-subject-option {
            min-height: 44px;
            padding: 6px 3px;
            font-size: 11px;
            letter-spacing: -0.015em;
          }
          .student-quota-row { align-items: flex-start; }
          .student-footer { flex-direction: column; gap: 8px; }
          .student-modal-backdrop { align-items: flex-end; padding: 0; }
          .student-modal-card { border-radius: 22px 22px 0 0; padding-bottom: max(22px, env(safe-area-inset-bottom)); }
        }

        @media (max-width: 360px) {
          .student-login-row-org {
            grid-template-columns: 1fr;
          }
        }

        /* JinXuan-style typography: titles first try licensed local/webfont, then stable TC fallbacks */
        .student-page .hh-display,
        .student-loading-page .hh-display,
        .student-modal .hh-display {
          font-family: var(--font-serif), "Source Han Serif TC", "Noto Serif TC", "Songti TC", "PMingLiU", serif;
          font-weight: 600;
          letter-spacing: 0.012em;
        }

        .student-brand-title {
          font-weight: 600;
          letter-spacing: 0.015em;
        }

        .student-step-title,
        .student-login-title,
        .student-welcome-title {
          font-weight: 600;
        }

      
        /* Source Han Serif / 思源宋體 title system */
        .student-page .hh-display,
        .student-loading-page .hh-display,
        .student-modal .hh-display {
          font-family: var(--font-serif), "Source Han Serif TC", "Noto Serif TC", "Songti TC", "PMingLiU", serif;
          font-weight: 650;
          letter-spacing: -0.018em;
        }


        /* =======================================================
           FRONTEND POLISH — SOFT GLOW + LIGHT GRADIENT ACCENTS
           ======================================================= */

        .student-page {
          background:
            radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--student-blue) 7%, transparent), transparent 28rem),
            radial-gradient(circle at 90% 2%, color-mix(in srgb, var(--student-gold) 6%, transparent), transparent 26rem),
            var(--bg);
        }

        .student-card,
        .student-welcome-card,
        .student-login-card,
        .student-result-card,
        .student-upload-panel,
        .student-settings-panel {
          background:
            linear-gradient(
              145deg,
              color-mix(in srgb, var(--surface) 97%, var(--primary) 3%),
              var(--surface)
            );
        }

        .student-step-card {
          background:
            linear-gradient(
              145deg,
              color-mix(in srgb, var(--surface) 97%, var(--primary) 3%),
              var(--surface)
            );
        }

        .student-upload-zone {
          background:
            radial-gradient(circle at 50% 5%, color-mix(in srgb, var(--student-blue) 6%, transparent), transparent 34%),
            linear-gradient(
              145deg,
              color-mix(in srgb, var(--surface-soft) 96%, var(--student-blue) 4%),
              var(--surface-soft)
            );
        }

        .student-solve-button,
        .student-primary-action {
          background: linear-gradient(135deg, var(--action) 0%, var(--action-hover) 100%);
          color: var(--action-text);
          border-color: transparent;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.10),
            0 10px 24px color-mix(in srgb, var(--action) 17%, transparent);
        }

        .student-solve-button:hover,
        .student-primary-action:hover {
          transform: translateY(-1px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.12),
            0 14px 30px color-mix(in srgb, var(--action) 23%, transparent);
        }

        .student-subject-button,
        .student-subject-option {
          position: relative;
          overflow: hidden;
          transition:
            transform .16s ease,
            border-color .16s ease,
            box-shadow .16s ease,
            background .16s ease;
        }

        .student-subject-button::after,
        .student-subject-option::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.22), transparent 45%);
          transition: opacity .16s ease;
        }

        .student-subject-button:hover::after,
        .student-subject-option:hover::after {
          opacity: .55;
        }

        .student-subject-button.is-selected,
        .student-subject-option.is-selected,
        .student-subject-button.active,
        .student-subject-option.active {
          transform: translateY(-1px);
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-page {
          background:
            radial-gradient(circle at 12% -4%, color-mix(in srgb, var(--primary) 11%, transparent), transparent 30rem),
            radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 27rem),
            var(--bg);
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-step-card,
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-welcome-card,
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-login-card,
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-result-card,
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-card {
          background:
            linear-gradient(
              145deg,
              color-mix(in srgb, var(--surface) 96%, var(--primary) 4%),
              var(--surface)
            );
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.025),
            0 16px 34px rgba(0,0,0,.12);
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-upload-zone {
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 36%),
            linear-gradient(
              145deg,
              color-mix(in srgb, var(--surface-soft) 95%, var(--primary) 5%),
              var(--surface-soft)
            );
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-physics.is-selected,
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-physics.active {
          box-shadow:
            0 0 0 1px rgba(140,169,199,.22),
            0 0 24px rgba(120,162,201,.18);
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-chemistry.is-selected,
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-chemistry.active {
          box-shadow:
            0 0 0 1px rgba(213,140,138,.22),
            0 0 24px rgba(196,117,114,.18);
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-biology.is-selected,
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-biology.active {
          box-shadow:
            0 0 0 1px rgba(221,187,101,.24),
            0 0 24px rgba(214,179,86,.18);
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-earth.is-selected,
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-earth.active {
          box-shadow:
            0 0 0 1px rgba(178,161,204,.22),
            0 0 24px rgba(158,139,192,.18);
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-usage-pill,
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-quota-badge {
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.04),
            0 0 18px rgba(219, 178, 89, .09);
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-annotation-trigger,
        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .annotation-number {
          text-shadow: 0 0 10px rgba(224, 186, 97, .14);
        }

        @media (prefers-reduced-motion: reduce) {
          .student-subject-button,
          .student-subject-option,
          .student-solve-button,
          .student-primary-action {
            transition: none;
          }
        }


        .student-app-header {
          position: sticky;
          top: 10px;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          min-height: 64px;
          margin-bottom: 22px;
          padding: 9px 12px 9px 18px;
          border: 1px solid var(--border);
          border-radius: 20px;
          background: color-mix(in srgb, var(--surface) 90%, transparent);
          box-shadow: 0 12px 32px rgba(25, 36, 30, .08);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .student-app-brand {
          display: grid;
          gap: 1px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--text);
          text-align: left;
          cursor: pointer;
        }

        .student-app-brand-en {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 760;
          letter-spacing: -.015em;
        }

        .student-app-brand-zh {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .08em;
        }

        .student-app-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .student-header-theme {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .student-menu-button {
          display: inline-grid;
          place-content: center;
          gap: 4px;
          width: 42px;
          height: 42px;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 13px;
          background: var(--surface);
          cursor: pointer;
        }

        .student-menu-button span {
          display: block;
          width: 17px;
          height: 1.5px;
          border-radius: 99px;
          background: var(--text);
        }

        .student-menu-backdrop {
          position: fixed;
          inset: 0;
          z-index: 101;
          border: 0;
          background: rgba(12, 17, 14, .18);
          backdrop-filter: blur(2px);
        }

        .student-menu-panel {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 102;
          width: min(300px, calc(100vw - 24px));
          padding: 10px;
          border: 1px solid var(--border);
          border-radius: 18px;
          background: var(--surface);
          box-shadow: 0 24px 60px rgba(19, 29, 23, .18);
        }

        .student-menu-panel > button {
          width: 100%;
          min-height: 43px;
          padding: 0 12px;
          border: 0;
          border-radius: 11px;
          background: transparent;
          color: var(--text);
          text-align: left;
          font-weight: 760;
          cursor: pointer;
        }

        .student-menu-panel > button:hover,
        .student-menu-panel > button.active {
          background: color-mix(in srgb, var(--primary) 9%, var(--surface));
          color: var(--primary);
        }

        .student-menu-panel > button.student-menu-logout {
          color: #9d493f;
        }

        .student-menu-separator {
          height: 1px;
          margin: 7px 4px;
          background: var(--border);
        }

        .student-menu-account {
          display: grid;
          gap: 2px;
          padding: 9px 12px;
        }

        .student-menu-account strong {
          font-size: 12px;
        }

        .student-menu-account span {
          color: var(--text-muted);
          font-size: 11px;
        }

        .student-firstuse-backdrop {
          position: fixed;
          inset: 0;
          z-index: 320;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(12, 17, 14, .54);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .student-firstuse-card,
        .student-install-card {
          width: min(560px, 100%);
          max-height: min(760px, calc(100dvh - 36px));
          overflow: auto;
          border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
          border-radius: 26px;
          background:
            radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--action) 10%, transparent), transparent 34%),
            var(--surface);
          box-shadow: 0 34px 100px rgba(9, 14, 11, .32);
          overscroll-behavior: contain;
          pointer-events: auto;
          animation: studentTourCardIn .34s cubic-bezier(.2,.8,.2,1) both;
        }

        .student-firstuse-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 20px 22px 14px;
          border-bottom: 1px solid var(--border);
        }

        .student-firstuse-topbar strong {
          display: block;
          margin-top: 3px;
          color: var(--text);
          font-size: 15px;
        }

        .student-firstuse-skip {
          flex: 0 0 auto;
          min-width: 44px;
          min-height: 38px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface-soft);
          color: var(--text-secondary);
          font-weight: 760;
          cursor: pointer;
        }

        .student-firstuse-progress {
          display: grid;
          grid-template-columns: repeat(9, minmax(0, 1fr));
          gap: 5px;
          padding: 14px 22px 0;
        }

        .student-firstuse-progress span {
          height: 3px;
          border-radius: 99px;
          background: var(--border);
          transition: background .18s ease, transform .18s ease;
        }

        .student-firstuse-progress span.active {
          background: var(--action);
          transform: scaleY(1.25);
        }

        .student-firstuse-body {
          padding: 24px 22px 20px;
        }

        .student-firstuse-count {
          display: flex;
          align-items: baseline;
          gap: 4px;
          margin-bottom: 14px;
          color: var(--action);
          font-size: 31px;
          font-weight: 820;
          letter-spacing: -.04em;
        }

        .student-firstuse-count span {
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 760;
          letter-spacing: 0;
        }

        .student-firstuse-copy h2 {
          margin: 5px 0 9px;
          color: var(--text);
          font-size: clamp(24px, 5vw, 33px);
          line-height: 1.15;
        }

        .student-firstuse-copy > p,
        .student-install-intro {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.75;
        }

        .student-firstuse-preview {
          margin: 20px 0 14px;
          padding: 15px;
          border: 1px solid color-mix(in srgb, var(--action) 24%, var(--border));
          border-radius: 18px;
          background: color-mix(in srgb, var(--action) 5%, var(--surface-soft));
        }

        .student-firstuse-preview-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .student-firstuse-preview-head span {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .08em;
        }

        .student-firstuse-preview-head strong {
          color: var(--action);
          font-size: 13px;
        }

        .student-firstuse-preview-line {
          width: 74%;
          height: 7px;
          margin-top: 8px;
          border-radius: 99px;
          background: color-mix(in srgb, var(--text) 9%, transparent);
        }

        .student-firstuse-preview-line.wide {
          width: 100%;
          height: 42px;
          margin-top: 0;
          border-radius: 12px;
          background:
            linear-gradient(135deg,
              color-mix(in srgb, var(--action) 13%, var(--surface)) 0 52%,
              color-mix(in srgb, var(--action) 5%, var(--surface)) 52% 100%);
        }

        .student-firstuse-preview-line.short {
          width: 47%;
        }

        .student-firstuse-tips {
          display: grid;
          gap: 8px;
        }

        .student-firstuse-tips > div {
          display: grid;
          grid-template-columns: 24px minmax(0, 1fr);
          gap: 8px;
          align-items: start;
          padding: 9px 11px;
          border-radius: 12px;
          background: var(--surface-soft);
        }

        .student-firstuse-tips span {
          display: grid;
          place-items: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--success-soft);
          color: var(--success);
          font-size: 11px;
          font-weight: 900;
        }

        .student-firstuse-tips p {
          margin: 1px 0 0;
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.55;
        }

        .student-firstuse-actions {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          gap: 10px;
          padding: 0 22px 22px;
        }

        .student-firstuse-actions > button {
          min-height: 46px;
        }

        .student-install-card {
          width: min(520px, 100%);
          padding-bottom: 22px;
        }

        .student-install-intro {
          padding: 20px 22px 0;
        }

        .student-install-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          margin: 18px 22px;
          padding: 5px;
          border: 1px solid var(--border);
          border-radius: 15px;
          background: var(--surface-soft);
        }

        .student-install-tabs button {
          min-height: 40px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: var(--text-secondary);
          font-weight: 800;
          cursor: pointer;
        }

        .student-install-tabs button.active {
          background: var(--surface);
          color: var(--action);
          box-shadow: var(--shadow-sm);
        }

        .student-install-steps {
          display: grid;
          gap: 9px;
          padding: 0 22px;
        }

        .student-install-steps > div {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr);
          gap: 11px;
          align-items: start;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 14px;
          background: color-mix(in srgb, var(--surface-soft) 78%, transparent);
        }

        .student-install-step-number {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: 11px;
          background: var(--action-soft);
          color: var(--action);
          font-size: 13px;
          font-weight: 900;
        }

        .student-install-steps p {
          display: grid;
          gap: 3px;
          margin: 0;
        }

        .student-install-steps strong {
          color: var(--text);
          font-size: 13px;
        }

        .student-install-steps small {
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.5;
        }

        .student-install-note {
          margin: 16px 22px;
          padding: 11px 13px;
          border-radius: 12px;
          background: var(--info-soft);
          color: var(--text-secondary);
          font-size: 11px;
          line-height: 1.55;
        }

        .student-install-done {
          width: calc(100% - 44px);
          min-height: 46px;
          margin: 0 22px;
        }

        .student-brand-intro {
          margin: 0 4px 22px;
        }

        .student-brand-intro h1 {
          margin: 5px 0 4px;
          font-size: clamp(25px, 4vw, 38px);
        }

        .student-brand-intro p {
          margin: 0;
          color: var(--text-muted);
          font-size: 13px;
          letter-spacing: .02em;
        }

        .student-add-more-images {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          min-height: 58px;
          margin-top: 9px;
          padding: 8px 10px;
          border: 1px dashed var(--border-strong);
          border-radius: 13px;
          background: var(--surface-soft);
          cursor: pointer;
          transition: border-color 140ms ease, background-color 140ms ease;
        }

        .student-add-more-images:hover {
          border-color: var(--student-sage);
          background: color-mix(in srgb, var(--student-sage-soft) 42%, var(--surface));
        }

        .student-add-more-plus {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: var(--student-sage-soft);
          color: var(--student-sage);
          font-size: 19px;
          font-weight: 800;
        }

        .student-add-more-images > span:nth-child(2) {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        .student-add-more-images strong {
          font-size: 12px;
        }

        .student-add-more-images small {
          color: var(--text-muted);
          font-size: 10px;
        }

        .student-add-more-action {
          padding: 6px 9px;
          border: 1px solid var(--border-strong);
          border-radius: 999px;
          background: var(--surface);
          color: var(--text-secondary);
          font-size: 10px;
          font-weight: 800;
        }

        .student-image-list {
          display: grid;
          gap: 8px;
          margin-top: 2px;
        }

        .student-image-card {
          display: grid;
          grid-template-columns: 38px 82px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border: 1px solid var(--border);
          border-radius: 13px;
          background: color-mix(in srgb, var(--surface) 96%, var(--primary) 4%);
        }

        .student-image-order {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: 11px;
          background: color-mix(in srgb, var(--primary) 10%, var(--surface));
          color: var(--primary);
          font-size: 11px;
          font-weight: 900;
        }

        .student-image-card-preview {
          overflow: hidden;
          height: 58px;
          border-radius: 10px;
          background: var(--surface-soft);
        }

        .student-image-card-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .student-image-card-info {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        .student-image-card-info strong {
          font-size: 13px;
        }

        .student-image-card-info span {
          overflow: hidden;
          color: var(--text-muted);
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .student-image-card-actions {
          display: flex;
          gap: 7px;
        }

        .student-image-card-actions .hh-button-secondary {
          min-height: 36px;
          padding: 0 11px;
        }

        .student-image-delete {
          min-height: 36px;
          padding: 0 10px;
          border: 1px solid color-mix(in srgb, #a9584e 34%, var(--border));
          border-radius: 10px;
          background: transparent;
          color: #a9584e;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
        }

        .student-image-editor {
          margin-top: 16px;
          padding: 16px;
          border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
          border-radius: 18px;
          background: color-mix(in srgb, var(--primary) 5%, var(--surface));
        }

        .student-image-editor-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 12px;
        }

        .student-image-editor-head h3 {
          margin: 4px 0 0;
          font-size: 18px;
        }

        .student-editor-tip,
        .student-upload-limit-note {
          margin-top: 10px;
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.6;
        }

        .student-history-placeholder {
          display: grid;
          place-items: center;
          min-height: 440px;
          padding: 40px 24px;
          text-align: center;
        }

        .student-history-placeholder h2 {
          margin: 6px 0 8px;
          font-size: 28px;
        }

        .student-history-placeholder p {
          max-width: 560px;
          margin: 0 0 20px;
          color: var(--text-muted);
          line-height: 1.75;
        }

        .student-history-symbol {
          display: grid;
          place-items: center;
          width: 58px;
          height: 58px;
          margin-bottom: 14px;
          border-radius: 18px;
          background: color-mix(in srgb, var(--primary) 9%, var(--surface));
          color: var(--primary);
          font-size: 28px;
        }

        @media (max-width: 720px) {
          .student-container {
            padding-top: calc(max(6px, env(safe-area-inset-top)) + 66px);
          }

          .student-app-header {
            position: fixed;
            top: max(6px, env(safe-area-inset-top));
            left: 12px;
            right: 12px;
            z-index: 100;
            width: auto;
            min-height: 50px;
            margin-bottom: 0;
            padding: 5px 7px 5px 12px;
            border-radius: 16px;
          }

          .student-app-brand-en {
            font-size: 15px;
          }

          .student-app-brand-zh {
            font-size: 10px;
          }

          .student-app-header-actions {
            gap: 6px;
          }

          .student-header-theme {
            flex: 0 0 auto;
          }

          .student-menu-button {
            flex: 0 0 auto;
            width: 38px;
            height: 38px;
            border-radius: 12px;
          }

          .student-brand-intro {
            margin-left: 1px;
            margin-right: 1px;
          }

          .student-welcome-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            min-height: 68px;
            padding: 9px 11px;
            margin-bottom: 12px;
            border-radius: 14px;
          }

          .student-welcome-main {
            min-width: 0;
            gap: 9px;
          }

          .student-avatar {
            flex: 0 0 auto;
            width: 34px;
            height: 34px;
            border-radius: 10px;
            font-size: 14px;
          }

          .student-welcome-label {
            display: none;
          }

          .student-welcome-title {
            overflow: hidden;
            margin: 0 0 2px;
            font-size: 16px;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .student-welcome-main .student-muted {
            overflow: hidden;
            max-width: 54vw;
            font-size: 10px;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .student-welcome-actions {
            flex: 0 0 auto;
            width: auto;
            margin-left: auto;
          }

          .student-usage-pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: auto;
            min-width: 86px;
            min-height: 34px;
            padding: 0 11px;
            gap: 4px;
            border-radius: 999px;
            font-size: 10px;
            line-height: 1;
            white-space: nowrap;
          }

          .student-usage-pill .hh-number {
            font-size: 15px;
            line-height: 1;
          }

          .student-panel-upload {
            padding-top: 15px;
            padding-bottom: 15px;
          }

          .student-upload-zone {
            min-height: 86px;
            padding: 14px 12px;
            border-radius: 14px;
          }

          .student-upload-mainline {
            gap: 8px;
          }

          .student-upload-icon {
            width: 32px;
            height: 32px;
            border-radius: 10px;
            font-size: 18px;
          }

          .student-upload-title {
            font-size: 14px;
          }

          .student-upload-short-note {
            margin-top: 5px;
            max-width: 100%;
            overflow: hidden;
            font-size: 10px;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .student-subject-picker {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
          }

          .student-subject-option {
            min-height: 44px;
            gap: 4px;
            padding: 7px 4px;
            border-radius: 10px;
            font-size: 11px;
          }

          .student-subject-dot {
            width: 6px;
            height: 6px;
          }

          .student-subject-check {
            display: none;
          }

          .student-subject-option-selected .student-subject-dot {
            width: 8px;
            height: 8px;
            box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 14%, transparent);
          }

          .student-brand-intro h1 {
            font-size: 25px;
          }

          .student-result-section-head h3,
          .student-history-analysis-block .student-result-section-head h3 {
            font-size: 16px;
            line-height: 1.25;
          }

          .student-image-card {
            grid-template-columns: 36px 76px minmax(0, 1fr);
          }

          .student-image-card-actions {
            grid-column: 2 / -1;
          }

          .student-image-card-actions > * {
            flex: 1;
          }

          .student-add-more-images {
            grid-template-columns: 32px minmax(0, 1fr) auto;
            min-height: 54px;
            padding: 7px 9px;
          }

          .student-add-more-action {
            padding: 5px 8px;
          }

          .student-image-editor-head {
            align-items: stretch;
            flex-direction: column;
          }

          .student-crop-frame .cropper-container {
            max-height: 360px;
          }
        }


        .student-history-shell {
          display: grid;
          gap: 16px;
        }

        .student-history-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
          padding: 4px 3px 2px;
        }

        .student-history-header h2 {
          margin: 5px 0 5px;
          font-size: clamp(27px, 4vw, 38px);
        }

        .student-history-header p {
          margin: 0;
          color: var(--text-muted);
          font-size: 13px;
        }

        .student-history-filters {
          padding: 18px;
        }

        .student-history-filters label {
          display: grid;
          gap: 7px;
        }

        .student-history-filters label > span {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 800;
        }

        .student-history-search {
          margin-bottom: 12px;
        }

        .student-history-filter-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr .9fr;
          gap: 10px;
        }

        .student-history-favorite-filter button {
          min-height: 44px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          color: var(--text-muted);
          font-weight: 800;
          cursor: pointer;
        }

        .student-history-favorite-filter button.active {
          border-color: color-mix(in srgb, #b08a36 50%, var(--border));
          background: color-mix(in srgb, #b08a36 8%, var(--surface));
          color: #9a7629;
        }

        .student-history-filter-actions {
          display: flex;
          gap: 9px;
          margin-top: 14px;
        }

        .student-history-result-count {
          padding: 0 3px;
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 700;
        }

        .student-history-list {
          display: grid;
          gap: 10px;
        }

        .student-history-item {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 48px;
          gap: 4px;
          padding: 8px;
        }

        .student-history-item-main {
          display: grid;
          grid-template-columns: 112px minmax(0, 1fr);
          gap: 14px;
          min-width: 0;
          padding: 6px;
          border: 0;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }

        .student-history-thumb {
          display: grid;
          place-items: center;
          overflow: hidden;
          min-height: 96px;
          border-radius: 13px;
          background: color-mix(in srgb, var(--primary) 8%, var(--surface-soft));
          color: var(--primary);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .12em;
        }

        .student-history-thumb img {
          width: 100%;
          height: 100%;
          min-height: 96px;
          object-fit: cover;
        }

        .student-history-item-content {
          display: grid;
          align-content: center;
          gap: 7px;
          min-width: 0;
        }

        .student-history-meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 800;
        }

        .student-history-meta-row span:first-child {
          color: var(--primary);
        }

        .student-history-item-answer {
          overflow: hidden;
          font-size: 16px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .student-history-item-content p {
          display: -webkit-box;
          overflow: hidden;
          margin: 0;
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.55;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .student-history-item-footer {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .student-history-item-footer span {
          padding: 3px 7px;
          border-radius: 999px;
          background: var(--surface-soft);
          color: var(--text-muted);
          font-size: 9px;
          font-weight: 800;
        }

        .student-history-star {
          align-self: start;
          width: 42px;
          height: 42px;
          margin-top: 5px;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: var(--text-muted);
          font-size: 21px;
          cursor: pointer;
        }

        .student-history-star.active,
        .student-favorite-button.active {
          color: #ad842b;
        }

        .student-history-empty {
          display: grid;
          place-items: center;
          min-height: 320px;
          padding: 32px;
          text-align: center;
        }

        .student-history-empty h3 {
          margin: 5px 0;
        }

        .student-history-empty p {
          color: var(--text-muted);
        }

        .student-history-back {
          margin-bottom: 10px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--primary);
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .student-history-detail {
          padding: 22px;
        }

        .student-history-detail-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .student-history-detail-head h3 {
          margin: 5px 0 0;
          font-size: 27px;
        }

        .student-favorite-button {
          min-height: 39px;
          padding: 0 12px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          color: var(--text-muted);
          font-weight: 800;
          cursor: pointer;
        }

        .student-history-images {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
          margin-bottom: 18px;
        }

        .student-history-images figure {
          overflow: hidden;
          margin: 0;
          border: 1px solid var(--border);
          border-radius: 14px;
          background: var(--surface-soft);
        }

        .student-history-images img {
          display: block;
          width: 100%;
          max-height: 390px;
          object-fit: contain;
          background: #fff;
        }

        .student-history-images figcaption {
          padding: 7px 10px;
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 700;
        }

        .student-history-context-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 15px;
        }

        .student-history-context-grid > div {
          display: grid;
          gap: 4px;
          padding: 13px 14px;
          border: 1px solid var(--border);
          border-radius: 13px;
        }

        .student-history-context-grid span,
        .student-history-answer > span {
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 800;
        }

        .student-history-answer {
          display: grid;
          gap: 6px;
          margin-bottom: 16px;
          padding: 16px;
          border-radius: 15px;
          background: color-mix(in srgb, var(--primary) 8%, var(--surface));
        }

        .student-history-answer strong {
          color: var(--primary);
          font-size: 20px;
        }

        .student-history-analysis-block {
          padding: 18px 0;
          border-top: 1px solid var(--border);
        }

        @media (max-width: 760px) {
          .student-firstuse-backdrop {
            place-items: end center;
            padding: 10px;
          }

          .student-firstuse-card,
          .student-install-card {
            width: 100%;
            max-height: calc(100dvh - 20px);
            border-radius: 24px;
          }

          .student-firstuse-topbar {
            padding: 17px 18px 13px;
          }

          .student-firstuse-progress {
            padding: 12px 18px 0;
          }

          .student-firstuse-body {
            padding: 20px 18px 16px;
          }

          .student-firstuse-actions {
            padding: 0 18px 18px;
          }

          .student-install-intro {
            padding: 18px 18px 0;
          }

          .student-install-tabs {
            margin: 16px 18px;
          }

          .student-install-steps {
            padding: 0 18px;
          }

          .student-install-note {
            margin: 14px 18px;
          }

          .student-install-done {
            width: calc(100% - 36px);
            margin: 0 18px;
          }

          .student-history-header {
            align-items: stretch;
            flex-direction: column;
          }

          .student-history-header .hh-button-primary {
            width: 100%;
          }

          .student-history-filter-grid {
            grid-template-columns: 1fr 1fr;
          }

          .student-history-item-main {
            grid-template-columns: 84px minmax(0, 1fr);
            gap: 10px;
          }

          .student-history-thumb,
          .student-history-thumb img {
            min-height: 86px;
          }

          .student-history-context-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 520px) {
          .student-history-filter-grid {
            grid-template-columns: 1fr;
          }

          .student-history-filter-actions {
            flex-direction: column;
          }

          .student-history-filter-actions > * {
            width: 100%;
          }

          .student-history-item {
            grid-template-columns: minmax(0, 1fr) 42px;
          }

          .student-history-item-main {
            grid-template-columns: 1fr;
          }

          .student-history-thumb {
            min-height: 150px;
          }

          .student-history-thumb img {
            min-height: 150px;
          }

          .student-history-detail {
            padding: 15px;
          }
        }


        .student-option-line {
          padding-left: 2.2em;
          text-indent: -2.2em;
        }

        .student-solving-card-v11 {
          position: relative;
          display: grid;
          place-items: center;
          gap: 16px;
          overflow: hidden;
          min-height: 220px;
          padding: 34px 20px;
          border: 1px solid color-mix(in srgb, #b6944b 32%, var(--border));
          background: color-mix(in srgb, var(--surface) 96%, #c8aa68 4%);
          animation: student-loading-breathe 2.1s ease-in-out infinite;
          text-align: center;
          isolation: isolate;
        }

        .student-solving-card-v11::before {
          content: "";
          position: absolute;
          top: -12%;
          bottom: -12%;
          left: 0;
          z-index: -1;
          width: 42%;
          background: linear-gradient(
            105deg,
            transparent 0%,
            color-mix(in srgb, #d9bd7c 5%, transparent) 24%,
            color-mix(in srgb, #d9bd7c 16%, transparent) 48%,
            color-mix(in srgb, #f0ddb0 24%, transparent) 52%,
            color-mix(in srgb, #d9bd7c 12%, transparent) 60%,
            transparent 100%
          );
          filter: blur(2px);
          transform: translate3d(-170%, 0, 0) skewX(-12deg);
          will-change: transform;
          animation: student-loading-shimmer-pass 1.95s linear infinite;
          pointer-events: none;
        }

        .student-solving-ring {
          position: relative;
          width: 54px;
          height: 54px;
          border: 3px solid color-mix(in srgb, #b6944b 22%, var(--border));
          border-top-color: #b6944b;
          border-radius: 50%;
          animation: student-loading-spin .85s linear infinite;
        }

        .student-solving-ring span {
          position: absolute;
          inset: 8px;
          border: 1px solid color-mix(in srgb, #b6944b 18%, transparent);
          border-radius: 50%;
        }

        .student-solving-card-v11 .student-solving-title {
          margin: 0;
          font-size: 15px;
          font-weight: 850;
          letter-spacing: .08em;
        }

        .student-followup-panel {
          display: grid;
          gap: 14px;
          padding: 18px;
          border: 1px solid var(--border);
          border-radius: 17px;
          background: color-mix(in srgb, var(--surface) 97%, var(--primary) 3%);
        }

        .student-followup-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .student-followup-head h3 {
          margin: 4px 0 4px;
          font-size: 20px;
        }

        .student-followup-head p {
          margin: 0;
          color: var(--text-muted);
          font-size: 11px;
        }

        .student-followup-count {
          flex: 0 0 auto;
          padding: 6px 9px;
          border-radius: 999px;
          background: var(--surface-soft);
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 850;
        }

        .student-followup-thread {
          display: grid;
          gap: 10px;
        }

        .student-followup-item {
          display: grid;
          gap: 8px;
        }

        .student-followup-question,
        .student-followup-answer {
          display: grid;
          grid-template-columns: 30px minmax(0, 1fr);
          gap: 9px;
          align-items: start;
        }

        .student-followup-question > span,
        .student-followup-answer > span {
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 900;
        }

        .student-followup-question > span {
          background: color-mix(in srgb, var(--primary) 11%, var(--surface));
          color: var(--primary);
        }

        .student-followup-answer > span {
          background: color-mix(in srgb, #b6944b 12%, var(--surface));
          color: #9a7629;
        }

        .student-followup-question p,
        .student-followup-answer .student-science-text {
          margin: 0;
          padding: 8px 10px;
          border-radius: 12px;
          background: var(--surface-soft);
          font-size: 12px;
          line-height: 1.65;
        }

        .student-followup-input-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: stretch;
        }

        .student-followup-input-row .hh-button-primary {
          min-width: 112px;
        }

        @keyframes student-loading-spin {
          to { transform: rotate(360deg); }
        }

        @keyframes student-loading-shimmer-pass {
          0% {
            transform: translate3d(-170%, 0, 0) skewX(-12deg);
          }
          100% {
            transform: translate3d(340%, 0, 0) skewX(-12deg);
          }
        }

        @keyframes student-loading-breathe {
          0%, 100% {
            box-shadow: 0 0 0 rgba(182, 148, 75, 0);
          }
          50% {
            box-shadow: 0 0 28px color-mix(in srgb, #b6944b 10%, transparent);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .student-solving-card-v11,
          .student-solving-card-v11::before,
          .student-solving-ring {
            animation: none !important;
          }

          .student-solving-card-v11::before {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .student-followup-input-row {
            grid-template-columns: 1fr;
          }

          .student-followup-input-row .hh-button-primary {
            width: 100%;
          }
        }


        /* v1.2.15 light theme refinements */
        html[data-theme="white"] .student-page {
          background:
            radial-gradient(circle at 12% -4%, color-mix(in srgb, #505552 7%, transparent), transparent 29rem),
            radial-gradient(circle at 88% 0%, color-mix(in srgb, #9ca19e 5%, transparent), transparent 25rem),
            var(--bg);
        }

        html[data-theme="white"] .student-top-glow {
          background:
            radial-gradient(circle at 18% -12%, color-mix(in srgb, #4a4f4c 7%, transparent), transparent 52%),
            radial-gradient(circle at 86% -18%, color-mix(in srgb, #a7aaa8 5%, transparent), transparent 48%);
        }

        html[data-theme="oatmeal"] .student-page {
          background:
            radial-gradient(circle at 11% -2%, color-mix(in srgb, #a48658 8%, transparent), transparent 29rem),
            radial-gradient(circle at 88% 0%, color-mix(in srgb, #8b7863 5%, transparent), transparent 26rem),
            var(--bg);
        }

        /* =======================================================
           v1.2.15 SUBJECT PICKER — COMPACT 4 COLUMNS / GREEN BLUE YELLOW RED
           ======================================================= */
        .student-subject-picker {
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 8px !important;
          width: 100%;
          min-height: 0;
        }

        .student-subject-option {
          --subject-accent: var(--primary);
          --subject-soft: var(--surface-soft);
          min-width: 0;
          min-height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 7px 8px !important;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--subject-accent) 42%, var(--border));
          border-radius: 13px;
          background: color-mix(in srgb, var(--subject-soft) 58%, var(--surface));
          color: var(--subject-accent);
          font-size: 13px;
          font-weight: 800;
          line-height: 1.15;
          white-space: nowrap;
          box-shadow: inset 0 1px 0 color-mix(in srgb, white 5%, transparent);
        }

        .student-subject-option > span:not(.student-subject-dot):not(.student-subject-check) {
          min-width: 0;
          overflow: hidden;
          text-overflow: clip;
          white-space: nowrap;
        }

        .student-subject-check {
          display: none !important;
        }

        .student-subject-dot {
          flex: 0 0 auto;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: currentColor;
          opacity: .96;
          box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent);
        }

        .student-subject-option:hover {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--subject-accent) 66%, var(--border));
          box-shadow: 0 8px 18px color-mix(in srgb, var(--subject-accent) 10%, transparent);
        }

        .student-subject-option-selected {
          transform: translateY(-1px);
          border-width: 1.5px;
          border-color: var(--subject-accent) !important;
          background: color-mix(in srgb, var(--subject-soft) 82%, var(--surface)) !important;
          color: var(--subject-accent);
          box-shadow:
            0 0 0 2px color-mix(in srgb, var(--subject-accent) 13%, transparent),
            0 9px 20px color-mix(in srgb, var(--subject-accent) 11%, transparent);
        }

        .student-subject-option-selected .student-subject-dot {
          width: 9px;
          height: 9px;
          box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 16%, transparent);
        }

        /* User-selected order: Physics green / Chemistry blue / Biology yellow / Earth red */
        .student-subject-physics {
          --subject-accent: #5f9877;
          --subject-soft: #e4efe8;
          color: var(--subject-accent);
          background: color-mix(in srgb, var(--subject-soft) 58%, var(--surface));
          border-color: color-mix(in srgb, var(--subject-accent) 42%, var(--border));
        }

        .student-subject-chemistry {
          --subject-accent: #5f86b2;
          --subject-soft: #e5edf6;
          color: var(--subject-accent);
          background: color-mix(in srgb, var(--subject-soft) 58%, var(--surface));
          border-color: color-mix(in srgb, var(--subject-accent) 42%, var(--border));
        }

        .student-subject-biology {
          --subject-accent: #bd9636;
          --subject-soft: #f6edcf;
          color: var(--subject-accent);
          background: color-mix(in srgb, var(--subject-soft) 60%, var(--surface));
          border-color: color-mix(in srgb, var(--subject-accent) 42%, var(--border));
        }

        .student-subject-earth {
          --subject-accent: #b86464;
          --subject-soft: #f3e3e2;
          color: var(--subject-accent);
          background: color-mix(in srgb, var(--subject-soft) 58%, var(--surface));
          border-color: color-mix(in srgb, var(--subject-accent) 42%, var(--border));
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-physics {
          --subject-accent: #82b495;
          --subject-soft: #23382b;
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-chemistry {
          --subject-accent: #8caccd;
          --subject-soft: #243548;
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-biology {
          --subject-accent: #dfbd66;
          --subject-soft: #3d341f;
        }

        html:is([data-theme="sage"],[data-theme="ocean"],[data-theme="graphite"],[data-theme="burgundy"]) .student-subject-earth {
          --subject-accent: #d58d8a;
          --subject-soft: #422a2c;
        }

        @media (max-width: 600px) {
          .student-subject-picker {
            gap: 6px !important;
          }

          .student-subject-option {
            min-height: 44px;
            gap: 5px;
            padding: 5px 4px !important;
            border-radius: 11px;
            font-size: 11px;
            letter-spacing: -.02em;
          }

          .student-subject-dot {
            width: 6px;
            height: 6px;
            box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 12%, transparent);
          }

          .student-subject-option-selected .student-subject-dot {
            width: 7px;
            height: 7px;
            box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 16%, transparent);
          }
        }


        @keyframes studentFirstActionPulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--action) 0%, transparent); transform: translateY(0); }
          35% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--action) 13%, transparent); transform: translateY(-1px); }
          70% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--action) 8%, transparent); transform: translateY(0); }
        }
        .student-first-action-pulse { animation: studentFirstActionPulse 1.6s ease-in-out 2; }
        .student-first-action-nudge {
          position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom)); z-index: 330;
          width: min(560px, calc(100vw - 24px)); transform: translateX(-50%);
          display: grid; grid-template-columns: 34px minmax(0,1fr) auto; align-items: center; gap: 10px;
          padding: 12px 42px 12px 12px; border: 1px solid color-mix(in srgb,var(--action) 28%,var(--border));
          border-radius: 17px; background: color-mix(in srgb,var(--surface) 94%,transparent);
          box-shadow: 0 18px 48px rgba(5,10,7,.2); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
          animation: studentTourCardIn .42s cubic-bezier(.2,.8,.2,1) both;
        }
        .student-first-action-nudge-icon { display:grid; place-items:center; width:34px; height:34px; border-radius:999px; background:var(--action); color:white; font-weight:900; }
        .student-first-action-nudge strong { display:block; color:var(--text); font-size:12px; line-height:1.35; }
        .student-first-action-nudge p { margin:3px 0 0; color:var(--text-secondary); font-size:10px; line-height:1.45; }
        .student-first-action-nudge > button:not(.student-first-action-nudge-close) { min-height:36px; padding:0 12px; border:0; border-radius:11px; background:var(--action); color:white; font-size:10px; font-weight:900; cursor:pointer; }
        .student-first-action-nudge-close { position:absolute; top:7px; right:8px; width:27px; height:27px; border:0; background:transparent; color:var(--text-muted); font-size:20px; cursor:pointer; }
        @keyframes studentTourCardIn { from { opacity:0; transform:translateY(10px) scale(.985); } to { opacity:1; transform:translateY(0) scale(1); } }

        /* v1.3.4 guided walkthrough: move to and spotlight the real interface */
        .student-page.student-tour-results-active {
          padding-bottom: calc(290px + env(safe-area-inset-bottom));
          transition: padding-bottom .28s ease;
        }

        .student-guided-tour-layer {
          position: fixed;
          inset: 0;
          z-index: 340;
          pointer-events: none;
        }

        .student-guided-tour-layer.no-target {
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(9, 14, 11, .62);
        }

        .student-guided-tour-spotlight {
          position: fixed;
          z-index: 341;
          border: 2px solid color-mix(in srgb, var(--action) 78%, white);
          border-radius: 17px;
          background: transparent;
          box-shadow:
            0 0 0 5px color-mix(in srgb, var(--action) 18%, transparent),
            0 0 0 9999px rgba(7, 11, 9, .62),
            0 14px 42px rgba(0, 0, 0, .2);
          pointer-events: none;
          will-change: top, left, width, height, opacity;
          transition: top .36s cubic-bezier(.22,1,.36,1), left .36s cubic-bezier(.22,1,.36,1), width .36s cubic-bezier(.22,1,.36,1), height .36s cubic-bezier(.22,1,.36,1), opacity .18s ease;
        }

        .student-guided-tour-card {
          position: fixed;
          pointer-events: auto;
          z-index: 342;
          max-width: calc(100vw - 24px);
          overflow: hidden;
          border-radius: 20px;
          box-shadow: 0 24px 70px rgba(5, 10, 7, .34);
          overscroll-behavior: contain;
        }

        .student-guided-tour-layer.no-target .student-guided-tour-card {
          position: relative;
          inset: auto;
          width: min(420px, 100%);
          max-height: calc(100dvh - 36px);
        }

        .student-guided-tour-card .student-firstuse-topbar {
          padding: 10px 14px 8px;
        }

        .student-guided-tour-card .student-firstuse-topbar strong {
          font-size: 13px;
        }

        .student-guided-tour-card .student-firstuse-progress {
          padding: 7px 14px 0;
        }

        .student-guided-tour-body {
          padding: 9px 14px 8px;
        }

        .student-guided-tour-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 4px;
        }

        .student-guided-tour-card .student-firstuse-count {
          margin: 0;
          font-size: 24px;
        }

        .student-guided-tour-target-label {
          padding: 5px 9px;
          border: 1px solid color-mix(in srgb, var(--action) 24%, var(--border));
          border-radius: 999px;
          background: color-mix(in srgb, var(--action) 7%, var(--surface-soft));
          color: var(--text-secondary);
          font-size: 10px;
          font-weight: 850;
          white-space: nowrap;
        }

        .student-guided-tour-card .student-firstuse-copy h2 {
          margin: 2px 0 4px;
          font-size: clamp(18px, 3.2vw, 23px);
        }

        .student-guided-tour-card .student-firstuse-copy > p {
          font-size: 11px;
          line-height: 1.45;
        }

        .student-guided-tour-live-note {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 8px;
          margin: 11px 0 9px;
          padding: 8px 10px;
          border-radius: 11px;
          background: color-mix(in srgb, var(--action) 7%, var(--surface-soft));
        }

        .student-guided-tour-live-note span {
          color: var(--text-muted);
          font-size: 9px;
          font-weight: 850;
        }

        .student-guided-tour-live-note strong {
          min-width: 0;
          overflow: hidden;
          color: var(--action);
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .student-guided-tour-card .student-firstuse-tips {
          gap: 5px;
        }

        .student-guided-tour-card .student-firstuse-tips > div {
          grid-template-columns: 20px minmax(0, 1fr);
          gap: 7px;
          padding: 6px 8px;
          border-radius: 10px;
        }

        .student-guided-tour-card .student-firstuse-tips span {
          width: 19px;
          height: 19px;
          font-size: 9px;
        }

        .student-guided-tour-card .student-firstuse-tips p {
          font-size: 10.5px;
          line-height: 1.45;
        }

        .student-guided-tour-interactive-hint {
          border-color: color-mix(in srgb,var(--action) 28%,var(--border)) !important;
          background: color-mix(in srgb,var(--action) 8%,var(--surface-soft)) !important;
          color: var(--text) !important;
          font-weight: 750;
        }
        .student-guided-tour-continuation {
          margin: 9px 0 0;
          padding: 8px 10px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface-soft);
          color: var(--text-secondary);
          font-size: 10px;
          line-height: 1.5;
        }


        .student-guided-tour-mini-tip {
          margin-top: 7px;
          padding: 6px 8px;
          border-radius: 9px;
          background: color-mix(in srgb, var(--action) 7%, var(--surface-soft));
          color: var(--text-secondary);
          font-size: 9.5px;
          line-height: 1.4;
        }

        .student-guided-tour-card .student-firstuse-actions {
          gap: 7px;
          padding: 0 14px 10px;
        }

        .student-guided-tour-card .student-firstuse-actions > button {
          min-height: 36px;
          font-size: 11px;
        }


        .student-guided-tour-version-note {
          margin: 8px 0 9px; padding: 7px 9px; border-radius: 10px;
          background: color-mix(in srgb, var(--action) 10%, var(--surface-soft));
          color: var(--action); font-size: 10px; font-weight: 900; line-height: 1.4;
        }
        @media (prefers-reduced-motion: reduce) {
          .student-guided-tour-spotlight, .student-guided-tour-card, .student-first-action-nudge {
            transition-duration: .01ms !important; animation-duration: .01ms !important;
          }
        }

        @media (max-width: 760px) {
          .student-first-action-nudge { grid-template-columns:30px minmax(0,1fr); gap:8px; padding:11px 36px 11px 11px; }
          .student-first-action-nudge-icon { width:30px; height:30px; }
          .student-first-action-nudge > button:not(.student-first-action-nudge-close) { grid-column:1 / -1; width:100%; }
          .student-guided-tour-layer.has-target {
            padding: 0;
          }

          .student-guided-tour-card {
            position: fixed !important;
            left: 10px !important;
            right: 10px !important;
            top: auto !important;
            bottom: max(10px, env(safe-area-inset-bottom)) !important;
            width: auto !important;
            max-width: none !important;
            max-height: min(208px, calc(100dvh - 24px)) !important;
            border-radius: 18px !important;
            overflow: hidden !important;
          }

          .student-guided-tour-card .student-firstuse-topbar {
            padding: 9px 12px 7px;
          }

          .student-guided-tour-card .student-firstuse-progress {
            padding: 6px 12px 0;
          }

          .student-guided-tour-body {
            padding: 8px 12px 7px;
          }

          .student-guided-tour-card .student-firstuse-copy h2 {
            margin: 1px 0 3px;
            font-size: 17px;
            line-height: 1.25;
          }

          .student-guided-tour-card .student-firstuse-copy > p {
            display: -webkit-box;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            margin: 0;
            font-size: 10.5px;
            line-height: 1.4;
          }

  
        .student-guided-tour-mini-tip {
          margin-top: 7px;
          padding: 6px 8px;
          border-radius: 9px;
          background: color-mix(in srgb, var(--action) 7%, var(--surface-soft));
          color: var(--text-secondary);
          font-size: 9.5px;
          line-height: 1.4;
        }

        .student-guided-tour-card .student-firstuse-actions {
            padding: 0 12px 9px;
          }
        }

`}</style>
    </main>
  );
}
