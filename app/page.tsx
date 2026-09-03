"use client";

import { useEffect, useRef, useState } from "react";
import { Cropper } from "react-cropper";
import katex from "katex";
import html2canvas from "html2canvas";
import ThemeToggle from "@/components/theme-toggle";
import "cropperjs/dist/cropper.css";
import "katex/dist/katex.min.css";

type Campus = "高雄班" | "嘉義班" | "員林班";

type StudentSession = {
  id: string;
  campus: Campus;
  name: string;
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
};

type UsageData = {
  count: number;
  limit: number;
  remaining: number;
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

function ScienceText({
  text,
  annotations,
  onAnnotationClick,
}: {
  text: string;
  annotations?: Annotation[];
  onAnnotationClick?: (annotation: Annotation) => void;
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
              dangerouslySetInnerHTML={{ __html: renderKatex(formula, true) }}
            />
          );
        }

        return block.split("\n").map((line, lineIndex) => {
          if (!line.trim()) return <div key={`${blockIndex}-${lineIndex}`} className="student-text-gap" />;
          const pieces = line.split(/(\$[^$\n]+\$)/);

          return (
            <p key={`${blockIndex}-${lineIndex}`}>
              {pieces.map((piece, pieceIndex) => {
                if (piece.startsWith("$") && piece.endsWith("$")) {
                  return (
                    <span
                      key={pieceIndex}
                      className="student-inline-formula"
                      dangerouslySetInnerHTML={{
                        __html: renderKatex(piece.slice(1, -1), false),
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

  const [usage, setUsage] = useState<UsageData>({ count: 0, limit: 10, remaining: 10 });

  const [image, setImage] = useState("");
  const [isCropping, setIsCropping] = useState(false);
  const cropperRef = useRef<any>(null);

  const [subject, setSubject] = useState("");
  const [referenceAnswer, setReferenceAnswer] = useState("");
  const [questionNote, setQuestionNote] = useState("");
  const [questionError, setQuestionError] = useState("");

  const [isSolving, setIsSolving] = useState(false);
  const [solveData, setSolveData] = useState<SolveData | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const resultRef = useRef<HTMLElement | null>(null);
  const exportCardRef = useRef<HTMLDivElement | null>(null);

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
    if (!/^\d{4}$/.test(pin.trim())) return setLoginError("班級 PIN 必須為四位數字。");

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

  async function handleLogout() {
    if (!window.confirm("確定要切換學生嗎？")) return;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}

    setStudent(null);
    setCampus("");
    setName("");
    setPin("");
    setSubject("");
    setUsage({ count: 0, limit: 10, remaining: 10 });
    clearQuestion();
  }

  function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const sourceImage = new Image();
      sourceImage.onload = () => {
        const maxDimension = 2200;
        let width = sourceImage.width;
        let height = sourceImage.height;

        if (width > maxDimension || height > maxDimension) {
          const scale = Math.min(maxDimension / width, maxDimension / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return setQuestionError("圖片處理失敗。");

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(sourceImage, 0, 0, width, height);
        setImage(canvas.toDataURL("image/jpeg", 0.92));
        setIsCropping(false);
        setQuestionError("");
        setSolveData(null);
      };
      sourceImage.onerror = () => setQuestionError("圖片無法讀取，請重新選擇。");
      sourceImage.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function rotateImage() {
    if (!image) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.height;
      canvas.height = img.width;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(Math.PI / 2);
      context.drawImage(img, -img.width / 2, -img.height / 2);
      setImage(canvas.toDataURL("image/jpeg", 0.95));
      setSolveData(null);
    };
    img.src = image;
  }

  function confirmCrop() {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({
      maxWidth: 1800,
      maxHeight: 1800,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });
    setImage(canvas.toDataURL("image/jpeg", 0.95));
    setIsCropping(false);
    setSolveData(null);
  }

  function clearQuestion() {
    setImage("");
    setIsCropping(false);
    setReferenceAnswer("");
    setQuestionNote("");
    setQuestionError("");
    setSolveData(null);
    setSelectedAnnotation(null);
    if (student) setupSubject(student);
    else setSubject("");
  }

  async function handleStartSolve() {
    setQuestionError("");
    if (!student) return setQuestionError("請先登入。");
    if (usage.remaining <= 0) return setQuestionError("今日 10 題 AI 解題額度已使用完畢。");
    if (!image) return setQuestionError("請先上傳題目圖片。");
    if (!subject) return setQuestionError("請先選擇科目。");

    setIsSolving(true);
    setSolveData(null);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, subject, referenceAnswer, questionNote }),
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

  async function handleSaveImage() {
    if (!exportCardRef.current || !solveData) return;
    setIsSaving(true);

    try {
      const canvas = await html2canvas(exportCardRef.current, {
        scale: 2,
        backgroundColor: "#f8f7f2",
        useCORS: true,
        logging: false,
      });

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
      if (!blob) throw new Error("圖片建立失敗");

      const safeStudent = student ? student.name.replace(/[\\/:*?"<>|]/g, "") : "學生";
      const fileName = `HH-Science-${safeStudent}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "H.H. Science Lab 解題解析", text: "題目與完整解析", files: [file] });
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      alert("解析圖片儲存失敗，請重新嘗試。");
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
        <header className="student-brand-header">
          <div>
            <div className="hh-eyebrow">H.H. SCIENCE LAB</div>
            <h1 className="hh-display student-brand-title">H.H.Science Lab 解題實驗室</h1>
            <p className="student-brand-slogan">拆解步驟，清晰脈絡，訂正錯誤，梳理思路</p>
          </div>
          <ThemeToggle />
        </header>

        {student ? (
          <section className="student-welcome-card">
            <div className="student-welcome-main">
              <div className="student-avatar">{student.name.slice(0, 1)}</div>
              <div>
                <div className="student-welcome-label">WELCOME BACK</div>
                <h2 className="hh-display student-welcome-title">{student.name}</h2>
                <div className="student-muted">{student.campus} · 今日剩餘 {usage.remaining} 題</div>
              </div>
            </div>

            <div className="student-welcome-actions">
              <div className={`student-usage-pill student-usage-pill-${usageTone}`}>
                <span className="hh-number">{usage.count}</span>
                <span>/</span>
                <span className="hh-number">{usage.limit}</span>
                <span>題</span>
              </div>
              <button type="button" onClick={handleLogout} className="hh-button-secondary student-switch-button">
                切換學生
              </button>
            </div>
          </section>
        ) : (
          <section className="hh-card student-login-card">
            <div className="student-login-intro">
              <div className="student-feature-mark">01</div>
              <div>
                <div className="hh-eyebrow">STUDENT ACCESS</div>
                <h2 className="hh-display student-login-title">學生登入</h2>
                <p className="student-muted">選擇班級、輸入姓名與本月班級 PIN</p>
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
                <span>班級 PIN</span>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  placeholder="四位數 PIN"
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

        <div className="student-workspace">
          <section className={`hh-card student-panel student-panel-upload ${!student ? "student-panel-disabled" : ""}`}>
            <StepHeader number="1" title="上傳題目圖片" description="從相簿選擇，或直接拍攝題目" tone="sage" />

            {!image && (
              <label className="student-upload-zone">
                <div className="student-upload-icon">↑</div>
                <div className="student-upload-title">上傳有問題的題目</div>
                <div className="student-muted">支援相簿、拍照與常見圖片格式</div>
                <div className="student-upload-cta">選擇圖片</div>
                <input type="file" accept="image/*,.heic,.heif" onChange={handleImageUpload} hidden />
              </label>
            )}

            {image && !isCropping && (
              <>
                <div className="student-image-frame">
                  <img src={image} alt="題目" className="student-question-image" />
                </div>
                <div className="student-image-actions">
                  <button type="button" onClick={rotateImage} className="hh-button-secondary">↻ 旋轉</button>
                  <button type="button" onClick={() => setIsCropping(true)} className="hh-button-secondary">✂ 裁切</button>
                  <label className="student-file-replace">
                    更換圖片
                    <input type="file" accept="image/*,.heic,.heif" onChange={handleImageUpload} hidden />
                  </label>
                </div>
              </>
            )}

            {image && isCropping && (
              <>
                <div className="student-crop-frame">
                  <Cropper
                    ref={cropperRef}
                    src={image}
                    style={{ height: 420, width: "100%" }}
                    viewMode={1}
                    dragMode="move"
                    responsive
                    autoCropArea={0.9}
                    background={false}
                  />
                </div>
                <div className="student-two-actions">
                  <button type="button" onClick={confirmCrop} className="hh-button-primary">確認裁切</button>
                  <button type="button" onClick={() => setIsCropping(false)} className="hh-button-secondary">取消</button>
                </div>
              </>
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
              <textarea value={questionNote} onChange={(event) => setQuestionNote(event.target.value)} rows={3} placeholder="例如：想問 C 選項為什麼錯、希望特別解釋某一行計算……" className="hh-textarea" />
            </label>

            <div className="student-quota-row">
              <div>
                <div className="student-quota-label">每日 AI 解題額度</div>
                <div className="student-muted">每位學生每日最多 {usage.limit} 題</div>
              </div>
              <div className={`student-remaining student-remaining-${usageTone}`}>
                <span className="hh-number">{usage.remaining}</span> 題剩餘
              </div>
            </div>

            {limitReached && <div className="student-alert student-alert-danger">今日解題額度已使用完畢，明天會自動恢復為 {usage.limit} 題。</div>}
            {questionError && <div className="student-alert student-alert-danger">{questionError}</div>}

            <div className="student-two-actions student-solve-actions">
              <button type="button" onClick={handleStartSolve} disabled={isSolving || limitReached} className="hh-button-primary student-solve-button">
                {limitReached ? "今日額度已使用完畢" : isSolving ? "AI 正在分析題目…" : "開始 AI 解題"}
              </button>
              <button type="button" onClick={clearQuestion} className="hh-button-secondary">清除目前題目</button>
            </div>
          </section>
        </div>

        <section ref={resultRef} className={`hh-card student-panel student-result-panel ${!student ? "student-panel-disabled" : ""}`}>
          <StepHeader number="3" title="解題結果" description="正確答案 → 此題詳解 → 各選項分析" tone="terra" />

          {!solveData && !isSolving && (
            <div className="student-result-empty">
              <div className="student-empty-symbol">∴</div>
              <div>尚未產生解題結果</div>
              <div className="student-muted">完成上方步驟後，解析會顯示在這裡</div>
            </div>
          )}

          {isSolving && (
            <div className="student-solving-card">
              <div className="student-solving-orbit"><span /></div>
              <div>
                <div className="student-solving-title">AI 正在分析題目</div>
                <div className="student-muted">辨識題意、計算並整理成可讀的解析…</div>
              </div>
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
                    <div className="hh-eyebrow">EXPLANATION</div>
                    <h3 className="hh-display">此題詳解</h3>
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
                      <div className="hh-eyebrow">OPTIONS</div>
                      <h3 className="hh-display">各選項分析</h3>
                    </div>
                  </div>
                  <div className="student-result-content">
                    <ScienceText text={solveData.options} annotations={solveData.annotations} onAnnotationClick={setSelectedAnnotation} />
                  </div>
                </article>
              )}

              <div className="student-result-actions">
                <button type="button" onClick={handleLineAsk} className="student-line-button">LINE 詢問老師</button>
                <button type="button" onClick={handleSaveImage} disabled={isSaving} className="student-save-button">
                  {isSaving ? "正在製作解析圖片…" : "儲存解析圖片"}
                </button>
              </div>
            </div>
          )}
        </section>

        <footer className="student-footer">
          <div className="hh-eyebrow">H.H. SCIENCE LAB</div>
          <div>AI 是輔助理解的工具；有疑問時，請回到推理與概念本身。</div>
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
              <div style={{ marginTop: "6px", fontSize: "14px", color: "#747c77" }}>拆解步驟，清晰脈絡，訂正錯誤，梳理思路</div>
              {student && <div style={{ marginTop: "10px", fontSize: "13px", color: "#747c77" }}>{student.campus} ｜ {student.name}</div>}
            </div>

            <div style={{ marginBottom: "22px" }}>
              <div style={{ fontWeight: 700, fontSize: "17px", color: "#30463b", marginBottom: "10px" }}>題目</div>
              <div style={{ padding: "12px", background: "#fff", border: "1px solid #dde1db", borderRadius: "14px" }}>
                <img src={image} alt="題目" style={{ display: "block", maxWidth: "100%", maxHeight: "680px", margin: "0 auto" }} />
              </div>
            </div>

            <div style={{ background: "#e8ece8", border: "1px solid #c8d3ca", borderRadius: "14px", padding: "14px 18px", marginBottom: "14px" }}>
              <div style={{ fontWeight: 700, color: "#30463b" }}>正確答案</div>
              <div style={{ marginTop: "6px" }}><ScienceText text={solveData.answer} /></div>
            </div>

            <div style={{ background: "#fff", border: "1px solid #dde1db", borderRadius: "14px", padding: "18px", marginBottom: "14px" }}>
              <div style={{ fontFamily: '"Source Han Serif TC", "Noto Serif TC", "Songti TC", "PMingLiU", serif', fontWeight: 700, fontSize: "18px", color: "#30463b", marginBottom: "8px" }}>此題詳解</div>
              <ScienceText text={solveData.explanation} />
            </div>

            {solveData.options && (
              <div style={{ background: "#fff", border: "1px solid #eadbd8", borderRadius: "14px", padding: "18px" }}>
                <div style={{ fontFamily: '"Source Han Serif TC", "Noto Serif TC", "Songti TC", "PMingLiU", serif', fontWeight: 700, fontSize: "18px", color: "#8e5752", marginBottom: "8px" }}>各選項分析</div>
                <ScienceText text={solveData.options} />
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
        .student-workspace { display: block; }
        .student-panel { padding: 24px 26px; margin-bottom: 14px; transition: opacity 160ms ease; }
        .student-panel-upload { background: var(--surface); }
        .student-panel-info { background: var(--surface); }
        .student-result-panel { background: var(--surface); }
        .student-panel-disabled { pointer-events: none; opacity: .42; filter: saturate(.65); }
        .student-step-header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
        .student-step-title { margin: 0; font-size: 22px; }
        .student-step-description { margin: 3px 0 0; color: var(--text-muted); font-size: 12px; }
        .student-upload-zone { min-height: 205px; border: 1px dashed var(--border-strong); border-radius: 16px; background: var(--surface-soft); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; cursor: pointer; transition: border-color 140ms ease, background-color 140ms ease; }
        .student-upload-zone:hover { border-color: var(--student-sage); background: color-mix(in srgb, var(--student-sage-soft) 46%, var(--surface)); }
        .student-upload-icon { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--student-sage-soft); color: var(--student-sage); font-size: 24px; }
        .student-upload-title { margin-top: 12px; font-weight: 750; }
        .student-upload-cta { margin-top: 14px; padding: 8px 12px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border-strong); color: var(--text-secondary); font-size: 12px; font-weight: 750; }
        .student-image-frame { padding: 10px; background: var(--surface-soft); border: 1px solid var(--border); border-radius: 18px; }
        .student-question-image { display: block; max-width: 100%; max-height: 470px; margin: 0 auto; border-radius: 12px; }
        .student-image-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-top: 10px; }
        .student-file-replace { min-height: 44px; display: grid; place-items: center; border-radius: 12px; background: var(--student-gold-soft); color: var(--student-gold); border: 1px solid color-mix(in srgb, var(--student-gold) 22%, var(--border)); font-size: 13px; font-weight: 750; cursor: pointer; }
        .student-crop-frame { overflow: hidden; border-radius: 14px; border: 1px solid var(--border); }
        .student-two-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 11px; }
        .student-note-field { margin-top: 12px; }
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
          .student-subject-picker { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .student-container { width: min(100% - 24px, 900px); padding-top: 28px; }
          .student-brand-title { font-size: 38px; }
          .student-workspace { display: block; }
          .student-login-grid { grid-template-columns: 1fr; }
          .student-welcome-card { align-items: flex-start; flex-direction: column; }
          .student-welcome-actions { width: 100%; justify-content: space-between; }
        }

        @media (max-width: 600px) {
          .student-subject-picker { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .student-container { width: min(100% - 20px, 900px); padding-top: 22px; padding-bottom: 48px; }
          .student-brand-header { align-items: flex-start; margin-bottom: 20px; }
          .student-brand-title { font-size: 31px; }
          .student-brand-slogan { font-size: 11px; white-space: nowrap; }
          .student-login-card, .student-panel { padding: 18px; border-radius: 17px; }
          .student-form-grid, .student-two-actions, .student-result-actions { grid-template-columns: 1fr; }
          .student-image-actions { grid-template-columns: 1fr 1fr; }
          .student-image-actions .student-file-replace { grid-column: 1 / -1; }
          .student-step-title { font-size: 20px; }
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
          background:
            linear-gradient(
              135deg,
              color-mix(in srgb, var(--primary) 92%, var(--student-blue) 8%),
              color-mix(in srgb, var(--primary) 90%, var(--student-gold) 10%)
            );
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.08),
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

`}</style>
    </main>
  );
}
