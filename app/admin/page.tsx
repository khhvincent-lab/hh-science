"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import katex from "katex";
import ThemeToggle from "@/components/theme-toggle";
import "katex/dist/katex.min.css";

const USD_TO_TWD_RATE = 32.5;

type AdminSection = "dashboard" | "classes" | "students" | "ai" | "pin" | "corrections" | "analytics";

type DashboardData = {
  today: {
    questions: number;
    students: number;
    cost: number;
    averageCost: number;
  };
  month: {
    questions: number;
    cost: number;
    averageCost: number;
  };
  campuses: {
    campus: string;
    todayQuestions: number;
    todayCost: number;
    monthQuestions: number;
    monthCost: number;
    students: number;
  }[];
  studentUsage: {
    id: string;
    name: string;
    campus: string;
    count: number;
    active: boolean;
  }[];
  ai: {
    model: string;
    modelName: string;
    description: string;
    reasoningEffort: string;
  };
};

type AIModel = {
  id: string;
  name: string;
  description: string;
  inputPrice?: number;
  cachedInputPrice?: number;
  outputPrice?: number;
};

type SettingsData = {
  ai: {
    model: string;
    reasoningEffort: string;
  };
  models: AIModel[];
  classPins: {
    campus: string;
    configured: boolean;
    validFrom?: string | null;
    validUntil?: string | null;
  }[];
};

type SolverMode = "single" | "multi";

type SolverSlot = {
  provider: "openai" | "gemini";
  model: string;
  reasoning: string;
};

type SolverSettingsData = {
  mode: SolverMode;
  primary: SolverSlot;
  verifier: SolverSlot;
  arbiter: SolverSlot;
  scienceGate: SolverSlot;
  arbitration: {
    confidenceThreshold: number;
  };
  followup: {
    enabled: boolean;
    model: SolverSlot;
    maxPerQuestion: number;
  };
  dailyLimit: number;
};

type RouterModelOption = AIModel & {
  provider: "openai" | "gemini";
  reasoningLevels: string[];
};

type StudentRow = {
  id: string;
  campus: string;
  name: string;
  active: boolean;
  must_change_pin?: boolean;
  passwordStatus?: "initial" | "personal";
  pin_changed_at?: string | null;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
  todayCount: number;
  region_id?: string | null;
  institution_id?: string | null;
  class_id?: string | null;
  regions?: { name?: string } | null;
  institutions?: { name?: string } | null;
  classes?: { name?: string } | null;
};

type StudentSummary = {
  total: number;
  active: number;
  inactive: number;
  campuses: { campus: string; count: number }[];
};

type AdminHistoryImage = {
  path: string;
  mimeType?: string;
  order?: number;
  url?: string | null;
};

type AdminFollowup = {
  id: string;
  question: string;
  answer: string;
  provider?: string | null;
  model?: string | null;
  createdAt: string;
};

type AdminHistoryItem = {
  id: string;
  subject: string;
  referenceAnswer: string;
  questionNote: string;
  answer: string;
  explanation: string;
  options: string;
  imagePaths: AdminHistoryImage[];
  favorite: boolean;
  createdAt: string;
  primaryProvider?: string | null;
  primaryModel?: string | null;
  verifierProvider?: string | null;
  verifierModel?: string | null;
  verifierResult?: string | null;
  arbiterProvider?: string | null;
  arbiterModel?: string | null;
  arbitrationTrigger?: string | null;
  disputeStatus?: string | null;
  followupCount: number;
  followups: AdminFollowup[];
};

type AnalyticsRange = "today" | "7d" | "30d" | "month";

type AnalyticsRoleMetric = {
  role: string;
  calls: number;
  costUsd: number;
};

type AnalyticsModelMetric = {
  model: string;
  provider: string;
  calls: number;
  costUsd: number;
  averageCostUsd: number;
  primaryReferenceCases: number;
  primaryMatches: number;
  primaryConsistencyRate: number | null;
  verifierCases: number;
  verifierMajorErrors: number;
  verifierDisagreementRate: number | null;
};

type AnalyticsData = {
  range: AnalyticsRange;
  label: string;
  startAt: string;
  endAt: string;
  generatedAt: string;
  totals: {
    solvedQuestions: number;
    apiCalls: number;
    totalCostUsd: number;
    averageCostPerSolveUsd: number;
  };
  roles: AnalyticsRoleMetric[];
  quality: {
    referenceCases: number;
    primaryReferenceMatches: number;
    primaryReferenceConsistencyRate: number | null;
    noReferenceCases: number;
    verifierQuestions: number;
    verifierActivationRate: number | null;
    verifierMajorErrors: number;
    verifierDisagreementRate: number | null;
    arbiterQuestions: number;
    arbiterActivationRate: number | null;
    referenceMismatchArbitrations: number;
    referenceArbiterSupportsReference: number;
    referenceArbiterSupportsPrimary: number;
    referenceArbiterStillInconsistent: number;
    verifierTriggeredArbitrations: number;
    disputedQuestions: number;
  };
  models: AnalyticsModelMetric[];
};

type LatencyModelMetric = {
  model: string;
  provider: string;
  calls: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
};

type LatencyData = {
  range: AnalyticsRange;
  label: string;
  totalCalls: number;
  averageMs: number;
  models: LatencyModelMetric[];
};

function modelDisplayName(model: string) {
  if (model === "gpt-5.6-luna") return "GPT-5.6 Luna";
  if (model === "gpt-5.6-terra") return "GPT-5.6 Terra";
  if (model === "gpt-5.6-sol") return "GPT-5.6 Sol";
  if (model === "gemini-3.8-flash") return "Gemini 3.8 Flash";
  if (model === "gemini-3.6-flash") return "Gemini 3.6 Flash";
  if (model === "gemini-2.5-flash") return "Gemini 2.5 Flash";
  return model;
}

function formatDuration(ms: number | null | undefined) {
  const value = Number(ms || 0);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} 秒`;
}

const CAMPUSES: string[] = ["高雄班", "嘉義班", "員林班"];
const CAMPUS_FILTERS: string[] = ["全部班級", ...CAMPUSES];

function adminSubjectLabel(value: string) {
  if (value === "physics") return "物理";
  if (value === "chemistry") return "化學";
  if (value === "biology") return "生物";
  if (value === "earth") return "地球科學";
  return "自然科";
}

function formatAdminDate(value: string) {
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

function adminRenderKatex(formula: string, displayMode: boolean) {
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

function AdminScienceText({ text }: { text: string }) {
  if (!text) return null;

  const cleaned = text
    .replace(/\\n/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/^---+$/gm, "")
    .trim();

  const blocks = cleaned.split(/(\$\$[\s\S]*?\$\$)/);

  return (
    <div className="admin-science-text">
      {blocks.map((block, blockIndex) => {
        if (block.startsWith("$$") && block.endsWith("$$")) {
          return (
            <div
              className="admin-display-formula"
              key={blockIndex}
              dangerouslySetInnerHTML={{
                __html: adminRenderKatex(block.slice(2, -2).trim(), true),
              }}
            />
          );
        }

        return block.split("\n").map((line, lineIndex) => {
          if (!line.trim()) {
            return <div className="admin-text-gap" key={`${blockIndex}-${lineIndex}`} />;
          }

          const pieces = line.split(/(\$[^$\n]+\$)/);
          const optionLine = /^[✓✕]\s*\([A-Z]\)/.test(line.trim());

          return (
            <p
              className={optionLine ? "admin-option-line" : undefined}
              key={`${blockIndex}-${lineIndex}`}
            >
              {pieces.map((piece, pieceIndex) =>
                piece.startsWith("$") && piece.endsWith("$") ? (
                  <span
                    key={pieceIndex}
                    dangerouslySetInnerHTML={{
                      __html: adminRenderKatex(piece.slice(1, -1), false),
                    }}
                  />
                ) : (
                  <span key={pieceIndex}>{piece}</span>
                ),
              )}
            </p>
          );
        });
      })}
    </div>
  );
}

function formatAdminOptions(text: string) {
  if (!text) return "";

  return text
    .replace(/^\s*\(([A-Z])\)\s*對[：:]\s*/gm, "✓ ($1) ")
    .replace(/^\s*\(([A-Z])\)\s*錯[：:]\s*/gm, "✕ ($1) ")
    .replace(/^\s*([A-Z])[.、]\s*對[：:]\s*/gm, "✓ ($1) ")
    .replace(/^\s*([A-Z])[.、]\s*錯[：:]\s*/gm, "✕ ($1) ");
}

export default function AdminPage() {
  const [adminReady, setAdminReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [selectedModel, setSelectedModel] = useState("gpt-5.6-luna");
  const [reasoning, setReasoning] = useState("medium");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [savingAI, setSavingAI] = useState(false);

  const [routerModels, setRouterModels] = useState<RouterModelOption[]>([]);
  const [solverSettings, setSolverSettings] = useState<SolverSettingsData | null>(null);
  const [solverLoading, setSolverLoading] = useState(false);
  const [solverSaving, setSolverSaving] = useState(false);

  const [initialStudentPin, setInitialStudentPin] = useState("258258");
  const [studentAuthLoading, setStudentAuthLoading] = useState(false);
  const [studentAuthSaving, setStudentAuthSaving] = useState(false);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentSummary, setStudentSummary] = useState<StudentSummary>({
    total: 0,
    active: 0,
    inactive: 0,
    campuses: [],
  });
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [studentMessage, setStudentMessage] = useState("");
  const [studentCampusFilter, setStudentCampusFilter] =
    useState<(typeof CAMPUS_FILTERS)[number]>("高雄班");
  const [studentStatusFilter, setStudentStatusFilter] =
    useState<"全部" | "啟用" | "停用">("全部");
  const [studentQuery, setStudentQuery] = useState("");
  const [newCampus, setNewCampus] = useState<(typeof CAMPUSES)[number]>("高雄班");
  const [newName, setNewName] = useState("");
  const [addingStudent, setAddingStudent] = useState(false);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);
  const [historyStudent, setHistoryStudent] = useState<StudentRow | null>(null);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError("");

    try {
      const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
      const data = await response.json();

      if (response.status === 401) {
        setIsLoggedIn(false);
        return;
      }

      if (!response.ok) throw new Error(data.error || "讀取儀表板失敗。");
      setDashboard(data);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "讀取儀表板失敗。");
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsError("");

    try {
      const response = await fetch("/api/admin/settings", { cache: "no-store" });
      const data = await response.json();

      if (response.status === 401) {
        setIsLoggedIn(false);
        return;
      }

      if (!response.ok) throw new Error(data.error || "讀取系統設定失敗。");

      setSettings(data);
      if (data.ai?.model) setSelectedModel(data.ai.model);
      if (data.ai?.reasoningEffort) setReasoning(data.ai.reasoningEffort);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "讀取系統設定失敗。");
    }
  }, []);

  const loadAISolverSettings = useCallback(async () => {
    setSolverLoading(true);
    setSettingsError("");

    try {
      const response = await fetch("/api/admin/ai-settings", {
        cache: "no-store",
      });
      const data = await response.json();

      if (response.status === 401) {
        setIsLoggedIn(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "讀取 v1.1 AI Router 設定失敗。");
      }

      setRouterModels(Array.isArray(data.models) ? data.models : []);
      setSolverSettings(data.settings ?? null);
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "讀取 v1.1 AI Router 設定失敗。",
      );
    } finally {
      setSolverLoading(false);
    }
  }, []);

  const loadStudentAuthSettings = useCallback(async () => {
    setStudentAuthLoading(true);

    try {
      const response = await fetch("/api/admin/student-auth-settings", {
        cache: "no-store",
      });
      const data = await response.json();

      if (response.status === 401) {
        setIsLoggedIn(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "讀取學生密碼設定失敗。");
      }

      if (typeof data.initialPin === "string") {
        setInitialStudentPin(data.initialPin);
      }
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "讀取學生密碼設定失敗。",
      );
    } finally {
      setStudentAuthLoading(false);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    setStudentError("");

    try {
      const response = await fetch("/api/admin/students", {
        cache: "no-store",
      });
      const data = await response.json();

      if (response.status === 401) {
        setIsLoggedIn(false);
        return;
      }

      if (!response.ok) throw new Error(data.error || "讀取學生資料失敗。");

      setStudents(Array.isArray(data.students) ? data.students : []);
      setStudentSummary(
        data.summary ?? {
          total: 0,
          active: 0,
          inactive: 0,
          campuses: [],
        },
      );
      setStudentsLoaded(true);
    } catch (error) {
      setStudentError(error instanceof Error ? error.message : "讀取學生資料失敗。");
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const loadAllAdminData = useCallback(async () => {
    await Promise.all([
      loadDashboard(),
      loadAISolverSettings(),
      loadStudentAuthSettings(),
    ]);
  }, [
    loadDashboard,
    loadAISolverSettings,
    loadStudentAuthSettings,
  ]);

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const data = await response.json();

        if (response.ok && data.authenticated) {
          setIsLoggedIn(true);
        }
      } catch {
      } finally {
        setAdminReady(true);
      }
    }

    void checkSession();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    void loadAllAdminData();
  }, [isLoggedIn, loadAllAdminData]);

  useEffect(() => {
    if (isLoggedIn && (activeSection === "students" || activeSection === "classes") && !studentsLoaded) {
      void loadStudents();
    }
  }, [activeSection, isLoggedIn, studentsLoaded, loadStudents]);

  async function handleLogin() {
    if (!password) {
      setLoginError("請輸入管理員密碼。");
      return;
    }

    setLoginLoading(true);
    setLoginError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "登入失敗。");

      setPassword("");
      setIsLoggedIn(true);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登入失敗。");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
    }

    setIsLoggedIn(false);
    setDashboard(null);
    setSettings(null);
    setStudents([]);
    setStudentsLoaded(false);
    setActiveSection("dashboard");
  }

  async function saveAISettings() {
    setSavingAI(true);
    setSettingsMessage("");
    setSettingsError("");

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_ai",
          model: selectedModel,
          reasoningEffort: reasoning,
        }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "儲存 AI 設定失敗。");

      setSettingsMessage("AI 設定已更新，下一次解題立即生效。");
      await Promise.all([loadSettings(), loadDashboard()]);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "儲存 AI 設定失敗。");
    } finally {
      setSavingAI(false);
    }
  }

  async function saveAISolverSettings() {
    if (!solverSettings) {
      setSettingsError("AI Router 設定尚未載入完成。");
      return;
    }

    setSolverSaving(true);
    setSettingsMessage("");
    setSettingsError("");

    try {
      const response = await fetch("/api/admin/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(solverSettings),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "儲存 AI Router 設定失敗。");
      }

      setSolverSettings(data.settings);
      setSettingsMessage("v1.1 AI Router 設定已更新，下一題立即生效。");
      await Promise.all([loadDashboard(), loadAISolverSettings()]);
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "儲存 AI Router 設定失敗。",
      );
    } finally {
      setSolverSaving(false);
    }
  }

  async function saveInitialStudentPin() {
    const pin = initialStudentPin.trim();

    if (!/^\d{4,6}$/.test(pin)) {
      setSettingsError("學生初始密碼必須為 4～6 位數字。");
      return;
    }

    if (
      !window.confirm(
        `確定要把共用初始密碼更新為 ${pin} 嗎？\n\n注意：已設定個人密碼的學生不受影響；之後新增學生或老師重設密碼時會使用新的初始密碼。`,
      )
    ) {
      return;
    }

    setStudentAuthSaving(true);
    setSettingsMessage("");
    setSettingsError("");

    try {
      const response = await fetch("/api/admin/student-auth-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialPin: pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "更新學生初始密碼失敗。");
      }

      setInitialStudentPin(data.initialPin);
      setSettingsMessage(
        `學生共用初始密碼已更新為 ${data.initialPin}。已設定個人密碼的學生不受影響。`,
      );
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "更新學生初始密碼失敗。",
      );
    } finally {
      setStudentAuthSaving(false);
    }
  }

  async function addStudent() {
    const name = newName.trim();
    if (!name) {
      setStudentError("請輸入學生姓名。");
      return;
    }

    setAddingStudent(true);
    setStudentError("");
    setStudentMessage("");

    try {
      const response = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campus: newCampus, name }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "新增學生失敗。");

      setNewName("");
      setStudentMessage(`已新增 ${newCampus}｜${name}`);
      await Promise.all([loadStudents(), loadDashboard()]);
    } catch (error) {
      setStudentError(error instanceof Error ? error.message : "新增學生失敗。");
    } finally {
      setAddingStudent(false);
    }
  }

  async function toggleStudent(student: StudentRow) {
    const nextActive = !student.active;
    const actionText = nextActive ? "重新啟用" : "停用";

    if (!window.confirm(`確定要${actionText}「${student.campus}｜${student.name}」嗎？`)) {
      return;
    }

    setBusyStudentId(student.id);
    setStudentError("");
    setStudentMessage("");

    try {
      const response = await fetch("/api/admin/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: student.id, active: nextActive }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "更新學生狀態失敗。");

      setStudentMessage(`已${actionText} ${student.name}`);
      await Promise.all([loadStudents(), loadDashboard()]);
    } catch (error) {
      setStudentError(error instanceof Error ? error.message : "更新學生狀態失敗。");
    } finally {
      setBusyStudentId(null);
    }
  }

  async function resetStudentUsage(student: StudentRow) {
    if (
      !window.confirm(
        `確定要重置「${student.campus}｜${student.name}」今天的解題額度嗎？\n\n重置後會恢復為 10 / 10 題。`,
      )
    ) {
      return;
    }

    setBusyStudentId(student.id);
    setStudentError("");
    setStudentMessage("");

    try {
      const response = await fetch("/api/admin/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: student.id,
          action: "reset_usage",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "重置學生額度失敗。");
      }

      setStudentMessage(`已重置 ${student.name} 今日解題額度，恢復為 10 / 10 題。`);
      await Promise.all([loadStudents(), loadDashboard()]);
    } catch (error) {
      setStudentError(
        error instanceof Error ? error.message : "重置學生額度失敗。",
      );
    } finally {
      setBusyStudentId(null);
    }
  }

  async function resetStudentPin(student: StudentRow) {
    if (
      !window.confirm(
        `確定要重設「${student.campus}｜${student.name}」的登入密碼嗎？\n\n重設後會恢復成共用初始密碼，學生下次登入時必須重新設定自己的個人密碼。`,
      )
    ) {
      return;
    }

    setBusyStudentId(student.id);
    setStudentError("");
    setStudentMessage("");

    try {
      const response = await fetch("/api/admin/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: student.id,
          action: "reset_pin",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "重設學生密碼失敗。");
      }

      setStudentMessage(
        `${student.name} 的登入密碼已重設為初始密碼 ${data.initialPin}，下次登入會強制重新設定個人密碼。`,
      );

      await loadStudents();
    } catch (error) {
      setStudentError(
        error instanceof Error
          ? error.message
          : "重設學生密碼失敗。",
      );
    } finally {
      setBusyStudentId(null);
    }
  }

  const filteredStudents = useMemo(() => {
    const keyword = studentQuery.trim().toLowerCase();

    return students.filter((student) => {
      if (
        studentCampusFilter !== "全部班級" &&
        student.campus !== studentCampusFilter
      ) {
        return false;
      }

      if (studentStatusFilter === "啟用" && !student.active) return false;
      if (studentStatusFilter === "停用" && student.active) return false;

      if (
        keyword &&
        !student.name.toLowerCase().includes(keyword) &&
        !student.campus.toLowerCase().includes(keyword)
      ) {
        return false;
      }

      return true;
    });
  }, [students, studentCampusFilter, studentStatusFilter, studentQuery]);

  function campusStudentCount(campus: string) {
    return studentSummary.campuses.find((item) => item.campus === campus)?.count ?? 0;
  }

  if (!adminReady) {
    return (
      <main className="admin-shell admin-center">
        <div className="admin-loading-card">
          <div className="hh-eyebrow">H.H. SCIENCE LAB</div>
          <h1 className="hh-display">教師管理中心</h1>
          <p>正在確認管理員登入狀態…</p>
        </div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <div className="admin-login-brand">
            <div className="hh-eyebrow">H.H. SCIENCE LAB · ADMIN</div>
            <h1 className="hh-display admin-login-title">教師管理中心</h1>
            <p>管理 AI 解題、學生帳號密碼、學生名單與使用成本。</p>
          </div>

          <label className="admin-field">
            <span>管理員密碼</span>
            <input
              className="hh-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleLogin();
              }}
              placeholder="輸入管理員密碼"
            />
          </label>

          {loginError && <div className="admin-notice danger">{loginError}</div>}

          <button
            type="button"
            className="hh-button-primary admin-login-button"
            disabled={loginLoading}
            onClick={() => void handleLogin()}
          >
            {loginLoading ? "登入中…" : "登入管理中心"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-mobile-header">
        <button
          type="button"
          className="admin-mobile-brand"
          onClick={() => {
            setActiveSection("dashboard");
            setMobileMenuOpen(false);
          }}
        >
          <span className="hh-display">教師管理中心</span>
          <small>H.H. SCIENCE LAB</small>
        </button>

        <div className="admin-mobile-header-actions">
          <div className="admin-mobile-theme-toggle" aria-label="切換外觀">
            <ThemeToggle />
          </div>
          <button
            type="button"
            className="admin-mobile-menu-button"
            aria-label="開啟教師管理選單"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <button
          type="button"
          className="admin-mobile-backdrop"
          aria-label="關閉選單"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`admin-sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="admin-sidebar-brand">
          <div className="hh-eyebrow">H.H. SCIENCE LAB</div>
          <div className="hh-display admin-sidebar-title">教師管理中心</div>
          <div className="admin-sidebar-subtitle">Academic Control Center</div>
        </div>

        <nav className="admin-nav">
          <NavButton
            active={activeSection === "dashboard"}
            icon="01"
            label="管理總覽"
            onClick={() => { setActiveSection("dashboard"); setMobileMenuOpen(false); }}
          />
          <NavButton
            active={activeSection === "classes" || activeSection === "students" || activeSection === "pin"}
            icon="02"
            label="班務管理"
            onClick={() => { setActiveSection("classes"); setMobileMenuOpen(false); }}
          />
          <NavButton
            active={activeSection === "ai" || activeSection === "analytics"}
            icon="03"
            label="AI 管理"
            onClick={() => { setActiveSection("ai"); setMobileMenuOpen(false); }}
          />
          <NavButton
            active={activeSection === "corrections"}
            icon="04"
            label="解題修正"
            onClick={() => { setActiveSection("corrections"); setMobileMenuOpen(false); }}
          />
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-theme-row">
            <span>外觀</span>
            <ThemeToggle />
          </div>
          <a className="admin-sidebar-link" href="/">
            ← 返回學生端
          </a>
          <button type="button" className="admin-sidebar-link" onClick={handleLogout}>
            登出管理中心
          </button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <div className="hh-eyebrow">{sectionEyebrow(activeSection)}</div>
            <h1 className="hh-display admin-page-title">{sectionTitle(activeSection)}</h1>
          </div>

          <div className="admin-topbar-actions">
            <button
              type="button"
              className="hh-button-secondary"
              onClick={() => {
                if (activeSection === "students" || activeSection === "classes") void loadStudents();
                else void loadAllAdminData();
              }}
            >
              重新整理
            </button>
          </div>
        </header>

        <div className="admin-content">
          {(activeSection === "classes" || activeSection === "students" || activeSection === "pin") && (
            <div className="management-tabs" role="tablist" aria-label="班務管理">
              <button type="button" className={activeSection === "classes" ? "active" : ""} onClick={() => setActiveSection("classes")}>班級管理</button>
              <button type="button" className={activeSection === "students" || activeSection === "pin" ? "active" : ""} onClick={() => setActiveSection("students")}>學生管理</button>
            </div>
          )}
          {(activeSection === "ai" || activeSection === "analytics") && (
            <div className="management-tabs" role="tablist" aria-label="AI 管理">
              <button type="button" className={activeSection === "ai" ? "active" : ""} onClick={() => setActiveSection("ai")}>AI 設定</button>
              <button type="button" className={activeSection === "analytics" ? "active" : ""} onClick={() => setActiveSection("analytics")}>數據分析</button>
            </div>
          )}
          {activeSection === "dashboard" && (
            <DashboardSection
              dashboard={dashboard}
              solverSettings={solverSettings}
              loading={dashboardLoading}
              error={dashboardError}
            />
          )}

          {activeSection === "classes" && (
            <StudentsSection
              mode="classes"
              students={filteredStudents}
              total={studentSummary.total}
              active={studentSummary.active}
              inactive={studentSummary.inactive}
              allStudents={students}
              loading={studentsLoading}
              error={studentError}
              message={studentMessage}
              campusFilter={studentCampusFilter}
              setCampusFilter={setStudentCampusFilter}
              statusFilter={studentStatusFilter}
              setStatusFilter={setStudentStatusFilter}
              query={studentQuery}
              setQuery={setStudentQuery}
              campusCount={campusStudentCount}
              newCampus={newCampus}
              setNewCampus={setNewCampus}
              newName={newName}
              setNewName={setNewName}
              adding={addingStudent}
              addStudent={addStudent}
              busyStudentId={busyStudentId}
              toggleStudent={toggleStudent}
              resetStudentUsage={resetStudentUsage}
              resetStudentPin={resetStudentPin}
              dailyLimit={solverSettings?.dailyLimit ?? 10}
              viewStudentHistory={setHistoryStudent}
              reloadStudents={loadStudents}
              initialPin={initialStudentPin}
              setInitialPin={setInitialStudentPin}
              studentAuthLoading={studentAuthLoading}
              studentAuthSaving={studentAuthSaving}
              saveInitialPin={saveInitialStudentPin}
              settingsMessage={settingsMessage}
              settingsError={settingsError}
            />
          )}

          {activeSection === "students" && (
            <StudentsSection
              mode="students"
              students={filteredStudents}
              total={studentSummary.total}
              active={studentSummary.active}
              inactive={studentSummary.inactive}
              allStudents={students}
              loading={studentsLoading}
              error={studentError}
              message={studentMessage}
              campusFilter={studentCampusFilter}
              setCampusFilter={setStudentCampusFilter}
              statusFilter={studentStatusFilter}
              setStatusFilter={setStudentStatusFilter}
              query={studentQuery}
              setQuery={setStudentQuery}
              campusCount={campusStudentCount}
              newCampus={newCampus}
              setNewCampus={setNewCampus}
              newName={newName}
              setNewName={setNewName}
              adding={addingStudent}
              addStudent={addStudent}
              busyStudentId={busyStudentId}
              toggleStudent={toggleStudent}
              resetStudentUsage={resetStudentUsage}
              resetStudentPin={resetStudentPin}
              dailyLimit={solverSettings?.dailyLimit ?? 10}
              viewStudentHistory={setHistoryStudent}
              reloadStudents={loadStudents}
              initialPin={initialStudentPin}
              setInitialPin={setInitialStudentPin}
              studentAuthLoading={studentAuthLoading}
              studentAuthSaving={studentAuthSaving}
              saveInitialPin={saveInitialStudentPin}
              settingsMessage={settingsMessage}
              settingsError={settingsError}
            />
          )}

          {activeSection === "ai" && (
            <AISection
              models={routerModels}
              settings={solverSettings}
              setSettings={setSolverSettings}
              loading={solverLoading}
              saving={solverSaving}
              onSave={saveAISolverSettings}
              message={settingsMessage}
              error={settingsError}
            />
          )}

          {activeSection === "corrections" && (
            <CorrectionSection />
          )}

          {activeSection === "analytics" && (
            <AnalyticsSection />
          )}
        </div>
      </section>

      {historyStudent && (
        <AdminStudentHistoryPanel
          student={historyStudent}
          onClose={() => setHistoryStudent(null)}
        />
      )}

      <style jsx global>{adminStyles}</style>
    </main>
  );
}

