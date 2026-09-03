"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ThemeToggle from "@/components/theme-toggle";

type AdminSection = "dashboard" | "students" | "ai" | "pin";

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

type StudentRow = {
  id: string;
  campus: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  todayCount: number;
};

type StudentSummary = {
  total: number;
  active: number;
  inactive: number;
  campuses: { campus: string; count: number }[];
};

const CAMPUSES = ["高雄班", "嘉義班", "員林班"] as const;
const CAMPUS_FILTERS = ["全部班級", ...CAMPUSES] as const;

export default function AdminPage() {
  const [adminReady, setAdminReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [selectedModel, setSelectedModel] = useState("gpt-5.6-luna");
  const [reasoning, setReasoning] = useState("medium");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [savingAI, setSavingAI] = useState(false);

  const [pinValues, setPinValues] = useState<Record<string, string>>({
    高雄班: "",
    嘉義班: "",
    員林班: "",
  });
  const [pinBusyCampus, setPinBusyCampus] = useState<string | null>(null);

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
    useState<(typeof CAMPUS_FILTERS)[number]>("全部班級");
  const [studentStatusFilter, setStudentStatusFilter] =
    useState<"全部" | "啟用" | "停用">("全部");
  const [studentQuery, setStudentQuery] = useState("");
  const [newCampus, setNewCampus] = useState<(typeof CAMPUSES)[number]>("高雄班");
  const [newName, setNewName] = useState("");
  const [addingStudent, setAddingStudent] = useState(false);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);

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
    await Promise.all([loadDashboard(), loadSettings()]);
  }, [loadDashboard, loadSettings]);

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
    if (isLoggedIn && activeSection === "students" && !studentsLoaded) {
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

  async function updateClassPin(campus: string) {
    const pin = pinValues[campus]?.trim() ?? "";

    if (!/^\d{4}$/.test(pin)) {
      setSettingsError(`${campus} PIN 必須為四位數字。`);
      return;
    }

    if (!window.confirm(`確定要立即更新 ${campus} 的班級 PIN 嗎？`)) return;

    setPinBusyCampus(campus);
    setSettingsError("");
    setSettingsMessage("");

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_class_pin",
          campus,
          pin,
        }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "更新班級 PIN 失敗。");

      setPinValues((current) => ({ ...current, [campus]: "" }));
      setSettingsMessage(`${campus} 班級 PIN 已更新。`);
      await loadSettings();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "更新班級 PIN 失敗。");
    } finally {
      setPinBusyCampus(null);
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
            <p>管理 AI 解題、班級 PIN、學生名單與使用成本。</p>
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
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <div className="hh-eyebrow">H.H. SCIENCE LAB</div>
          <div className="hh-display admin-sidebar-title">教師管理中心</div>
          <div className="admin-sidebar-subtitle">Academic Control Center</div>
        </div>

        <nav className="admin-nav">
          <NavButton
            active={activeSection === "dashboard"}
            icon="01"
            label="總覽"
            onClick={() => setActiveSection("dashboard")}
          />
          <NavButton
            active={activeSection === "students"}
            icon="02"
            label="學生管理"
            onClick={() => setActiveSection("students")}
          />
          <NavButton
            active={activeSection === "ai"}
            icon="03"
            label="AI 設定"
            onClick={() => setActiveSection("ai")}
          />
          <NavButton
            active={activeSection === "pin"}
            icon="04"
            label="班級 PIN"
            onClick={() => setActiveSection("pin")}
          />
        </nav>

        <div className="admin-sidebar-footer">
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
            <ThemeToggle />
            <button
              type="button"
              className="hh-button-secondary"
              onClick={() => {
                if (activeSection === "students") void loadStudents();
                else void loadAllAdminData();
              }}
            >
              重新整理
            </button>
          </div>
        </header>

        <div className="admin-content">
          {activeSection === "dashboard" && (
            <DashboardSection
              dashboard={dashboard}
              loading={dashboardLoading}
              error={dashboardError}
              settings={settings}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              reasoning={reasoning}
              setReasoning={setReasoning}
              savingAI={savingAI}
              onSaveAI={saveAISettings}
              settingsMessage={settingsMessage}
              settingsError={settingsError}
              pinValues={pinValues}
              setPinValues={setPinValues}
              pinBusyCampus={pinBusyCampus}
              onUpdatePin={updateClassPin}
            />
          )}

          {activeSection === "students" && (
            <StudentsSection
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
            />
          )}

          {activeSection === "ai" && (
            <AISection
              settings={settings}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              reasoning={reasoning}
              setReasoning={setReasoning}
              saving={savingAI}
              onSave={saveAISettings}
              message={settingsMessage}
              error={settingsError}
            />
          )}

          {activeSection === "pin" && (
            <PinSection
              settings={settings}
              pinValues={pinValues}
              setPinValues={setPinValues}
              busyCampus={pinBusyCampus}
              onUpdate={updateClassPin}
              message={settingsMessage}
              error={settingsError}
            />
          )}
        </div>
      </section>

      <style jsx global>{adminStyles}</style>
    </main>
  );
}

