"use client";

import { useEffect, useRef, useState } from "react";
import { Cropper } from "react-cropper";
import katex from "katex";
import html2canvas from "html2canvas";
import ThemeToggle from "@/components/theme-toggle";
import "cropperjs/dist/cropper.css";
import "katex/dist/katex.min.css";

type Campus = "高雄班" | "嘉義班" | "員林班";

type LoginRegion = { id: string; name: string };
type LoginInstitution = { id: string; region_id: string; name: string };
type LoginClass = { id: string; institution_id: string; name: string; academic_year?: number | null };

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
    { value: "auto", label: "AI 自動判斷" },
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

function StepHeader({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="student-step-header">
      <div className="student-step-number hh-number">{number}</div>
      <div>
        <h2 className="hh-display student-step-title">{title}</h2>
        <p className="student-step-description">{description}</p>
      </div>
    </div>
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

  useEffect(() => {
    async function loadLoginOptions() {
      try {
        const response = await fetch("/api/auth/login-options", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "讀取班級資料失敗。");

        const regions = Array.isArray(data.regions) ? data.regions : [];
        const institutions = Array.isArray(data.institutions) ? data.institutions : [];
        const classes = Array.isArray(data.classes) ? data.classes : [];

        setLoginRegions(regions);
        setLoginInstitutions(institutions);
        setLoginClasses(classes);
        setRegionId((current) => current || regions[0]?.id || "");
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : "讀取班級資料失敗。");
      } finally {
        setLoginOptionsLoading(false);
      }
    }

    void loadLoginOptions();
  }, []);

  useEffect(() => {
    const available = loginInstitutions.filter((item) => item.region_id === regionId);
    if (!available.some((item) => item.id === institutionId)) {
      setInstitutionId(available[0]?.id || "");
    }
  }, [regionId, institutionId, loginInstitutions]);

  useEffect(() => {
    const available = loginClasses.filter((item) => item.institution_id === institutionId);
    if (!available.some((item) => item.id === classId)) {
      setClassId(available[0]?.id || "");
    }
  }, [institutionId, classId, loginClasses]);

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
    if (!regionId) return setLoginError("請先選擇地區。");
    if (!institutionId) return setLoginError("請先選擇補習班。");
    if (!classId) return setLoginError("請先選擇班級。");
    if (!name.trim()) return setLoginError("請輸入學生姓名。");
    if (!/^\d{4,6}$/.test(pin.trim())) return setLoginError("個人 PIN 必須為 4～6 位數字。");

    setLoginLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, name: name.trim(), pin: pin.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登入失敗。");

      const loggedIn: StudentSession = {
        id: data.student.id,
        campus: data.student.campus,
        name: data.student.name,
      };
      setStudent(loggedIn);
      setCampus(loggedIn.campus);
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
    setClassId("");
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
            <h1 className="hh-display student-brand-title">解題實驗室</h1>
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
              <div className={`student-usage-pill ${limitReached ? "student-usage-pill-danger" : ""}`}>
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
                <p className="student-muted">選擇地區、補習班與實際班級，再輸入姓名與個人 PIN</p>
              </div>
            </div>

            <div className="student-login-grid student-login-grid-org">
              <label className="student-field">
                <span>地區</span>
                <select
                  value={regionId}
                  onChange={(event) => setRegionId(event.target.value)}
                  className="hh-select"
                  disabled={loginOptionsLoading}
                >
                  <option value="">選擇地區</option>
                  {loginRegions.map((region) => (
                    <option key={region.id} value={region.id}>{region.name}</option>
                  ))}
                </select>
              </label>

              <label className="student-field">
                <span>補習班</span>
                <select
                  value={institutionId}
                  onChange={(event) => setInstitutionId(event.target.value)}
                  className="hh-select"
                  disabled={loginOptionsLoading || !regionId}
                >
                  <option value="">選擇補習班</option>
                  {loginInstitutions
                    .filter((item) => item.region_id === regionId)
                    .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>

              <label className="student-field">
                <span>班級</span>
                <select
                  value={classId}
                  onChange={(event) => setClassId(event.target.value)}
                  className="hh-select"
                  disabled={loginOptionsLoading || !institutionId}
                >
                  <option value="">選擇班級</option>
                  {loginClasses
                    .filter((item) => item.institution_id === institutionId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.academic_year ? `${item.academic_year} · ` : ""}{item.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="student-field">
                <span>學生姓名</span>
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="輸入姓名" className="hh-input" />
              </label>

              <label className="student-field">
                <span>個人 PIN</span>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="off"
                  placeholder="4～6 位數 PIN"
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
          <section className={`hh-card student-panel ${!student ? "student-panel-disabled" : ""}`}>
            <StepHeader number="1" title="上傳題目圖片" description="從相簿選擇，或直接拍攝題目" />

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

          <section className={`hh-card student-panel ${!student ? "student-panel-disabled" : ""}`}>
            <StepHeader number="2" title="設定題目資訊" description="科目、參考答案與補充敘述" />

            <div className="student-form-grid">
              <label className="student-field">
                <span>科目</span>
                <select value={subject} onChange={(event) => setSubject(event.target.value)} className="hh-select">
                  {availableSubjects.length > 1 && <option value="">選擇科目</option>}
                  {availableSubjects.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>

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
              <div className={`student-remaining ${limitReached ? "student-remaining-danger" : ""}`}>
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
          <StepHeader number="3" title="解題結果" description="正確答案 → 此題詳解 → 各選項分析" />

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
              fontFamily: '-apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif',
            }}
          >
            <div style={{ borderBottom: "2px solid #dce0da", paddingBottom: "18px", marginBottom: "24px" }}>
              <div style={{ fontFamily: '"Noto Serif TC", serif', fontSize: "32px", fontWeight: 700, color: "#30463b" }}>H.H. Science Lab 解題實驗室</div>
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
              <div style={{ fontFamily: '"Noto Serif TC", serif', fontWeight: 700, fontSize: "18px", color: "#30463b", marginBottom: "8px" }}>此題詳解</div>
              <ScienceText text={solveData.explanation} />
            </div>

            {solveData.options && (
              <div style={{ background: "#fff", border: "1px solid #eadbd8", borderRadius: "14px", padding: "18px" }}>
                <div style={{ fontFamily: '"Noto Serif TC", serif', fontWeight: 700, fontSize: "18px", color: "#8e5752", marginBottom: "8px" }}>各選項分析</div>
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
        .student-page { position: relative; overflow-x: hidden; }
        .student-top-glow { position: fixed; inset: 0 0 auto; height: 280px; pointer-events: none; background: radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 58%), radial-gradient(circle at 84% 8%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 48%); z-index: 0; }
        .student-container { position: relative; z-index: 1; width: min(1040px, calc(100% - 32px)); margin: 0 auto; padding: 42px 0 72px; }
        .student-brand-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
        .student-brand-title { margin: 5px 0 0; font-size: clamp(34px, 5vw, 54px); line-height: 1.12; color: var(--primary); }
        .student-brand-slogan { margin: 10px 0 0; color: var(--text-secondary); font-size: 14px; letter-spacing: .02em; }
        .student-muted { color: var(--text-muted); font-size: 13px; }
        .student-loading-page { min-height: 100vh; display: grid; place-items: center; }
        .student-loading-card { text-align: center; }
        .student-loading-title { margin-top: 6px; color: var(--primary); font-size: 28px; }
        .student-welcome-card { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 17px 18px; margin-bottom: 18px; border: 1px solid var(--border); border-radius: 20px; background: linear-gradient(135deg, var(--primary-soft), var(--surface)); box-shadow: var(--shadow-sm); }
        .student-welcome-main { display: flex; align-items: center; gap: 13px; }
        .student-avatar { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--primary); color: #fff; font-family: var(--font-serif), serif; font-weight: 700; font-size: 18px; }
        html[data-theme="dark"] .student-avatar { color: #172019; }
        .student-welcome-label { color: var(--text-muted); font: 700 10px/1 var(--font-inter), sans-serif; letter-spacing: .13em; }
        .student-welcome-title { margin: 4px 0 1px; font-size: 20px; }
        .student-welcome-actions { display: flex; align-items: center; gap: 9px; }
        .student-usage-pill { display: inline-flex; align-items: baseline; gap: 4px; padding: 9px 12px; border-radius: 999px; background: var(--success-soft); color: var(--success); font-weight: 750; font-size: 12px; }
        .student-usage-pill-danger { background: var(--danger-soft); color: var(--danger); }
        .student-switch-button { border-radius: 999px; padding: 9px 13px; font-size: 12px; }
        .student-login-card { padding: 24px; margin-bottom: 18px; }
        .student-login-intro { display: flex; gap: 14px; align-items: center; margin-bottom: 20px; }
        .student-feature-mark, .student-step-number { display: grid; place-items: center; flex: 0 0 auto; width: 36px; height: 36px; border-radius: 12px; background: var(--primary); color: #fff; font-size: 12px; font-weight: 800; box-shadow: var(--shadow-sm); }
        html[data-theme="dark"] .student-feature-mark, html[data-theme="dark"] .student-step-number { color: #172019; }
        .student-login-title { margin: 3px 0 2px; font-size: 24px; }
        .student-login-grid, .student-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .student-login-grid-org { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        .student-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .student-field { display: grid; gap: 7px; }
        .student-field > span { color: var(--text-secondary); font-size: 12px; font-weight: 700; }
        .student-field em { font-style: normal; color: var(--text-muted); font-weight: 500; }
        .student-login-button { width: 100%; margin-top: 16px; min-height: 48px; }
        .student-workspace { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
        .student-panel { padding: 24px; margin-bottom: 18px; transition: opacity 160ms ease; }
        .student-panel-disabled { pointer-events: none; opacity: .42; filter: saturate(.65); }
        .student-step-header { display: flex; align-items: center; gap: 13px; margin-bottom: 20px; }
        .student-step-title { margin: 0; font-size: 22px; }
        .student-step-description { margin: 3px 0 0; color: var(--text-muted); font-size: 12px; }
        .student-upload-zone { min-height: 230px; border: 1.5px dashed var(--border-strong); border-radius: 18px; background: var(--surface-soft); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; cursor: pointer; transition: border-color 140ms ease, background-color 140ms ease, transform 140ms ease; }
        .student-upload-zone:hover { border-color: var(--secondary); background: var(--primary-soft); transform: translateY(-1px); }
        .student-upload-icon { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary); font-size: 24px; }
        .student-upload-title { margin-top: 12px; font-weight: 750; }
        .student-upload-cta { margin-top: 14px; padding: 8px 12px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); color: var(--text-secondary); font-size: 12px; font-weight: 700; }
        .student-image-frame { padding: 10px; background: var(--surface-soft); border: 1px solid var(--border); border-radius: 18px; }
        .student-question-image { display: block; max-width: 100%; max-height: 470px; margin: 0 auto; border-radius: 12px; }
        .student-image-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin-top: 10px; }
        .student-file-replace { min-height: 44px; display: grid; place-items: center; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 750; cursor: pointer; }
        .student-crop-frame { overflow: hidden; border-radius: 14px; border: 1px solid var(--border); }
        .student-two-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 11px; }
        .student-note-field { margin-top: 12px; }
        .student-quota-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 16px; padding: 13px 14px; border-radius: 14px; background: var(--surface-soft); border: 1px solid var(--border); }
        .student-quota-label { font-size: 12px; font-weight: 750; }
        .student-remaining { padding: 7px 10px; border-radius: 999px; background: var(--success-soft); color: var(--success); font-size: 12px; font-weight: 750; }
        .student-remaining-danger { background: var(--danger-soft); color: var(--danger); }
        .student-alert { margin-top: 12px; padding: 11px 13px; border-radius: 12px; font-size: 13px; }
        .student-alert-danger { background: var(--danger-soft); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 22%, transparent); }
        .student-solve-actions { margin-top: 15px; }
        .student-solve-button { min-height: 48px; }
        .student-result-panel { scroll-margin-top: 20px; }
        .student-result-empty { min-height: 190px; display: grid; place-items: center; align-content: center; gap: 4px; border: 1px dashed var(--border-strong); border-radius: 16px; color: var(--text-secondary); text-align: center; }
        .student-empty-symbol { font: 700 30px/1 var(--font-serif), serif; color: var(--text-muted); margin-bottom: 5px; }
        .student-solving-card { display: flex; align-items: center; justify-content: center; gap: 16px; min-height: 150px; border-radius: 16px; background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent); }
        .student-solving-title { color: var(--accent); font-weight: 800; }
        .student-solving-orbit { width: 42px; height: 42px; border: 2px solid color-mix(in srgb, var(--accent) 30%, transparent); border-top-color: var(--accent); border-radius: 50%; animation: studentSpin 900ms linear infinite; }
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
        .student-result-index-gold { background: var(--accent-soft); color: var(--accent); }
        .student-result-index-red { background: var(--danger-soft); color: var(--danger); }
        .student-result-content { padding: 17px; color: var(--text); font-size: 15px; }
        .student-result-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .student-line-button, .student-save-button { min-height: 48px; border: 0; border-radius: 12px; font-weight: 750; cursor: pointer; }
        .student-line-button { background: var(--danger); color: white; }
        .student-save-button { background: var(--accent-soft); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent); }
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
        .student-modal-info-gold { background: var(--accent-soft); color: var(--text); }
        .student-modal-info-red { background: var(--danger-soft); color: var(--text); }
        .student-modal-info-label { font-size: 11px; font-weight: 800; margin-bottom: 5px; }
        .student-modal-science { display: grid; gap: 2px; font-size: 13px; line-height: 1.65; }
        .student-modal-science p { margin: 0; }
        .student-modal-formula { overflow-x: auto; }
        .student-modal-done { width: 100%; margin-top: 16px; }

        @media (max-width: 820px) {
          .student-container { width: min(100% - 24px, 1040px); padding-top: 28px; }
          .student-brand-title { font-size: 38px; }
          .student-workspace { grid-template-columns: 1fr; gap: 0; }
          .student-login-grid { grid-template-columns: 1fr; }
          .student-welcome-card { align-items: flex-start; flex-direction: column; }
          .student-welcome-actions { width: 100%; justify-content: space-between; }
        }

        @media (max-width: 600px) {
          .student-container { width: min(100% - 20px, 1040px); padding-top: 22px; padding-bottom: 48px; }
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
      `}</style>
    </main>
  );
}