function DashboardSection({
  dashboard,
  solverSettings,
  loading,
  error,
}: {
  dashboard: DashboardData | null;
  solverSettings: SolverSettingsData | null;
  loading: boolean;
  error: string;
}) {
  const [costAlertThreshold, setCostAlertThreshold] = useState("500");
  const [costAlertLoading, setCostAlertLoading] = useState(true);
  const [costAlertSaving, setCostAlertSaving] = useState(false);
  const [costAlertMessage, setCostAlertMessage] = useState("");
  const [dashboardClassRows, setDashboardClassRows] = useState<Array<{
    classId: string; label: string; students: number; todayActive: number; todayQuestions: number; monthQuestions: number; monthCostTwd: number;
  }>>([]);

  useEffect(() => {
    let active = true;
    async function loadClassRows() {
      try {
        const response = await fetch("/api/admin/class-overview", { cache: "no-store" });
        const data = await response.json();
        if (active && response.ok) setDashboardClassRows(Array.isArray(data.rows) ? data.rows : []);
      } catch {
        // 班級統計失敗時仍保留總覽其他資訊
      }
    }
    void loadClassRows();
    return () => { active = false; };
  }, [dashboard?.month.questions]);

  useEffect(() => {
    let active = true;

    async function loadCostAlertSetting() {
      try {
        const response = await fetch("/api/admin/cost-alert-settings", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "讀取 API 成本警示設定失敗。");
        }

        if (active) {
          setCostAlertThreshold(String(data.monthlyThresholdTwd ?? 500));
        }
      } catch (loadError) {
        if (active) {
          setCostAlertMessage(
            loadError instanceof Error
              ? loadError.message
              : "讀取 API 成本警示設定失敗。",
          );
        }
      } finally {
        if (active) setCostAlertLoading(false);
      }
    }

    void loadCostAlertSetting();

    return () => {
      active = false;
    };
  }, []);

  async function saveCostAlertSetting() {
    const value = Number(costAlertThreshold);

    if (!Number.isFinite(value) || value <= 0 || value > 3000000) {
      setCostAlertMessage("警示金額必須大於 0，且不超過 NT$3,000,000。");
      return;
    }

    setCostAlertSaving(true);
    setCostAlertMessage("");

    try {
      const response = await fetch("/api/admin/cost-alert-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monthlyThresholdTwd: value,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "儲存 API 成本警示設定失敗。");
      }

      setCostAlertThreshold(String(data.monthlyThresholdTwd));
      setCostAlertMessage("API 成本警示金額已更新。");
    } catch (saveError) {
      setCostAlertMessage(
        saveError instanceof Error
          ? saveError.message
          : "儲存 API 成本警示設定失敗。",
      );
    } finally {
      setCostAlertSaving(false);
    }
  }

  const costAlertValue = Number(costAlertThreshold || 0);
  const isCostAlert =
    Boolean(dashboard) &&
    Number.isFinite(costAlertValue) &&
    costAlertValue > 0 &&
    usdToTwd(dashboard!.month.cost) >= costAlertValue;

  if (loading && !dashboard) {
    return <div className="hh-card admin-state-card">正在讀取管理資料…</div>;
  }

  if (error && !dashboard) {
    return <div className="admin-notice danger">{error}</div>;
  }

  if (!dashboard) return null;


  return (
    <div className="admin-stack admin-dashboard-stack">
      <section className="hh-card admin-panel admin-period-panel">
        <div className="admin-section-head compact">
          <div>
            <div className="hh-eyebrow">THIS MONTH · TODAY</div>
            <h2 className="hh-display">解題與成本概況</h2>
          </div>
          <span className="admin-section-note">快速掌握本月累積與今日即時使用</span>
        </div>

        <div className="admin-period-grid">
          <article className="admin-period-card period-month">
            <span>本月解題</span>
            <strong className="hh-number">{dashboard.month.questions} 題</strong>
            <small>平均每題 {formatTwdFromUsd(dashboard.month.averageCost)}</small>
          </article>

          <article className="admin-period-card period-today">
            <span>今日解題</span>
            <strong className="hh-number">{dashboard.today.questions} 題</strong>
            <small>{dashboard.today.students} 位學生使用</small>
          </article>

          <article className="admin-period-card period-month-cost">
            <span>本月 API 成本</span>
            <strong className="hh-number">{formatTwdFromUsd(dashboard.month.cost)}</strong>
            <small>本月累積</small>
          </article>

          <article className="admin-period-card period-today-cost">
            <span>今日 API 成本</span>
            <strong className="hh-number">{formatTwdFromUsd(dashboard.today.cost)}</strong>
            <small>平均 {formatTwdFromUsd(dashboard.today.averageCost)} / 題</small>
          </article>
        </div>

        <div className={`admin-cost-alert-strip ${isCostAlert ? "warning" : ""}`}>
          <div className="admin-cost-alert-status">
            <div className="hh-eyebrow">API COST ALERT</div>
            <strong>
              {isCostAlert
                ? `本月成本已達 ${formatTwdFromUsd(dashboard.month.cost)}`
                : `本月成本 ${formatTwdFromUsd(dashboard.month.cost)}`}
            </strong>
            <span>
              {isCostAlert
                ? `已達到你設定的 NT$${Math.round(costAlertValue).toLocaleString("zh-TW")} 警示門檻`
                : `達到設定金額時會顯示警示`}
            </span>
          </div>

          <div className="admin-cost-alert-controls">
            <label>
              <span>警示金額（NT$）</span>
              <input
                className="hh-input"
                type="number"
                min="0.01"
                max="3000000"
                step="10"
                value={costAlertThreshold}
                disabled={costAlertLoading || costAlertSaving}
                onChange={(event) => setCostAlertThreshold(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="hh-button-secondary"
              disabled={costAlertLoading || costAlertSaving}
              onClick={() => void saveCostAlertSetting()}
            >
              {costAlertSaving ? "儲存中…" : "設定警示"}
            </button>
          </div>
        </div>

        {costAlertMessage && (
          <div className={`admin-cost-alert-message ${costAlertMessage.includes("已更新") ? "success" : ""}`}>
            {costAlertMessage}
          </div>
        )}
      </section>

      <section className="hh-card admin-panel admin-routing-overview">
        <div className="admin-section-head compact">
          <div>
            <div className="hh-eyebrow">CURRENT AI ROUTING</div>
            <h2 className="hh-display">目前解題方式</h2>
          </div>
        </div>
        <div className="admin-routing-overview-grid">
          <article>
            <span>解題模式</span>
            <strong>{solverSettings?.mode === "single" ? "單模型" : "多模型"}</strong>
            <small>{solverSettings?.mode === "single" ? "只使用主要解題模型" : "依規則啟動驗算與仲裁"}</small>
          </article>
          <article>
            <span>主要解題模型</span>
            <strong>{solverSettings ? modelDisplayName(solverSettings.primary.model) : "讀取中…"}</strong>
            <small>{solverSettings ? `${solverSettings.primary.provider === "gemini" ? "Google" : "OpenAI"} · ${solverSettings.primary.reasoning}` : ""}</small>
          </article>
          <article>
            <span>驗算模型</span>
            <strong>{solverSettings?.mode === "multi" ? modelDisplayName(solverSettings.verifier.model) : "未啟用"}</strong>
            <small>{solverSettings?.mode === "multi" ? "發生需要驗算的題目時啟動" : "單模型模式"}</small>
          </article>
        </div>
      </section>

      <section className="hh-card admin-panel admin-overview-panel">
        <div className="admin-section-head">
          <div>
            <div className="hh-eyebrow">CLASS OVERVIEW</div>
            <h2 className="hh-display">各班使用狀況</h2>
            <p>使用完整地區・合作單位・班級名稱，快速比較今天與本月狀況。</p>
          </div>
        </div>

        <div className="admin-campus-summary-table-wrap">
          <table className="admin-campus-summary-table">
            <thead>
              <tr>
                <th>班級</th>
                <th>學生</th>
                <th>今日</th>
                <th>本月</th>
                <th>本月成本</th>
              </tr>
            </thead>
            <tbody>
              {dashboardClassRows.map((row) => (
                <tr key={row.classId}>
                  <td><strong>{row.label}</strong></td>
                  <td>{row.students}</td>
                  <td>{row.todayQuestions} 題</td>
                  <td>{row.monthQuestions} 題</td>
                  <td>NT$ {row.monthCostTwd.toFixed(1)}</td>
                </tr>
              ))}
              {dashboardClassRows.length === 0 && (
                <tr><td colSpan={5}>目前沒有班級統計資料。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {error && <div className="admin-notice danger">{error}</div>}
    </div>
  );
}

function StudentsSection(props: {
  mode: "classes" | "students";
  students: StudentRow[]; allStudents: StudentRow[]; total: number; active: number; inactive: number;
  loading: boolean; error: string; message: string;
  campusFilter: string; setCampusFilter: (value: string) => void;
  statusFilter: "全部" | "啟用" | "停用"; setStatusFilter: (value: "全部" | "啟用" | "停用") => void;
  query: string; setQuery: (value: string) => void; campusCount: (campus: string) => number;
  newCampus: string; setNewCampus: (campus: string) => void; newName: string; setNewName: (name: string) => void;
  adding: boolean; addStudent: () => Promise<void>; busyStudentId: string | null;
  toggleStudent: (student: StudentRow) => Promise<void>; resetStudentUsage: (student: StudentRow) => Promise<void>;
  resetStudentPin: (student: StudentRow) => Promise<void>; dailyLimit: number; viewStudentHistory: (student: StudentRow) => void;
  reloadStudents: () => Promise<void>;
  initialPin: string; setInitialPin: (value: string) => void;
  studentAuthLoading: boolean; studentAuthSaving: boolean; saveInitialPin: () => Promise<void>;
  settingsMessage: string; settingsError: string;
}) {
  type Region = { id: string; name: string; active: boolean };
  type Institution = { id: string; region_id: string; name: string; active: boolean };
  type ClassRow = { id: string; institution_id: string; name: string; active: boolean; academic_year?: number };
  type AssignmentDraft = { regionId: string; institutionId: string; classId: string };

  const [regions, setRegions] = useState<Region[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [regionId, setRegionId] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [classId, setClassId] = useState("");
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgMessage, setOrgMessage] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});
  const [filterRegion, setFilterRegion] = useState("");
  const [filterInstitution, setFilterInstitution] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [promotionSourceClass, setPromotionSourceClass] = useState("");
  const [promotionTargetClass, setPromotionTargetClass] = useState("");
  const currentAcademicYear = new Date().getFullYear();
  type BulkPreview = {
    totalRows: number;
    validCount: number;
    importableCount: number;
    duplicateInFile: string[];
    existing: string[];
    invalid: Array<{ value: string; reason: string }>;
    names: string[];
  };
  type BulkResult = { inserted: number; skipped: number; total: number };
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkInputKey, setBulkInputKey] = useState(0);
  type ClassOverviewRow = {
    classId: string; label: string; regionId?: string; regionName?: string; institutionName?: string; className?: string; academicYear?: number;
    students: number; todayActive: number; todayQuestions: number; monthQuestions: number; monthCostTwd: number;
  };
  type ClassSortKey = "name" | "students" | "todayActive" | "todayQuestions" | "monthQuestions" | "monthCostTwd";
  const [classOverview, setClassOverview] = useState<ClassOverviewRow[]>([]);
  const [overviewRegion, setOverviewRegion] = useState("");
  const [classSortKey, setClassSortKey] = useState<ClassSortKey>("name");
  const [classSortDirection, setClassSortDirection] = useState<"asc" | "desc">("asc");
  const [newStudentOpen, setNewStudentOpen] = useState(true);

  const institutionById = useMemo(() => new Map(institutions.map((item) => [item.id, item])), [institutions]);
  const regionById = useMemo(() => new Map(regions.map((item) => [item.id, item])), [regions]);

  function compactClassLabel(classRow: ClassRow) {
    return classRow.academic_year && classRow.academic_year !== currentAcademicYear
      ? `${classRow.academic_year} · ${classRow.name}`
      : classRow.name;
  }

  function contextualClassLabel(classRow: ClassRow, mode: "full" | "filter" = "full") {
    const institution = institutionById.get(classRow.institution_id);
    const region = institution ? regionById.get(institution.region_id) : undefined;
    const year = classRow.academic_year && classRow.academic_year !== currentAcademicYear ? `${classRow.academic_year} · ` : "";
    if (mode === "filter") {
      if (filterInstitution) return `${year}${classRow.name}`;
      if (filterRegion) return `${year}${institution?.name ?? "合作單位"} · ${classRow.name}`;
      return `${year}${region?.name ?? "地區"} · ${institution?.name ?? "合作單位"} · ${classRow.name}`;
    }
    return `${year}${region?.name ?? "地區"} · ${institution?.name ?? "合作單位"} · ${classRow.name}`;
  }

  const loadOrg = useCallback(async () => {
    const response = await fetch("/api/admin/organizations", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "讀取組織資料失敗。");

    const nextRegions = Array.isArray(data.regions) ? data.regions : [];
    const nextInstitutions = Array.isArray(data.institutions) ? data.institutions : [];
    const nextClasses = Array.isArray(data.classes) ? data.classes : [];

    setRegions(nextRegions);
    setInstitutions(nextInstitutions);
    setClasses(nextClasses);

    setRegionId((current) => current || nextRegions[0]?.id || "");
  }, []);

  useEffect(() => {
    void loadOrg().catch((error) =>
      setOrgMessage(error instanceof Error ? error.message : "讀取組織資料失敗。"),
    );
  }, [loadOrg]);

  useEffect(() => {
    const available = institutions.filter((item) => item.region_id === regionId);
    if (!available.some((item) => item.id === institutionId)) {
      setInstitutionId(available[0]?.id || "");
    }
  }, [regionId, institutions, institutionId]);

  useEffect(() => {
    const available = classes.filter((item) => item.institution_id === institutionId);
    if (!available.some((item) => item.id === classId)) {
      setClassId(available[0]?.id || "");
    }
  }, [institutionId, classes, classId]);

  const loadClassOverview = useCallback(async () => {
    if (props.mode !== "classes") return;
    try {
      const response = await fetch("/api/admin/class-overview", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setClassOverview(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      // 班級統計失敗不阻斷班級管理
    }
  }, [props.mode]);

  useEffect(() => { void loadClassOverview(); }, [loadClassOverview]);

  const filtered = props.allStudents.filter((student) => {
    if (filterRegion && student.region_id !== filterRegion) return false;
    if (filterInstitution && student.institution_id !== filterInstitution) return false;
    if (filterClass && student.class_id !== filterClass) return false;
    if (props.statusFilter === "啟用" && !student.active) return false;
    if (props.statusFilter === "停用" && student.active) return false;

    const keyword = props.query.trim().toLowerCase();
    return (
      !keyword ||
      student.name.toLowerCase().includes(keyword) ||
      (student.classes?.name || "").toLowerCase().includes(keyword) ||
      (student.institutions?.name || "").toLowerCase().includes(keyword) ||
      (student.regions?.name || "").toLowerCase().includes(keyword)
    );
  });

  const showStudentResults = Boolean(filterClass || props.query.trim());

  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const todayActive = props.allStudents.filter(
    (student) =>
      student.last_login_at &&
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(
        new Date(student.last_login_at),
      ) === todayKey,
  ).length;

  function getStudentDraft(student: StudentRow): AssignmentDraft {
    return (
      assignmentDrafts[student.id] ?? {
        regionId: student.region_id || regions[0]?.id || "",
        institutionId: student.institution_id || "",
        classId: student.class_id || "",
      }
    );
  }

  function isDraftDirty(student: StudentRow, draft = getStudentDraft(student)) {
    return (
      draft.regionId !== (student.region_id || "") ||
      draft.institutionId !== (student.institution_id || "") ||
      draft.classId !== (student.class_id || "")
    );
  }

  const dirtyStudents = props.allStudents.filter((student) => {
    const draft = assignmentDrafts[student.id];
    return draft ? isDraftDirty(student, draft) : false;
  });

  function changeStudentRegion(student: StudentRow, nextRegionId: string) {
    const nextInstitution = institutions.find((item) => item.region_id === nextRegionId);
    const nextClass = nextInstitution
      ? classes.find((item) => item.institution_id === nextInstitution.id)
      : undefined;

    setAssignmentDrafts((current) => ({
      ...current,
      [student.id]: {
        regionId: nextRegionId,
        institutionId: nextInstitution?.id || "",
        classId: nextClass?.id || "",
      },
    }));
  }

  function changeStudentInstitution(student: StudentRow, nextInstitutionId: string) {
    const draft = getStudentDraft(student);
    const nextClass = classes.find((item) => item.institution_id === nextInstitutionId);

    setAssignmentDrafts((current) => ({
      ...current,
      [student.id]: {
        ...draft,
        institutionId: nextInstitutionId,
        classId: nextClass?.id || "",
      },
    }));
  }

  function changeStudentClass(student: StudentRow, nextClassId: string) {
    const draft = getStudentDraft(student);
    setAssignmentDrafts((current) => ({
      ...current,
      [student.id]: { ...draft, classId: nextClassId },
    }));
  }

  async function orgCreate(type: "region" | "institution" | "class", parent?: string) {
    const label = type === "region" ? "地區" : type === "institution" ? "合作單位" : "班級";
    const name = window.prompt(`新增${label}名稱`);
    if (!name?.trim()) return;

    setOrgBusy(true);
    setOrgMessage("");
    try {
      const body: Record<string, string> = { type, name: name.trim() };
      if (type === "institution") body.regionId = parent || "";
      if (type === "class") {
        body.institutionId = parent || "";
        const suggestedYear = String(new Date().getFullYear());
        const year = window.prompt("這個班級屬於哪個學年度？例如 2026", suggestedYear)?.trim();
        if (!year) { setOrgBusy(false); return; }
        body.academicYear = year;
      }

      const response = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "新增失敗。");
      setOrgMessage(`已新增${label}：${name.trim()}`);
      await loadOrg();
    } catch (error) {
      setOrgMessage(error instanceof Error ? error.message : "新增失敗。");
    } finally {
      setOrgBusy(false);
    }
  }

  async function orgDelete(type: "region" | "institution" | "class", id: string, name: string) {
    if (!confirm(`確定刪除「${name}」？有學生或下層資料時系統會阻止刪除。`)) return;

    setOrgBusy(true);
    setOrgMessage("");
    try {
      const response = await fetch("/api/admin/organizations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "刪除失敗。");
      setOrgMessage(`已刪除 ${name}`);
      await loadOrg();
    } catch (error) {
      setOrgMessage(error instanceof Error ? error.message : "刪除失敗。");
    } finally {
      setOrgBusy(false);
    }
  }

  async function assign(student: StudentRow, draft: AssignmentDraft) {
    if (!draft.regionId || !draft.institutionId || !draft.classId) {
      setOrgMessage("請完整選擇地區、合作單位與班級。");
      return;
    }

    setOrgBusy(true);
    setOrgMessage(`正在更新 ${student.name}…`);
    try {
      const response = await fetch("/api/admin/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: student.id,
          regionId: draft.regionId,
          institutionId: draft.institutionId,
          classId: draft.classId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "更新班級失敗。");

      setAssignmentDrafts((current) => {
        const next = { ...current };
        delete next[student.id];
        return next;
      });
      setOrgMessage(`已更新 ${student.name} 的班級。`);
      await props.reloadStudents();
    } catch (error) {
      setOrgMessage(error instanceof Error ? error.message : "更新班級失敗。");
    } finally {
      setOrgBusy(false);
    }
  }

  async function saveAllAssignments() {
    const pending = props.allStudents
      .map((student) => ({ student, draft: assignmentDrafts[student.id] }))
      .filter(({ student, draft }) => draft && isDraftDirty(student, draft));

    if (!pending.length) {
      setOrgMessage("目前沒有尚未儲存的分班變更。");
      return;
    }

    if (!confirm(`確定一次儲存 ${pending.length} 位學生的分班變更？`)) return;

    setOrgBusy(true);
    setOrgMessage(`正在儲存 ${pending.length} 位學生…`);
    try {
      const results = await Promise.all(
        pending.map(async ({ student, draft }) => {
          const response = await fetch("/api/admin/students", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: student.id,
              regionId: draft!.regionId,
              institutionId: draft!.institutionId,
              classId: draft!.classId,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(`${student.name}：${data.error || "更新失敗"}`);
          return student.id;
        }),
      );

      setAssignmentDrafts((current) => {
        const next = { ...current };
        results.forEach((id) => delete next[id]);
        return next;
      });
      await props.reloadStudents();
      setOrgMessage(`已一次儲存 ${results.length} 位學生的分班變更。`);
    } catch (error) {
      setOrgMessage(error instanceof Error ? error.message : "批次儲存分班失敗。");
    } finally {
      setOrgBusy(false);
    }
  }

  async function deleteStudent(student: StudentRow) {
    const typed = window.prompt(`確定要永久刪除「${student.name}」嗎？\n這會一併刪除他的額度與解題紀錄。\n請輸入學生姓名「${student.name}」確認：`);
    if (typed !== student.name) return;
    setOrgBusy(true);
    setOrgMessage(`正在刪除 ${student.name}…`);
    try {
      const response = await fetch("/api/admin/students", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: student.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "刪除學生失敗。");
      setAssignmentDrafts((current) => { const next = { ...current }; delete next[student.id]; return next; });
      setExpanded(null);
      setOrgMessage(`已永久刪除 ${student.name}。`);
      await props.reloadStudents();
    } catch (error) {
      setOrgMessage(error instanceof Error ? error.message : "刪除學生失敗。");
    } finally {
      setOrgBusy(false);
    }
  }

  async function createStudent() {
    const name = props.newName.trim();
    if (!name || !regionId || !institutionId || !classId) {
      setOrgMessage("請輸入姓名並完整選擇地區、合作單位、班級。");
      return;
    }

    setOrgBusy(true);
    setOrgMessage("正在新增學生…");
    try {
      const response = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          regionId,
          institutionId,
          classId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "新增學生失敗。");

      props.setNewName("");
      setOrgMessage(`已新增 ${name}`);
      await props.reloadStudents();
    } catch (error) {
      setOrgMessage(error instanceof Error ? error.message : "新增學生失敗。");
    } finally {
      setOrgBusy(false);
    }
  }

  async function sendBulkStudentFile(action: "preview" | "import") {
    if (!bulkFile || !regionId || !institutionId || !classId) {
      setOrgMessage("請先選擇地區、合作單位、班級，再選擇 CSV 或 Excel 名單。");
      return;
    }

    setBulkBusy(true);
    setBulkResult(null);
    setOrgMessage(action === "preview" ? "正在檢查學生名單…" : "正在批次匯入學生…");
    try {
      const form = new FormData();
      form.append("action", action);
      form.append("regionId", regionId);
      form.append("institutionId", institutionId);
      form.append("classId", classId);
      form.append("file", bulkFile);

      const response = await fetch("/api/admin/students/bulk", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "批次匯入失敗。");

      if (action === "preview") {
        setBulkPreview(data.preview as BulkPreview);
        setOrgMessage(`名單檢查完成：可匯入 ${data.preview?.importableCount ?? 0} 位學生。`);
      } else {
        setBulkResult({ inserted: Number(data.inserted || 0), skipped: Number(data.skipped || 0), total: Number(data.total || 0) });
        setOrgMessage(`批次匯入完成：新增 ${data.inserted ?? 0} 位，跳過 ${data.skipped ?? 0} 位。`);
        setBulkPreview(null);
        setBulkFile(null);
        setBulkInputKey((value) => value + 1);
        await props.reloadStudents();
      }
    } catch (error) {
      setOrgMessage(error instanceof Error ? error.message : "批次匯入失敗。");
    } finally {
      setBulkBusy(false);
    }
  }

  async function promoteWholeClass() {
    if (!promotionSourceClass || !promotionTargetClass || promotionSourceClass === promotionTargetClass) {
      setOrgMessage("請選擇不同的來源班級與目標班級。");
      return;
    }
    const source = classes.find((item) => item.id === promotionSourceClass);
    const target = classes.find((item) => item.id === promotionTargetClass);
    const count = props.allStudents.filter((student) => student.class_id === promotionSourceClass).length;
    if (!confirm(`確定將「${source ? contextualClassLabel(source) : "來源班級"}」的 ${count} 位學生，整班升到「${target ? contextualClassLabel(target) : "目標班級"}」？\n\n原班級不會被改名，升班紀錄會保留。`)) return;
    setOrgBusy(true); setOrgMessage("正在整班升班…");
    try {
      const response = await fetch("/api/admin/organizations", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote_class", sourceClassId: promotionSourceClass, targetClassId: promotionTargetClass }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "升班失敗。");
      setOrgMessage(`升班完成：已移動 ${data.moved ?? 0} 位學生。`);
      setAssignmentDrafts({});
      await Promise.all([loadOrg(), props.reloadStudents()]);
    } catch (error) { setOrgMessage(error instanceof Error ? error.message : "升班失敗。"); }
    finally { setOrgBusy(false); }
  }

  const promotionSource = classes.find((item) => item.id === promotionSourceClass);
  const promotionSourceInstitution = promotionSource ? institutionById.get(promotionSource.institution_id) : undefined;
  const promotionSourceRegion = promotionSourceInstitution ? regionById.get(promotionSourceInstitution.region_id) : undefined;
  const promotionSourceCount = props.allStudents.filter((student) => student.class_id === promotionSourceClass).length;
  const promotionTargets = promotionSource
    ? classes.filter((item) => item.id !== promotionSource.id && item.institution_id === promotionSource.institution_id && (item.academic_year || currentAcademicYear) >= (promotionSource.academic_year || currentAcademicYear))
    : [];

  const visibleInstitutions = institutions.filter((item) => item.region_id === regionId);
  const visibleClasses = classes.filter((item) => item.institution_id === institutionId);
  const overviewRows = classOverview
    .filter((row) => !overviewRegion || row.regionId === overviewRegion || row.regionName === regions.find((item) => item.id === overviewRegion)?.name)
    .sort((a, b) => {
      const direction = classSortDirection === "asc" ? 1 : -1;
      if (classSortKey === "name") return a.label.localeCompare(b.label, "zh-Hant") * direction;
      return (Number(a[classSortKey]) - Number(b[classSortKey])) * direction;
    });
  function toggleClassSort(key: ClassSortKey) {
    if (classSortKey === key) setClassSortDirection((current) => current === "asc" ? "desc" : "asc");
    else { setClassSortKey(key); setClassSortDirection(key === "name" ? "asc" : "desc"); }
  }

  return (
    <div className={`admin-stack org-students-v12 mode-${props.mode}`}>
      <section className="admin-student-summary-strip student-only">
        <article><span>學生總數</span><strong>{props.total}</strong><small>人</small></article>
        <article><span>啟用中</span><strong>{props.active}</strong><small>人</small></article>
        <article><span>今日活躍</span><strong>{todayActive}</strong><small>人</small></article>
      </section>

      <section className="hh-card admin-panel org-compact-panel class-only">
        <PanelHeader eyebrow="CLASS OVERVIEW" title="各班級總覽" subtitle="選地區後查看；點欄位即可依學生、活躍、題數或成本排序" />
        <div className="class-overview-toolbar">
          <select className="hh-select" value={overviewRegion} onChange={(event) => setOverviewRegion(event.target.value)}>
            <option value="">全部地區</option>
            {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
          <span>{overviewRows.length} 個班級</span>
        </div>
        <div className="class-overview-grid">
          <div className="class-overview-grid-head">
            <button type="button" onClick={() => toggleClassSort("name")}>班級 {classSortKey === "name" ? (classSortDirection === "asc" ? "↑" : "↓") : ""}</button>
            <button type="button" onClick={() => toggleClassSort("students")}>學生 {classSortKey === "students" ? (classSortDirection === "asc" ? "↑" : "↓") : ""}</button>
            <button type="button" onClick={() => toggleClassSort("todayActive")}>活躍 {classSortKey === "todayActive" ? (classSortDirection === "asc" ? "↑" : "↓") : ""}</button>
            <button type="button" onClick={() => toggleClassSort("todayQuestions")}>今日 {classSortKey === "todayQuestions" ? (classSortDirection === "asc" ? "↑" : "↓") : ""}</button>
            <button type="button" onClick={() => toggleClassSort("monthQuestions")}>本月 {classSortKey === "monthQuestions" ? (classSortDirection === "asc" ? "↑" : "↓") : ""}</button>
            <button type="button" onClick={() => toggleClassSort("monthCostTwd")}>月成本 {classSortKey === "monthCostTwd" ? (classSortDirection === "asc" ? "↑" : "↓") : ""}</button>
          </div>
          {overviewRows.length === 0 ? <div className="admin-empty">目前沒有符合條件的班級。</div> : overviewRows.map((row) => (
            <article className="class-overview-grid-row" key={row.classId}>
              <div className="class-overview-name"><strong>{row.className || row.label}</strong><small>{row.regionName || ""}{row.institutionName ? ` · ${row.institutionName}` : ""}</small></div>
              <span><b>{row.students}</b><small>學生</small></span><span><b>{row.todayActive}</b><small>活躍</small></span><span><b>{row.todayQuestions}</b><small>今日題</small></span><span><b>{row.monthQuestions}</b><small>本月題</small></span><span><b>NT${row.monthCostTwd.toFixed(1)}</b><small>月成本</small></span>
            </article>
          ))}
        </div>
      </section>

      <section className="hh-card admin-panel org-manager class-only">
        <PanelHeader
          eyebrow="ORGANIZATION"
          title="地區・合作單位・班級"
          subtitle="可自由新增地區、合作補習班與班級；有學生時不可誤刪"
        />
        <div className="org-columns">
          <div className="org-column-block">
            <div className="org-head"><b>地區</b><button onClick={() => void orgCreate("region")} disabled={orgBusy}>＋</button></div>
            <div className="org-chip-list">
              {regions.map((region) => (
                <div className={`org-item ${regionId === region.id ? "active" : ""}`} key={region.id}>
                  <button onClick={() => setRegionId(region.id)}>{region.name}</button>
                  <button className="del" onClick={() => void orgDelete("region", region.id, region.name)}>×</button>
                </div>
              ))}
            </div>
          </div>

          <div className="org-column-block">
            <div className="org-head"><b>合作單位</b><button onClick={() => void orgCreate("institution", regionId)} disabled={!regionId || orgBusy}>＋</button></div>
            <div className="org-chip-list">
              {visibleInstitutions.map((institution) => (
                <div className={`org-item ${institutionId === institution.id ? "active" : ""}`} key={institution.id}>
                  <button onClick={() => setInstitutionId(institution.id)}>{institution.name}</button>
                  <button className="del" onClick={() => void orgDelete("institution", institution.id, institution.name)}>×</button>
                </div>
              ))}
            </div>
          </div>

          <div className="org-column-block">
            <div className="org-head"><b>班級</b><button onClick={() => void orgCreate("class", institutionId)} disabled={!institutionId || orgBusy}>＋</button></div>
            <div className="org-chip-list">
              {visibleClasses.map((classRow) => (
                <div className={`org-item ${classId === classRow.id ? "active" : ""}`} key={classRow.id}>
                  <button onClick={() => setClassId(classRow.id)}>{compactClassLabel(classRow)}</button>
                  <button className="del" onClick={() => void orgDelete("class", classRow.id, classRow.name)}>×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        {orgMessage && <div className="org-message">{orgMessage}</div>}
      </section>

      <section className="hh-card admin-panel org-compact-panel promotion-panel class-only">
        <PanelHeader eyebrow="ACADEMIC YEAR" title="班級升班" subtitle="先選原班級，再只顯示同一合作單位可升入的目標班級；舊班級與歷史紀錄都會保留" />
        <div className="promotion-flow">
          <label><span>1 · 選擇原班級</span><select className="hh-select" value={promotionSourceClass} onChange={(event) => { setPromotionSourceClass(event.target.value); setPromotionTargetClass(""); }}>
            <option value="">選擇地區・合作單位・班級</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{contextualClassLabel(item)}</option>)}
          </select></label>
          <div className="promotion-summary">
            <strong>{promotionSource ? `${promotionSourceRegion?.name || ""} · ${promotionSourceInstitution?.name || ""} · ${compactClassLabel(promotionSource)}` : "尚未選擇原班級"}</strong>
            <span>{promotionSource ? `目前 ${promotionSourceCount} 位學生` : "選擇後會顯示班級資訊"}</span>
          </div>
          <label><span>2 · 選擇升入班級</span><select className="hh-select" value={promotionTargetClass} disabled={!promotionSourceClass} onChange={(event) => setPromotionTargetClass(event.target.value)}>
            <option value="">{promotionSourceClass ? "選擇同單位的目標班級" : "請先選原班級"}</option>
            {promotionTargets.map((item) => <option key={item.id} value={item.id}>{compactClassLabel(item)}</option>)}
          </select></label>
          <button className="hh-button-primary promotion-button" disabled={orgBusy || !promotionSourceClass || !promotionTargetClass || promotionSourceCount === 0} onClick={() => void promoteWholeClass()}>3 · 確認整班升班</button>
        </div>
      </section>

      <section className="hh-card admin-panel org-compact-panel student-only student-create-hub">
        <button type="button" className="student-create-toggle" onClick={() => setNewStudentOpen((current) => !current)}>
          <span><small>STUDENT CREATE</small><strong>新增學生</strong><em>新增學生・批次匯入學生名單</em></span><b>{newStudentOpen ? "收合 −" : "展開 ＋"}</b>
        </button>
        {newStudentOpen && <div className="student-create-body">      <div className="student-create-subpanel">
        <PanelHeader
          eyebrow="NEW STUDENT"
          title="新增學生"
          subtitle="細部分班只供老師後台管理"
        />
        <div className="org-add-row">
          <select value={regionId} onChange={(event) => setRegionId(event.target.value)} className="hh-select">
            {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
          <select value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} className="hh-select">
            {visibleInstitutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
          </select>
          <select value={classId} onChange={(event) => setClassId(event.target.value)} className="hh-select">
            {visibleClasses.map((classRow) => <option key={classRow.id} value={classRow.id}>{compactClassLabel(classRow)}</option>)}
          </select>
          <input className="hh-input" placeholder="學生姓名" value={props.newName} onChange={(event) => props.setNewName(event.target.value)} />
          <button className="hh-button-primary" onClick={() => void createStudent()} disabled={orgBusy}>新增</button>
        </div>
      </div>

      <div className="student-create-subpanel bulk-import-panel">
        <PanelHeader
          eyebrow="BULK IMPORT"
          title="批次匯入學生"
          subtitle="CSV 或 Excel (.xlsx) 都可以；先檢查名單，再一次建立學生帳號與初始密碼"
        />
        <div className="bulk-target-class">
          <span>匯入目標</span>
          <strong>{classId ? `${regions.find((item) => item.id === regionId)?.name || "地區"} · ${institutions.find((item) => item.id === institutionId)?.name || "合作單位"} · ${classes.find((item) => item.id === classId) ? compactClassLabel(classes.find((item) => item.id === classId)!) : "班級"}` : "請先選擇班級"}</strong>
        </div>
        <div className="bulk-import-controls">
          <label className="bulk-file-picker">
            <input
              key={bulkInputKey}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setBulkFile(file);
                setBulkPreview(null);
                setBulkResult(null);
              }}
            />
            <span>{bulkFile ? bulkFile.name : "選擇 CSV / Excel 名單"}</span>
          </label>
          <button className="hh-button-secondary" type="button" disabled={bulkBusy || !bulkFile || !classId} onClick={() => void sendBulkStudentFile("preview")}>
            {bulkBusy ? "檢查中…" : "檢查名單"}
          </button>
        </div>

        {bulkPreview && (
          <div className="bulk-preview-box">
            <div className="bulk-preview-stats">
              <article><span>辨識</span><strong>{bulkPreview.totalRows}</strong><small>筆</small></article>
              <article><span>可匯入</span><strong>{bulkPreview.importableCount}</strong><small>人</small></article>
              <article><span>已存在</span><strong>{bulkPreview.existing.length}</strong><small>人</small></article>
              <article><span>需略過</span><strong>{bulkPreview.duplicateInFile.length + bulkPreview.invalid.length}</strong><small>筆</small></article>
            </div>
            <div className="bulk-preview-names">
              {bulkPreview.names.slice(0, 18).map((name) => <span key={name}>{name}</span>)}
              {bulkPreview.names.length > 18 && <span>＋{bulkPreview.names.length - 18} 位</span>}
            </div>
            {(bulkPreview.existing.length > 0 || bulkPreview.duplicateInFile.length > 0 || bulkPreview.invalid.length > 0) && (
              <div className="bulk-warning">
                {bulkPreview.existing.length > 0 && <p>已存在，將跳過：{bulkPreview.existing.slice(0, 8).join("、")}{bulkPreview.existing.length > 8 ? "…" : ""}</p>}
                {bulkPreview.duplicateInFile.length > 0 && <p>名單內重複：{bulkPreview.duplicateInFile.slice(0, 8).join("、")}{bulkPreview.duplicateInFile.length > 8 ? "…" : ""}</p>}
                {bulkPreview.invalid.length > 0 && <p>格式需略過：{bulkPreview.invalid.slice(0, 5).map((item) => item.value || "空白").join("、")}{bulkPreview.invalid.length > 5 ? "…" : ""}</p>}
              </div>
            )}
            <button
              className="hh-button-primary bulk-confirm-button"
              type="button"
              disabled={bulkBusy || bulkPreview.importableCount === 0}
              onClick={() => {
                if (confirm(`確定將 ${bulkPreview.importableCount} 位學生匯入目前班級？\n\n每位學生都會套用目前的共用初始密碼，首次登入必須改成個人密碼。`)) void sendBulkStudentFile("import");
              }}
            >
              {bulkBusy ? "匯入中…" : `確認匯入 ${bulkPreview.importableCount} 位學生`}
            </button>
          </div>
        )}

        {bulkResult && <div className="admin-notice success">匯入完成：成功新增 {bulkResult.inserted} 位，跳過 {bulkResult.skipped} 位。</div>}
      </div></div>}
      </section>


      {(props.error || props.message) && (
        <div className={`admin-notice ${props.error ? "danger" : "success"}`}>{props.error || props.message}</div>
      )}

      <section className="hh-card admin-panel org-compact-panel student-only">
        <div className="student-directory-head">
          <PanelHeader eyebrow="STUDENT DIRECTORY" title="學生名單" subtitle={showStudentResults ? `目前顯示 ${filtered.length} / ${props.total} 位學生` : `共 ${props.total} 位學生 · 選擇班級或搜尋姓名後顯示名單`} />
          <button
            type="button"
            className={`bulk-save-button ${dirtyStudents.length ? "has-change" : ""}`}
            disabled={orgBusy || dirtyStudents.length === 0}
            onClick={() => void saveAllAssignments()}
          >
            {orgBusy ? "儲存中…" : dirtyStudents.length ? `儲存全部變更 (${dirtyStudents.length})` : "沒有待儲存變更"}
          </button>
        </div>
        <div className="org-filter-row">
          <select className="hh-select" value={filterRegion} onChange={(event) => { setFilterRegion(event.target.value); setFilterInstitution(""); setFilterClass(""); }}>
            <option value="">全部地區</option>
            {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
          <select className="hh-select" value={filterInstitution} onChange={(event) => { setFilterInstitution(event.target.value); setFilterClass(""); }}>
            <option value="">全部合作單位</option>
            {institutions.filter((item) => !filterRegion || item.region_id === filterRegion).map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
          </select>
          <select className="hh-select" value={filterClass} onChange={(event) => setFilterClass(event.target.value)}>
            <option value="">全部班級</option>
            {classes.filter((item) => !filterInstitution || item.institution_id === filterInstitution).map((classRow) => <option key={classRow.id} value={classRow.id}>{contextualClassLabel(classRow, "filter")}</option>)}
          </select>
          <input className="hh-input" placeholder="搜尋學生…" value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
          <select className="hh-select" value={props.statusFilter} onChange={(event) => props.setStatusFilter(event.target.value as "全部" | "啟用" | "停用")}>
            <option>全部</option><option>啟用</option><option>停用</option>
          </select>
        </div>

        <div className="compact-student-list">
          {!showStudentResults ? (
            <div className="admin-empty student-list-gate">請先選擇班級，或直接搜尋學生姓名。</div>
          ) : props.loading ? (
            <div className="admin-empty">讀取中…</div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">找不到符合條件的學生。</div>
          ) : (
            filtered.map((student) => {
              const open = expanded === student.id;
              const draft = getStudentDraft(student);
              const studentInstitutions = institutions.filter((item) => item.region_id === draft.regionId);
              const studentClasses = classes.filter((item) => item.institution_id === draft.institutionId);

              return (
                <article className={`compact-student ${open ? "open" : ""} ${isDraftDirty(student, draft) ? "dirty" : ""}`} key={student.id}>
                  <button
                    className="compact-main"
                    onClick={() => {
                      setExpanded(open ? null : student.id);
                      if (!open) {
                        setAssignmentDrafts((current) =>
                          current[student.id]
                            ? current
                            : {
                                ...current,
                                [student.id]: {
                                  regionId: student.region_id || regions[0]?.id || "",
                                  institutionId: student.institution_id || "",
                                  classId: student.class_id || "",
                                },
                              },
                        );
                      }
                    }}
                  >
                    <span className="mini-avatar">{student.name.slice(0, 1)}</span>
                    <span className="student-core">
                      <strong>{student.name}</strong>
                      <small>{student.regions?.name || student.campus} · {student.institutions?.name || "未指定單位"} · {student.classes?.name || "未分班"}</small>
                    </span>
                    <span className="usage-mini">{student.todayCount}/{props.dailyLimit}</span>
                    <span className={`dot ${student.active ? "on" : ""}`} />
                    <span className="chev">{open ? "⌃" : "⌄"}</span>
                  </button>

                  {open && (
                    <div className="compact-detail">
                      <div className="assign-row">
                        <select className="hh-select" value={draft.regionId} onChange={(event) => changeStudentRegion(student, event.target.value)}>
                          {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
                        </select>
                        <select className="hh-select" value={draft.institutionId} onChange={(event) => changeStudentInstitution(student, event.target.value)}>
                          {studentInstitutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
                        </select>
                        <select className="hh-select" value={draft.classId} onChange={(event) => changeStudentClass(student, event.target.value)}>
                          {studentClasses.map((classRow) => <option key={classRow.id} value={classRow.id}>{compactClassLabel(classRow)}</option>)}
                        </select>
                        <button className="admin-mini-button assign-save-button" disabled={orgBusy} onClick={() => void assign(student, draft)}>
                          {orgBusy ? "儲存中…" : "儲存分班"}
                        </button>
                      </div>

                      <div className="action-row">
                        <button className="admin-mini-button history" onClick={() => props.viewStudentHistory(student)}>紀錄</button>
                        <button className="admin-mini-button usage-action" onClick={() => void props.resetStudentUsage(student)}>重置額度</button>
                        <button className="admin-mini-button pin-action" onClick={() => void props.resetStudentPin(student)}>重設密碼</button>
                        <button className="admin-mini-button delete-student" onClick={() => void deleteStudent(student)}>刪除學生</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>


      <div className="student-only integrated-pin-section student-pin-last">
        <PinSection
          initialPin={props.initialPin}
          setInitialPin={props.setInitialPin}
          loading={props.studentAuthLoading}
          saving={props.studentAuthSaving}
          onSave={props.saveInitialPin}
          message={props.settingsMessage}
          error={props.settingsError}
        />
      </div>

      <style jsx global>{`
        .org-students-v12 { width: 100%; max-width: 100%; }
        .mode-classes .student-only { display:none !important; }
        .mode-students .class-only { display:none !important; }
        .promotion-flow { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(180px,.8fr) minmax(0,1fr) auto; gap:10px; align-items:end; }
        .promotion-flow label { display:grid; gap:6px; min-width:0; }
        .promotion-flow label > span { font-size:12px; color:var(--text-secondary); font-weight:800; }
        .promotion-summary { min-height:48px; display:grid; align-content:center; gap:2px; padding:8px 10px; border:1px solid var(--border); border-radius:10px; background:var(--surface-soft); min-width:0; }
        .promotion-summary strong,.promotion-summary span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .promotion-summary span { font-size:11px; color:var(--text-secondary); }
        .student-create-hub{padding:0;overflow:hidden}.student-create-toggle{width:100%;border:0;background:transparent;color:var(--text);padding:16px 18px;display:flex;align-items:center;justify-content:space-between;text-align:left;cursor:pointer}.student-create-toggle span{display:grid;gap:3px}.student-create-toggle small{font-size:10px;letter-spacing:.18em;color:var(--text-secondary);font-weight:900}.student-create-toggle strong{font-size:20px}.student-create-toggle em{font-style:normal;font-size:12px;color:var(--text-secondary)}.student-create-toggle>b{font-size:12px;color:var(--text-secondary)}.student-create-body{display:grid;gap:12px;padding:0 14px 14px}.student-create-subpanel{padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface-soft)}.student-pin-last{margin-top:2px}.class-overview-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0}.class-overview-toolbar .hh-select{max-width:220px}.class-overview-toolbar span{font-size:12px;color:var(--text-secondary);white-space:nowrap}.class-overview-grid{border:1px solid var(--border);border-radius:12px;overflow:hidden}.class-overview-grid-head,.class-overview-grid-row{display:grid;grid-template-columns:minmax(220px,2fr) repeat(5,minmax(78px,1fr));align-items:center}.class-overview-grid-head{background:var(--surface-soft);border-bottom:1px solid var(--border)}.class-overview-grid-head button{border:0;background:transparent;color:var(--text-secondary);font-weight:850;font-size:12px;padding:11px 10px;text-align:left;cursor:pointer}.class-overview-grid-row{border-bottom:1px solid var(--border);padding:10px}.class-overview-grid-row:last-child{border-bottom:0}.class-overview-grid-row>span{display:grid;gap:2px}.class-overview-grid-row>span b{font-size:14px}.class-overview-grid-row>span small,.class-overview-name small{font-size:10px;color:var(--text-secondary)}.class-overview-name{display:grid;gap:2px}.class-overview-name strong{font-size:14px}.class-overview-name small{white-space:normal}
        .class-overview-table { display:grid; margin-top:10px; border:1px solid var(--border); border-radius:12px; overflow:hidden; }
        .class-overview-head,.class-overview-row { display:grid; grid-template-columns:minmax(180px,2.2fr) repeat(4,minmax(64px,.7fr)) minmax(90px,.9fr); gap:8px; align-items:center; padding:10px 12px; }
        .class-overview-head { background:var(--surface-soft); color:var(--text-secondary); font-size:11px; font-weight:900; }
        .class-overview-row { border-top:1px solid var(--border); font-size:13px; }
        .class-overview-row span:not(:last-child) { text-align:center; }
        .class-overview-row span:last-child { text-align:right; font-variant-numeric:tabular-nums; }
        .action-row .delete-student { background:color-mix(in srgb,#a84d4d 15%,var(--surface)); border-color:color-mix(in srgb,#a84d4d 55%,var(--border)); color:#df9a9a; }
        .org-manager, .org-compact-panel { width: 100%; box-sizing: border-box; }
        .org-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .org-column-block { min-width: 0; }
        .org-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px; }
        .org-head button { border: 1px solid var(--border); background: var(--surface); border-radius: 8px; width: 28px; height: 28px; }
        .org-chip-list { min-width: 0; }
        .org-item { display: grid; grid-template-columns: minmax(0, 1fr) 28px; border: 1px solid var(--border); border-radius: 9px; margin: 5px 0; overflow: hidden; }
        .org-item > button { min-width: 0; border: 0; background: transparent; text-align: left; padding: 8px 10px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .org-item.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 7%, var(--surface)); }
        .org-item .del { text-align: center; padding: 0; color: var(--text-secondary); }
        .org-add-row, .org-filter-row { display: grid; grid-template-columns: minmax(110px, .8fr) minmax(150px, 1.2fr) minmax(110px, .8fr) minmax(150px, 1.2fr) auto; gap: 8px; align-items: center; }
        .org-message { margin-top: 10px; font-size: 13px; color: var(--primary); }
        .compact-student-list { display: grid; border-top: 1px solid var(--border); margin-top: 12px; }
        .compact-student { border-bottom: 1px solid var(--border); }
        .compact-main { width: 100%; display: grid; grid-template-columns: 34px minmax(0, 1fr) 48px 12px 20px; gap: 9px; align-items: center; padding: 9px 4px; border: 0; background: transparent; color: var(--text); text-align: left; }
        .mini-avatar { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-soft); font-weight: 700; }
        .student-core { min-width: 0; display: grid; }
        .student-core strong { font-size: 14px; }
        .student-core small { font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .usage-mini { text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #aaa; }
        .dot.on { background: #6f927a; }
        .chev { text-align: center; color: var(--text-secondary); }
        .compact-detail { padding: 8px 4px 12px 47px; display: grid; gap: 8px; }
        .assign-row { display: grid; grid-template-columns: minmax(90px, .8fr) minmax(140px, 1.2fr) minmax(100px, .9fr) auto; gap: 7px; }
        .assign-save-button { white-space: nowrap; }
        .action-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .student-directory-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }

        .promotion-row { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto; gap:8px; align-items:center; }
        .promotion-arrow { font-weight:900; color:var(--text-secondary); text-align:center; }
        .promotion-button { min-height:38px; white-space:nowrap; }
        .bulk-save-button { min-height: 36px; padding: 0 13px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-soft); color: var(--text-secondary); font-weight: 800; white-space: nowrap; }
        .bulk-save-button.has-change { background: color-mix(in srgb, #4f7d62 18%, var(--surface)); border-color: color-mix(in srgb, #4f7d62 55%, var(--border)); color: color-mix(in srgb, #8eb79b 80%, var(--text)); }
        .compact-student.dirty { box-shadow: inset 3px 0 0 #c79b55; }
        .action-row .history { background: color-mix(in srgb, #4f7fa7 18%, var(--surface)); border-color: color-mix(in srgb, #4f7fa7 52%, var(--border)); color: #9fc0dc; }
        .action-row .usage-action { background: color-mix(in srgb, #b58a45 18%, var(--surface)); border-color: color-mix(in srgb, #b58a45 52%, var(--border)); color: #d8b878; }
        .action-row .pin-action { background: color-mix(in srgb, #7d66a7 18%, var(--surface)); border-color: color-mix(in srgb, #7d66a7 52%, var(--border)); color: #b7a6d4; }
        .action-row .danger { background: color-mix(in srgb, #aa5d5d 17%, var(--surface)); border-color: color-mix(in srgb, #aa5d5d 52%, var(--border)); color: #d98b8b; }
        .action-row .success { background: color-mix(in srgb, #568665 18%, var(--surface)); border-color: color-mix(in srgb, #568665 52%, var(--border)); color: #91bd9d; }
        .student-list-gate { min-height: 84px; display:grid; place-items:center; border:1px dashed var(--border); border-radius:12px; margin-top:10px; }
        .integrated-pin-section .admin-stack { gap:8px; }
        .integrated-pin-section .admin-panel { padding:12px 14px; }
        .integrated-pin-section .admin-notice.warning { margin-top:0; font-size:11px; }

        @media (max-width: 760px) {
          .class-overview-grid{border:0;overflow:visible}.class-overview-grid-head{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;border:0;background:transparent;margin-bottom:8px}.class-overview-grid-head button{font-size:10px;padding:8px 5px;border:1px solid var(--border);border-radius:8px;background:var(--surface-soft);text-align:center}.class-overview-grid-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;padding:10px}.class-overview-name{grid-column:1/-1;border-bottom:1px solid var(--border);padding-bottom:8px}.class-overview-grid-row>span{padding:3px 0}.class-overview-grid-row>span b{font-size:13px}.class-overview-toolbar .hh-select{max-width:none;flex:1}.student-create-body{padding:0 10px 10px}.student-create-subpanel{padding:10px}.student-create-toggle{padding:14px}.student-create-toggle strong{font-size:18px}

          .org-students-v12 { width: calc(100% + 6px); margin-left: -3px; }
          .org-students-v12 .admin-panel { padding: 10px !important; border-radius: 12px !important; }
          .org-students-v12 .admin-student-summary-strip { gap: 6px !important; }
          .org-students-v12 .admin-student-summary-strip article { padding: 8px 9px !important; }

          .org-columns { grid-template-columns: 1fr; gap: 8px; }
          .org-column-block { border-bottom: 1px solid var(--border); padding-bottom: 7px; }
          .org-column-block:last-child { border-bottom: 0; padding-bottom: 0; }
          .org-head { margin-bottom: 5px; }
          .org-chip-list { display: flex; gap: 6px; overflow-x: auto; padding: 1px 1px 4px; scrollbar-width: none; }
          .org-chip-list::-webkit-scrollbar { display: none; }
          .org-item { flex: 0 0 auto; min-width: 98px; max-width: 190px; margin: 0; grid-template-columns: minmax(0, 1fr) 25px; }
          .org-item > button { padding: 7px 8px; font-size: 12px; }

          .student-directory-head { align-items: center; gap: 8px; }
          .student-directory-head > :first-child { min-width: 0; flex: 1; }

          .promotion-row { grid-template-columns:minmax(0,1fr) 22px minmax(0,1fr); gap:5px; }
          .promotion-flow { grid-template-columns:1fr; gap:8px; }
          .promotion-summary { min-height:42px; }
          .class-overview-table { display:block; border:1px solid var(--border); overflow-x:auto; overflow-y:hidden; border-radius:10px; -webkit-overflow-scrolling:touch; }
          .class-overview-head,.class-overview-row { display:grid; min-width:650px; grid-template-columns:minmax(210px,2.2fr) repeat(4,68px) 92px; gap:6px; padding:9px 10px; border-radius:0; }
          .class-overview-head { font-size:10.5px; }
          .class-overview-row { border:0; border-top:1px solid var(--border); font-size:12px; }
          .class-overview-row strong { grid-column:auto; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .class-overview-row span { text-align:center !important; font-size:11px; }
          .class-overview-row span::before { content:none !important; }
          .class-overview-row span:last-child { text-align:right !important; }
          .promotion-button { grid-column:1 / -1; min-height:34px; height:34px; }
          .bulk-save-button { min-height: 34px; height: 34px; padding: 0 9px; font-size: 10.5px; }

          .org-add-row { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5px; }
          .org-add-row > select:nth-child(1) { grid-column: span 2; }
          .org-add-row > select:nth-child(2) { grid-column: span 2; }
          .org-add-row > select:nth-child(3) { grid-column: span 2; }
          .org-add-row > input { grid-column: span 4; }
          .org-add-row > button { grid-column: span 2; }

          .org-filter-row { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5px; }
          .org-filter-row > select:nth-child(1),
          .org-filter-row > select:nth-child(2),
          .org-filter-row > select:nth-child(3) { grid-column: span 2; }
          .org-filter-row > input { grid-column: span 4; }
          .org-filter-row > select:nth-child(5) { grid-column: span 2; }

          .org-add-row .hh-select, .org-add-row .hh-input, .org-add-row .hh-button-primary,
          .org-filter-row .hh-select, .org-filter-row .hh-input { min-width: 0; width: 100%; height: 42px; min-height: 42px; font-size: 13px; line-height:1.25; padding-left: 10px; padding-right: 28px; }

          .compact-main { grid-template-columns: 30px minmax(0, 1fr) 42px 9px 16px; padding: 8px 0; gap: 7px; }
          .mini-avatar { width: 28px; height: 28px; }
          .student-core strong { font-size: 13px; }
          .student-core small { font-size: 10.5px; }
          .compact-detail { padding: 7px 0 10px; }
          .assign-row { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
          .assign-row button { grid-column: 1 / -1; }
          .assign-row .hh-select { width: 100%; min-width: 0; min-height: 40px; height: 40px; padding: 0 26px 0 8px; font-size: 12px; line-height:1.2; }
          .assign-row .admin-mini-button { width: 100%; min-height: 33px; height: 33px; }
          .action-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
          .action-row .admin-mini-button { min-width: 0; padding: 7px 2px; font-size: 9.8px; white-space:nowrap; }
        }

        @media (max-width: 430px) {
          .org-students-v12 { width: calc(100% + 10px); margin-left: -5px; }
          .org-students-v12 .admin-panel { padding: 9px 8px !important; }
          .org-add-row, .org-filter-row { gap: 4px; }
          .org-add-row .hh-select, .org-add-row .hh-input, .org-add-row .hh-button-primary,
          .org-filter-row .hh-select, .org-filter-row .hh-input { font-size: 12px; padding-left: 8px; padding-right: 26px; }
          .bulk-save-button { font-size: 9.5px; padding: 0 7px; }
          .org-item { min-width: 88px; }
          .action-row .admin-mini-button { font-size: 9.5px; }
        }
      `}</style>
    </div>
  );
}

function AdminStudentHistoryPanel({
  student,
  onClose,
}: {
  student: StudentRow;
  onClose: () => void;
}) {
  const [items, setItems] = useState<AdminHistoryItem[]>([]);
  const [selected, setSelected] = useState<AdminHistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (subject) params.set("subject", subject);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (keyword.trim()) params.set("q", keyword.trim());

      const response = await fetch(
        `/api/admin/students/${student.id}/history${
          params.toString() ? `?${params.toString()}` : ""
        }`,
        { cache: "no-store" },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "讀取學生解題紀錄失敗。");
      }

      setItems(Array.isArray(data.items) ? data.items : []);
      setSelected(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "讀取學生解題紀錄失敗。",
      );
    } finally {
      setLoading(false);
    }
  }, [student.id, subject, from, to, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function clearFilters() {
    setSubject("");
    setFrom("");
    setTo("");
    setKeyword("");
  }

  return (
    <div className="admin-history-overlay" role="dialog" aria-modal="true">
      <button
        type="button"
        className="admin-history-backdrop"
        aria-label="關閉學生解題紀錄"
        onClick={onClose}
      />

      <section className="admin-history-panel">
        <header className="admin-history-panel-head">
          <div className="admin-history-student-identity">
            <div className="admin-avatar large">{student.name.slice(0, 1)}</div>
            <div>
              <div className="hh-eyebrow">STUDENT SOLVE HISTORY</div>
              <h2 className="hh-display">{student.name}</h2>
              <p>{student.campus} · 教師檢視模式</p>
            </div>
          </div>

          <button
            type="button"
            className="admin-history-close"
            onClick={onClose}
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        {!selected ? (
          <>
            <div className="admin-history-filter-toggle-row">
              <button type="button" className="hh-button-secondary admin-history-filter-toggle" onClick={() => setFiltersOpen((value) => !value)}>
                {filtersOpen ? "收合搜尋條件" : "搜尋與篩選"}
              </button>
              {(keyword || subject || from || to) && <span>已套用篩選</span>}
            </div>
            {filtersOpen && <div className="admin-history-filterbar">
              <label className="admin-history-search-field">
                <span>搜尋</span>
                <input
                  className="hh-input"
                  type="search"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void load();
                  }}
                  placeholder="答案、學生補充、解析…"
                />
              </label>

              <label>
                <span>科目</span>
                <select
                  className="hh-select"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
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
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>

              <label>
                <span>結束日期</span>
                <input
                  className="hh-input"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>

              <div className="admin-history-filter-actions">
                <button
                  type="button"
                  className="hh-button-primary"
                  disabled={loading}
                  onClick={() => void load()}
                >
                  {loading ? "讀取中…" : "套用"}
                </button>
                <button
                  type="button"
                  className="hh-button-secondary"
                  onClick={clearFilters}
                >
                  清除
                </button>
              </div>
            </div>}

            {error && <div className="admin-notice danger">{error}</div>}

            <div className="admin-history-summary-line">
              <span>{loading ? "正在讀取…" : `共 ${items.length} 筆解題紀錄`}</span>
              <span>
                今日使用 {student.todayCount} 題 · {student.active ? "帳號啟用中" : "帳號已停用"}
              </span>
            </div>

            {!loading && items.length === 0 ? (
              <div className="admin-history-empty-state">
                <strong>沒有符合條件的解題紀錄</strong>
                <span>這位學生可能尚未解題，或目前篩選條件沒有結果。</span>
              </div>
            ) : (
              <div className="admin-history-list">
                {items.map((item) => (
                  <button
                    type="button"
                    className="admin-history-row"
                    key={item.id}
                    onClick={() => setSelected(item)}
                  >
                    <div className="admin-history-thumb">
                      {item.imagePaths[0]?.url ? (
                        <img src={item.imagePaths[0].url || ""} alt="題目縮圖" />
                      ) : (
                        <span>SCI</span>
                      )}
                    </div>

                    <div className="admin-history-row-main">
                      <div className="admin-history-row-meta">
                        <span>{adminSubjectLabel(item.subject)}</span>
                        <span>{formatAdminDate(item.createdAt)}</span>
                        {item.favorite && <span className="favorite">★ 學生收藏</span>}
                      </div>

                      <strong>{item.answer || "查看完整解析"}</strong>

                      <p>
                        {item.questionNote ||
                          item.explanation.replace(/\$+/g, "").slice(0, 110) ||
                          "點擊查看完整解題內容"}
                      </p>

                      <div className="admin-history-row-tags">
                        <span>{item.imagePaths.length || 0} 張圖片</span>
                        {item.referenceAnswer && <span>有標準答案</span>}
                        {item.followupCount > 0 && (
                          <span>{item.followupCount} 次追問</span>
                        )}
                        {item.primaryModel && <span>{item.primaryModel}</span>}
                      </div>
                    </div>

                    <span className="admin-history-chevron">›</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="admin-history-detail">
            <button
              type="button"
              className="admin-history-detail-back"
              onClick={() => setSelected(null)}
            >
              ← 返回 {student.name} 的解題紀錄
            </button>

            <div className="admin-history-detail-title">
              <div>
                <div className="admin-history-row-meta">
                  <span>{adminSubjectLabel(selected.subject)}</span>
                  <span>{formatAdminDate(selected.createdAt)}</span>
                  {selected.favorite && <span className="favorite">★ 學生收藏</span>}
                </div>
                <h3 className="hh-display">完整解題內容</h3>
              </div>

              <div className={`admin-dispute-badge status-${selected.disputeStatus || "normal"}`}>
                {selected.disputeStatus === "disputed"
                  ? "仍有爭議"
                  : selected.disputeStatus === "resolved"
                    ? "已仲裁"
                    : "一般"}
              </div>
              <button type="button" className="admin-correction-add" onClick={async () => {
                setCorrectionMessage("儲存中…");
                try {
                  const response = await fetch("/api/admin/corrections", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ solveHistoryId:selected.id, studentId:student.id }) });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error || "加入待修正失敗");
                  setCorrectionMessage("已加入待修正題庫");
                } catch (error) { setCorrectionMessage(error instanceof Error ? error.message : "加入待修正失敗"); }
              }}>＋ 加入待修正</button>
              {correctionMessage && <span className="admin-correction-message">{correctionMessage}</span>}
            </div>

            {selected.imagePaths.length > 0 && (
              <div className="admin-history-images">
                {selected.imagePaths.map((image, index) =>
                  image.url ? (
                    <figure key={`${image.path}-${index}`}>
                      <img src={image.url} alt={`題目圖片 ${index + 1}`} />
                      <figcaption>題目圖片 {index + 1}</figcaption>
                    </figure>
                  ) : null,
                )}
              </div>
            )}

            <div className="admin-history-context-grid">
              <article>
                <span>標準答案</span>
                <strong>{selected.referenceAnswer || "學生未輸入"}</strong>
              </article>
              <article>
                <span>AI 最終答案</span>
                <strong>{selected.answer || "—"}</strong>
              </article>
              {selected.questionNote && (
                <article className="wide">
                  <span>學生補充</span>
                  <strong>{selected.questionNote}</strong>
                </article>
              )}
            </div>

            <section className="admin-history-analysis-section">
              <div className="admin-history-analysis-head">
                <span className="hh-number">01</span>
                <div>
                  <div className="hh-eyebrow">CONCEPT ANALYSIS</div>
                  <h4 className="hh-display">觀念解析</h4>
                </div>
              </div>
              <AdminScienceText text={selected.explanation} />
            </section>

            {selected.options && (
              <section className="admin-history-analysis-section">
                <div className="admin-history-analysis-head">
                  <span className="hh-number">02</span>
                  <div>
                    <div className="hh-eyebrow">OPTION ANALYSIS</div>
                    <h4 className="hh-display">選項分析</h4>
                  </div>
                </div>
                <AdminScienceText text={formatAdminOptions(selected.options)} />
              </section>
            )}

            <section className="admin-history-routing">
              <div className="admin-history-analysis-head">
                <span className="hh-number">AI</span>
                <div>
                  <div className="hh-eyebrow">MODEL ROUTING</div>
                  <h4 className="hh-display">本題 AI 路由</h4>
                </div>
              </div>

              <div className="admin-history-routing-grid">
                <RoutingCard
                  label="PRIMARY"
                  provider={selected.primaryProvider}
                  model={selected.primaryModel}
                />
                <RoutingCard
                  label="VERIFIER"
                  provider={selected.verifierProvider}
                  model={selected.verifierModel}
                  detail={selected.verifierResult}
                />
                <RoutingCard
                  label="ARBITER"
                  provider={selected.arbiterProvider}
                  model={selected.arbiterModel}
                  detail={selected.arbitrationTrigger}
                />
              </div>
            </section>

            <section className="admin-history-followups">
              <div className="admin-history-analysis-head">
                <span className="hh-number">Q</span>
                <div>
                  <div className="hh-eyebrow">FOLLOW-UP</div>
                  <h4 className="hh-display">學生追問紀錄</h4>
                </div>
              </div>

              {selected.followups.length === 0 ? (
                <div className="admin-history-no-followup">這一題沒有追問紀錄。</div>
              ) : (
                <div className="admin-history-followup-list">
                  {selected.followups.map((followup, index) => (
                    <article key={followup.id}>
                      <div className="admin-history-followup-question">
                        <strong>追問 {index + 1}</strong>
                        <span>{formatAdminDate(followup.createdAt)}</span>
                        <p>{followup.question}</p>
                      </div>

                      <div className="admin-history-followup-answer">
                        <div>
                          <strong>AI 回答</strong>
                          <span>
                            {[followup.provider, followup.model]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        <AdminScienceText text={followup.answer} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function RoutingCard({
  label,
  provider,
  model,
  detail,
}: {
  label: string;
  provider?: string | null;
  model?: string | null;
  detail?: string | null;
}) {
  return (
    <article className="admin-routing-card">
      <div className="hh-eyebrow">{label}</div>
      <strong>{model || "未啟動"}</strong>
      <span>
        {[provider, detail].filter(Boolean).join(" · ") || "本題未使用此角色"}
      </span>
    </article>
  );
}


function AISection(props: {
  models: RouterModelOption[];
  settings: SolverSettingsData | null;
  setSettings: React.Dispatch<React.SetStateAction<SolverSettingsData | null>>;
  loading: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
  message: string;
  error: string;
}) {
  if (props.loading || !props.settings) {
    return (
      <section className="hh-card admin-panel">
        <PanelHeader
          eyebrow="AI ROUTER"
          title="AI 解題設定"
          subtitle="正在讀取 v1.1 AI Router 設定…"
        />
        <div className="admin-empty">載入中…</div>
      </section>
    );
  }

  const settings = props.settings;

  function patchSettings(
    updater: (current: SolverSettingsData) => SolverSettingsData,
  ) {
    props.setSettings((current) =>
      current ? updater(current) : current,
    );
  }

  function patchSlot(
    key: "primary" | "verifier" | "arbiter" | "scienceGate",
    patch: Partial<SolverSlot>,
  ) {
    patchSettings((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch,
      },
    }));
  }

  function patchFollowupModel(patch: Partial<SolverSlot>) {
    patchSettings((current) => ({
      ...current,
      followup: {
        ...current.followup,
        model: {
          ...current.followup.model,
          ...patch,
        },
      },
    }));
  }

  return (
    <div className="admin-stack">
      <section className="hh-card admin-panel">
        <PanelHeader
          eyebrow="DAILY QUOTA"
          title="每日解題額度"
          subtitle="修改後立即生效，不需要重新部署"
        />

        <div className="admin-quota-control">
          <div>
            <strong>每位學生每日可解題數</strong>
            <span>考前可暫時調成 20、30 題，之後再調回即可。</span>
          </div>

          <div className="admin-number-control">
            <input
              className="hh-input"
              type="number"
              min={1}
              max={100}
              step={1}
              value={settings.dailyLimit}
              onChange={(event) => {
                const value = Number(event.target.value);
                patchSettings((current) => ({
                  ...current,
                  dailyLimit: Number.isFinite(value)
                    ? Math.max(1, Math.min(100, Math.round(value)))
                    : 10,
                }));
              }}
            />
            <span>題／日</span>
          </div>
        </div>
      </section>
      <section className="hh-card admin-panel">
        <PanelHeader
          eyebrow="ROUTING MODE"
          title="AI 解題模式"
          subtitle="單模型適合測試；智慧多模型會依標準答案與驗算結果決定是否啟動仲裁模型"
        />

        <div className="admin-segmented">
          <button
            type="button"
            className={settings.mode === "single" ? "active" : ""}
            onClick={() =>
              patchSettings((current) => ({
                ...current,
                mode: "single",
              }))
            }
          >
            <strong>單模型解題</strong>
            <span>只使用主要解題模型</span>
          </button>

          <button
            type="button"
            className={settings.mode === "multi" ? "active" : ""}
            onClick={() =>
              patchSettings((current) => ({
                ...current,
                mode: "multi",
              }))
            }
          >
            <strong>智慧多模型</strong>
            <span>Primary＋Verifier＋必要時 Arbiter</span>
          </button>
        </div>
      </section>

      <section className="hh-card admin-panel">
        <PanelHeader
          eyebrow="MODEL ROUTER"
          title="模型角色"
          subtitle="每個角色都可以獨立選擇 OpenAI 或 Gemini 模型與推理強度"
        />

        <div className="admin-router-grid">
          <ModelSlotEditor
            title="主要解題模型"
            eyebrow="PRIMARY"
            description="每一題都會先由這個模型完整解題。"
            slot={settings.primary}
            models={props.models}
            onChange={(patch) => patchSlot("primary", patch)}
          />

          <ModelSlotEditor
            title="無標準答案驗算模型"
            eyebrow="VERIFIER"
            description="只有學生沒有輸入標準答案時才啟動，負責檢查重大錯誤。"
            slot={settings.verifier}
            models={props.models}
            onChange={(patch) => patchSlot("verifier", patch)}
          />

          <ModelSlotEditor
            title="衝突／爭議模型"
            eyebrow="ARBITER"
            description="Primary 與標準答案衝突，或 Verifier 高信心判重大錯誤時才啟動。"
            slot={settings.arbiter}
            models={props.models}
            onChange={(patch) => patchSlot("arbiter", patch)}
          />

          <ModelSlotEditor
            title="自然科辨識模型"
            eyebrow="SCIENCE GATE"
            description="扣除每日額度前，先判斷整組圖片是否屬於自然科。"
            slot={settings.scienceGate}
            models={props.models}
            onChange={(patch) => patchSlot("scienceGate", patch)}
          />
        </div>

        <div className="admin-router-threshold">
          <div>
            <strong>Verifier 仲裁門檻</strong>
            <span>建議 85%，避免弱疑慮造成不必要的 Arbiter 成本。</span>
          </div>

          <div className="admin-number-control">
            <input
              className="hh-input"
              type="number"
              min={50}
              max={100}
              step={1}
              value={settings.arbitration.confidenceThreshold}
              onChange={(event) => {
                const value = Number(event.target.value);
                patchSettings((current) => ({
                  ...current,
                  arbitration: {
                    ...current.arbitration,
                    confidenceThreshold: Number.isFinite(value)
                      ? Math.max(50, Math.min(100, Math.round(value)))
                      : 85,
                  },
                }));
              }}
            />
            <span>%</span>
          </div>
        </div>
      </section>

      <section className="hh-card admin-panel">
        <PanelHeader
          eyebrow="FOLLOW-UP"
          title="學生追問"
          subtitle="追問不重新跑完整解題 Router，也不扣每日題數"
        />

        <button
          type="button"
          className={`admin-toggle-button ${
            settings.followup.enabled ? "active" : ""
          }`}
          onClick={() =>
            patchSettings((current) => ({
              ...current,
              followup: {
                ...current.followup,
                enabled: !current.followup.enabled,
              },
            }))
          }
        >
          {settings.followup.enabled ? "追問功能：開啟" : "追問功能：關閉"}
        </button>

        <div className="admin-followup-grid">
          <ModelSlotEditor
            title="追問模型"
            eyebrow="FOLLOW-UP MODEL"
            description="建議使用低成本模型，只傳必要文字上下文。"
            slot={settings.followup.model}
            models={props.models}
            disabled={!settings.followup.enabled}
            onChange={patchFollowupModel}
          />

          <div className="admin-simple-setting">
            <div className="hh-eyebrow">FOLLOW-UP LIMIT</div>
            <h3 className="hh-display">每題追問上限</h3>
            <p>目前規劃預設每一題最多 3 次追問。</p>

            <div className="admin-number-control">
              <input
                className="hh-input"
                type="number"
                min={1}
                max={10}
                value={settings.followup.maxPerQuestion}
                disabled={!settings.followup.enabled}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  patchSettings((current) => ({
                    ...current,
                    followup: {
                      ...current.followup,
                      maxPerQuestion: Number.isFinite(value)
                        ? Math.max(1, Math.min(10, Math.round(value)))
                        : 3,
                    },
                  }));
                }}
              />
              <span>次／題</span>
            </div>
          </div>
        </div>
      </section>

      {(props.message || props.error) && (
        <div className={`admin-notice ${props.error ? "danger" : "success"}`}>
          {props.error || props.message}
        </div>
      )}

      <div className="admin-save-row">
        <button
          type="button"
          className="hh-button-primary"
          disabled={props.saving}
          onClick={() => void props.onSave()}
        >
          {props.saving ? "儲存中…" : "儲存 v1.1 AI 設定"}
        </button>
      </div>
    </div>
  );
}


function getSafeReasoningLevels(
  model: RouterModelOption | undefined,
): string[] {
  if (!model) {
    return ["low", "medium", "high"];
  }

  const provided = Array.isArray(model.reasoningLevels)
    ? model.reasoningLevels.filter(Boolean)
    : [];

  const id = String(model.id || "").toLowerCase();
  const provider = String(model.provider || "").toLowerCase();

  // Known Gemini 3.x Flash models support the three practical UI levels
  // used by this project. Keep these visible even if an API response is
  // temporarily incomplete.
  if (provider === "gemini" && id.includes("gemini-3")) {
    return ["low", "medium", "high"];
  }

  // OpenAI GPT-5.6 family: expose the full configured reasoning ladder.
  if (provider === "openai" && id.includes("gpt-5.6")) {
    return ["none", "low", "medium", "high", "xhigh", "max"];
  }

  if (provided.length > 0) {
    return Array.from(new Set(provided));
  }

  return ["low", "medium", "high"];
}


function ModelSlotEditor(props: {
  title: string;
  eyebrow: string;
  description: string;
  slot: SolverSlot;
  models: RouterModelOption[];
  onChange: (patch: Partial<SolverSlot>) => void;
  disabled?: boolean;
}) {
  const selectedModel =
    props.models.find((model) => model.id === props.slot.model) ??
    props.models[0];

  const reasoningLevels =
    getSafeReasoningLevels(selectedModel);

  function handleModelChange(modelId: string) {
    const model = props.models.find((item) => item.id === modelId);
    if (!model) return;

    const safeLevels =
      getSafeReasoningLevels(model);

    const nextReasoning = safeLevels.includes(props.slot.reasoning)
      ? props.slot.reasoning
      : safeLevels.includes("medium")
        ? "medium"
        : safeLevels[0] || "low";

    props.onChange({
      model: model.id,
      provider: model.provider,
      reasoning: nextReasoning,
    });
  }

  return (
    <article className={`admin-router-card ${props.disabled ? "disabled" : ""}`}>
      <div className="admin-router-identity">
        <div className="hh-eyebrow">{props.eyebrow}</div>
        <h3 className="hh-display">{props.title}</h3>
        <p>{props.description}</p>
      </div>

      <label className="admin-router-field admin-router-model-field">
        <span>模型</span>
        <select
          className="hh-input"
          value={props.slot.model}
          disabled={props.disabled}
          onChange={(event) => handleModelChange(event.target.value)}
        >
          {props.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} · {model.provider === "gemini" ? "Google" : "OpenAI"}
            </option>
          ))}
        </select>
      </label>

      <div className="admin-router-field admin-router-reasoning-field">
        <span>推理強度</span>
        <div className="admin-reasoning-pills">
          {reasoningLevels.map((level) => (
            <button
              type="button"
              key={level}
              disabled={props.disabled}
              className={props.slot.reasoning === level ? "active" : ""}
              onClick={() => props.onChange({ reasoning: level })}
            >
              {reasoningLabel(level)}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-router-meta">
        <span>{selectedModel?.description || props.slot.model}</span>
        {selectedModel && (
          <small>
            Input {selectedModel.inputPrice == null ? "—" : formatTwdFromUsd(Number(selectedModel.inputPrice))}/M · Output {selectedModel.outputPrice == null ? "—" : formatTwdFromUsd(Number(selectedModel.outputPrice))}/M
          </small>
        )}
      </div>
    </article>
  );
}


function reasoningLabel(value: string) {
  if (value === "none") return "關閉";
  if (value === "low") return "快速";
  if (value === "medium") return "標準";
  if (value === "high") return "深度";
  if (value === "xhigh") return "超深度";
  if (value === "max") return "最大";
  return value;
}


function PinSection(props: {
  initialPin: string;
  setInitialPin: (value: string) => void;
  loading: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
  message: string;
  error: string;
}) {
  return (
    <div className="admin-stack">
      <section className="hh-card admin-panel">
        <PanelHeader
          eyebrow="STUDENT ACCESS"
          title="初始登入密碼"
          subtitle="新生第一次登入與老師重設密碼時使用；學生個人密碼不會顯示"
        />

        {(props.message || props.error) && (
          <div className={`admin-notice ${props.error ? "danger" : "success"}`}>
            {props.error || props.message}
          </div>
        )}

        <article className="admin-pin-card">
          <div className="admin-pin-head">
            <div>
              <strong>共用初始密碼</strong>
              <span>新生第一次登入、或老師重設密碼後使用</span>
            </div>
            <div className="admin-pin-status">4–6 DIGITS</div>
          </div>

          <div className="admin-pin-controls">
            <input
              className="hh-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={props.initialPin}
              disabled={props.loading || props.saving}
              onChange={(event) =>
                props.setInitialPin(
                  event.target.value.replace(/\D/g, "").slice(0, 6),
                )
              }
              placeholder="4～6 位初始密碼"
            />

            <button
              type="button"
              className="hh-button-primary"
              disabled={props.loading || props.saving}
              onClick={() => void props.onSave()}
            >
              {props.saving ? "儲存中…" : "儲存初始密碼"}
            </button>
          </div>
        </article>
      </section>

      <div className="admin-notice warning">
        老師無法查看學生目前的個人密碼。若學生忘記密碼，請到「學生管理」按「重設密碼」；
        系統會恢復成上方初始密碼，學生下次登入後必須重新設定自己的個人密碼。
      </div>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`admin-nav-button ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

function CorrectionSection() {
  type CorrectionRow = { id:string; status:string; issueType:string; teacherNote:string; correctedAnswer:string; correctedExplanation:string; createdAt:string; studentName:string; subject:string; answer:string; explanation:string; imageUrl?:string|null; };
  const [items, setItems] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/corrections", { cache:"no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "讀取待修正題庫失敗");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "讀取失敗"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(item: CorrectionRow, patch: Partial<CorrectionRow>) {
    const next = { ...item, ...patch };
    setItems((rows) => rows.map((row) => row.id === item.id ? next : row));
    const response = await fetch("/api/admin/corrections", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:item.id, status:next.status, issueType:next.issueType, teacherNote:next.teacherNote, correctedAnswer:next.correctedAnswer, correctedExplanation:next.correctedExplanation }) });
    const data = await response.json();
    setMessage(response.ok ? "已儲存老師修正內容。" : (data.error || "儲存失敗"));
  }

  return <div className="admin-stack">
    <section className="hh-card admin-panel">
      <PanelHeader eyebrow="TEACHING CORRECTIONS" title="待修正題庫" subtitle="把學生真實問過、AI 解錯或解法可改善的題目留下來，整理成之後可餵回解題規則與提示詞的教師資料" />
      {message && <div className="admin-notice success">{message}</div>}
      {loading ? <div className="admin-empty">讀取中…</div> : items.length === 0 ? <div className="admin-empty">目前沒有待修正題目。從學生解題紀錄點「加入待修正」即可。</div> : <div className="correction-list">
        {items.map((item) => <article className="correction-card" key={item.id}>
          <div className="correction-card-head"><div><strong>{item.studentName} · {adminSubjectLabel(item.subject)}</strong><small>{item.answer || "尚無答案"}</small></div><select className="hh-select" value={item.status} onChange={(e) => void save(item,{status:e.target.value})}><option value="pending">待修正</option><option value="reviewed">已檢視</option><option value="applied">已套用規則</option></select></div>
          <select className="hh-select" value={item.issueType} onChange={(e) => void save(item,{issueType:e.target.value})}><option value="wrong_answer">答案錯誤</option><option value="better_method">解法可更好</option><option value="unclear">說明不清楚</option><option value="format">格式問題</option><option value="other">其他</option></select>
          <textarea className="hh-input correction-textarea" placeholder="老師備註：錯在哪裡、希望 AI 下次怎麼解…" value={item.teacherNote} onChange={(e) => setItems(rows=>rows.map(r=>r.id===item.id?{...r,teacherNote:e.target.value}:r))} onBlur={() => void save(item,{teacherNote:items.find(r=>r.id===item.id)?.teacherNote || ""})} />
          <input className="hh-input" placeholder="老師認定的正確答案（可選）" value={item.correctedAnswer} onChange={(e)=>setItems(rows=>rows.map(r=>r.id===item.id?{...r,correctedAnswer:e.target.value}:r))} onBlur={() => void save(item,{correctedAnswer:items.find(r=>r.id===item.id)?.correctedAnswer || ""})} />
          <textarea className="hh-input correction-textarea" placeholder="建議解法／要補強的解題規則（可選）" value={item.correctedExplanation} onChange={(e)=>setItems(rows=>rows.map(r=>r.id===item.id?{...r,correctedExplanation:e.target.value}:r))} onBlur={() => void save(item,{correctedExplanation:items.find(r=>r.id===item.id)?.correctedExplanation || ""})} />
        </article>)}
      </div>}
    </section>
    <style jsx global>{`
      .correction-list{display:grid;gap:10px;margin-top:12px}.correction-card{display:grid;gap:8px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-soft)}.correction-card-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.correction-card-head>div{display:grid;gap:2px}.correction-card-head small{color:var(--text-secondary)}.correction-card-head .hh-select{width:auto;min-width:120px}.correction-textarea{min-height:76px;resize:vertical;padding-top:10px!important}
      @media(max-width:760px){.correction-card-head{align-items:stretch;flex-direction:column}.correction-card-head .hh-select{width:100%}}
    `}</style>
  </div>;
}

function AnalyticsSection() {
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [latency, setLatency] = useState<LatencyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, latencyResponse] = await Promise.all([
        fetch(`/api/admin/analytics?range=${encodeURIComponent(range)}`, { cache: "no-store" }),
        fetch(`/api/admin/latency-analytics?range=${encodeURIComponent(range)}`, { cache: "no-store" }),
      ]);
      const [payload, latencyPayload] = await Promise.all([response.json(), latencyResponse.json()]);
      if (!response.ok) throw new Error(payload.error || "讀取 AI 數據分析失敗。");
      setData(payload);
      setLatency(latencyResponse.ok ? latencyPayload : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "讀取 AI 數據分析失敗。");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  const roleMap = useMemo(() => {
    const map = new Map<string, AnalyticsRoleMetric>();
    for (const item of data?.roles || []) map.set(item.role, item);
    return map;
  }, [data]);

  const roleRows = [
    ["Science Gate", "science_gate"],
    ["Primary", "primary"],
    ["Verifier", "verifier"],
    ["Arbiter", "arbiter"],
    ["Follow-up", "followup"],
  ] as const;

  const ranges: Array<{ value: AnalyticsRange; label: string }> = [
    { value: "today", label: "今天" },
    { value: "7d", label: "7 天" },
    { value: "30d", label: "30 天" },
    { value: "month", label: "本月" },
  ];

  return (
    <div className="admin-stack admin-analytics-compact">
      <section className="hh-card admin-panel admin-analytics-toolbar">
        <div>
          <div className="hh-eyebrow">AI ANALYTICS</div>
          <h2 className="hh-display">AI 數據分析</h2>
        </div>
        <div className="admin-analytics-range">
          {ranges.map((item) => (
            <button key={item.value} type="button" className={range === item.value ? "active" : ""} onClick={() => setRange(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="admin-notice danger">{error}</div>}
      {!data && loading && <section className="hh-card admin-panel admin-empty">正在整理 AI 數據…</section>}

      {data && (
        <>
          <section className="hh-card admin-panel admin-data-table-panel">
            <PanelHeader eyebrow="OVERVIEW" title="使用與成本" subtitle={data.label} />
            <div className="admin-data-table-wrap">
              <table className="admin-data-table admin-overview-data-table">
                <thead><tr><th>指標</th><th>數值</th><th>說明</th></tr></thead>
                <tbody>
                  <tr><td>解題數</td><td>{formatInteger(data.totals.solvedQuestions)} 題</td><td>成功建立的解題紀錄</td></tr>
                  <tr><td>模型呼叫</td><td>{formatInteger(data.totals.apiCalls)} 次</td><td>全部 AI 角色合計</td></tr>
                  <tr><td>估算總成本</td><td>{formatTwdFromUsd(data.totals.totalCostUsd)}</td><td>依 api_usage 加總</td></tr>
                  <tr><td>平均每題成本</td><td>{formatTwdFromUsd(data.totals.averageCostPerSolveUsd)}</td><td>總成本 ÷ 解題數</td></tr>
                  <tr><td>AI 平均回應時間</td><td>{formatDuration(latency?.averageMs)}</td><td>依已記錄 latency_ms 的模型呼叫計算</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="hh-card admin-panel admin-data-table-panel">
            <PanelHeader eyebrow="COST BY ROLE" title="角色使用量與成本" />
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead><tr><th>角色</th><th>呼叫</th><th>成本</th></tr></thead>
                <tbody>
                  {roleRows.map(([label, key]) => {
                    const metric = roleMap.get(key) || { role: key, calls: 0, costUsd: 0 };
                    return <tr key={key}><td>{label}</td><td>{formatInteger(metric.calls)} 次</td><td>{formatTwdFromUsd(metric.costUsd)}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="hh-card admin-panel admin-data-table-panel">
            <PanelHeader eyebrow="ROUTER QUALITY" title="解題品質與路由效率" />
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead><tr><th>指標</th><th>結果</th><th>樣本</th></tr></thead>
                <tbody>
                  <tr><td>Primary 與標準答案一致率</td><td>{formatPercent(data.quality.primaryReferenceConsistencyRate)}</td><td>{data.quality.primaryReferenceMatches}/{data.quality.referenceCases}</td></tr>
                  <tr><td>Verifier 啟動率</td><td>{formatPercent(data.quality.verifierActivationRate)}</td><td>{data.quality.verifierQuestions}/{data.quality.noReferenceCases}</td></tr>
                  <tr><td>Verifier 重大錯誤率</td><td>{formatPercent(data.quality.verifierDisagreementRate)}</td><td>{data.quality.verifierMajorErrors}/{data.quality.verifierQuestions}</td></tr>
                  <tr><td>Arbiter 啟動率</td><td>{formatPercent(data.quality.arbiterActivationRate)}</td><td>{data.quality.arbiterQuestions}/{data.totals.solvedQuestions}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="hh-card admin-panel admin-data-table-panel">
            <PanelHeader eyebrow="ARBITRATION" title="仲裁結果" />
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead><tr><th>結果</th><th>題數</th><th>比例／備註</th></tr></thead>
                <tbody>
                  <tr><td>標準答案衝突仲裁</td><td>{data.quality.referenceMismatchArbitrations}</td><td>基準母體</td></tr>
                  <tr><td>支持標準答案</td><td>{data.quality.referenceArbiterSupportsReference}</td><td>{formatFractionPercent(data.quality.referenceArbiterSupportsReference, data.quality.referenceMismatchArbitrations)}</td></tr>
                  <tr><td>支持 Primary</td><td>{data.quality.referenceArbiterSupportsPrimary}</td><td>{formatFractionPercent(data.quality.referenceArbiterSupportsPrimary, data.quality.referenceMismatchArbitrations)}</td></tr>
                  <tr><td>仲裁後仍不一致</td><td>{data.quality.referenceArbiterStillInconsistent}</td><td>{formatFractionPercent(data.quality.referenceArbiterStillInconsistent, data.quality.referenceMismatchArbitrations)}</td></tr>
                  <tr><td>Verifier 觸發仲裁</td><td>{data.quality.verifierTriggeredArbitrations}</td><td>無標準答案流程</td></tr>
                  <tr><td>仍有爭議</td><td>{data.quality.disputedQuestions}</td><td>disputed</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="hh-card admin-panel admin-data-table-panel">
            <PanelHeader eyebrow="AI LATENCY" title="各模型平均解題時間" subtitle="比較不同 AI 與版本的實際 API 回應時間" />
            <div className="admin-model-performance-mobile latency-mobile-list">
              {(latency?.models || []).length === 0 ? (
                <div className="admin-empty">這個區間尚無延遲資料。</div>
              ) : latency!.models.map((model) => (
                <article className="admin-model-performance-row" key={`latency-${model.provider}-${model.model}`}>
                  <div className="admin-model-performance-head">
                    <div><strong>{modelDisplayName(model.model)}</strong><span>{providerLabel(model.provider)}</span></div>
                    <b>{formatDuration(model.averageMs)}</b>
                  </div>
                  <div className="admin-model-performance-metrics latency-metrics">
                    <div><span>呼叫</span><strong>{formatInteger(model.calls)} 次</strong></div>
                    <div><span>平均</span><strong>{formatDuration(model.averageMs)}</strong></div>
                    <div><span>最快</span><strong>{formatDuration(model.minMs)}</strong></div>
                    <div><span>最慢</span><strong>{formatDuration(model.maxMs)}</strong></div>
                  </div>
                </article>
              ))}
            </div>
            <div className="admin-data-table-wrap admin-model-performance-desktop">
              <table className="admin-data-table"><thead><tr><th>模型</th><th>呼叫</th><th>平均時間</th><th>最快</th><th>最慢</th></tr></thead><tbody>
                {(latency?.models || []).length === 0 ? <tr><td colSpan={5}>這個區間尚無延遲資料。</td></tr> : latency!.models.map((model) => (
                  <tr key={`latency-table-${model.provider}-${model.model}`}><td><strong>{modelDisplayName(model.model)}</strong><small>{providerLabel(model.provider)}</small></td><td>{formatInteger(model.calls)} 次</td><td>{formatDuration(model.averageMs)}</td><td>{formatDuration(model.minMs)}</td><td>{formatDuration(model.maxMs)}</td></tr>
                ))}
              </tbody></table>
            </div>
          </section>

          <section className="hh-card admin-panel admin-data-table-panel">
            <PanelHeader eyebrow="MODEL PERFORMANCE" title="各模型使用與品質" />

            <div className="admin-data-table-wrap admin-model-performance-desktop">
              <table className="admin-data-table admin-model-performance-table">
                <thead><tr><th>模型</th><th>呼叫</th><th>成本</th><th>平均／次</th><th>Primary 一致率</th><th>Verifier 錯誤率</th></tr></thead>
                <tbody>
                  {data.models.length === 0 ? (
                    <tr><td colSpan={6}>這個區間尚無資料。</td></tr>
                  ) : data.models.map((model) => (
                    <tr key={`${model.provider}-${model.model}`}>
                      <td><strong>{model.model}</strong><small>{providerLabel(model.provider)}</small></td>
                      <td>{formatInteger(model.calls)}</td>
                      <td>{formatTwdFromUsd(model.costUsd)}</td>
                      <td>{formatTwdFromUsd(model.averageCostUsd)}</td>
                      <td>{formatPercent(model.primaryConsistencyRate)} <small>{model.primaryMatches}/{model.primaryReferenceCases}</small></td>
                      <td>{formatPercent(model.verifierDisagreementRate)} <small>{model.verifierMajorErrors}/{model.verifierCases}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-model-performance-mobile">
              {data.models.length === 0 ? (
                <div className="admin-empty">這個區間尚無資料。</div>
              ) : data.models.map((model) => (
                <article className="admin-model-performance-row" key={`mobile-${model.provider}-${model.model}`}>
                  <div className="admin-model-performance-head">
                    <div>
                      <strong>{model.model}</strong>
                      <span>{providerLabel(model.provider)}</span>
                    </div>
                    <b>{formatInteger(model.calls)} 次</b>
                  </div>

                  <div className="admin-model-performance-metrics">
                    <div>
                      <span>總成本</span>
                      <strong>{formatTwdFromUsd(model.costUsd)}</strong>
                    </div>
                    <div>
                      <span>平均／次</span>
                      <strong>{formatTwdFromUsd(model.averageCostUsd)}</strong>
                    </div>
                    <div>
                      <span>Primary 一致率</span>
                      <strong>{formatPercent(model.primaryConsistencyRate)}</strong>
                      <small>{model.primaryMatches}/{model.primaryReferenceCases}</small>
                    </div>
                    <div>
                      <span>Verifier 錯誤率</span>
                      <strong>{formatPercent(model.verifierDisagreementRate)}</strong>
                      <small>{model.verifierMajorErrors}/{model.verifierCases}</small>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}


function AnalyticsKpi({
  eyebrow,
  label,
  value,
  note,
}: {
  eyebrow: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="hh-card admin-analytics-kpi">
      <div className="hh-eyebrow">{eyebrow}</div>
      <span>{label}</span>
      <strong className="hh-display">{value}</strong>
      <small>{note}</small>
    </article>
  );
}


function AnalyticsRoleCard({
  label,
  metric,
  note,
}: {
  label: string;
  metric: AnalyticsRoleMetric;
  note: string;
}) {
  return (
    <article className="admin-role-card">
      <div>
        <span>{label}</span>
        <small>{note}</small>
      </div>
      <strong>{formatInteger(metric.calls)} 次</strong>
      <b>{formatTwdFromUsd(metric.costUsd)}</b>
    </article>
  );
}


function QualityMetricCard({
  eyebrow,
  title,
  rate,
  numerator,
  denominator,
  denominatorLabel,
}: {
  eyebrow: string;
  title: string;
  rate: number | null;
  numerator: number;
  denominator: number;
  denominatorLabel: string;
}) {
  return (
    <article className="admin-quality-card">
      <div className="hh-eyebrow">{eyebrow}</div>
      <h3 className="hh-display">{title}</h3>
      <strong>{formatPercent(rate)}</strong>
      <div className="admin-quality-fraction">
        {formatInteger(numerator)} / {formatInteger(denominator)}
      </div>
      <small>分母：{denominatorLabel}</small>
    </article>
  );
}


function MetricCell({
  rate,
  numerator,
  denominator,
}: {
  rate: number | null;
  numerator: number;
  denominator: number;
}) {
  return (
    <div className="admin-metric-cell">
      <strong>{formatPercent(rate)}</strong>
      <span>
        {numerator}/{denominator}
      </span>
    </div>
  );
}


function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-TW").format(Number(value || 0));
}


function usdToTwd(value: number) {
  return Number(value || 0) * USD_TO_TWD_RATE;
}


function formatTwdFromUsd(value: number) {
  const amount = usdToTwd(value);

  if (amount > 0 && amount < 1) {
    return `NT$${amount.toFixed(2)}`;
  }

  return `NT$${amount.toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}


function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return `${value.toFixed(1)}%`;
}


function formatFractionPercent(numerator: number, denominator: number) {
  if (!denominator) {
    return "分母 0 題";
  }

  return `${numerator}/${denominator} · ${(
    (numerator / denominator) *
    100
  ).toFixed(1)}%`;
}


function providerLabel(value: string) {
  if (value === "gemini") return "Google Gemini";
  if (value === "openai") return "OpenAI";
  return value || "Unknown";
}


function PanelHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="admin-panel-header">
      <div className="hh-eyebrow">{eyebrow}</div>
      <h2 className="hh-display">{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix = "",
  prefix = "",
  digits = 0,
  tone = "",
}: {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  digits?: number;
  tone?: "blue" | "gold" | "purple" | "red" | "";
}) {
  return (
    <article className={`admin-kpi tone-${tone}`}>
      <div>{label}</div>
      <strong className="hh-number">
        {prefix}
        {digits ? value.toFixed(digits) : value}
        {suffix}
      </strong>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-metric">
      <span>{label}</span>
      <strong className="hh-number">{value}</strong>
    </div>
  );
}

function QuickAction({
  title,
  desc,
  onClick,
}: {
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="admin-quick-card" onClick={onClick}>
      <strong className="hh-display">{title}</strong>
      <span>{desc}</span>
      <b>→</b>
    </button>
  );
}

function sectionEyebrow(section: AdminSection) {
  if (section === "classes") return "CLASS MANAGEMENT";
  if (section === "students") return "STUDENT MANAGEMENT";
  if (section === "ai") return "AI CONTROL";
  if (section === "pin") return "STUDENT ACCESS";
  if (section === "corrections") return "TEACHING CORRECTIONS";
  if (section === "analytics") return "AI ANALYTICS";
  return "OVERVIEW";
}

function sectionTitle(section: AdminSection) {
  if (section === "classes" || section === "students" || section === "pin") return "班務管理";
  if (section === "ai" || section === "analytics") return "AI 管理";
  if (section === "corrections") return "解題修正";
  return "管理總覽";
}



const adminStyles = `
  .management-tabs { display:inline-flex; gap:4px; padding:4px; border:1px solid var(--border); background:var(--surface-soft); border-radius:12px; margin-bottom:4px; }
  .management-tabs button { border:0; background:transparent; color:var(--text-secondary); min-height:34px; padding:0 16px; border-radius:9px; font-weight:850; }
  .management-tabs button.active { background:var(--surface); color:var(--text); box-shadow:0 0 0 1px var(--border); }
  @media(max-width:760px){ .management-tabs { width:100%; display:grid; grid-template-columns:1fr 1fr; } .management-tabs button { width:100%; } }

  .admin-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 248px minmax(0, 1fr);
    background: var(--background);
    color: var(--text);
  }

  .admin-center,
  .admin-login-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 30rem),
      radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--accent-gold) 10%, transparent), transparent 28rem),
      var(--background);
  }

  .admin-loading-card,
  .admin-login-card {
    width: min(480px, 100%);
    padding: 34px;
    border-radius: 24px;
    border: 1px solid var(--border);
    background: var(--surface);
    box-shadow: 0 22px 60px rgba(15, 25, 18, 0.12);
  }

  .admin-loading-card h1 {
    margin: 8px 0;
    font-size: 34px;
  }

  .admin-loading-card p,
  .admin-login-brand p {
    color: var(--text-secondary);
  }

  .admin-login-brand {
    margin-bottom: 28px;
  }

  .admin-login-title {
    margin: 8px 0;
    font-size: 42px;
  }

  .admin-field {
    display: grid;
    gap: 8px;
    font-size: 13px;
    font-weight: 800;
  }

  .admin-login-button {
    width: 100%;
    margin-top: 14px;
  }

  .admin-sidebar {
    min-height: 100vh;
    position: sticky;
    top: 0;
    align-self: start;
    padding: 28px 18px 20px;
    border-right: 1px solid #314039;
    background:
      linear-gradient(180deg, #1b2821 0%, #162019 100%);
    color: #edf2ee;
    display: flex;
    flex-direction: column;
  }

  .admin-sidebar-brand {
    padding: 10px 10px 24px;
  }

  .admin-sidebar .hh-eyebrow {
    color: #90a296;
  }

  .admin-sidebar-title {
    margin-top: 7px;
    font-size: 25px;
    color: #f1f3f0;
  }

  .admin-sidebar-subtitle {
    margin-top: 5px;
    color: #7f9185;
    font-size: 11px;
    letter-spacing: 0.04em;
  }

  .admin-nav {
    display: grid;
    gap: 7px;
  }

  .admin-nav-button {
    min-height: 46px;
    border: 0;
    border-radius: 13px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 11px;
    background: transparent;
    color: #aeb8b0;
    cursor: pointer;
    text-align: left;
    font-weight: 800;
    transition: 0.16s ease;
  }

  .admin-nav-button span {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: #9bb0a1;
  }

  .admin-nav-button:hover {
    background: rgba(255,255,255,.05);
    color: white;
  }

  .admin-nav-button.active {
    background: #2d4337;
    color: #fff;
    box-shadow: inset 0 0 0 1px #41574a;
  }

  .admin-nav-button.active span {
    background: #a7b9aa;
    color: #203027;
  }

  .admin-sidebar-footer {
    margin-top: auto;
    padding-top: 18px;
    border-top: 1px solid #314039;
    display: grid;
    gap: 4px;
  }

  .admin-sidebar-link {
    border: 0;
    background: transparent;
    color: #91a096;
    padding: 10px;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
  }

  .admin-sidebar-link:hover {
    color: white;
  }

  .admin-main {
    min-width: 0;
    min-height: 100vh;
  }

  .admin-topbar {
    min-height: 108px;
    padding: 22px 32px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: blur(14px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    position: sticky;
    top: 0;
    z-index: 20;
  }

  .admin-page-title {
    margin: 5px 0 0;
    font-size: 33px;
  }

  .admin-topbar-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .admin-content {
    width: min(1180px, calc(100% - 48px));
    margin: 0 auto;
    padding: 28px 0 64px;
  }

  .admin-stack {
    display: grid;
    gap: 18px;
  }

  .admin-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 13px;
  }

  .admin-kpi {
    min-height: 116px;
    padding: 19px;
    border: 1px solid var(--border);
    border-top: 3px solid var(--primary);
    border-radius: 18px;
    background: var(--surface);
    box-shadow: 0 10px 28px rgba(20,31,24,.045);
  }

  .admin-kpi > div {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 800;
  }

  .admin-kpi strong {
    display: block;
    margin-top: 13px;
    font-size: 26px;
    color: var(--text);
  }

  .admin-kpi.tone-blue { border-top-color: #6e8fb3; }
  .admin-kpi.tone-gold { border-top-color: #c6a35b; }
  .admin-kpi.tone-purple { border-top-color: #8a7aa6; }
  .admin-kpi.tone-red { border-top-color: #a8615b; }

  .admin-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }

  .admin-grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }

  .admin-panel {
    padding: 23px;
  }

  .admin-panel-header {
    margin-bottom: 18px;
  }

  .admin-panel-header h2 {
    margin: 5px 0 3px;
    font-size: 24px;
  }

  .admin-panel-header p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.7;
  }

  .admin-month-metrics,
  .admin-campus-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .admin-metric {
    padding: 14px;
    border-radius: 14px;
    background: var(--surface-soft);
    border: 1px solid var(--border);
  }

  .admin-metric span {
    display: block;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
  }

  .admin-metric strong {
    display: block;
    margin-top: 6px;
    font-size: 16px;
  }

  .admin-current-ai {
    margin: 0 0 16px;
    padding: 15px;
    border: 1px solid var(--border);
    border-radius: 15px;
    background: var(--surface-soft);
    display: flex;
    align-items: center;
    gap: 13px;
  }

  .admin-model-orb {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: var(--primary);
    color: var(--background);
    font-weight: 900;
  }

  [data-theme="dark"] .admin-model-orb {
    color: #142018;
  }

  .admin-current-ai strong,
  .admin-current-ai span {
    display: block;
  }

  .admin-current-ai span {
    margin-top: 3px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .admin-campus-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 13px;
  }

  .admin-campus-card {
    padding: 17px;
    border: 1px solid var(--border);
    border-radius: 17px;
    background: var(--surface-soft);
  }

  .admin-campus-card.campus-高雄班 { border-top: 3px solid #6e8fb3; }
  .admin-campus-card.campus-嘉義班 { border-top: 3px solid #a8615b; }
  .admin-campus-card.campus-員林班 { border-top: 3px solid #8a7aa6; }

  .admin-campus-card-top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
  }

  .admin-campus-card-top span {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .admin-campus-stats {
    grid-template-columns: 1fr 1fr;
  }

  .admin-quick-card {
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: 17px;
    background: var(--surface);
    text-align: left;
    cursor: pointer;
    color: var(--text);
    display: grid;
    gap: 5px;
    transition: .16s ease;
  }

  .admin-quick-card:hover {
    transform: translateY(-2px);
    border-color: var(--secondary);
  }

  .admin-quick-card strong {
    font-size: 18px;
  }

  .admin-quick-card span {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.6;
  }

  .admin-quick-card b {
    margin-top: 5px;
  }

  .admin-add-student {
    display: grid;
    grid-template-columns: .9fr 1.1fr;
    align-items: end;
    gap: 24px;
  }

  .admin-add-form {
    display: grid;
    grid-template-columns: 140px 1fr 120px;
    gap: 9px;
  }

  .admin-student-filter-box {
    margin-bottom: 16px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface-soft);
    display: grid;
    gap: 11px;
  }

  .admin-filter-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .admin-filter-pill {
    min-height: 36px;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 7px;
    background: var(--surface);
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 800;
  }

  .admin-filter-pill span {
    font-size: 11px;
    opacity: .75;
  }

  .admin-filter-pill.active {
    background: var(--primary);
    color: var(--background);
    border-color: var(--primary);
  }

  [data-theme="dark"] .admin-filter-pill.active {
    color: #162019;
  }

  .admin-student-search {
    display: grid;
    grid-template-columns: 1fr 160px;
    gap: 9px;
  }

  .admin-table-wrap {
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow-x: auto;
  }

  .admin-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 760px;
  }

  .admin-table th,
  .admin-table td {
    padding: 13px 15px;
    border-bottom: 1px solid var(--border);
    text-align: left;
  }

  .admin-table th {
    background: var(--surface-soft);
    color: var(--text-secondary);
    font-size: 11px;
    letter-spacing: .04em;
  }

  .admin-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .admin-table tbody tr:hover {
    background: color-mix(in srgb, var(--primary) 4%, var(--surface));
  }

  .align-right {
    text-align: right !important;
  }

  .admin-student-cell {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .admin-avatar {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: var(--primary-soft);
    color: var(--primary);
    font-weight: 900;
  }

  .admin-student-cell strong,
  .admin-student-cell span {
    display: block;
  }

  .admin-student-cell span {
    margin-top: 2px;
    color: var(--text-secondary);
    font-size: 10px;
  }

  .admin-campus-tag {
    min-height: 29px;
    padding: 0 10px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    border: 1px solid;
    font-size: 11px;
    font-weight: 800;
  }

  .admin-campus-tag.tag-高雄班 {
    background: color-mix(in srgb, #6e8fb3 12%, var(--surface));
    color: #6988a5;
    border-color: color-mix(in srgb, #6e8fb3 30%, var(--border));
  }

  .admin-campus-tag.tag-嘉義班 {
    background: color-mix(in srgb, #a8615b 11%, var(--surface));
    color: #a05f59;
    border-color: color-mix(in srgb, #a8615b 30%, var(--border));
  }

  .admin-campus-tag.tag-員林班 {
    background: color-mix(in srgb, #8a7aa6 12%, var(--surface));
    color: #82739e;
    border-color: color-mix(in srgb, #8a7aa6 30%, var(--border));
  }

  .admin-usage-cell {
    width: 120px;
  }

  .admin-usage-cell > span {
    color: var(--text-secondary);
    font-size: 11px;
  }

  .admin-usage-cell > span strong {
    color: var(--text);
    font-size: 15px;
  }

  .admin-usage-cell > div {
    height: 4px;
    margin-top: 6px;
    border-radius: 999px;
    background: var(--border);
    overflow: hidden;
  }

  .admin-usage-cell i {
    display: block;
    height: 100%;
    background: var(--accent-gold);
  }

  .admin-status {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    font-size: 11px;
    font-weight: 800;
  }

  .admin-status i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .admin-status.active { color: var(--success); }
  .admin-status.active i { background: var(--success); }
  .admin-status.inactive { color: var(--text-secondary); }
  .admin-status.inactive i { background: var(--text-secondary); }

  .admin-mini-button {
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid;
    border-radius: 9px;
    background: transparent;
    cursor: pointer;
    font-size: 11px;
    font-weight: 800;
  }

  .admin-mini-button.danger {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 32%, var(--border));
  }

  .admin-mini-button.success {
    color: var(--success);
    border-color: color-mix(in srgb, var(--success) 32%, var(--border));
  }

  .admin-empty {
    padding: 38px;
    text-align: center;
    color: var(--text-secondary);
  }

  .admin-model-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .admin-model-card {
    min-height: 150px;
    padding: 17px;
    border: 1px solid var(--border);
    border-radius: 17px;
    background: var(--surface-soft);
    color: var(--text);
    cursor: pointer;
    text-align: left;
    transition: .16s ease;
  }

  .admin-model-card:hover {
    transform: translateY(-2px);
  }

  .admin-model-card.model-luna { border-top: 3px solid #6e8fb3; }
  .admin-model-card.model-terra { border-top: 3px solid #66866f; }
  .admin-model-card.model-sol { border-top: 3px solid #c6a35b; }

  .admin-model-card.selected {
    box-shadow: 0 0 0 2px var(--primary), 0 12px 28px rgba(20,31,24,.08);
  }

  .admin-model-top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-weight: 900;
  }

  .admin-model-top b {
    font-size: 10px;
    color: var(--primary);
  }

  .admin-model-card p {
    margin: 9px 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.6;
  }

  .admin-model-card small {
    color: var(--text-secondary);
  }

  .admin-segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 9px;
  }

  .admin-segmented button {
    min-height: 78px;
    padding: 13px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface-soft);
    color: var(--text);
    cursor: pointer;
    text-align: left;
  }

  .admin-segmented button.active {
    border: 2px solid var(--primary);
    background: var(--primary-soft);
  }

  .admin-segmented strong,
  .admin-segmented span {
    display: block;
  }

  .admin-segmented span {
    margin-top: 4px;
    color: var(--text-secondary);
    font-size: 11px;
  }

  .admin-save-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 18px;
  }

  .admin-pin-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .admin-pin-card {
    padding: 17px;
    border: 1px solid var(--border);
    border-radius: 17px;
    background: var(--surface-soft);
  }

  .admin-pin-card.pin-高雄班 { border-top: 3px solid #6e8fb3; }
  .admin-pin-card.pin-嘉義班 { border-top: 3px solid #a8615b; }
  .admin-pin-card.pin-員林班 { border-top: 3px solid #8a7aa6; }

  .admin-pin-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .admin-pin-head strong,
  .admin-pin-head span {
    display: block;
  }

  .admin-pin-head span,
  .admin-pin-date {
    margin-top: 4px;
    color: var(--text-secondary);
    font-size: 11px;
  }

  .admin-pin-status {
    color: var(--success);
    font-size: 9px;
    letter-spacing: .08em;
    font-weight: 900;
  }

  .admin-pin-controls {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    margin-top: 14px;
  }

  .admin-notice {
    padding: 12px 14px;
    border-radius: 13px;
    border: 1px solid;
    font-size: 12px;
    font-weight: 700;
  }

  .admin-notice.success {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 9%, var(--surface));
    border-color: color-mix(in srgb, var(--success) 30%, var(--border));
  }

  .admin-notice.danger {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 9%, var(--surface));
    border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
  }

  .admin-notice.warning {
    color: #9d7427;
    background: color-mix(in srgb, var(--accent-gold) 11%, var(--surface));
    border-color: color-mix(in srgb, var(--accent-gold) 35%, var(--border));
  }

  @media (max-width: 1080px) {
    .admin-kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .admin-campus-grid,
    .admin-model-grid,
    .admin-pin-grid {
      grid-template-columns: 1fr;
    }

    .admin-add-student,
    .admin-grid-2 {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .admin-shell {
      display: block;
    }

    .admin-sidebar {
      min-height: auto;
      position: static;
      padding: 16px 14px;
    }

    .admin-sidebar-brand {
      padding: 4px 4px 12px;
    }

    .admin-nav {
      grid-template-columns: repeat(4, 1fr);
      overflow-x: auto;
    }

    .admin-nav-button {
      justify-content: center;
      padding: 0 8px;
      font-size: 11px;
    }

    .admin-nav-button span {
      display: none;
    }

    .admin-sidebar-footer {
      display: none;
    }

    .admin-topbar {
      position: static;
      min-height: 92px;
      padding: 17px 16px;
    }

    .admin-page-title {
      font-size: 27px;
    }

    .admin-content {
      width: min(100% - 24px, 1180px);
      padding-top: 16px;
    }

    .admin-grid-3 {
      grid-template-columns: 1fr;
    }

    .admin-add-form,
    .admin-student-search,
    .admin-pin-controls {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .admin-kpi-grid,
    .admin-segmented {
      grid-template-columns: 1fr 1fr;
    }

    .admin-topbar-actions .hh-button-secondary {
      display: none;
    }

    .admin-month-metrics {
      grid-template-columns: 1fr;
    }
  }

  /* ===== Editorial refinement / JinXuan-style typography ===== */
  .admin-shell .hh-display,
  .admin-login-page .hh-display,
  .admin-center .hh-display {
    font-family: var(--font-serif), "Source Han Serif TC", "Noto Serif TC", "Songti TC", "PMingLiU", serif;
    font-weight: 600;
    letter-spacing: 0.012em;
  }

  .admin-sidebar {
    width: auto;
    background: #1b2620;
    border-right-color: #334139;
  }

  .admin-nav-button span {
    width: 26px;
    height: 22px;
    border-radius: 7px;
    font-family: var(--font-inter), ui-sans-serif, sans-serif;
    font-size: 9px;
    letter-spacing: .08em;
    color: #83958a;
    background: rgba(255,255,255,.035);
  }

  .admin-nav-button.active span {
    background: rgba(218, 225, 219, .9);
    color: #28382f;
  }

  .admin-topbar {
    min-height: 94px;
    padding-top: 18px;
    padding-bottom: 18px;
  }

  .admin-content {
    padding-top: 24px;
  }

  .admin-dashboard-board {
    display: grid;
    grid-template-columns: minmax(0, 1.75fr) minmax(280px, .75fr);
    gap: 16px;
    align-items: start;
  }

  .admin-dashboard-primary {
    min-width: 0;
  }

  .admin-dashboard-side {
    display: grid;
    gap: 16px;
  }

  .admin-compact-panel {
    padding: 20px;
  }

  .admin-month-metrics-vertical {
    grid-template-columns: 1fr;
  }

  .admin-ai-summary-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .admin-ai-summary-head h2 {
    margin: 5px 0 0;
    font-size: 22px;
  }

  .admin-ai-status-dot {
    width: 9px;
    height: 9px;
    margin-top: 5px;
    border-radius: 999px;
    background: #789981;
    box-shadow: 0 0 0 5px color-mix(in srgb, #789981 12%, transparent);
  }

  .admin-ai-summary-desc {
    margin: 10px 0 14px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.65;
  }

  .admin-ai-summary-meta {
    padding: 12px 13px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--surface-soft);
    display: grid;
    gap: 4px;
    margin-bottom: 12px;
  }

  .admin-ai-summary-meta span {
    color: var(--text-secondary);
    font-size: 11px;
    font-family: var(--font-inter), ui-monospace, monospace;
  }

  .admin-ai-summary-meta b {
    font-size: 12px;
    font-weight: 800;
  }

  .admin-full-button {
    width: 100%;
  }

  .admin-quick-links-panel {
    gap: 0;
  }

  .admin-quick-links-panel > button {
    width: 100%;
    min-height: 42px;
    padding: 0;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    font-weight: 750;
  }

  .admin-quick-links-panel > button:last-child {
    border-bottom: 0;
  }

  .admin-quick-links-panel > button b {
    color: var(--text-secondary);
  }

  .admin-campus-grid-editorial {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .admin-campus-grid-editorial .admin-campus-card {
    border-top-width: 1px;
    display: grid;
    grid-template-columns: 150px minmax(0,1fr);
    gap: 14px;
    align-items: center;
  }

  .admin-campus-grid-editorial .admin-campus-card.campus-高雄班 { border-left: 3px solid #718ca4; }
  .admin-campus-grid-editorial .admin-campus-card.campus-嘉義班 { border-left: 3px solid #a46f69; }
  .admin-campus-grid-editorial .admin-campus-card.campus-員林班 { border-left: 3px solid #887b9c; }

  .admin-campus-grid-editorial .admin-campus-card-top {
    margin-bottom: 0;
    display: grid;
    gap: 4px;
  }

  .admin-campus-grid-editorial .admin-campus-stats {
    grid-template-columns: repeat(4, minmax(0,1fr));
  }

  /* Student filter: neutral segmented tabs, no heavy dark-green selected pill */
  .admin-student-filter-box {
    background: color-mix(in srgb, var(--surface-soft) 68%, var(--surface));
  }

  .admin-filter-tabs {
    gap: 8px;
  }

  .admin-filter-pill {
    min-height: 38px;
    padding: 0 11px 0 13px;
    background: var(--surface);
    color: var(--text-secondary);
    border-color: var(--border);
    box-shadow: none;
    transition: .15s ease;
  }

  .admin-filter-pill:hover {
    color: var(--text);
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  }

  .admin-filter-pill span {
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 999px;
    display: inline-grid;
    place-items: center;
    background: var(--surface-soft);
    color: var(--text-secondary);
    opacity: 1;
  }

  .admin-filter-pill.active {
    background: color-mix(in srgb, var(--primary) 9%, var(--surface));
    color: var(--primary);
    border-color: color-mix(in srgb, var(--primary) 70%, var(--border));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 14%, transparent);
  }

  .admin-filter-pill.active span {
    background: color-mix(in srgb, var(--primary) 13%, var(--surface));
    color: var(--primary);
  }

  [data-theme="dark"] .admin-filter-pill.active {
    color: var(--primary-strong, #b5c6b9);
    background: color-mix(in srgb, var(--primary) 12%, var(--surface));
  }

  /* Model cards: remove icon-like color noise; color is only a quiet top accent */
  .admin-model-card {
    background: var(--surface);
    border-top-width: 1px;
    position: relative;
    overflow: hidden;
  }

  .admin-model-card::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    height: 3px;
    background: #8d978f;
    opacity: .75;
  }

  .admin-model-card.model-luna::before { background: #7c8da4; }
  .admin-model-card.model-terra::before { background: #7d947f; }
  .admin-model-card.model-sol::before { background: #b79b61; }

  .admin-model-card.selected {
    border-color: color-mix(in srgb, var(--primary) 68%, var(--border));
    background: color-mix(in srgb, var(--primary) 6%, var(--surface));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 18%, transparent);
  }

  @media (max-width: 1050px) {
    .admin-dashboard-board {
      grid-template-columns: 1fr;
    }

    .admin-dashboard-side {
      grid-template-columns: 1fr 1fr;
    }

    .admin-quick-links-panel {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 760px) {
    .admin-dashboard-side {
      grid-template-columns: 1fr;
    }

    .admin-quick-links-panel {
      grid-column: auto;
    }

    .admin-campus-grid-editorial .admin-campus-card {
      grid-template-columns: 1fr;
    }

    .admin-campus-grid-editorial .admin-campus-stats {
      grid-template-columns: 1fr 1fr;
    }
  }


  /* =========================================================
     SOURCE HAN SERIF + REFINED DARK GLOW / GRADIENT LAYER
     ========================================================= */

  .admin-shell .hh-display,
  .admin-login-page .hh-display,
  .admin-center .hh-display {
    font-family: var(--font-serif), "Source Han Serif TC", "Noto Serif TC", "Songti TC", "PMingLiU", serif;
    font-weight: 650;
    letter-spacing: -0.018em;
  }

  .admin-kpi {
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface) 96%, var(--primary) 4%),
        var(--surface) 58%
      );
  }

  .admin-kpi::after {
    content: "";
    position: absolute;
    width: 130px;
    height: 130px;
    right: -62px;
    top: -78px;
    border-radius: 999px;
    background: radial-gradient(
      circle,
      color-mix(in srgb, currentColor 10%, transparent),
      transparent 68%
    );
    pointer-events: none;
    opacity: .7;
  }

  .admin-dashboard-primary {
    background:
      linear-gradient(
        150deg,
        color-mix(in srgb, var(--surface) 96%, #6e8fb3 4%),
        var(--surface) 46%,
        color-mix(in srgb, var(--surface) 97%, var(--primary) 3%)
      );
  }

  .admin-compact-panel {
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface) 97%, var(--primary) 3%),
        var(--surface)
      );
  }

  .admin-campus-card {
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface-soft) 96%, var(--primary) 4%),
        var(--surface-soft)
      );
  }

  .admin-campus-card::after {
    content: "";
    position: absolute;
    inset: auto -45px -65px auto;
    width: 130px;
    height: 130px;
    border-radius: 50%;
    pointer-events: none;
    opacity: .38;
  }

  .admin-campus-card.campus-高雄班::after {
    background: radial-gradient(circle, rgba(110,143,179,.34), transparent 68%);
  }

  .admin-campus-card.campus-嘉義班::after {
    background: radial-gradient(circle, rgba(168,97,91,.30), transparent 68%);
  }

  .admin-campus-card.campus-員林班::after {
    background: radial-gradient(circle, rgba(138,122,166,.32), transparent 68%);
  }

  .admin-quick-links-panel button,
  .admin-model-card,
  .admin-segmented button,
  .admin-filter-pill,
  .admin-nav-button {
    transition:
      border-color .18s ease,
      background .18s ease,
      box-shadow .18s ease,
      transform .18s ease,
      color .18s ease;
  }

  .admin-quick-links-panel button:hover {
    background:
      linear-gradient(
        90deg,
        color-mix(in srgb, var(--primary) 8%, transparent),
        transparent
      );
  }

  [data-theme="dark"] .admin-main {
    background:
      radial-gradient(circle at 14% 0%, rgba(116, 150, 129, .075), transparent 32rem),
      radial-gradient(circle at 92% 10%, rgba(198, 163, 91, .055), transparent 28rem),
      var(--background);
  }

  [data-theme="dark"] .admin-topbar {
    background:
      linear-gradient(
        115deg,
        color-mix(in srgb, var(--surface) 93%, #809f8c 7%),
        color-mix(in srgb, var(--surface) 97%, transparent)
      );
  }

  [data-theme="dark"] .admin-kpi {
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface) 90%, #90aa98 10%),
        var(--surface) 56%,
        color-mix(in srgb, var(--surface) 96%, #d5ae5d 4%)
      );
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.028),
      0 14px 34px rgba(0,0,0,.12);
  }

  [data-theme="dark"] .admin-panel {
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.025),
      0 16px 38px rgba(0,0,0,.11);
  }

  [data-theme="dark"] .admin-dashboard-primary {
    background:
      linear-gradient(
        148deg,
        rgba(39, 54, 46, .96),
        var(--surface) 42%,
        rgba(31, 42, 36, .98)
      );
  }

  [data-theme="dark"] .admin-compact-panel {
    background:
      linear-gradient(
        145deg,
        rgba(37, 50, 43, .95),
        var(--surface) 62%
      );
  }

  /* Selected nav: soft sage bloom instead of a flat green block. */
  [data-theme="dark"] .admin-nav-button.active {
    border: 1px solid rgba(145, 180, 157, .34);
    background:
      linear-gradient(
        105deg,
        rgba(84, 119, 96, .58),
        rgba(45, 67, 55, .78)
      );
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.055),
      0 0 0 1px rgba(137, 174, 149, .08),
      0 0 24px rgba(105, 151, 120, .16);
  }

  [data-theme="dark"] .admin-nav-button.active span {
    box-shadow:
      0 0 14px rgba(170, 205, 179, .18);
  }

  /* Filters become luminous but remain restrained. */
  [data-theme="dark"] .admin-filter-pill.active {
    background:
      linear-gradient(
        135deg,
        rgba(117, 151, 128, .27),
        rgba(66, 91, 75, .55)
      );
    border-color: rgba(148, 181, 158, .60);
    color: #edf3ee;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.05),
      0 0 0 1px rgba(137, 173, 148, .08),
      0 0 18px rgba(111, 158, 125, .15);
  }

  /* Model cards: each selected model gets its own quiet glow. */
  [data-theme="dark"] .admin-model-card.selected {
    transform: translateY(-1px);
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface-soft) 88%, var(--primary) 12%),
        var(--surface-soft)
      );
  }

  [data-theme="dark"] .admin-model-card.model-luna.selected {
    border-color: rgba(126, 164, 200, .72);
    box-shadow:
      0 0 0 1px rgba(110,143,179,.16),
      0 0 26px rgba(99,142,181,.18),
      0 14px 34px rgba(0,0,0,.12);
  }

  [data-theme="dark"] .admin-model-card.model-terra.selected {
    border-color: rgba(132, 172, 145, .72);
    box-shadow:
      0 0 0 1px rgba(102,134,111,.16),
      0 0 26px rgba(103,155,120,.17),
      0 14px 34px rgba(0,0,0,.12);
  }

  [data-theme="dark"] .admin-model-card.model-sol.selected {
    border-color: rgba(217, 183, 101, .76);
    box-shadow:
      0 0 0 1px rgba(198,163,91,.17),
      0 0 28px rgba(207,171,84,.18),
      0 14px 34px rgba(0,0,0,.12);
  }

  /* Reasoning selector receives the same selection language. */
  [data-theme="dark"] .admin-segmented button.active {
    border-color: rgba(150, 185, 160, .70);
    background:
      linear-gradient(
        145deg,
        rgba(76, 108, 88, .50),
        rgba(38, 52, 44, .86)
      );
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.055),
      0 0 22px rgba(107, 155, 122, .15);
  }

  [data-theme="dark"] .admin-pin-card {
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface-soft) 94%, var(--primary) 6%),
        var(--surface-soft)
      );
  }

  [data-theme="dark"] .admin-campus-card.campus-高雄班 {
    box-shadow: inset 3px 0 0 rgba(110,143,179,.70);
  }

  [data-theme="dark"] .admin-campus-card.campus-嘉義班 {
    box-shadow: inset 3px 0 0 rgba(168,97,91,.70);
  }

  [data-theme="dark"] .admin-campus-card.campus-員林班 {
    box-shadow: inset 3px 0 0 rgba(138,122,166,.72);
  }

  @media (prefers-reduced-motion: reduce) {
    .admin-quick-links-panel button,
    .admin-model-card,
    .admin-segmented button,
    .admin-filter-pill,
    .admin-nav-button {
      transition: none;
    }
  }


  /* =========================================================
     FINAL OVERVIEW LAYOUT
     ========================================================= */

  .admin-overview-panel {
    padding: 24px;
  }

  .admin-overview-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 18px;
  }

  .admin-overview-head .admin-panel-header {
    margin-bottom: 0;
  }

  .admin-overview-month {
    min-width: 170px;
    padding: 13px 15px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface-soft) 95%, var(--accent-gold) 5%),
        var(--surface-soft)
      );
    display: grid;
    gap: 3px;
  }

  .admin-overview-month span {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .06em;
  }

  .admin-overview-month strong {
    font-size: 18px;
  }

  .admin-overview-month b {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .admin-campus-list {
    display: grid;
    gap: 10px;
  }

  .admin-campus-row {
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: 160px minmax(0, 1fr);
    gap: 18px;
    align-items: center;
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background:
      linear-gradient(
        120deg,
        color-mix(in srgb, var(--surface-soft) 96%, var(--primary) 4%),
        var(--surface-soft)
      );
  }

  .admin-campus-row::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
  }

  .admin-campus-row.campus-高雄班::before { background: #6e8fb3; }
  .admin-campus-row.campus-嘉義班::before { background: #a8615b; }
  .admin-campus-row.campus-員林班::before { background: #8a7aa6; }

  .admin-campus-identity strong,
  .admin-campus-identity span {
    display: block;
  }

  .admin-campus-identity strong {
    font-size: 19px;
  }

  .admin-campus-identity span {
    margin-top: 4px;
    color: var(--text-secondary);
    font-size: 11px;
  }

  .admin-campus-row-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .admin-campus-row-metrics .admin-metric {
    padding: 10px 12px;
    background: color-mix(in srgb, var(--surface) 72%, transparent);
  }

  .admin-system-strip {
    display: grid;
    grid-template-columns: 1.2fr 1fr .8fr;
    gap: 12px;
  }

  .admin-system-card {
    min-height: 150px;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: 17px;
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface) 96%, var(--primary) 4%),
        var(--surface)
      );
    box-shadow: 0 10px 26px rgba(20,31,24,.045);
  }

  .admin-system-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .admin-system-card h2 {
    margin: 5px 0 0;
    font-size: 22px;
  }

  .admin-system-card p {
    margin: 10px 0 12px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .admin-system-meta {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 11px;
  }

  .admin-system-meta b {
    color: var(--text);
  }

  .admin-text-link {
    margin-top: 12px;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-weight: 800;
    font-size: 12px;
  }

  .admin-month-inline {
    margin-top: 14px;
    display: grid;
    gap: 10px;
  }

  .admin-month-inline > div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding-bottom: 9px;
    border-bottom: 1px solid var(--border);
  }

  .admin-month-inline > div:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .admin-month-inline span {
    color: var(--text-secondary);
    font-size: 11px;
  }

  .admin-month-inline strong {
    font-size: 15px;
  }

  .admin-system-card-actions {
    display: grid;
    align-content: start;
  }

  .admin-system-card-actions button {
    min-height: 42px;
    padding: 0;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    font-weight: 800;
  }

  .admin-system-card-actions button:last-child {
    border-bottom: 0;
  }

  [data-theme="dark"] .admin-overview-panel {
    background:
      linear-gradient(
        148deg,
        rgba(37, 51, 43, .98),
        var(--surface) 44%,
        rgba(30, 41, 35, .98)
      );
  }

  [data-theme="dark"] .admin-campus-row {
    background:
      linear-gradient(
        110deg,
        rgba(42, 57, 48, .92),
        rgba(31, 42, 36, .96) 62%
      );
  }

  [data-theme="dark"] .admin-campus-row:hover {
    border-color: rgba(139, 174, 149, .35);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.03),
      0 0 22px rgba(103, 151, 118, .09);
  }

  [data-theme="dark"] .admin-system-card {
    background:
      linear-gradient(
        145deg,
        rgba(39, 53, 45, .94),
        rgba(30, 41, 35, .98)
      );
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.025),
      0 14px 32px rgba(0,0,0,.10);
  }

  [data-theme="dark"] .admin-system-card-ai {
    background:
      radial-gradient(circle at 95% 5%, rgba(112, 155, 125, .10), transparent 32%),
      linear-gradient(145deg, rgba(39,53,45,.96), rgba(30,41,35,.98));
  }

  [data-theme="dark"] .admin-system-card-month {
    background:
      radial-gradient(circle at 92% 4%, rgba(198,163,91,.09), transparent 32%),
      linear-gradient(145deg, rgba(39,53,45,.96), rgba(30,41,35,.98));
  }

  [data-theme="dark"] .admin-system-card-actions button:hover,
  [data-theme="dark"] .admin-text-link:hover {
    color: #d9e7dc;
    text-shadow: 0 0 12px rgba(154, 194, 166, .22);
  }

  @media (max-width: 980px) {
    .admin-campus-row {
      grid-template-columns: 1fr;
    }

    .admin-system-strip {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .admin-overview-head {
      flex-direction: column;
    }

    .admin-overview-month {
      width: 100%;
    }

    .admin-campus-row-metrics {
      grid-template-columns: 1fr 1fr;
    }
  }


  /* =========================================================
     DASHBOARD V5 — PERIOD → CAMPUS → AI → PIN
     ========================================================= */

  .admin-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 18px;
  }

  .admin-section-head.compact {
    align-items: end;
  }

  .admin-section-head h2 {
    margin: 5px 0 3px;
    font-size: 25px;
  }

  .admin-section-head p,
  .admin-section-note {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.65;
  }

  .admin-period-panel {
    padding: 22px;
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface) 97%, var(--accent-gold) 3%),
        var(--surface)
      );
  }

  .admin-period-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 11px;
  }

  .admin-period-card {
    position: relative;
    overflow: hidden;
    min-height: 112px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface-soft);
  }

  .admin-period-card::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 3px;
  }

  .admin-period-card.period-month::before { background: #8a7aa6; }
  .admin-period-card.period-today::before { background: #6e8fb3; }
  .admin-period-card.period-month-cost::before { background: #c6a35b; }
  .admin-period-card.period-today-cost::before { background: #7b9a82; }

  .admin-period-card > span,
  .admin-period-card > strong,
  .admin-period-card > small {
    display: block;
  }

  .admin-period-card > span {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
  }

  .admin-period-card > strong {
    margin-top: 10px;
    font-size: 24px;
  }

  .admin-period-card > small {
    margin-top: 5px;
    color: var(--text-secondary);
    font-size: 10px;
  }

  .admin-current-model-mini {
    min-width: 170px;
    padding: 11px 13px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--surface-soft);
  }

  .admin-current-model-mini span,
  .admin-current-model-mini strong {
    display: block;
  }

  .admin-current-model-mini span {
    color: var(--text-secondary);
    font-size: 10px;
  }

  .admin-current-model-mini strong {
    margin-top: 4px;
    font-size: 13px;
  }

  .admin-overview-ai-grid {
    display: grid;
    gap: 18px;
  }

  .admin-overview-ai-block {
    display: grid;
    gap: 9px;
  }

  .admin-control-label {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .04em;
  }

  .overview-model-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .overview-model-grid .admin-model-card {
    min-height: 126px;
  }

  .overview-reasoning {
    max-width: 620px;
  }

  .overview-save-row {
    margin-top: 16px;
  }

  .overview-pin-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  [data-theme="dark"] .admin-period-panel {
    background:
      radial-gradient(circle at 8% 0%, rgba(138,122,166,.08), transparent 32%),
      radial-gradient(circle at 92% 0%, rgba(198,163,91,.07), transparent 30%),
      linear-gradient(145deg, rgba(39,53,45,.96), rgba(30,41,35,.99));
  }

  [data-theme="dark"] .admin-period-card {
    background:
      linear-gradient(
        145deg,
        rgba(43, 57, 49, .90),
        rgba(31, 42, 36, .97)
      );
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.025),
      0 10px 24px rgba(0,0,0,.08);
  }

  [data-theme="dark"] .admin-ai-control-panel {
    background:
      radial-gradient(circle at 92% 4%, rgba(110,143,179,.08), transparent 29%),
      linear-gradient(145deg, rgba(39,53,45,.96), rgba(30,41,35,.99));
  }

  [data-theme="dark"] .admin-pin-overview-panel {
    background:
      radial-gradient(circle at 8% 0%, rgba(198,163,91,.055), transparent 28%),
      linear-gradient(145deg, rgba(39,53,45,.96), rgba(30,41,35,.99));
  }

  @media (max-width: 980px) {
    .admin-period-grid {
      grid-template-columns: 1fr 1fr;
    }

    .overview-model-grid,
    .overview-pin-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 620px) {
    .admin-period-grid {
      grid-template-columns: 1fr 1fr;
    }

    .admin-section-head {
      flex-direction: column;
    }

    .admin-current-model-mini {
      width: 100%;
    }
  }


  .admin-student-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
    flex-wrap: wrap;
  }

  .admin-mini-button.quota {
    color: var(--accent-gold);
    border-color: color-mix(in srgb, var(--accent-gold) 32%, var(--border));
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--accent-gold) 8%, var(--surface)),
        var(--surface)
      );
  }

  .admin-mini-button.quota:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent-gold) 58%, var(--border));
    box-shadow: 0 0 18px color-mix(in srgb, var(--accent-gold) 13%, transparent);
  }

  .admin-mini-button.quota:disabled {
    opacity: .45;
    cursor: default;
  }

  [data-theme="dark"] .admin-mini-button.quota {
    color: #e0bd69;
    background:
      linear-gradient(
        135deg,
        rgba(190, 151, 70, .12),
        rgba(32, 42, 36, .92)
      );
    border-color: rgba(214, 174, 88, .30);
  }


  .admin-router-grid,
  .admin-followup-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .admin-router-card,
  .admin-simple-setting {
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 18px;
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface) 96%, var(--primary) 4%),
        var(--surface)
      );
  }

  .admin-router-card.disabled {
    opacity: .5;
  }

  .admin-router-card h3,
  .admin-simple-setting h3 {
    margin: 5px 0 6px;
    font-size: 18px;
  }

  .admin-router-card > p,
  .admin-simple-setting > p {
    min-height: 40px;
    margin: 0 0 14px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.65;
  }

  .admin-router-field {
    display: grid;
    gap: 7px;
    margin-top: 12px;
  }

  .admin-router-field > span {
    font-size: 12px;
    font-weight: 800;
  }

  .admin-reasoning-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .admin-reasoning-pills button,
  .admin-toggle-button {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .admin-reasoning-pills button.active,
  .admin-toggle-button.active {
    border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, var(--surface));
  }

  .admin-reasoning-pills button:disabled,
  .admin-toggle-button:disabled {
    cursor: default;
  }

  .admin-router-meta {
    display: grid;
    gap: 3px;
    margin-top: 13px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 11px;
  }

  .admin-router-threshold,
  .admin-quota-control {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-top: 18px;
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: 16px;
  }

  .admin-router-threshold > div:first-child,
  .admin-quota-control > div:first-child {
    display: grid;
    gap: 4px;
  }

  .admin-router-threshold span,
  .admin-quota-control span,
  .admin-simple-setting p {
    color: var(--muted);
  }

  .admin-number-control {
    display: flex;
    align-items: center;
    gap: 9px;
    white-space: nowrap;
  }

  .admin-number-control .hh-input {
    width: 98px;
    text-align: center;
  }

  .admin-followup-grid {
    margin-top: 14px;
  }

  @media (max-width: 760px) {
    .admin-router-grid,
    .admin-followup-grid {
      grid-template-columns: 1fr;
    }

    .admin-router-threshold,
    .admin-quota-control {
      align-items: stretch;
      flex-direction: column;
    }
  }



  .admin-mobile-header,
  .admin-mobile-backdrop,
  .admin-student-mobile-list {
    display: none;
  }

  .admin-sidebar-theme-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    color: #b5c0b8;
    font-size: 11px;
    font-weight: 800;
  }

  .admin-student-mobile-card {
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
  }

  .admin-student-mobile-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .admin-student-mobile-usage {
    display: grid;
    gap: 8px;
    margin-top: 13px;
    padding: 11px 12px;
    border-radius: 12px;
    background: var(--surface-soft);
  }

  .admin-student-mobile-usage > div:first-child {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .admin-student-mobile-usage strong {
    color: var(--text);
    font-size: 13px;
  }

  .admin-student-mobile-progress {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--border);
  }

  .admin-student-mobile-progress i {
    display: block;
    height: 100%;
    background: var(--accent-gold);
  }

  .admin-student-mobile-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    margin-top: 11px;
  }

  .admin-analytics-placeholder {
    min-height: 420px;
  }

  .admin-analytics-placeholder > h2 {
    margin: 6px 0 8px;
    font-size: 30px;
  }

  .admin-analytics-placeholder > p {
    max-width: 680px;
    color: var(--text-secondary);
    line-height: 1.7;
  }

  .admin-analytics-preview-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 22px;
  }

  .admin-analytics-preview-grid article {
    display: grid;
    gap: 6px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 15px;
    background: var(--surface-soft);
  }

  .admin-analytics-preview-grid span {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .08em;
  }

  @media (max-width: 760px) {
    .admin-shell {
      display: block;
      padding-top: 70px;
    }

    .admin-mobile-header {
      position: fixed;
      top: 7px;
      left: 10px;
      right: 10px;
      z-index: 130;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 56px;
      padding: 7px 8px 7px 13px;
      border: 1px solid var(--border);
      border-radius: 17px;
      background: color-mix(in srgb, var(--surface) 92%, transparent);
      box-shadow: 0 12px 30px rgba(18, 26, 21, .12);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .admin-mobile-brand {
      display: grid;
      gap: 1px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--text);
      text-align: left;
      cursor: pointer;
    }

    .admin-mobile-brand span {
      font-size: 16px;
    }

    .admin-mobile-brand small {
      color: var(--text-secondary);
      font-size: 8px;
      font-weight: 800;
      letter-spacing: .1em;
    }

    .admin-mobile-menu-button {
      display: grid;
      place-content: center;
      gap: 4px;
      width: 42px;
      height: 42px;
      border: 1px solid var(--border);
      border-radius: 13px;
      background: var(--surface);
      cursor: pointer;
    }

    .admin-mobile-menu-button span {
      display: block;
      width: 17px;
      height: 1.5px;
      border-radius: 99px;
      background: var(--text);
    }

    .admin-mobile-backdrop {
      position: fixed;
      inset: 0;
      z-index: 118;
      display: block;
      border: 0;
      background: rgba(10, 15, 12, .28);
      backdrop-filter: blur(2px);
    }

    .admin-sidebar {
      position: fixed !important;
      top: 0;
      right: 0;
      bottom: 0;
      left: auto;
      z-index: 125;
      display: flex;
      flex-direction: column;
      width: min(330px, 86vw);
      min-height: 100dvh;
      padding: 22px 16px 18px;
      transform: translateX(105%);
      transition: transform .2s ease;
      box-shadow: -22px 0 60px rgba(10, 15, 12, .24);
    }

    .admin-sidebar.mobile-open {
      transform: translateX(0);
    }

    .admin-sidebar-brand {
      padding: 8px 6px 18px;
    }

    .admin-nav {
      display: grid;
      grid-template-columns: 1fr !important;
      gap: 7px;
      overflow: visible;
    }

    .admin-nav-button {
      justify-content: flex-start !important;
      min-height: 46px;
      padding: 0 12px !important;
      font-size: 13px !important;
    }

    .admin-nav-button span {
      display: grid !important;
    }

    .admin-sidebar-footer {
      display: grid !important;
      gap: 7px;
      margin-top: auto;
    }

    .admin-main {
      min-width: 0;
    }

    .admin-topbar {
      position: static !important;
      min-height: auto;
      padding: 12px 14px 9px;
      background: transparent;
      border-bottom: 0;
    }

    .admin-topbar .hh-eyebrow,
    .admin-page-title {
      display: none;
    }

    .admin-topbar-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .admin-content {
      width: min(100% - 20px, 1180px) !important;
      padding-top: 4px !important;
    }

    .admin-table-wrap {
      display: none;
    }

    .admin-student-mobile-list {
      display: grid;
      gap: 9px;
      margin-top: 12px;
    }

    .admin-student-mobile-actions .admin-mini-button {
      min-height: 38px;
      padding: 0 6px;
      font-size: 10px;
    }

    .admin-analytics-preview-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 430px) {
    .admin-student-mobile-actions {
      grid-template-columns: 1fr;
    }
  }


  .admin-mini-button.history {
    border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 6%, var(--surface));
  }

  .admin-history-overlay {
    position: fixed;
    inset: 0;
    z-index: 160;
    display: grid;
    place-items: stretch;
  }

  .admin-history-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(15, 22, 18, .48);
    backdrop-filter: blur(4px);
  }

  .admin-history-panel {
    position: relative;
    z-index: 1;
    width: min(1180px, calc(100% - 48px));
    height: min(900px, calc(100vh - 42px));
    margin: auto;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 24px;
    background: var(--bg);
    box-shadow: 0 32px 100px rgba(9, 16, 12, .28);
  }

  .admin-history-panel-head {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    min-height: 88px;
    padding: 16px 22px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(18px);
  }

  .admin-history-student-identity {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .admin-avatar.large {
    width: 48px;
    height: 48px;
    font-size: 17px;
  }

  .admin-history-student-identity h2 {
    margin: 3px 0 2px;
    font-size: 23px;
  }

  .admin-history-student-identity p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 11px;
  }

  .admin-history-close {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--surface);
    color: var(--text);
    font-size: 25px;
    cursor: pointer;
  }

  .admin-history-filter-toggle-row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
  .admin-history-filter-toggle-row > span { font-size:12px; color:var(--text-secondary); }
  .admin-correction-add { border:1px solid color-mix(in srgb,#c79b55 55%,var(--border)); background:color-mix(in srgb,#c79b55 14%,var(--surface)); color:var(--text); border-radius:10px; min-height:36px; padding:0 12px; font-weight:850; }
  .admin-correction-message { font-size:11px; color:var(--text-secondary); }
  .admin-history-filterbar {
    display: grid;
    grid-template-columns: minmax(230px, 1.7fr) 1fr 1fr 1fr auto;
    gap: 10px;
    align-items: end;
    padding: 18px 22px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .admin-history-filterbar label {
    display: grid;
    gap: 6px;
  }

  .admin-history-filterbar label > span {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 800;
  }

  .admin-history-filter-actions {
    display: flex;
    gap: 7px;
  }

  .admin-history-summary-line {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 15px 22px 8px;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
  }

  .admin-history-list {
    display: grid;
    gap: 9px;
    padding: 10px 22px 28px;
  }

  .admin-history-row {
    display: grid;
    grid-template-columns: 108px minmax(0, 1fr) 34px;
    gap: 14px;
    align-items: center;
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform .16s ease, border-color .16s ease;
  }

  .admin-history-row:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--primary) 34%, var(--border));
  }

  .admin-history-thumb {
    display: grid;
    place-items: center;
    overflow: hidden;
    height: 86px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary) 8%, var(--surface));
    color: var(--primary);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .12em;
  }

  .admin-history-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .admin-history-row-main {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .admin-history-row-main > strong {
    overflow: hidden;
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-history-row-main > p {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.55;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .admin-history-row-meta,
  .admin-history-row-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .admin-history-row-meta span,
  .admin-history-row-tags span {
    color: var(--text-secondary);
    font-size: 9px;
    font-weight: 800;
  }

  .admin-history-row-meta span:first-child {
    color: var(--primary);
  }

  .admin-history-row-meta .favorite {
    color: #a58131;
  }

  .admin-history-row-tags span {
    padding: 3px 6px;
    border-radius: 999px;
    background: var(--surface-soft);
  }

  .admin-history-chevron {
    color: var(--text-secondary);
    font-size: 25px;
    text-align: center;
  }

  .admin-history-empty-state {
    display: grid;
    place-items: center;
    gap: 5px;
    min-height: 300px;
    padding: 30px;
    text-align: center;
  }

  .admin-history-empty-state span {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .admin-history-detail {
    padding: 20px 24px 34px;
  }

  .admin-history-detail-back {
    margin: 2px 0 17px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--primary);
    font-weight: 800;
    cursor: pointer;
  }

  .admin-history-detail-title {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 17px;
  }

  .admin-history-detail-title h3 {
    margin: 6px 0 0;
    font-size: 29px;
  }

  .admin-dispute-badge {
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 850;
  }

  .admin-dispute-badge.status-resolved {
    color: var(--primary);
    border-color: color-mix(in srgb, var(--primary) 32%, var(--border));
  }

  .admin-dispute-badge.status-disputed {
    color: #a15a4f;
    border-color: color-mix(in srgb, #a15a4f 32%, var(--border));
  }

  .admin-history-images {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 11px;
    margin-bottom: 16px;
  }

  .admin-history-images figure {
    overflow: hidden;
    margin: 0;
    border: 1px solid var(--border);
    border-radius: 15px;
    background: var(--surface);
  }

  .admin-history-images img {
    display: block;
    width: 100%;
    height: 300px;
    object-fit: contain;
    background: #fff;
  }

  .admin-history-images figcaption {
    padding: 7px 10px;
    color: var(--text-secondary);
    font-size: 9px;
    font-weight: 750;
  }

  .admin-history-context-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 15px;
  }

  .admin-history-context-grid article {
    display: grid;
    gap: 5px;
    padding: 14px 15px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
  }

  .admin-history-context-grid article.wide {
    grid-column: 1 / -1;
  }

  .admin-history-context-grid span {
    color: var(--text-secondary);
    font-size: 9px;
    font-weight: 800;
  }

  .admin-history-analysis-section,
  .admin-history-routing,
  .admin-history-followups {
    margin-top: 12px;
    padding: 19px;
    border: 1px solid var(--border);
    border-radius: 17px;
    background: var(--surface);
  }

  .admin-history-analysis-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .admin-history-analysis-head > .hh-number {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary) 9%, var(--surface));
    color: var(--primary);
    font-size: 11px;
    font-weight: 900;
  }

  .admin-history-analysis-head h4 {
    margin: 3px 0 0;
    font-size: 19px;
  }

  .admin-science-text {
    color: var(--text);
    font-size: 13px;
    line-height: 1.78;
  }

  .admin-science-text p {
    margin: 4px 0;
  }

  .admin-display-formula {
    overflow-x: auto;
    margin: 10px 0;
    padding: 5px 0;
  }

  .admin-text-gap {
    height: 7px;
  }

  .admin-option-line {
    padding-left: 2.2em;
    text-indent: -2.2em;
  }

  .admin-history-routing-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
  }

  .admin-routing-card {
    display: grid;
    gap: 5px;
    padding: 13px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--surface-soft);
  }

  .admin-routing-card strong {
    font-size: 12px;
  }

  .admin-routing-card span {
    color: var(--text-secondary);
    font-size: 9px;
    line-height: 1.5;
  }

  .admin-history-no-followup {
    padding: 20px;
    border-radius: 12px;
    background: var(--surface-soft);
    color: var(--text-secondary);
    font-size: 11px;
    text-align: center;
  }

  .admin-history-followup-list {
    display: grid;
    gap: 11px;
  }

  .admin-history-followup-list > article {
    display: grid;
    gap: 8px;
    padding: 13px;
    border: 1px solid var(--border);
    border-radius: 13px;
  }

  .admin-history-followup-question,
  .admin-history-followup-answer {
    display: grid;
    gap: 5px;
  }

  .admin-history-followup-question > span,
  .admin-history-followup-answer > div span {
    color: var(--text-secondary);
    font-size: 9px;
  }

  .admin-history-followup-question p {
    margin: 0;
    font-size: 12px;
  }

  .admin-history-followup-answer > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  @media (max-width: 900px) {
    .admin-history-panel {
      width: calc(100% - 18px);
      height: calc(100vh - 18px);
      border-radius: 19px;
    }

    .admin-history-filterbar {
      grid-template-columns: 1fr 1fr;
    }

    .admin-history-search-field {
      grid-column: 1 / -1;
    }

    .admin-history-filter-actions {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 620px) {
    .admin-history-panel {
      width: 100%;
      height: 100vh;
      border: 0;
      border-radius: 0;
    }

    .admin-history-panel-head {
      min-height: 72px;
      padding: 11px 13px;
    }

    .admin-avatar.large {
      display: none;
    }

    .admin-history-student-identity h2 {
      font-size: 19px;
    }

    .admin-history-filterbar {
      grid-template-columns: 1fr;
      padding: 13px;
    }

    .admin-history-search-field,
    .admin-history-filter-actions {
      grid-column: auto;
    }

    .admin-history-filter-actions > * {
      flex: 1;
    }

    .admin-history-summary-line {
      align-items: flex-start;
      flex-direction: column;
      padding: 12px 13px 5px;
    }

    .admin-history-list {
      padding: 8px 13px 24px;
    }

    .admin-history-row {
      grid-template-columns: 82px minmax(0, 1fr);
      gap: 9px;
    }

    .admin-history-chevron {
      display: none;
    }

    .admin-history-thumb {
      height: 86px;
    }

    .admin-history-detail {
      padding: 13px 13px 28px;
    }

    .admin-history-detail-title h3 {
      font-size: 23px;
    }

    .admin-history-images {
      grid-template-columns: 1fr;
    }

    .admin-history-images img {
      height: auto;
      max-height: 430px;
    }

    .admin-history-context-grid,
    .admin-history-routing-grid {
      grid-template-columns: 1fr;
    }

    .admin-history-context-grid article.wide {
      grid-column: auto;
    }

    .admin-history-analysis-section,
    .admin-history-routing,
    .admin-history-followups {
      padding: 14px;
    }
  }


  .admin-analytics-hero {
    overflow: hidden;
    background:
      radial-gradient(
        circle at 94% 10%,
        color-mix(in srgb, var(--primary) 11%, transparent),
        transparent 32%
      ),
      var(--surface);
  }

  .admin-analytics-hero-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }

  .admin-analytics-hero-head h2 {
    margin: 5px 0 5px;
    font-size: 30px;
  }

  .admin-analytics-hero-head p {
    max-width: 720px;
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.7;
  }

  .admin-analytics-range {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 18px;
  }

  .admin-analytics-range button {
    min-height: 37px;
    padding: 0 15px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 850;
    cursor: pointer;
  }

  .admin-analytics-range button.active {
    border-color: color-mix(in srgb, var(--primary) 48%, var(--border));
    background: color-mix(in srgb, var(--primary) 9%, var(--surface));
    color: var(--primary);
  }

  .admin-analytics-window {
    margin-top: 11px;
    color: var(--text-secondary);
    font-size: 10px;
  }

  .admin-analytics-loading {
    display: grid;
    place-items: center;
    min-height: 240px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .admin-analytics-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .admin-analytics-kpi {
    display: grid;
    align-content: start;
    gap: 6px;
    min-height: 160px;
    padding: 18px;
  }

  .admin-analytics-kpi > span {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
  }

  .admin-analytics-kpi > strong {
    margin-top: 3px;
    font-size: clamp(24px, 3vw, 35px);
    line-height: 1;
  }

  .admin-analytics-kpi > small {
    margin-top: auto;
    color: var(--text-secondary);
    font-size: 9px;
    line-height: 1.55;
  }

  .admin-analytics-role-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 9px;
  }

  .admin-role-card {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface-soft);
  }

  .admin-role-card > div {
    display: grid;
    gap: 3px;
  }

  .admin-role-card span {
    font-size: 12px;
    font-weight: 850;
  }

  .admin-role-card small {
    min-height: 28px;
    color: var(--text-secondary);
    font-size: 9px;
    line-height: 1.45;
  }

  .admin-role-card > strong {
    font-size: 16px;
  }

  .admin-role-card > b {
    color: var(--primary);
    font-size: 11px;
  }

  .admin-quality-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .admin-quality-card {
    display: grid;
    gap: 7px;
    padding: 17px;
    border: 1px solid var(--border);
    border-radius: 15px;
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--surface) 96%, var(--primary) 4%),
        var(--surface)
      );
  }

  .admin-quality-card h3 {
    min-height: 42px;
    margin: 0;
    font-size: 15px;
    line-height: 1.4;
  }

  .admin-quality-card > strong {
    margin-top: 7px;
    color: var(--primary);
    font-size: 28px;
  }

  .admin-quality-fraction {
    font-size: 11px;
    font-weight: 850;
  }

  .admin-quality-card > small {
    color: var(--text-secondary);
    font-size: 9px;
    line-height: 1.55;
  }

  .admin-arbitration-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .admin-arbitration-summary article {
    display: grid;
    gap: 6px;
    min-height: 125px;
    padding: 15px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface-soft);
  }

  .admin-arbitration-summary article.good {
    border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
  }

  .admin-arbitration-summary article.warning {
    border-color: color-mix(in srgb, #a46c4e 28%, var(--border));
  }

  .admin-arbitration-summary span {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 800;
  }

  .admin-arbitration-summary strong {
    font-size: 25px;
  }

  .admin-arbitration-summary small {
    margin-top: auto;
    color: var(--text-secondary);
    font-size: 9px;
    line-height: 1.5;
  }

  .admin-analytics-table-wrap {
    overflow-x: auto;
  }

  .admin-analytics-table {
    width: 100%;
    min-width: 820px;
    border-collapse: collapse;
  }

  .admin-analytics-table th,
  .admin-analytics-table td {
    padding: 12px 10px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: middle;
  }

  .admin-analytics-table th {
    color: var(--text-secondary);
    font-size: 9px;
    font-weight: 850;
    letter-spacing: .04em;
  }

  .admin-analytics-table td {
    font-size: 11px;
  }

  .admin-model-name {
    display: grid;
    gap: 2px;
  }

  .admin-model-name strong {
    font-size: 11px;
  }

  .admin-model-name span {
    color: var(--text-secondary);
    font-size: 9px;
  }

  .admin-metric-cell {
    display: grid;
    gap: 2px;
  }

  .admin-metric-cell strong {
    font-size: 11px;
  }

  .admin-metric-cell span {
    color: var(--text-secondary);
    font-size: 8px;
  }

  .admin-analytics-empty-cell {
    padding: 30px !important;
    color: var(--text-secondary);
    text-align: center !important;
  }

  .admin-model-mobile-list {
    display: none;
  }

  .admin-analytics-footnote {
    padding: 0 4px;
    color: var(--text-secondary);
    font-size: 9px;
    line-height: 1.65;
  }

  @media (max-width: 1100px) {
    .admin-analytics-kpi-grid,
    .admin-quality-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .admin-analytics-role-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .admin-analytics-hero-head {
      align-items: stretch;
      flex-direction: column;
    }

    .admin-analytics-hero-head .hh-button-secondary {
      width: 100%;
    }

    .admin-analytics-kpi-grid,
    .admin-quality-grid,
    .admin-arbitration-summary {
      grid-template-columns: 1fr 1fr;
    }

    .admin-analytics-role-grid {
      grid-template-columns: 1fr 1fr;
    }

    .admin-analytics-table-wrap {
      display: none;
    }

    .admin-model-mobile-list {
      display: grid;
      gap: 9px;
    }

    .admin-model-mobile-card {
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--surface-soft);
    }

    .admin-model-mobile-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .admin-model-mobile-head > div {
      display: grid;
      gap: 2px;
    }

    .admin-model-mobile-head strong {
      font-size: 12px;
    }

    .admin-model-mobile-head span {
      color: var(--text-secondary);
      font-size: 9px;
    }

    .admin-model-mobile-head b {
      color: var(--primary);
      font-size: 11px;
    }

    .admin-model-mobile-metrics {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .admin-model-mobile-metrics > div {
      display: grid;
      gap: 3px;
      padding: 9px;
      border-radius: 10px;
      background: var(--surface);
    }

    .admin-model-mobile-metrics span,
    .admin-model-mobile-metrics small {
      color: var(--text-secondary);
      font-size: 8px;
    }

    .admin-model-mobile-metrics strong {
      font-size: 12px;
    }
  }

  @media (max-width: 500px) {
    .admin-analytics-kpi-grid,
    .admin-quality-grid,
    .admin-arbitration-summary,
    .admin-analytics-role-grid {
      grid-template-columns: 1fr;
    }

    .admin-analytics-range {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .admin-analytics-range button {
      width: 100%;
    }
  }


  /* ===== Admin compact mobile redesign ===== */

  .admin-period-card,
  .admin-period-card > span,
  .admin-period-card > strong,
  .admin-period-card > small {
    text-align: left;
  }

  .admin-cost-alert-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14px;
    align-items: end;
    margin-top: 14px;
    padding: 13px 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface-soft);
  }

  .admin-cost-alert-strip.warning {
    border-color: color-mix(in srgb, #c59a43 55%, var(--border));
    background: color-mix(in srgb, #c59a43 10%, var(--surface));
    box-shadow: 0 0 0 2px color-mix(in srgb, #c59a43 8%, transparent);
  }

  .admin-cost-alert-status {
    display: grid;
    gap: 3px;
  }

  .admin-cost-alert-status strong {
    font-size: 13px;
  }

  .admin-cost-alert-status span {
    color: var(--text-secondary);
    font-size: 10px;
  }

  .admin-cost-alert-controls {
    display: flex;
    align-items: end;
    gap: 7px;
  }

  .admin-cost-alert-controls label {
    display: grid;
    gap: 4px;
  }

  .admin-cost-alert-controls label > span {
    color: var(--text-secondary);
    font-size: 9px;
    font-weight: 800;
  }

  .admin-cost-alert-controls .hh-input {
    width: 130px;
    min-height: 38px;
  }

  .admin-cost-alert-controls .hh-button-secondary {
    min-height: 38px;
  }

  .admin-cost-alert-message {
    margin-top: 7px;
    color: var(--danger);
    font-size: 10px;
  }

  .admin-cost-alert-message.success {
    color: var(--success);
  }

  @media (max-width: 760px) {
    .admin-topbar {
      min-height: 64px;
      padding: 10px 12px;
    }

    .admin-page-title {
      margin-top: 2px;
      font-size: 20px;
      line-height: 1.15;
    }

    .admin-topbar .hh-eyebrow {
      font-size: 8px;
    }

    .admin-content {
      width: min(100% - 16px, 1180px);
      padding-top: 10px;
      padding-bottom: 28px;
    }

    .admin-stack {
      gap: 9px;
    }

    .admin-panel,
    .admin-compact-panel {
      padding: 13px;
      border-radius: 14px;
    }

    .admin-section-head,
    .admin-panel-header,
    .admin-analytics-hero-head,
    .admin-history-detail-title,
    .admin-history-analysis-head {
      gap: 8px;
      margin-bottom: 10px;
    }

    .admin-section-head h2,
    .admin-panel-header h2,
    .admin-analytics-hero-head h2,
    .admin-ai-summary-head h2,
    .admin-system-card h2,
    .admin-history-detail-title h3,
    .admin-history-analysis-head h4 {
      font-size: 16px;
      line-height: 1.25;
    }

    .admin-section-head p,
    .admin-panel-header p,
    .admin-analytics-hero-head p {
      margin-top: 3px;
      font-size: 10px;
      line-height: 1.5;
    }

    .admin-section-note {
      display: none;
    }

    .admin-period-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
    }

    .admin-period-card {
      min-height: 76px;
      padding: 10px 11px;
      border-radius: 12px;
    }

    .admin-period-card > span {
      font-size: 9px;
    }

    .admin-period-card > strong {
      margin-top: 5px;
      font-size: 17px;
      text-align: left !important;
    }

    .admin-period-card > small {
      margin-top: 3px;
      font-size: 8px;
    }

    .admin-cost-alert-strip {
      grid-template-columns: 1fr;
      gap: 9px;
      margin-top: 9px;
      padding: 10px;
      border-radius: 12px;
    }

    .admin-cost-alert-status strong {
      font-size: 12px;
    }

    .admin-cost-alert-controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 7px;
    }

    .admin-cost-alert-controls .hh-input {
      width: 100%;
      min-height: 36px;
    }

    .admin-cost-alert-controls .hh-button-secondary {
      min-height: 36px;
      padding-left: 10px;
      padding-right: 10px;
    }

    .admin-campus-list {
      gap: 7px;
    }

    .admin-campus-row {
      grid-template-columns: 82px minmax(0, 1fr);
      gap: 8px;
      min-height: 72px;
      padding: 9px 10px;
      border-radius: 12px;
    }

    .admin-campus-identity strong {
      font-size: 14px;
    }

    .admin-campus-identity span {
      margin-top: 2px;
      font-size: 9px;
    }

    .admin-campus-row-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 7px;
    }

    .admin-campus-row-metrics .admin-metric {
      padding: 4px 6px;
      border-radius: 8px;
    }

    .admin-campus-row-metrics .admin-metric span {
      font-size: 7.5px;
    }

    .admin-campus-row-metrics .admin-metric strong {
      margin-top: 1px;
      font-size: 10px;
      text-align: left;
    }

    .admin-kpi-grid {
      gap: 7px;
    }

    .admin-kpi {
      min-height: 92px;
      padding: 11px;
      border-radius: 12px;
    }

    .admin-kpi strong {
      font-size: 20px;
    }

    .admin-ai-card,
    .admin-model-card,
    .admin-setting-card,
    .admin-student-mobile-card,
    .admin-pin-card {
      padding: 11px;
      border-radius: 12px;
    }

    .admin-segmented,
    .admin-filter-tabs {
      gap: 5px;
    }

    .admin-nav-button,
    .admin-mini-button {
      min-height: 36px;
    }

    .admin-analytics-kpi-grid {
      gap: 7px;
    }

    .admin-analytics-kpi {
      min-height: 112px;
      padding: 12px;
    }

    .admin-analytics-kpi > strong {
      font-size: 22px;
    }

    .admin-quality-card,
    .admin-role-card,
    .admin-arbitration-summary article {
      padding: 11px;
      min-height: auto;
    }

    .admin-quality-card h3 {
      min-height: 0;
      font-size: 13px;
    }

    .admin-quality-card > strong {
      font-size: 22px;
    }
  }

  @media (max-width: 520px) {
    .admin-period-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .admin-kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .admin-quality-grid,
    .admin-arbitration-summary,
    .admin-analytics-role-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }


  /* =========================================================
     ADMIN MOBILE DENSITY PASS 2
     ========================================================= */

  @media (max-width: 760px) {
    /* Global mobile density */
    .admin-content {
      width: min(100% - 14px, 1180px);
      padding-top: 8px;
      padding-bottom: 22px;
    }

    .admin-stack {
      gap: 7px;
    }

    .admin-panel,
    .admin-compact-panel {
      padding: 11px;
      border-radius: 13px;
    }

    .admin-section-head,
    .admin-panel-header,
    .admin-analytics-hero-head {
      display: block;
      margin-bottom: 8px;
      text-align: left !important;
    }

    .admin-section-head > div,
    .admin-panel-header > div,
    .admin-analytics-hero-head > div {
      text-align: left !important;
      width: 100%;
    }

    .admin-section-head .hh-eyebrow,
    .admin-panel-header .hh-eyebrow,
    .admin-analytics-hero-head .hh-eyebrow {
      display: block;
      text-align: left !important;
      font-size: 7.5px;
      letter-spacing: .12em;
    }

    .admin-section-head h2,
    .admin-panel-header h2,
    .admin-analytics-hero-head h2,
    .admin-ai-summary-head h2,
    .admin-history-detail-title h3,
    .admin-history-analysis-head h4 {
      margin: 3px 0 0;
      font-size: 15px !important;
      line-height: 1.18;
      text-align: left !important;
    }

    .admin-section-head p,
    .admin-panel-header p,
    .admin-analytics-hero-head p {
      margin: 3px 0 0;
      font-size: 9px;
      line-height: 1.35;
      text-align: left !important;
    }

    /* Dashboard hero title: FORCE LEFT */
    .admin-overview-hero .admin-section-head,
    .admin-overview-hero .admin-section-head > div,
    .admin-overview-hero .hh-eyebrow,
    .admin-overview-hero h2,
    .admin-overview-hero p {
      text-align: left !important;
      justify-content: flex-start !important;
      align-items: flex-start !important;
    }

    .admin-overview-hero {
      padding: 11px !important;
    }

    /* 4 top KPI cards: flatter */
    .admin-period-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }

    .admin-period-card {
      min-height: 66px;
      padding: 8px 9px;
      border-radius: 11px;
    }

    .admin-period-card > span {
      font-size: 8.5px;
    }

    .admin-period-card > strong {
      margin-top: 3px;
      font-size: 16px !important;
      line-height: 1.05;
      text-align: left !important;
    }

    .admin-period-card > small {
      margin-top: 2px;
      font-size: 7.5px;
      line-height: 1.25;
      text-align: left !important;
    }

    /* Cost alert: thin horizontal tool row */
    .admin-cost-alert-strip {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 120px;
      align-items: center;
      gap: 8px;
      margin-top: 7px;
      padding: 8px 9px;
      border-radius: 11px;
    }

    .admin-cost-alert-status {
      gap: 2px;
      min-width: 0;
    }

    .admin-cost-alert-status .hh-eyebrow {
      font-size: 7px;
    }

    .admin-cost-alert-status strong {
      font-size: 11px;
      line-height: 1.2;
    }

    .admin-cost-alert-status span {
      display: none;
    }

    .admin-cost-alert-controls {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .admin-cost-alert-controls label {
      gap: 2px;
    }

    .admin-cost-alert-controls label > span {
      font-size: 7px;
    }

    .admin-cost-alert-controls .hh-input {
      min-height: 30px;
      height: 30px;
      padding: 0 8px;
      font-size: 10px;
    }

    .admin-cost-alert-controls .hh-button-secondary {
      min-height: 30px;
      height: 30px;
      padding: 0 8px;
      font-size: 9px;
    }

    .admin-cost-alert-message {
      margin-top: 4px;
      font-size: 8px;
    }

    /* Campus overview: dense rows */
    .admin-campus-list {
      display: grid;
      gap: 5px;
    }

    .admin-campus-row {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 7px;
      align-items: center;
      min-height: 58px;
      padding: 7px 8px;
      border-radius: 11px;
    }

    .admin-campus-identity {
      min-width: 0;
    }

    .admin-campus-identity strong {
      font-size: 12px;
      line-height: 1.1;
    }

    .admin-campus-identity span {
      margin-top: 2px;
      font-size: 8px;
    }

    .admin-campus-row-metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
    }

    .admin-campus-row-metrics .admin-metric {
      min-width: 0;
      padding: 4px 5px;
      border-radius: 7px;
    }

    .admin-campus-row-metrics .admin-metric span {
      display: block;
      overflow: hidden;
      font-size: 6.5px;
      line-height: 1.1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .admin-campus-row-metrics .admin-metric strong {
      margin-top: 1px;
      font-size: 9px;
      line-height: 1.1;
      text-align: left;
    }

    /* Analytics top KPIs: compact 2x2 */
    .admin-analytics-kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 6px;
    }

    .admin-analytics-kpi {
      min-height: 86px !important;
      padding: 9px !important;
      border-radius: 11px !important;
      gap: 3px;
    }

    .admin-analytics-kpi .hh-eyebrow {
      font-size: 7px;
    }

    .admin-analytics-kpi > span {
      font-size: 8px;
    }

    .admin-analytics-kpi > strong {
      margin-top: 1px;
      font-size: 18px !important;
      line-height: 1;
    }

    .admin-analytics-kpi > small {
      font-size: 7px;
      line-height: 1.25;
    }

    /* Role cards: 2 columns, much shorter */
    .admin-analytics-role-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 6px;
    }

    .admin-role-card {
      min-height: 78px !important;
      padding: 8px !important;
      border-radius: 10px !important;
      gap: 5px !important;
    }

    .admin-role-card > div {
      gap: 1px;
    }

    .admin-role-card span {
      font-size: 10px;
    }

    .admin-role-card small {
      min-height: 0;
      font-size: 7px;
      line-height: 1.2;
    }

    .admin-role-card > strong {
      font-size: 13px;
    }

    .admin-role-card > b {
      font-size: 8px;
    }

    /* Router quality / arbitration density */
    .admin-quality-grid,
    .admin-arbitration-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 6px !important;
    }

    .admin-quality-card,
    .admin-arbitration-summary article {
      min-height: 86px !important;
      padding: 8px !important;
      border-radius: 10px !important;
      gap: 3px !important;
    }

    .admin-quality-card h3 {
      min-height: 0 !important;
      font-size: 10px !important;
      line-height: 1.2;
    }

    .admin-quality-card > strong,
    .admin-arbitration-summary strong {
      margin-top: 2px !important;
      font-size: 17px !important;
    }

    .admin-quality-card > small,
    .admin-arbitration-summary small {
      font-size: 6.5px !important;
      line-height: 1.2;
    }

    .admin-quality-fraction {
      font-size: 8px;
    }

    /* Student summary cards */
    .admin-kpi-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 5px !important;
    }

    .admin-kpi {
      min-height: 64px !important;
      padding: 8px !important;
      border-radius: 10px !important;
    }

    .admin-kpi .hh-eyebrow {
      display: none;
    }

    .admin-kpi span {
      font-size: 7px !important;
    }

    .admin-kpi strong {
      margin-top: 3px;
      font-size: 16px !important;
      line-height: 1;
    }

    /* New student form: compressed */
    .admin-new-student-card,
    .admin-student-create-card {
      padding: 10px !important;
      border-radius: 11px !important;
    }

    .admin-new-student-card h3,
    .admin-student-create-card h3 {
      font-size: 14px !important;
      margin: 2px 0 3px !important;
    }

    .admin-new-student-card p,
    .admin-student-create-card p {
      margin: 0 0 8px !important;
      font-size: 8px !important;
      line-height: 1.3 !important;
    }

    .admin-new-student-form,
    .admin-student-create-form {
      gap: 6px !important;
    }

    .admin-new-student-form .hh-input,
    .admin-new-student-form .hh-select,
    .admin-student-create-form .hh-input,
    .admin-student-create-form .hh-select {
      min-height: 38px !important;
      height: 38px !important;
      padding: 0 10px !important;
      font-size: 11px !important;
    }

    .admin-new-student-form .hh-button-primary,
    .admin-student-create-form .hh-button-primary {
      min-height: 38px !important;
      height: 38px !important;
      font-size: 11px !important;
    }

    /* Any generic large form fields */
    .admin-panel .hh-input,
    .admin-panel .hh-select,
    .admin-panel .hh-textarea {
      font-size: 11px;
    }

    /* Header fixed area stays compact */
    .admin-mobile-header {
      min-height: 58px;
      padding: 8px 10px;
    }

    .admin-mobile-header h1,
    .admin-mobile-header .hh-display {
      font-size: 16px !important;
    }

    /* Hide verbose explanatory text in dense dashboard sections */
    .admin-overview-panel > .admin-section-head p,
    .admin-analytics-footnote {
      display: none;
    }
  }

  @media (max-width: 430px) {
    .admin-campus-row {
      grid-template-columns: 64px minmax(0, 1fr);
    }

    .admin-campus-row-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .admin-kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    .admin-cost-alert-strip {
      grid-template-columns: 1fr 104px;
    }
  }


  /* ===== AI settings mobile compact layout ===== */
  @media (max-width: 760px) {
    .admin-router-grid,
    .admin-followup-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
    }

    .admin-router-card {
      display: grid;
      grid-template-columns: minmax(84px, .72fr) minmax(0, 1.35fr);
      grid-template-areas:
        "identity model"
        "identity reasoning"
        "meta meta";
      gap: 7px 9px;
      align-items: center;
      padding: 9px 10px !important;
      border-radius: 11px !important;
    }

    .admin-router-identity {
      grid-area: identity;
      align-self: stretch;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
    }

    .admin-router-identity .hh-eyebrow {
      font-size: 6.8px;
      letter-spacing: .12em;
    }

    .admin-router-identity h3 {
      margin: 3px 0 0 !important;
      font-size: 11px !important;
      line-height: 1.2;
    }

    .admin-router-identity p {
      display: none;
    }

    .admin-router-model-field {
      grid-area: model;
    }

    .admin-router-reasoning-field {
      grid-area: reasoning;
    }

    .admin-router-field {
      gap: 3px;
      margin-top: 0 !important;
      min-width: 0;
    }

    .admin-router-field > span {
      font-size: 7px;
      line-height: 1;
    }

    .admin-router-model-field .hh-input {
      width: 100%;
      min-height: 34px;
      height: 34px;
      padding: 0 8px;
      border-radius: 9px;
      font-size: 10px;
      text-overflow: ellipsis;
    }

    .admin-reasoning-pills {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(46px, 1fr));
      gap: 4px;
      flex-wrap: nowrap;
    }

    .admin-reasoning-pills button {
      width: 100%;
      min-width: 0;
      min-height: 30px;
      height: 30px;
      padding: 0 5px;
      border-radius: 9px;
      font-size: 8px;
      white-space: nowrap;
    }

    .admin-router-meta {
      grid-area: meta;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      margin-top: 0 !important;
      padding-top: 6px !important;
      border-top: 1px solid var(--border);
      font-size: 7px !important;
      line-height: 1.2;
    }

    .admin-router-meta > span {
      overflow: hidden;
      min-width: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .admin-router-meta > small {
      flex: 0 0 auto;
      font-size: 7px;
      white-space: nowrap;
    }

    .admin-router-threshold,
    .admin-quota-control {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      margin-top: 7px;
      padding: 8px 9px;
      border-radius: 11px;
    }

    .admin-router-threshold > div:first-child,
    .admin-quota-control > div:first-child {
      gap: 1px;
    }

    .admin-router-threshold strong,
    .admin-quota-control strong {
      font-size: 10px;
    }

    .admin-router-threshold > div:first-child > span,
    .admin-quota-control > div:first-child > span {
      display: none;
    }

    .admin-number-control {
      gap: 4px;
      font-size: 8px;
    }

    .admin-number-control .hh-input {
      width: 68px;
      min-height: 32px;
      height: 32px;
      padding: 0 7px;
      font-size: 10px;
    }

    .admin-toggle-button {
      min-height: 32px;
      padding: 0 9px;
      font-size: 9px;
    }

    .admin-followup-grid {
      margin-top: 7px;
    }

    .admin-simple-setting {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 8px 9px !important;
      border-radius: 11px !important;
    }

    .admin-simple-setting .hh-eyebrow,
    .admin-simple-setting > p {
      display: none;
    }

    .admin-simple-setting h3 {
      margin: 0 !important;
      font-size: 10px !important;
    }

    .admin-simple-setting .admin-number-control {
      margin: 0;
    }

    .admin-save-row {
      position: static !important;
      display: block;
      margin-top: 8px !important;
      padding: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }

    .admin-save-row .hh-button-primary {
      width: 100%;
      min-height: 42px;
      height: 42px;
      border-radius: 11px;
      font-size: 11px;
    }
  }

  @media (max-width: 430px) {
    .admin-router-card {
      grid-template-columns: 74px minmax(0, 1fr);
    }

    .admin-router-meta > span {
      max-width: 55%;
    }

    .admin-reasoning-pills {
      grid-template-columns: repeat(auto-fit, minmax(42px, 1fr));
    }
  }


  /* =========================================================
     ADMIN MOBILE REGRESSION FIX
     - compact popover menu
     - safe area
     - no full-screen drawer
     ========================================================= */
  @media (max-width: 760px) {
    .admin-shell {
      padding-top: calc(max(8px, env(safe-area-inset-top)) + 66px) !important;
    }

    .admin-mobile-header {
      top: max(8px, env(safe-area-inset-top)) !important;
      left: 10px !important;
      right: 10px !important;
      z-index: 150 !important;
    }

    .admin-mobile-backdrop {
      position: fixed !important;
      inset: 0 !important;
      z-index: 138 !important;
      background: rgba(8, 13, 10, .08) !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }

    .admin-sidebar {
      position: fixed !important;
      top: calc(max(8px, env(safe-area-inset-top)) + 62px) !important;
      right: 10px !important;
      bottom: auto !important;
      left: auto !important;
      z-index: 145 !important;
      width: min(286px, calc(100vw - 20px)) !important;
      min-height: 0 !important;
      max-height: calc(100dvh - max(8px, env(safe-area-inset-top)) - 82px) !important;
      overflow-y: auto !important;
      padding: 8px !important;
      border: 1px solid var(--border) !important;
      border-radius: 16px !important;
      background: color-mix(in srgb, var(--surface) 97%, transparent) !important;
      box-shadow: 0 18px 48px rgba(8, 14, 10, .22) !important;
      transform: translateY(-8px) scale(.985) !important;
      transform-origin: top right !important;
      opacity: 0 !important;
      pointer-events: none !important;
      transition: opacity .14s ease, transform .14s ease !important;
    }

    .admin-sidebar.mobile-open {
      transform: translateY(0) scale(1) !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }

    .admin-sidebar-brand {
      display: none !important;
    }

    .admin-nav {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 3px !important;
      overflow: visible !important;
    }

    .admin-nav-button {
      justify-content: flex-start !important;
      min-height: 40px !important;
      padding: 0 10px !important;
      border-radius: 10px !important;
      font-size: 12px !important;
    }

    .admin-nav-button span {
      display: grid !important;
      width: 22px !important;
      height: 20px !important;
      font-size: 8px !important;
    }

    .admin-sidebar-footer {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 4px !important;
      margin-top: 6px !important;
      padding-top: 6px !important;
    }

    .admin-sidebar-link {
      min-height: 36px !important;
      padding: 0 8px !important;
      display: flex !important;
      align-items: center !important;
      border-radius: 9px !important;
      background: var(--surface-soft) !important;
      color: var(--text-secondary) !important;
      font-size: 10px !important;
    }
  }


  /* =========================================================
     MOBILE ADMIN V3 — coherent redesign
     ========================================================= */
  .admin-campus-summary-table-wrap,
  .admin-data-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

  .admin-campus-summary-table,
  .admin-data-table { width: 100%; border-collapse: collapse; }

  .admin-campus-summary-table th,
  .admin-campus-summary-table td,
  .admin-data-table th,
  .admin-data-table td { padding: 10px 11px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: middle; }

  .admin-campus-summary-table th,
  .admin-data-table th { color: var(--text-secondary); font-size: 10px; font-weight: 850; white-space: nowrap; }
  .admin-campus-summary-table td,
  .admin-data-table td { font-size: 12px; }
  .admin-data-table td small { display: block; margin-top: 2px; color: var(--text-secondary); font-size: 9px; }

  .admin-student-summary-strip { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 9px; }
  .admin-student-summary-strip article { display: grid; grid-template-columns: 1fr auto auto; align-items: baseline; gap: 4px; padding: 13px 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
  .admin-student-summary-strip span { color: var(--text-secondary); font-size: 11px; font-weight: 800; }
  .admin-student-summary-strip strong { font-size: 23px; }
  .admin-student-summary-strip small { color: var(--text-secondary); font-size: 10px; }

  .admin-analytics-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .admin-analytics-toolbar h2 { margin: 4px 0 0; font-size: 22px; }
  .admin-data-table-panel .admin-panel-header { margin-bottom: 9px; }
  .admin-model-performance-table { min-width: 760px; }
  .admin-routing-overview-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
  .admin-routing-overview-grid article { padding:12px 13px; border:1px solid var(--border); border-radius:13px; background:var(--surface-soft); min-width:0; }
  .admin-routing-overview-grid span, .admin-routing-overview-grid small { display:block; color:var(--text-secondary); }
  .admin-routing-overview-grid span { font-size:10px; font-weight:800; }
  .admin-routing-overview-grid strong { display:block; margin-top:5px; font-size:15px; line-height:1.25; overflow-wrap:anywhere; }
  .admin-routing-overview-grid small { margin-top:4px; font-size:9px; line-height:1.35; }
  .admin-mobile-header-actions { display:flex; align-items:center; gap:5px; margin-left:auto; }
  .admin-mobile-theme-toggle { display:none; }

  @media (max-width: 760px) {
    html, body { font-size: 14px; }

    .admin-shell { padding-top: calc(max(6px, env(safe-area-inset-top)) + 54px) !important; }

    .admin-mobile-header {
      top: max(6px, env(safe-area-inset-top)) !important;
      left: 8px !important;
      right: 8px !important;
      min-height: 46px !important;
      height: 46px !important;
      padding: 4px 5px 4px 10px !important;
      border-radius: 14px !important;
      z-index: 160 !important;
    }
    .admin-mobile-brand { gap: 0 !important; }
    .admin-mobile-brand span { font-size: 16px !important; line-height: 1.08 !important; }
    .admin-mobile-brand small { font-size: 7.5px !important; line-height: 1 !important; }
    .admin-mobile-menu-button { width: 36px !important; height: 36px !important; border-radius: 11px !important; }
    .admin-mobile-theme-toggle { display:block !important; }
    .admin-mobile-theme-toggle button { width:36px !important; height:36px !important; min-width:36px !important; min-height:36px !important; border-radius:11px !important; }
    .admin-sidebar-theme-row { display:none !important; }

    .admin-topbar { display: none !important; }
    .admin-content { width: min(100% - 14px, 1180px) !important; padding: 7px 0 26px !important; }
    .admin-stack { gap: 8px !important; }
    .admin-panel { padding: 11px !important; border-radius: 13px !important; }

    /* Menu = small popover, never full-screen drawer */
    .admin-mobile-backdrop { z-index: 148 !important; background: transparent !important; backdrop-filter: none !important; }
    .admin-sidebar {
      position: fixed !important; top: calc(max(6px, env(safe-area-inset-top)) + 50px) !important; right: 8px !important; left: auto !important; bottom: auto !important;
      width: min(260px, calc(100vw - 16px)) !important; max-height: calc(100dvh - 72px) !important; min-height: 0 !important;
      padding: 7px !important; border: 1px solid var(--border) !important; border-radius: 14px !important; background: var(--surface) !important; box-shadow: 0 18px 44px rgba(8,14,10,.22) !important;
      z-index: 155 !important; transform: translateY(-6px) scale(.985) !important; opacity: 0 !important; pointer-events: none !important;
    }
    .admin-sidebar.mobile-open { transform: translateY(0) scale(1) !important; opacity: 1 !important; pointer-events: auto !important; }
    .admin-sidebar-brand { display: none !important; }
    .admin-nav { gap: 3px !important; }
    .admin-nav-button { min-height: 38px !important; padding: 0 9px !important; font-size: 12px !important; }
    .admin-sidebar-footer { margin-top: 5px !important; padding-top: 5px !important; }

    /* Titles: compact, but readable */
    .admin-section-head, .admin-panel-header { margin-bottom: 8px !important; text-align: left !important; }
    .admin-section-head .hh-eyebrow, .admin-panel-header .hh-eyebrow { font-size: 8px !important; text-align: left !important; }
    .admin-section-head h2, .admin-panel-header h2, .admin-analytics-toolbar h2 { margin: 3px 0 0 !important; font-size: 17px !important; line-height: 1.2 !important; text-align: left !important; }
    .admin-section-head p, .admin-panel-header p { margin-top: 3px !important; font-size: 10.5px !important; line-height: 1.4 !important; }
    .admin-section-note { display: none !important; }

    /* Dashboard: all left aligned */
    .admin-period-panel .admin-section-head, .admin-period-panel .admin-section-head > div, .admin-period-panel h2, .admin-period-panel .hh-eyebrow { text-align: left !important; justify-content: flex-start !important; }
    .admin-period-grid { grid-template-columns: repeat(2,minmax(0,1fr)) !important; gap: 6px !important; }
    .admin-period-card { min-height: 69px !important; padding: 9px 10px !important; border-radius: 11px !important; text-align: left !important; }
    .admin-period-card span { font-size: 10px !important; }
    .admin-period-card strong { margin-top: 4px !important; font-size: 18px !important; text-align: left !important; }
    .admin-period-card small { font-size: 8.5px !important; text-align: left !important; }

    .admin-cost-alert-strip { grid-template-columns: minmax(0,1fr) 126px !important; gap: 8px !important; margin-top: 7px !important; padding: 8px 9px !important; border-radius: 11px !important; align-items: center !important; }
    .admin-cost-alert-status strong { font-size: 11.5px !important; }
    .admin-cost-alert-status span { display: none !important; }
    .admin-cost-alert-controls { display: grid !important; grid-template-columns: 1fr !important; gap: 4px !important; }
    .admin-cost-alert-controls label > span { font-size: 8px !important; }
    .admin-cost-alert-controls .hh-input, .admin-cost-alert-controls .hh-button-secondary { height: 31px !important; min-height: 31px !important; font-size: 10px !important; padding: 0 8px !important; }

    .admin-campus-summary-table th, .admin-campus-summary-table td { padding: 8px 6px !important; }
    .admin-campus-summary-table th { font-size: 8.5px !important; }
    .admin-campus-summary-table td { font-size: 10.5px !important; white-space: nowrap; }

    /* Student summary = exactly 3 metrics */
    .admin-student-summary-strip { gap: 5px !important; }
    .admin-student-summary-strip article { display: block !important; padding: 9px 8px !important; border-radius: 10px !important; }
    .admin-student-summary-strip span { display: block; font-size: 9px !important; }
    .admin-student-summary-strip strong { display: inline-block; margin-top: 3px; font-size: 18px !important; }
    .admin-student-summary-strip small { margin-left: 2px; font-size: 9px !important; }

    /* New student: small campus / wide name / compact button */
    .admin-add-student { display: block !important; padding: 10px !important; }
    .admin-add-student .admin-panel-header { margin-bottom: 7px !important; }
    .admin-add-form { grid-template-columns: 86px minmax(0,1fr) 74px !important; gap: 5px !important; }
    .admin-add-form .hh-select, .admin-add-form .hh-input, .admin-add-form .hh-button-primary { min-height: 38px !important; height: 38px !important; padding: 0 8px !important; font-size: 11px !important; }
    .admin-add-form .hh-button-primary { padding: 0 5px !important; }
    .admin-add-form .hh-select, .admin-student-search .hh-select, .student-assignment-grid .hh-select, .promotion-row .hh-select {
      min-width:0 !important; padding-left:10px !important; padding-right:28px !important; font-size:12px !important; line-height:1.2 !important; font-family:inherit !important; text-align:left !important;
    }
    .admin-routing-overview-grid { grid-template-columns:repeat(3,minmax(0,1fr)) !important; gap:5px !important; }
    .admin-routing-overview-grid article { padding:8px 7px !important; border-radius:10px !important; }
    .admin-routing-overview-grid span { font-size:8px !important; }
    .admin-routing-overview-grid strong { font-size:11px !important; }
    .admin-routing-overview-grid small { display:none !important; }

    .admin-student-filter-box { padding: 8px !important; gap: 7px !important; margin-bottom: 8px !important; border-radius: 11px !important; }
    .admin-filter-tabs { display: grid !important; grid-template-columns: repeat(3,minmax(0,1fr)) !important; gap: 5px !important; }
    .admin-filter-pill { justify-content: center !important; min-height: 34px !important; padding: 0 5px !important; font-size: 10.5px !important; }
    .admin-filter-pill span { font-size: 8.5px !important; }
    .admin-student-search { grid-template-columns: minmax(0,1fr) 92px !important; gap: 5px !important; }
    .admin-student-search .hh-input, .admin-student-search .hh-select { min-height: 36px !important; height: 36px !important; font-size: 10.5px !important; }

    .admin-student-mobile-list { gap: 6px !important; }
    .admin-student-mobile-card { padding: 9px !important; border-radius: 11px !important; }
    .admin-student-cell strong { font-size: 12.5px !important; }
    .admin-student-cell span { font-size: 9px !important; }
    .admin-student-mobile-actions { gap: 4px !important; }
    .admin-mini-button { min-height: 31px !important; padding: 0 7px !important; font-size: 9px !important; }

    /* AI: daily quota first + aligned model rows */
    .admin-quota-control { display: grid !important; grid-template-columns: minmax(0,1fr) 116px !important; gap: 8px !important; align-items: center !important; }
    .admin-quota-control strong { font-size: 12px !important; }
    .admin-quota-control > div:first-child > span { font-size: 9px !important; line-height: 1.35 !important; }
    .admin-number-control .hh-input { min-height: 36px !important; height: 36px !important; font-size: 12px !important; }

    .admin-router-grid { gap: 6px !important; }
    .admin-router-card { display: grid !important; grid-template-columns: 95px minmax(0,1fr) !important; gap: 7px 9px !important; align-items: center !important; min-height: 0 !important; padding: 9px !important; border-radius: 11px !important; }
    .admin-router-identity { grid-column: 1 !important; grid-row: 1 / span 2 !important; align-self: stretch !important; display: flex !important; flex-direction: column !important; justify-content: center !important; }
    .admin-router-identity .hh-eyebrow { font-size: 7.5px !important; }
    .admin-router-identity h3 { margin: 3px 0 0 !important; font-size: 13px !important; line-height: 1.25 !important; }
    .admin-router-identity p { display: none !important; }
    .admin-router-model-field { grid-column: 2 !important; grid-row: 1 !important; }
    .admin-router-reasoning-field { grid-column: 2 !important; grid-row: 2 !important; }
    .admin-router-field { display: grid !important; grid-template-columns: 50px minmax(0,1fr) !important; gap: 5px !important; align-items: center !important; }
    .admin-router-field > span { font-size: 9px !important; }
    .admin-router-model-field .hh-input { width: 100% !important; min-height: 35px !important; height: 35px !important; font-size: 11px !important; padding: 0 8px !important; }
    .admin-reasoning-pills { display: flex !important; gap: 4px !important; overflow-x: auto !important; }
    .admin-reasoning-pills button { flex: 1 0 auto !important; min-width: 46px !important; min-height: 31px !important; height: 31px !important; padding: 0 7px !important; font-size: 10px !important; border-radius: 9px !important; }
    .admin-router-meta { grid-column: 1 / -1 !important; display: flex !important; justify-content: space-between !important; gap: 8px !important; padding-top: 5px !important; border-top: 1px solid var(--border) !important; }
    .admin-router-meta > span, .admin-router-meta > small { font-size: 8.5px !important; line-height: 1.3 !important; }
    .admin-router-meta > span { max-width: 55% !important; }
    .admin-router-threshold, .admin-simple-setting { padding: 9px !important; border-radius: 11px !important; }
    .admin-followup-grid { gap: 6px !important; }
    .admin-save-row { position: static !important; padding: 0 !important; background: transparent !important; }
    .admin-save-row .hh-button-primary { min-height: 42px !important; font-size: 12px !important; }

    /* Analytics = tables only */
    .admin-analytics-toolbar { display: block !important; padding: 10px !important; }
    .admin-analytics-toolbar h2 { font-size: 17px !important; }
    .admin-analytics-range { display: grid !important; grid-template-columns: repeat(4,minmax(0,1fr)) !important; gap: 4px !important; margin-top: 7px !important; }
    .admin-analytics-range button { min-height: 32px !important; padding: 0 4px !important; font-size: 9.5px !important; }
    .admin-data-table-panel { padding: 9px !important; }
    .admin-data-table-panel .admin-panel-header { margin-bottom: 5px !important; }
    .admin-data-table th, .admin-data-table td { padding: 7px 6px !important; }
    .admin-data-table th { font-size: 8.5px !important; }
    .admin-data-table td { font-size: 10.5px !important; line-height: 1.3 !important; }
    .admin-data-table td small { font-size: 8px !important; }
    .admin-model-performance-table { min-width: 690px !important; }
  }

  @media (max-width: 420px) {
    .admin-add-form { grid-template-columns: 78px minmax(0,1fr) 68px !important; }
    .admin-router-card { grid-template-columns: 82px minmax(0,1fr) !important; }
    .admin-router-field { grid-template-columns: 42px minmax(0,1fr) !important; }
  }


  /* =========================================================
     FINAL MOBILE FIX — READABLE ANALYTICS + FULL REASONING
     ========================================================= */

  @media (max-width: 760px) {
    /* AI Analytics: prioritize readability, not maximum density */
    .admin-analytics-compact {
      gap: 9px !important;
    }

    .admin-analytics-toolbar {
      padding: 12px !important;
    }

    .admin-analytics-toolbar .hh-eyebrow {
      font-size: 9px !important;
    }

    .admin-analytics-toolbar h2 {
      margin-top: 3px !important;
      font-size: 20px !important;
      line-height: 1.2 !important;
    }

    .admin-analytics-range button {
      min-height: 38px !important;
      height: 38px !important;
      padding: 0 8px !important;
      font-size: 12px !important;
      font-weight: 800 !important;
    }

    .admin-data-table-panel {
      padding: 13px !important;
    }

    .admin-data-table-panel .admin-panel-header {
      margin-bottom: 9px !important;
    }

    .admin-data-table-panel .admin-panel-header .hh-eyebrow {
      font-size: 9px !important;
    }

    .admin-data-table-panel .admin-panel-header h2 {
      font-size: 18px !important;
      line-height: 1.2 !important;
    }

    .admin-data-table-panel .admin-panel-header p {
      font-size: 11px !important;
      line-height: 1.4 !important;
    }

    .admin-data-table-wrap {
      width: 100% !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
    }

    .admin-data-table {
      width: 100% !important;
      min-width: 0 !important;
      table-layout: auto !important;
      border-collapse: collapse !important;
    }

    .admin-data-table th {
      padding: 9px 8px !important;
      font-size: 10.5px !important;
      line-height: 1.25 !important;
      font-weight: 850 !important;
      letter-spacing: .01em !important;
      white-space: nowrap !important;
    }

    .admin-data-table td {
      padding: 10px 8px !important;
      font-size: 12.5px !important;
      line-height: 1.35 !important;
      vertical-align: middle !important;
    }

    .admin-data-table td strong {
      font-size: 12.5px !important;
    }

    .admin-data-table td small {
      display: block !important;
      margin-top: 2px !important;
      font-size: 10px !important;
      line-height: 1.25 !important;
      color: var(--text-secondary) !important;
    }

    .admin-data-table tbody tr {
      min-height: 42px !important;
    }

    /* First four tables should fit the screen and remain legible. */
    .admin-data-table:not(.admin-model-performance-table) th:first-child,
    .admin-data-table:not(.admin-model-performance-table) td:first-child {
      width: 46% !important;
    }

    .admin-data-table:not(.admin-model-performance-table) th:nth-child(2),
    .admin-data-table:not(.admin-model-performance-table) td:nth-child(2) {
      width: 24% !important;
      white-space: nowrap !important;
    }

    .admin-data-table:not(.admin-model-performance-table) th:nth-child(3),
    .admin-data-table:not(.admin-model-performance-table) td:nth-child(3) {
      width: 30% !important;
    }

    /* Six-column model table: horizontal scroll instead of microscopic text. */
    .admin-model-performance-table {
      min-width: 760px !important;
      table-layout: auto !important;
    }

    .admin-model-performance-table th,
    .admin-model-performance-table td {
      white-space: nowrap !important;
    }

    .admin-model-performance-table th:first-child,
    .admin-model-performance-table td:first-child {
      min-width: 150px !important;
    }

    /* Model role cards: reasoning is a real segmented row with all options visible/clickable */
    .admin-router-card {
      grid-template-columns: 108px minmax(0, 1fr) !important;
    }

    .admin-router-identity .hh-eyebrow {
      font-size: 9px !important;
    }

    .admin-router-identity h3 {
      font-size: 15px !important;
      line-height: 1.25 !important;
    }

    .admin-router-field {
      grid-template-columns: 58px minmax(0, 1fr) !important;
      gap: 7px !important;
    }

    .admin-router-field > span {
      font-size: 11px !important;
      font-weight: 800 !important;
    }

    .admin-router-model-field .hh-input {
      min-height: 40px !important;
      height: 40px !important;
      font-size: 13px !important;
    }

    .admin-reasoning-pills {
      display: flex !important;
      width: 100% !important;
      max-width: 100% !important;
      gap: 5px !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      padding: 1px 0 3px !important;
      scrollbar-width: none !important;
      -webkit-overflow-scrolling: touch !important;
    }

    .admin-reasoning-pills::-webkit-scrollbar {
      display: none !important;
    }

    .admin-reasoning-pills button {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex: 0 0 auto !important;
      width: auto !important;
      min-width: 62px !important;
      min-height: 38px !important;
      height: 38px !important;
      padding: 0 11px !important;
      border-radius: 10px !important;
      font-size: 12px !important;
      font-weight: 800 !important;
      white-space: nowrap !important;
      pointer-events: auto !important;
      opacity: 1 !important;
    }

    .admin-reasoning-pills button.active {
      font-weight: 900 !important;
    }

    .admin-router-meta > span,
    .admin-router-meta > small {
      font-size: 10px !important;
      line-height: 1.35 !important;
    }
  }

  @media (max-width: 430px) {
    .admin-data-table th {
      padding: 8px 6px !important;
      font-size: 10px !important;
    }

    .admin-data-table td {
      padding: 9px 6px !important;
      font-size: 12px !important;
    }

    .admin-router-card {
      grid-template-columns: 98px minmax(0, 1fr) !important;
    }

    .admin-reasoning-pills button {
      min-width: 58px !important;
      padding: 0 9px !important;
      font-size: 11.5px !important;
    }
  }


  /* =========================================================
     MOBILE ADMIN — HEADER BREATHING + ANALYTICS REBUILD
     ========================================================= */

  .admin-model-performance-mobile {
    display: none;
  }

  @media (max-width: 760px) {
    /* Never let a child widen the iPhone layout */
    .admin-shell,
    .admin-main,
    .admin-content,
    .admin-stack,
    .admin-panel,
    .admin-data-table-panel {
      min-width: 0 !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    .admin-shell,
    .admin-main {
      overflow-x: hidden !important;
    }

    /* Header: still compact, but no longer cramped */
    .admin-shell {
      padding-top: calc(max(10px, env(safe-area-inset-top)) + 64px) !important;
    }

    .admin-mobile-header {
      top: max(10px, env(safe-area-inset-top)) !important;
      left: 12px !important;
      right: 12px !important;
      height: 52px !important;
      min-height: 52px !important;
      padding: 6px 7px 6px 13px !important;
      border-radius: 15px !important;
    }

    .admin-mobile-brand {
      gap: 1px !important;
    }

    .admin-mobile-brand span {
      font-size: 17px !important;
      line-height: 1.08 !important;
    }

    .admin-mobile-brand small {
      font-size: 8.5px !important;
      line-height: 1 !important;
      letter-spacing: .12em !important;
    }

    .admin-mobile-menu-button {
      width: 38px !important;
      height: 38px !important;
      border-radius: 11px !important;
    }

    .admin-sidebar {
      top: calc(max(10px, env(safe-area-inset-top)) + 58px) !important;
      right: 12px !important;
      width: min(270px, calc(100vw - 24px)) !important;
    }

    /* Analytics page typography */
    .admin-analytics-compact {
      width: 100% !important;
      gap: 10px !important;
    }

    .admin-analytics-toolbar {
      width: 100% !important;
      padding: 13px !important;
      border-radius: 14px !important;
    }

    .admin-analytics-toolbar .hh-eyebrow {
      font-size: 9px !important;
    }

    .admin-analytics-toolbar h2 {
      font-size: 20px !important;
      line-height: 1.2 !important;
    }

    .admin-analytics-range {
      gap: 6px !important;
      margin-top: 10px !important;
    }

    .admin-analytics-range button {
      min-height: 40px !important;
      height: 40px !important;
      font-size: 12px !important;
      border-radius: 12px !important;
    }

    .admin-data-table-panel {
      width: 100% !important;
      padding: 13px !important;
      border-radius: 14px !important;
      overflow: hidden !important;
    }

    .admin-data-table-panel .admin-panel-header {
      margin-bottom: 9px !important;
    }

    .admin-data-table-panel .admin-panel-header .hh-eyebrow {
      font-size: 9px !important;
    }

    .admin-data-table-panel .admin-panel-header h2 {
      font-size: 18px !important;
      line-height: 1.2 !important;
    }

    .admin-data-table-panel .admin-panel-header p {
      font-size: 11px !important;
      line-height: 1.35 !important;
    }

    .admin-data-table-wrap {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      overflow: hidden !important;
    }

    .admin-data-table {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
    }

    .admin-data-table th {
      padding: 9px 7px !important;
      font-size: 10.5px !important;
      line-height: 1.25 !important;
      white-space: normal !important;
    }

    .admin-data-table td {
      padding: 10px 7px !important;
      font-size: 13px !important;
      line-height: 1.35 !important;
      white-space: normal !important;
      overflow-wrap: anywhere !important;
    }

    .admin-data-table td small {
      font-size: 10px !important;
      line-height: 1.25 !important;
    }

    .admin-data-table th:first-child,
    .admin-data-table td:first-child {
      width: 48% !important;
    }

    .admin-data-table th:nth-child(2),
    .admin-data-table td:nth-child(2) {
      width: 24% !important;
    }

    .admin-data-table th:nth-child(3),
    .admin-data-table td:nth-child(3) {
      width: 28% !important;
    }

    /* Overview doesn't need the verbose description column on phone */
    .admin-overview-data-table th:nth-child(3),
    .admin-overview-data-table td:nth-child(3) {
      display: none !important;
    }

    .admin-overview-data-table th:first-child,
    .admin-overview-data-table td:first-child {
      width: 58% !important;
    }

    .admin-overview-data-table th:nth-child(2),
    .admin-overview-data-table td:nth-child(2) {
      width: 42% !important;
      text-align: right !important;
    }

    /* Six-column desktop table must never participate in mobile sizing */
    .admin-model-performance-desktop {
      display: none !important;
    }

    .admin-model-performance-mobile {
      display: grid !important;
      gap: 8px !important;
      width: 100% !important;
      min-width: 0 !important;
    }

    .admin-model-performance-row {
      display: grid !important;
      gap: 9px !important;
      min-width: 0 !important;
      padding: 11px !important;
      border: 1px solid var(--border) !important;
      border-radius: 12px !important;
      background: var(--surface-soft) !important;
    }

    .admin-model-performance-head {
      display: flex !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 10px !important;
      min-width: 0 !important;
    }

    .admin-model-performance-head > div {
      display: grid !important;
      gap: 2px !important;
      min-width: 0 !important;
    }

    .admin-model-performance-head strong {
      font-size: 14px !important;
      line-height: 1.2 !important;
      overflow-wrap: anywhere !important;
    }

    .admin-model-performance-head span {
      color: var(--text-secondary) !important;
      font-size: 10px !important;
    }

    .admin-model-performance-head b {
      flex: 0 0 auto !important;
      font-size: 12px !important;
      color: var(--primary) !important;
    }

    .admin-model-performance-metrics {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 6px !important;
    }

    .admin-model-performance-metrics > div {
      display: grid !important;
      gap: 2px !important;
      min-width: 0 !important;
      padding: 8px !important;
      border-radius: 9px !important;
      background: var(--surface) !important;
    }

    .admin-model-performance-metrics span {
      color: var(--text-secondary) !important;
      font-size: 9px !important;
      font-weight: 750 !important;
    }

    .admin-model-performance-metrics strong {
      font-size: 13px !important;
      line-height: 1.2 !important;
    }

    .admin-model-performance-metrics small {
      color: var(--text-secondary) !important;
      font-size: 9px !important;
    }
  }

  @media (min-width: 761px) {
    .admin-model-performance-desktop {
      display: block;
    }

    .admin-model-performance-mobile {
      display: none !important;
    }
  }


/* v1.2.6 mobile readability + compact management */
@media (max-width: 760px) {
  .org-filter-row .hh-select, .org-filter-row .hh-input,
  .org-add-row .hh-select, .org-add-row .hh-input,
  .assign-row .hh-select {
    min-height: 42px !important; height: 42px !important;
    font-size: 13px !important; line-height: 1.25 !important;
    padding-top: 0 !important; padding-bottom: 0 !important;
  }
  .org-filter-row .hh-select, .org-add-row .hh-select, .assign-row .hh-select { padding-right: 28px !important; }
  .action-row { grid-template-columns: repeat(4, minmax(0,1fr)) !important; gap:4px !important; }
  .action-row .admin-mini-button { width:100% !important; min-width:0 !important; font-size:9.5px !important; padding:7px 1px !important; white-space:nowrap !important; }
}


/* v1.2.7 bulk student import */
.bulk-import-panel { display: grid; gap: 16px; }
.bulk-target-class { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface-soft); }
.bulk-target-class span { color: var(--muted); font-size: 13px; font-weight: 800; }
.bulk-target-class strong { text-align: right; font-size: 14px; }
.bulk-import-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
.bulk-file-picker { min-width: 0; min-height: 48px; display: flex; align-items: center; padding: 0 16px; border: 1px dashed var(--border-strong); border-radius: 16px; cursor: pointer; background: var(--surface-soft); }
.bulk-file-picker input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.bulk-file-picker span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; color: var(--text); }
.bulk-preview-box { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface-soft); }
.bulk-preview-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.bulk-preview-stats article { padding: 10px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); }
.bulk-preview-stats span, .bulk-preview-stats small { display: block; color: var(--muted); font-size: 11px; font-weight: 800; }
.bulk-preview-stats strong { display: inline-block; margin: 2px 4px 0 0; font-size: 22px; }
.bulk-preview-names { display: flex; flex-wrap: wrap; gap: 6px; }
.bulk-preview-names span { padding: 5px 8px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); font-size: 12px; font-weight: 800; }
.bulk-warning { padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(184, 135, 58, .35); background: rgba(184, 135, 58, .08); }
.bulk-warning p { margin: 3px 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
.bulk-confirm-button { width: 100%; }
@media (max-width: 760px) {
  .bulk-target-class { align-items: flex-start; flex-direction: column; gap: 4px; }
  .bulk-target-class strong { text-align: left; }
  .bulk-import-controls { grid-template-columns: 1fr; }
  .bulk-preview-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .bulk-preview-stats article { padding: 8px 6px; }
  .bulk-preview-stats strong { font-size: 18px; }
  .bulk-preview-stats span, .bulk-preview-stats small { font-size: 10px; }
}

`;