function DashboardSection({
  dashboard,
  loading,
  error,
  settings,
  selectedModel,
  setSelectedModel,
  reasoning,
  setReasoning,
  savingAI,
  onSaveAI,
  settingsMessage,
  settingsError,
  pinValues,
  setPinValues,
  pinBusyCampus,
  onUpdatePin,
}: {
  dashboard: DashboardData | null;
  loading: boolean;
  error: string;
  settings: SettingsData | null;
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  reasoning: string;
  setReasoning: (value: string) => void;
  savingAI: boolean;
  onSaveAI: () => Promise<void>;
  settingsMessage: string;
  settingsError: string;
  pinValues: Record<string, string>;
  setPinValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  pinBusyCampus: string | null;
  onUpdatePin: (campus: string) => Promise<void>;
}) {
  if (loading && !dashboard) {
    return <div className="hh-card admin-state-card">正在讀取管理資料…</div>;
  }

  if (error && !dashboard) {
    return <div className="admin-notice danger">{error}</div>;
  }

  if (!dashboard) return null;

  const models = settings?.models ?? [
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", description: "高流量／低成本" },
    { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", description: "品質與成本平衡" },
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", description: "最高品質" },
  ];

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
            <small>平均每題 ${dashboard.month.averageCost.toFixed(4)}</small>
          </article>

          <article className="admin-period-card period-today">
            <span>今日解題</span>
            <strong className="hh-number">{dashboard.today.questions} 題</strong>
            <small>{dashboard.today.students} 位學生使用</small>
          </article>

          <article className="admin-period-card period-month-cost">
            <span>本月 API 成本</span>
            <strong className="hh-number">${dashboard.month.cost.toFixed(4)}</strong>
            <small>本月累積</small>
          </article>

          <article className="admin-period-card period-today-cost">
            <span>今日 API 成本</span>
            <strong className="hh-number">${dashboard.today.cost.toFixed(4)}</strong>
            <small>平均 ${dashboard.today.averageCost.toFixed(4)} / 題</small>
          </article>
        </div>
      </section>

      <section className="hh-card admin-panel admin-overview-panel">
        <div className="admin-section-head">
          <div>
            <div className="hh-eyebrow">CAMPUS OVERVIEW</div>
            <h2 className="hh-display">各班使用狀況</h2>
            <p>比較三個班級今天與本月的解題量、成本與學生數。</p>
          </div>
        </div>

        <div className="admin-campus-list">
          {dashboard.campuses.map((campus) => (
            <article
              className={`admin-campus-row campus-${campus.campus}`}
              key={campus.campus}
            >
              <div className="admin-campus-identity">
                <strong className="hh-display">{campus.campus}</strong>
                <span>{campus.students} 位學生</span>
              </div>

              <div className="admin-campus-row-metrics">
                <Metric label="今日解題" value={`${campus.todayQuestions} 題`} />
                <Metric label="今日成本" value={`$${campus.todayCost.toFixed(4)}`} />
                <Metric label="本月解題" value={`${campus.monthQuestions} 題`} />
                <Metric label="本月成本" value={`$${campus.monthCost.toFixed(4)}`} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="hh-card admin-panel admin-ai-control-panel">
        <div className="admin-section-head">
          <div>
            <div className="hh-eyebrow">AI CONTROL</div>
            <h2 className="hh-display">AI 模型與推理強度</h2>
            <p>直接在總覽切換所有學生下一題所使用的模型與推理深度。</p>
          </div>

          <div className="admin-current-model-mini">
            <span>目前模型</span>
            <strong>{dashboard.ai.modelName}</strong>
          </div>
        </div>

        <div className="admin-overview-ai-grid">
          <div className="admin-overview-ai-block">
            <div className="admin-control-label">模型</div>
            <div className="admin-model-grid overview-model-grid">
              {models.map((model) => (
                <button
                  type="button"
                  key={model.id}
                  className={`admin-model-card model-${model.id.split("-").at(-1)} ${
                    selectedModel === model.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedModel(model.id)}
                >
                  <div className="admin-model-top">
                    <span>{model.name}</span>
                    {selectedModel === model.id && <b>已選取</b>}
                  </div>
                  <p>{model.description}</p>
                  {typeof model.inputPrice === "number" && (
                    <small>
                      Input ${model.inputPrice}/M · Output ${model.outputPrice}/M
                    </small>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-overview-ai-block">
            <div className="admin-control-label">推理強度</div>
            <div className="admin-segmented overview-reasoning">
              {[
                ["low", "快速", "速度優先"],
                ["medium", "標準", "日常建議"],
                ["high", "深度", "複雜題目"],
              ].map(([value, label, note]) => (
                <button
                  type="button"
                  key={value}
                  className={reasoning === value ? "active" : ""}
                  onClick={() => setReasoning(value)}
                >
                  <strong>{label}</strong>
                  <span>{note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {(settingsMessage || settingsError) && (
          <div className={`admin-notice ${settingsError ? "danger" : "success"}`}>
            {settingsError || settingsMessage}
          </div>
        )}

        <div className="admin-save-row overview-save-row">
          <button
            type="button"
            className="hh-button-primary"
            disabled={savingAI}
            onClick={() => void onSaveAI()}
          >
            {savingAI ? "儲存中…" : "套用 AI 設定"}
          </button>
        </div>
      </section>

      <section className="hh-card admin-panel admin-pin-overview-panel">
        <div className="admin-section-head">
          <div>
            <div className="hh-eyebrow">CLASS ACCESS</div>
            <h2 className="hh-display">班級 PIN</h2>
            <p>直接在總覽更新各班共用的四位數登入 PIN。</p>
          </div>
        </div>

        <div className="admin-pin-grid overview-pin-grid">
          {CAMPUSES.map((campus) => {
            const info = settings?.classPins?.find(
              (item) => item.campus === campus,
            );

            return (
              <article className={`admin-pin-card pin-${campus}`} key={campus}>
                <div className="admin-pin-head">
                  <div>
                    <strong>{campus}</strong>
                    <span>{info?.configured ? "目前已設定" : "尚未設定"}</span>
                  </div>
                  <div className="admin-pin-status">
                    {info?.configured ? "ACTIVE" : "NOT SET"}
                  </div>
                </div>

                {info?.validFrom && (
                  <div className="admin-pin-date">
                    {info.validFrom} ～ {info.validUntil || "—"}
                  </div>
                )}

                <div className="admin-pin-controls">
                  <input
                    className="hh-input"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinValues[campus] || ""}
                    onChange={(event) =>
                      setPinValues((current) => ({
                        ...current,
                        [campus]: event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 4),
                      }))
                    }
                    placeholder="新的四位數 PIN"
                  />
                  <button
                    type="button"
                    className="hh-button-primary"
                    disabled={pinBusyCampus === campus}
                    onClick={() => void onUpdatePin(campus)}
                  >
                    {pinBusyCampus === campus ? "更新中…" : "更新 PIN"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {error && <div className="admin-notice danger">{error}</div>}
    </div>
  );
}

function StudentsSection(props: {
  students: StudentRow[];
  allStudents: StudentRow[];
  total: number;
  active: number;
  inactive: number;
  loading: boolean;
  error: string;
  message: string;
  campusFilter: (typeof CAMPUS_FILTERS)[number];
  setCampusFilter: (value: (typeof CAMPUS_FILTERS)[number]) => void;
  statusFilter: "全部" | "啟用" | "停用";
  setStatusFilter: (value: "全部" | "啟用" | "停用") => void;
  query: string;
  setQuery: (value: string) => void;
  campusCount: (campus: string) => number;
  newCampus: (typeof CAMPUSES)[number];
  setNewCampus: (campus: (typeof CAMPUSES)[number]) => void;
  newName: string;
  setNewName: (name: string) => void;
  adding: boolean;
  addStudent: () => Promise<void>;
  busyStudentId: string | null;
  toggleStudent: (student: StudentRow) => Promise<void>;
}) {
  const todayTotal = props.allStudents.reduce((sum, student) => sum + student.todayCount, 0);

  return (
    <div className="admin-stack">
      <section className="admin-kpi-grid">
        <KpiCard label="學生總數" value={props.total} suffix="人" />
        <KpiCard label="啟用中" value={props.active} suffix="人" tone="blue" />
        <KpiCard label="已停用" value={props.inactive} suffix="人" tone="red" />
        <KpiCard label="今日已解題" value={todayTotal} suffix="題" tone="gold" />
      </section>

      <section className="hh-card admin-panel admin-add-student">
        <div>
          <PanelHeader
            eyebrow="NEW STUDENT"
            title="新增學生"
            subtitle="班級共用 PIN，因此只需要班級與姓名"
          />
        </div>

        <div className="admin-add-form">
          <select
            className="hh-select"
            value={props.newCampus}
            onChange={(event) =>
              props.setNewCampus(event.target.value as (typeof CAMPUSES)[number])
            }
          >
            {CAMPUSES.map((campus) => (
              <option value={campus} key={campus}>
                {campus}
              </option>
            ))}
          </select>

          <input
            className="hh-input"
            value={props.newName}
            onChange={(event) => props.setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void props.addStudent();
            }}
            placeholder="輸入學生姓名"
          />

          <button
            type="button"
            className="hh-button-primary"
            disabled={props.adding}
            onClick={() => void props.addStudent()}
          >
            {props.adding ? "新增中…" : "新增學生"}
          </button>
        </div>
      </section>

      {(props.message || props.error) && (
        <div className={`admin-notice ${props.error ? "danger" : "success"}`}>
          {props.error || props.message}
        </div>
      )}

      <section className="hh-card admin-panel">
        <PanelHeader
          eyebrow="STUDENT DIRECTORY"
          title="學生名單"
          subtitle={`目前顯示 ${props.students.length} / ${props.total} 位學生`}
        />

        <div className="admin-student-filter-box">
          <div className="admin-filter-tabs">
            {CAMPUS_FILTERS.map((campus) => (
              <button
                type="button"
                key={campus}
                className={`admin-filter-pill ${
                  props.campusFilter === campus ? "active" : ""
                }`}
                onClick={() => props.setCampusFilter(campus)}
              >
                {campus}
                <span>
                  {campus === "全部班級" ? props.total : props.campusCount(campus)}
                </span>
              </button>
            ))}
          </div>

          <div className="admin-student-search">
            <input
              className="hh-input"
              placeholder="搜尋學生姓名…"
              value={props.query}
              onChange={(event) => props.setQuery(event.target.value)}
            />
            <select
              className="hh-select"
              value={props.statusFilter}
              onChange={(event) =>
                props.setStatusFilter(event.target.value as "全部" | "啟用" | "停用")
              }
            >
              <option value="全部">全部狀態</option>
              <option value="啟用">啟用中</option>
              <option value="停用">已停用</option>
            </select>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>學生</th>
                <th>班級</th>
                <th>今日使用</th>
                <th>狀態</th>
                <th className="align-right">管理</th>
              </tr>
            </thead>
            <tbody>
              {props.loading && (
                <tr>
                  <td colSpan={5}>
                    <div className="admin-empty">正在讀取學生名單…</div>
                  </td>
                </tr>
              )}

              {!props.loading &&
                props.students.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div className="admin-student-cell">
                        <div className="admin-avatar">{student.name.slice(0, 1)}</div>
                        <div>
                          <strong>{student.name}</strong>
                          <span>{student.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`admin-campus-tag tag-${student.campus}`}>
                        {student.campus}
                      </span>
                    </td>
                    <td>
                      <div className="admin-usage-cell">
                        <span>
                          <strong>{student.todayCount}</strong> / 10 題
                        </span>
                        <div>
                          <i
                            style={{
                              width: `${Math.min(100, student.todayCount * 10)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`admin-status ${
                          student.active ? "active" : "inactive"
                        }`}
                      >
                        <i />
                        {student.active ? "啟用中" : "已停用"}
                      </span>
                    </td>
                    <td className="align-right">
                      <button
                        type="button"
                        className={`admin-mini-button ${
                          student.active ? "danger" : "success"
                        }`}
                        disabled={props.busyStudentId === student.id}
                        onClick={() => void props.toggleStudent(student)}
                      >
                        {props.busyStudentId === student.id
                          ? "處理中…"
                          : student.active
                            ? "停用"
                            : "重新啟用"}
                      </button>
                    </td>
                  </tr>
                ))}

              {!props.loading && props.students.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="admin-empty">沒有符合目前條件的學生。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AISection(props: {
  settings: SettingsData | null;
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  reasoning: string;
  setReasoning: (value: string) => void;
  saving: boolean;
  onSave: () => Promise<void>;
  message: string;
  error: string;
}) {
  const models = props.settings?.models ?? [
    {
      id: "gpt-5.6-luna",
      name: "GPT-5.6 Luna",
      description: "高流量／低成本",
    },
    {
      id: "gpt-5.6-terra",
      name: "GPT-5.6 Terra",
      description: "品質與成本平衡",
    },
    {
      id: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      description: "最高品質",
    },
  ];

  return (
    <div className="admin-stack">
      <section className="hh-card admin-panel">
        <PanelHeader
          eyebrow="MODEL CONTROL"
          title="AI 模型"
          subtitle="教師端統一控制所有學生解題所使用的模型"
        />

        <div className="admin-model-grid">
          {models.map((model) => (
            <button
              type="button"
              key={model.id}
              className={`admin-model-card model-${model.id.split("-").at(-1)} ${
                props.selectedModel === model.id ? "selected" : ""
              }`}
              onClick={() => props.setSelectedModel(model.id)}
            >
              <div className="admin-model-top">
                <span>{model.name}</span>
                {props.selectedModel === model.id && <b>目前選擇</b>}
              </div>
              <p>{model.description}</p>
              {typeof model.inputPrice === "number" && (
                <small>
                  Input ${model.inputPrice}/M · Output ${model.outputPrice}/M
                </small>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="hh-card admin-panel">
        <PanelHeader
          eyebrow="REASONING"
          title="推理強度"
          subtitle="控制模型每題投入的推理深度"
        />

        <div className="admin-segmented">
          {[
            ["low", "快速", "速度優先"],
            ["medium", "標準", "建議日常使用"],
            ["high", "深度", "複雜題目"],
          ].map(([value, label, note]) => (
            <button
              type="button"
              key={value}
              className={props.reasoning === value ? "active" : ""}
              onClick={() => props.setReasoning(value)}
            >
              <strong>{label}</strong>
              <span>{note}</span>
            </button>
          ))}
        </div>

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
            {props.saving ? "儲存中…" : "儲存 AI 設定"}
          </button>
        </div>
      </section>
    </div>
  );
}

function PinSection(props: {
  settings: SettingsData | null;
  pinValues: Record<string, string>;
  setPinValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  busyCampus: string | null;
  onUpdate: (campus: string) => Promise<void>;
  message: string;
  error: string;
}) {
  return (
    <div className="admin-stack">
      <section className="hh-card admin-panel">
        <PanelHeader
          eyebrow="CLASS ACCESS"
          title="班級 PIN"
          subtitle="每班共用一組四位數 PIN；更新後會立即套用"
        />

        {(props.message || props.error) && (
          <div className={`admin-notice ${props.error ? "danger" : "success"}`}>
            {props.error || props.message}
          </div>
        )}

        <div className="admin-pin-grid">
          {CAMPUSES.map((campus) => {
            const info = props.settings?.classPins?.find(
              (item) => item.campus === campus,
            );

            return (
              <article className={`admin-pin-card pin-${campus}`} key={campus}>
                <div className="admin-pin-head">
                  <div>
                    <strong>{campus}</strong>
                    <span>{info?.configured ? "目前已設定" : "尚未設定"}</span>
                  </div>
                  <div className="admin-pin-status">
                    {info?.configured ? "ACTIVE" : "NOT SET"}
                  </div>
                </div>

                {info?.validFrom && (
                  <div className="admin-pin-date">
                    有效期間：{info.validFrom} ～ {info.validUntil || "—"}
                  </div>
                )}

                <div className="admin-pin-controls">
                  <input
                    className="hh-input"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={props.pinValues[campus] || ""}
                    onChange={(event) =>
                      props.setPinValues((current) => ({
                        ...current,
                        [campus]: event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 4),
                      }))
                    }
                    placeholder="新的四位數 PIN"
                  />
                  <button
                    type="button"
                    className="hh-button-primary"
                    disabled={props.busyCampus === campus}
                    onClick={() => void props.onUpdate(campus)}
                  >
                    {props.busyCampus === campus ? "更新中…" : "更新 PIN"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="admin-notice warning">
        班級 PIN 是課堂使用的簡易進入門檻，不建議重複使用管理員密碼或其他重要密碼。
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

function PanelHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="admin-panel-header">
      <div className="hh-eyebrow">{eyebrow}</div>
      <h2 className="hh-display">{title}</h2>
      <p>{subtitle}</p>
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
  if (section === "students") return "STUDENT MANAGEMENT";
  if (section === "ai") return "AI CONTROL";
  if (section === "pin") return "CLASS ACCESS";
  return "OVERVIEW";
}

function sectionTitle(section: AdminSection) {
  if (section === "students") return "學生管理";
  if (section === "ai") return "AI 設定";
  if (section === "pin") return "班級 PIN";
  return "管理總覽";
}

function reasoningLabel(value: string) {
  if (value === "low") return "快速";
  if (value === "high") return "深度";
  return "標準";
}

const adminStyles = `
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

`;

