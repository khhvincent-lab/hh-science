"use client";

import { useEffect, useRef, useState } from "react";
import { Cropper } from "react-cropper";
import katex from "katex";
import { toPng } from "html-to-image";
import ThemeToggle from "@/components/theme-toggle";
import "cropperjs/dist/cropper.css";
import "katex/dist/katex.min.css";

type Campus = "高雄班" | "嘉義班" | "員林班";

type StudentSession = {
  id: string;
  campus: Campus;
  name: string;
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
  // 匯出的 PNG 不需要點擊標註。把 \htmlData{annotation=...}{內容}
  // 還原成純 KaTeX 內容，可避免複雜化學式在圖片匯出時被 KaTeX
  // 判定為不合法語法而顯示紅色原始指令。
  let result = formula;

  for (let i = 0; i < 8; i += 1) {
    const next = result.replace(
      /\\htmlData\{annotation=[^}]+\}\{([^{}]*)\}/g,
      "$1",
    );

    if (next === result) break;
    result = next;
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

  const cleaned = text
    .replace(/\\n/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/^---+$/gm, "")
    .trim();

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
  const cleaned = text.replace(/\\n/g, "\n").trim();
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

export default function Home() {
  const [campus, setCampus] = useState<Campus | "">("");
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
    if (student && activeView === "history") {
      void loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, student?.id]);

  function setupSubject(currentStudent: StudentSession) {
    const allowed = subjectPermissions[currentStudent.campus];
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

  async function handleLogin() {
    setLoginError("");
    if (!campus) return setLoginError("請先選擇班級。");
    if (!name.trim()) return setLoginError("請輸入學生姓名。");
    if (!/^\d{4,6}$/.test(pin.trim())) return setLoginError("個人登入密碼必須為 4～6 位數字。");

    setLoginLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campus, name: name.trim(), pin: pin.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登入失敗。");

      const loggedIn: StudentSession = {
        id: data.student.id,
        campus: data.student.campus,
        name: data.student.name,
        mustChangePin: Boolean(data.student.mustChangePin ?? data.mustChangePin),
      };
      setStudent(loggedIn);
      setupSubject(loggedIn);
      setPin("");
      await loadUsage();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登入發生錯誤。");
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
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          subject,
          referenceAnswer,
          questionNote,
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

  const availableSubjects = student ? subjectPermissions[student.campus] : [];

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
    <main className="hh-page student-page">
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
            <div className="student-header-theme" aria-label="切換深色或淺色模式">
              <ThemeToggle />
            </div>

            <button
              type="button"
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

              <div className="student-menu-panel">
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
                <p className="student-muted">選擇班級、輸入姓名與個人登入密碼</p>
              </div>
            </div>

            <div className="student-login-grid">
              <label className="student-field">
                <span>班級</span>
                <div className="student-select-wrap">
                  <select value={campus} onChange={(event) => setCampus(event.target.value as Campus | "")} className="hh-select student-select">
                    <option value="">選擇班級</option>
                    <option value="高雄班">高雄班</option>
                    <option value="嘉義班">嘉義班</option>
                    <option value="員林班">員林班</option>
                  </select>
                  <span className="student-select-arrow" aria-hidden="true">⌄</span>
                </div>
              </label>

              <label className="student-field">
                <span>學生姓名</span>
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="輸入姓名" className="hh-input" />
              </label>

              <label className="student-field">
                <span>個人登入密碼</span>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="current-password"
                  placeholder="4～6 位數字"
                  className="hh-input"
                />
              </label>
            </div>

            {loginError && <div className="student-alert student-alert-danger">{loginError}</div>}

            <button type="button" onClick={handleLogin} disabled={loginLoading} className="hh-button-primary student-login-button">
              {loginLoading ? "正在登入…" : "登入解題實驗室"}
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
          <section className={`hh-card student-panel student-panel-upload ${!student ? "student-panel-disabled" : ""}`}>
            <StepHeader
              number="1"
              title="上傳題目圖片"
              description="可上傳1～5張，題目與解答皆可上傳"
              tone="sage"
            />

            {images.length === 0 && (
              <label className="student-upload-zone">
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
              <div className="student-image-editor">
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
                    onClick={rotateEditingImage}
                  >
                    ↻ 旋轉 90°
                  </button>
                </div>

                <div className="student-crop-frame">
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
                <div className="student-subject-picker" role="group" aria-label="選擇科目">
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

              <label className="student-field">
                <span>標準參考答案 <em>選填</em></span>
                <input value={referenceAnswer} onChange={(event) => setReferenceAnswer(event.target.value)} placeholder="例如 B、ACD、2.5 mol..." className="hh-input" />
              </label>
            </div>

            <label className="student-field student-note-field">
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
              <button type="button" onClick={handleStartSolve} disabled={isSolving || limitReached} className="hh-button-primary student-solve-button">
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
                <div className="student-result-card-header">
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
                  <div className="student-result-card-header">
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

              <section className="student-followup-panel">
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

              <div className="student-result-actions">
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
          <div>自然科解題實驗室 v1</div>
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
          --student-sage: #477d77;
          --student-sage-soft: #e1efec;
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
        html[data-theme="dark"] .student-page {
          --student-sage: #7fb1aa;
          --student-sage-soft: #203a36;
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
        .student-avatar { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; background: var(--primary); color: #fff; font-family: var(--font-serif), serif; font-weight: 700; font-size: 16px; }
        html[data-theme="dark"] .student-avatar { color: #172019; }
        .student-welcome-label { color: var(--text-muted); font: 700 10px/1 var(--font-inter), sans-serif; letter-spacing: .13em; }
        .student-welcome-title { margin: 3px 0 1px; font-size: 18px; }
        .student-welcome-actions { display: flex; align-items: center; gap: 9px; }
        .student-usage-pill { display: inline-flex; align-items: baseline; gap: 4px; padding: 9px 12px; border-radius: 999px; font-weight: 800; font-size: 12px; border: 1px solid transparent; }
        .student-usage-pill-caution { background: var(--quota-caution-soft); color: var(--quota-caution); border-color: color-mix(in srgb, var(--quota-caution) 34%, transparent); }
        .student-usage-pill-warning { background: var(--quota-warning-soft); color: var(--quota-warning); border-color: color-mix(in srgb, var(--quota-warning) 38%, transparent); }
        .student-usage-pill-danger { background: var(--quota-danger-soft); color: var(--quota-danger); border-color: color-mix(in srgb, var(--quota-danger) 42%, transparent); }
        .student-switch-button { border-radius: 999px; padding: 9px 13px; font-size: 12px; }
        .student-login-card { padding: 24px; margin-bottom: 18px; }
        .student-login-intro { display: flex; gap: 14px; align-items: center; margin-bottom: 20px; }
        .student-feature-mark, .student-step-number { display: grid; place-items: center; flex: 0 0 auto; width: 34px; height: 34px; border-radius: 11px; color: #fff; font-size: 12px; font-weight: 800; box-shadow: none; }
        .student-feature-mark { background: var(--student-blue); }
        .student-step-number-sage { background: var(--primary); }
        .student-step-number-gold { background: var(--primary); color: #fff; }
        .student-step-number-terra { background: var(--primary); }
        html[data-theme="dark"] .student-feature-mark, html[data-theme="dark"] .student-step-number-sage, html[data-theme="dark"] .student-step-number-gold, html[data-theme="dark"] .student-step-number-terra { color: #142019; }
        .student-login-title { margin: 3px 0 2px; font-size: 24px; }
        .student-login-grid, .student-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .student-form-grid { grid-template-columns: 1fr; gap: 14px; }
        .student-field { display: grid; gap: 7px; }
        .student-field > span { color: var(--text-secondary); font-size: 12px; font-weight: 700; }
        .student-field em { font-style: normal; color: var(--text-muted); font-weight: 500; }
        .student-select-wrap { position: relative; }
        .student-select { appearance: none; -webkit-appearance: none; padding-right: 42px !important; background: var(--surface) !important; background-image: none !important; box-shadow: none !important; }
        .student-select:hover { border-color: var(--student-blue); }
        .student-select:focus { border-color: var(--student-blue) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--student-blue) 16%, transparent) !important; }
        .student-select option { background: var(--surface); color: var(--text); }
        .student-select-arrow { position: absolute; right: 14px; top: 50%; transform: translateY(-56%); pointer-events: none; color: var(--text-secondary); font-size: 16px; font-weight: 700; }
        .student-subject-picker { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; min-height: 46px; }
        .student-subject-option { position: relative; min-height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 42px 9px 12px; border: 1px solid currentColor; border-radius: 12px; cursor: pointer; font-size: 12px; font-weight: 760; transition: transform 140ms ease, border-color 140ms ease, background-color 140ms ease, color 140ms ease, box-shadow 140ms ease; }
        .student-subject-option:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
        .student-subject-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 999px; background: currentColor; opacity: .95; transition: width 140ms ease, height 140ms ease, box-shadow 140ms ease; }
        .student-subject-check { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); min-width: 30px; height: 20px; padding: 0 7px; display: grid; place-items: center; border-radius: 999px; background: color-mix(in srgb, currentColor 12%, transparent); color: currentColor; border: 1px solid color-mix(in srgb, currentColor 42%, transparent); font-size: 9px; font-weight: 850; letter-spacing: .04em; box-shadow: none; }
        .student-subject-physics { color: var(--subject-blue); background: color-mix(in srgb, var(--subject-blue-soft) 46%, var(--surface)); border-color: color-mix(in srgb, var(--subject-blue) 32%, var(--border)); }
        .student-subject-chemistry { color: var(--subject-red); background: color-mix(in srgb, var(--subject-red-soft) 46%, var(--surface)); border-color: color-mix(in srgb, var(--subject-red) 32%, var(--border)); }
        .student-subject-biology { color: var(--subject-yellow); background: color-mix(in srgb, var(--subject-yellow-soft) 50%, var(--surface)); border-color: color-mix(in srgb, var(--subject-yellow) 34%, var(--border)); }
        .student-subject-earth { color: var(--subject-purple); background: color-mix(in srgb, var(--subject-purple-soft) 48%, var(--surface)); border-color: color-mix(in srgb, var(--subject-purple) 34%, var(--border)); }
        .student-subject-option-selected { transform: translateY(-1px); font-weight: 850; border-width: 2px; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 14%, transparent), inset 0 0 0 1px color-mix(in srgb, currentColor 24%, transparent), 0 8px 18px color-mix(in srgb, currentColor 8%, transparent); }
        .student-subject-option-selected .student-subject-dot { width: 11px; height: 11px; box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 14%, transparent); }
        .student-subject-physics.student-subject-option-selected { background: color-mix(in srgb, var(--subject-blue-soft) 82%, var(--subject-blue) 18%); border-color: var(--subject-blue); }
        .student-subject-chemistry.student-subject-option-selected { background: color-mix(in srgb, var(--subject-red-soft) 82%, var(--subject-red) 18%); border-color: var(--subject-red); }
        .student-subject-biology.student-subject-option-selected { background: color-mix(in srgb, var(--subject-yellow-soft) 80%, var(--subject-yellow) 20%); border-color: var(--subject-yellow); }
        .student-subject-earth.student-subject-option-selected { background: color-mix(in srgb, var(--subject-purple-soft) 82%, var(--subject-purple) 18%); border-color: var(--subject-purple); }
        .student-field .hh-input:focus, .student-field .hh-textarea:focus { border-color: var(--student-gold); box-shadow: 0 0 0 3px color-mix(in srgb, var(--student-gold) 16%, transparent); }
        .student-login-button { width: 100%; margin-top: 16px; min-height: 48px; }

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
          background: rgba(48, 70, 59, 0.08);
          color: var(--hh-primary);
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
          color: var(--hh-muted);
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
        .student-solve-button { min-height: 48px; background: linear-gradient(135deg, #315b55, var(--student-sage)); color: #fff; box-shadow: 0 8px 20px color-mix(in srgb, var(--student-sage) 18%, transparent); }
        html[data-theme="dark"] .student-solve-button { color: #f6faf7; }
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
          .student-login-grid,
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
          .student-login-card, .student-panel { padding: 18px; border-radius: 17px; }
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
            var(--background);
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
          background: linear-gradient(135deg, #315b55 0%, #54745d 100%);
          color: #ffffff;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.10),
            0 10px 24px rgba(34, 62, 49, .10);
        }

        .student-solve-button:hover,
        .student-primary-action:hover {
          transform: translateY(-1px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.10),
            0 14px 28px rgba(34, 62, 49, .14);
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

        html[data-theme="dark"] .student-page {
          background:
            radial-gradient(circle at 12% -4%, rgba(98, 143, 123, .10), transparent 30rem),
            radial-gradient(circle at 88% 0%, rgba(190, 158, 86, .07), transparent 27rem),
            var(--background);
        }

        html[data-theme="dark"] .student-step-card,
        html[data-theme="dark"] .student-welcome-card,
        html[data-theme="dark"] .student-login-card,
        html[data-theme="dark"] .student-result-card,
        html[data-theme="dark"] .student-card {
          background:
            linear-gradient(
              145deg,
              rgba(38, 52, 44, .96),
              rgba(28, 39, 33, .99)
            );
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.025),
            0 16px 34px rgba(0,0,0,.10);
        }

        html[data-theme="dark"] .student-upload-zone {
          background:
            radial-gradient(circle at 50% 0%, rgba(104, 151, 132, .09), transparent 36%),
            linear-gradient(
              145deg,
              rgba(39, 53, 45, .90),
              rgba(31, 42, 36, .97)
            );
        }

        html[data-theme="light"] .student-solve-button,
        html[data-theme="light"] .student-primary-action {
          background: linear-gradient(135deg, #315b55 0%, #54745d 100%);
          color: #ffffff;
          border-color: transparent;
        }

        html[data-theme="dark"] .student-solve-button,
        html[data-theme="dark"] .student-primary-action {
          background:
            linear-gradient(
              135deg,
              #4f7f72,
              #79aaa0
            );
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.08),
            0 0 24px rgba(108, 162, 139, .13),
            0 12px 28px rgba(0,0,0,.14);
        }

        html[data-theme="dark"] .student-solve-button:hover,
        html[data-theme="dark"] .student-primary-action:hover {
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.10),
            0 0 30px rgba(116, 177, 151, .18),
            0 15px 34px rgba(0,0,0,.16);
        }

        html[data-theme="dark"] .student-subject-physics.is-selected,
        html[data-theme="dark"] .student-subject-physics.active {
          box-shadow:
            0 0 0 1px rgba(140,169,199,.22),
            0 0 24px rgba(120,162,201,.18);
        }

        html[data-theme="dark"] .student-subject-chemistry.is-selected,
        html[data-theme="dark"] .student-subject-chemistry.active {
          box-shadow:
            0 0 0 1px rgba(213,140,138,.22),
            0 0 24px rgba(196,117,114,.18);
        }

        html[data-theme="dark"] .student-subject-biology.is-selected,
        html[data-theme="dark"] .student-subject-biology.active {
          box-shadow:
            0 0 0 1px rgba(221,187,101,.24),
            0 0 24px rgba(214,179,86,.18);
        }

        html[data-theme="dark"] .student-subject-earth.is-selected,
        html[data-theme="dark"] .student-subject-earth.active {
          box-shadow:
            0 0 0 1px rgba(178,161,204,.22),
            0 0 24px rgba(158,139,192,.18);
        }

        html[data-theme="dark"] .student-usage-pill,
        html[data-theme="dark"] .student-quota-badge {
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.04),
            0 0 18px rgba(219, 178, 89, .09);
        }

        html[data-theme="dark"] .student-annotation-trigger,
        html[data-theme="dark"] .annotation-number {
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
          border-radius: 15px;
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
          font-size: 24px;
        }

        .student-history-analysis-block {
          padding: 18px 0;
          border-top: 1px solid var(--border);
        }

        @media (max-width: 760px) {
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

`}</style>
    </main>
  );
}
