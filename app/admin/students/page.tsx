"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ThemeToggle from "@/components/theme-toggle";

type StudentRow = {
  id: string;
  campus: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  todayCount: number;
};

type Summary = {
  total: number;
  active: number;
  inactive: number;
  campuses: { campus: string; count: number }[];
};

const CAMPUSES = ["全部班級", "高雄班", "嘉義班", "員林班"] as const;

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    active: 0,
    inactive: 0,
    campuses: [],
  });

  const [campus, setCampus] = useState<(typeof CAMPUSES)[number]>("全部班級");
  const [status, setStatus] = useState<"全部" | "啟用" | "停用">("全部");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [newCampus, setNewCampus] = useState("高雄班");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/students", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/admin";
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "讀取學生資料失敗。");
      }

      setStudents(Array.isArray(data.students) ? data.students : []);
      setSummary(
        data.summary ?? {
          total: 0,
          active: 0,
          inactive: 0,
          campuses: [],
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "讀取學生資料失敗。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const filteredStudents = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return students.filter((student) => {
      if (campus !== "全部班級" && student.campus !== campus) return false;
      if (status === "啟用" && !student.active) return false;
      if (status === "停用" && student.active) return false;

      if (
        keyword &&
        !student.name.toLowerCase().includes(keyword) &&
        !student.campus.toLowerCase().includes(keyword)
      ) {
        return false;
      }

      return true;
    });
  }, [students, campus, status, query]);

  async function addStudent() {
    const name = newName.trim();
    if (!name) {
      setError("請輸入學生姓名。");
      return;
    }

    setAdding(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campus: newCampus,
          name,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "新增學生失敗。");

      setNewName("");
      setMessage(`已新增 ${newCampus}｜${name}`);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增學生失敗。");
    } finally {
      setAdding(false);
    }
  }

  async function toggleStudent(student: StudentRow) {
    const nextActive = !student.active;
    const wording = nextActive ? "重新啟用" : "停用";

    if (
      !window.confirm(
        `確定要${wording}「${student.campus}｜${student.name}」嗎？`,
      )
    ) {
      return;
    }

    setBusyId(student.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: student.id,
          active: nextActive,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "更新學生狀態失敗。");

      setStudents((current) =>
        current.map((row) =>
          row.id === student.id ? { ...row, active: nextActive } : row,
        ),
      );

      setSummary((current) => ({
        ...current,
        active: current.active + (nextActive ? 1 : -1),
        inactive: current.inactive + (nextActive ? -1 : 1),
      }));

      setMessage(`已${wording} ${student.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新學生狀態失敗。");
    } finally {
      setBusyId(null);
    }
  }

  function campusCount(name: string) {
    return summary.campuses.find((item) => item.campus === name)?.count ?? 0;
  }

  return (
    <main className="student-admin-page">
      <header className="student-admin-header">
        <div className="student-admin-header-inner">
          <div>
            <div className="hh-eyebrow">H.H. SCIENCE LAB · ADMIN</div>
            <h1 className="hh-display student-admin-title">學生管理</h1>
            <p className="student-admin-subtitle">
              管理學生名單、登入資格與今日 AI 解題使用量
            </p>
          </div>

          <div className="student-admin-header-actions">
            <ThemeToggle />
            <a href="/admin" className="hh-button-secondary student-admin-back">
              返回管理後台
            </a>
          </div>
        </div>
      </header>

      <div className="student-admin-container">
        <section className="student-admin-kpis">
          <Kpi label="學生總數" value={summary.total} note="目前名單" />
          <Kpi label="啟用中" value={summary.active} note="可登入系統" tone="success" />
          <Kpi label="已停用" value={summary.inactive} note="暫停登入" tone="danger" />
          <Kpi
            label="今日已解題"
            value={students.reduce((sum, item) => sum + item.todayCount, 0)}
            note="全班合計"
            tone="gold"
          />
        </section>

        <section className="hh-card student-admin-add-card">
          <div>
            <div className="hh-eyebrow">NEW STUDENT</div>
            <h2 className="hh-display student-admin-section-title">新增學生</h2>
            <p className="student-admin-muted">
              學生登入使用班級共用 PIN，因此新增時只需要班級與姓名。
            </p>
          </div>

          <div className="student-admin-add-form">
            <select
              className="hh-select"
              value={newCampus}
              onChange={(event) => setNewCampus(event.target.value)}
            >
              <option value="高雄班">高雄班</option>
              <option value="嘉義班">嘉義班</option>
              <option value="員林班">員林班</option>
            </select>

            <input
              className="hh-input"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addStudent();
              }}
              placeholder="輸入學生姓名"
              maxLength={40}
            />

            <button
              type="button"
              className="hh-button-primary student-admin-add-button"
              onClick={() => void addStudent()}
              disabled={adding}
            >
              {adding ? "新增中…" : "新增學生"}
            </button>
          </div>
        </section>

        {(message || error) && (
          <div
            className={`student-admin-notice ${
              error ? "student-admin-notice-error" : "student-admin-notice-success"
            }`}
          >
            {error || message}
          </div>
        )}

        <section className="hh-card student-admin-table-card">
          <div className="student-admin-toolbar">
            <div>
              <div className="hh-eyebrow">STUDENT DIRECTORY</div>
              <h2 className="hh-display student-admin-section-title">學生名單</h2>
              <p className="student-admin-muted">
                顯示 {filteredStudents.length} / {summary.total} 位學生
              </p>
            </div>

            <button
              type="button"
              className="hh-button-secondary"
              onClick={() => void loadStudents()}
              disabled={loading}
            >
              {loading ? "更新中…" : "重新整理"}
            </button>
          </div>

          <div className="student-admin-filters">
            <div className="student-admin-campus-tabs">
              {CAMPUSES.map((item) => {
                const count =
                  item === "全部班級" ? summary.total : campusCount(item);

                return (
                  <button
                    key={item}
                    type="button"
                    className={`student-admin-filter-chip ${
                      campus === item ? "is-active" : ""
                    }`}
                    onClick={() => setCampus(item)}
                  >
                    {item}
                    <span className="hh-number">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="student-admin-search-row">
              <input
                className="hh-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜尋學生姓名…"
              />

              <select
                className="hh-select"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "全部" | "啟用" | "停用")
                }
              >
                <option value="全部">全部狀態</option>
                <option value="啟用">啟用中</option>
                <option value="停用">已停用</option>
              </select>
            </div>
          </div>

          <div className="student-admin-table-wrap">
            <table className="student-admin-table">
              <thead>
                <tr>
                  <th>學生</th>
                  <th>班級</th>
                  <th>今日使用</th>
                  <th>狀態</th>
                  <th className="student-admin-align-right">管理</th>
                </tr>
              </thead>

              <tbody>
                {!loading &&
                  filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td>
                        <div className="student-admin-student-cell">
                          <div className="student-admin-avatar">
                            {student.name.slice(0, 1)}
                          </div>
                          <div>
                            <div className="student-admin-name">{student.name}</div>
                            <div className="student-admin-id">
                              {student.id.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`student-admin-campus student-admin-campus-${student.campus.replace(
                            "班",
                            "",
                          )}`}
                        >
                          {student.campus}
                        </span>
                      </td>

                      <td>
                        <div className="student-admin-usage">
                          <strong className="hh-number">{student.todayCount}</strong>
                          <span>/ 10 題</span>
                          <div className="student-admin-progress">
                            <span
                              style={{
                                width: `${Math.min(
                                  100,
                                  (student.todayCount / 10) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`student-admin-status ${
                            student.active
                              ? "student-admin-status-active"
                              : "student-admin-status-inactive"
                          }`}
                        >
                          <i />
                          {student.active ? "啟用中" : "已停用"}
                        </span>
                      </td>

                      <td className="student-admin-align-right">
                        <button
                          type="button"
                          className={`student-admin-toggle-button ${
                            student.active ? "danger" : "success"
                          }`}
                          disabled={busyId === student.id}
                          onClick={() => void toggleStudent(student)}
                        >
                          {busyId === student.id
                            ? "處理中…"
                            : student.active
                              ? "停用"
                              : "重新啟用"}
                        </button>
                      </td>
                    </tr>
                  ))}

                {!loading && filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="student-admin-empty">
                        沒有符合目前條件的學生。
                      </div>
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={5}>
                      <div className="student-admin-empty">正在讀取學生名單…</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .student-admin-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--primary) 8%, transparent), transparent 28rem),
            radial-gradient(circle at 92% 2%, color-mix(in srgb, var(--accent-gold) 8%, transparent), transparent 26rem),
            var(--background);
          color: var(--text);
        }

        .student-admin-header {
          border-bottom: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 86%, transparent);
          backdrop-filter: blur(14px);
        }

        .student-admin-header-inner,
        .student-admin-container {
          width: min(1180px, calc(100% - 40px));
          margin: 0 auto;
        }

        .student-admin-header-inner {
          min-height: 150px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
        }

        .student-admin-title {
          margin: 8px 0 4px;
          font-size: clamp(32px, 4vw, 48px);
          line-height: 1.08;
        }

        .student-admin-subtitle,
        .student-admin-muted {
          color: var(--text-secondary);
          line-height: 1.7;
        }

        .student-admin-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .student-admin-back {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          text-decoration: none;
        }

        .student-admin-container {
          padding: 28px 0 56px;
          display: grid;
          gap: 20px;
        }

        .student-admin-kpis {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .student-admin-kpi {
          padding: 20px;
          border-radius: 18px;
          border: 1px solid var(--border);
          background: var(--surface);
          box-shadow: 0 10px 30px rgba(20, 31, 24, 0.05);
        }

        .student-admin-kpi-label {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 700;
        }

        .student-admin-kpi-value {
          margin: 8px 0 2px;
          font-size: 30px;
          font-weight: 800;
        }

        .student-admin-kpi-note {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .student-admin-kpi.success {
          border-top: 3px solid var(--success);
        }

        .student-admin-kpi.danger {
          border-top: 3px solid var(--danger);
        }

        .student-admin-kpi.gold {
          border-top: 3px solid var(--accent-gold);
        }

        .student-admin-add-card,
        .student-admin-table-card {
          padding: 24px;
        }

        .student-admin-add-card {
          display: grid;
          grid-template-columns: minmax(220px, 0.8fr) minmax(480px, 1.2fr);
          gap: 28px;
          align-items: end;
        }

        .student-admin-section-title {
          font-size: 24px;
          margin: 5px 0 4px;
        }

        .student-admin-add-form {
          display: grid;
          grid-template-columns: 160px minmax(180px, 1fr) 120px;
          gap: 10px;
        }

        .student-admin-add-button {
          white-space: nowrap;
        }

        .student-admin-notice {
          padding: 13px 16px;
          border-radius: 14px;
          border: 1px solid;
          font-size: 14px;
          font-weight: 700;
        }

        .student-admin-notice-success {
          color: var(--success);
          border-color: color-mix(in srgb, var(--success) 35%, var(--border));
          background: color-mix(in srgb, var(--success) 10%, var(--surface));
        }

        .student-admin-notice-error {
          color: var(--danger);
          border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
          background: color-mix(in srgb, var(--danger) 10%, var(--surface));
        }

        .student-admin-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 20px;
        }

        .student-admin-filters {
          padding: 15px;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--surface-soft);
          display: grid;
          gap: 12px;
          margin-bottom: 18px;
        }

        .student-admin-campus-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .student-admin-filter-chip {
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-secondary);
          min-height: 38px;
          border-radius: 999px;
          padding: 0 13px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-weight: 700;
          transition: 0.16s ease;
        }

        .student-admin-filter-chip span {
          opacity: 0.75;
          font-size: 12px;
        }

        .student-admin-filter-chip:hover {
          border-color: var(--secondary);
          color: var(--text);
        }

        .student-admin-filter-chip.is-active {
          background: var(--primary);
          color: var(--background);
          border-color: var(--primary);
        }

        [data-theme="dark"] .student-admin-filter-chip.is-active {
          color: #152019;
        }

        .student-admin-search-row {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 170px;
          gap: 10px;
        }

        .student-admin-table-wrap {
          overflow-x: auto;
          border: 1px solid var(--border);
          border-radius: 16px;
        }

        .student-admin-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 780px;
        }

        .student-admin-table th,
        .student-admin-table td {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          text-align: left;
          vertical-align: middle;
        }

        .student-admin-table th {
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--text-secondary);
          background: var(--surface-soft);
        }

        .student-admin-table tbody tr:last-child td {
          border-bottom: 0;
        }

        .student-admin-table tbody tr:hover {
          background: color-mix(in srgb, var(--primary) 4%, var(--surface));
        }

        .student-admin-student-cell {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .student-admin-avatar {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: var(--primary-soft);
          color: var(--primary);
          font-weight: 900;
        }

        .student-admin-name {
          font-weight: 800;
        }

        .student-admin-id {
          margin-top: 2px;
          font-size: 11px;
          color: var(--text-secondary);
          font-family: var(--font-inter), monospace;
        }

        .student-admin-campus {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          border: 1px solid var(--border);
        }

        .student-admin-campus-高雄 {
          background: color-mix(in srgb, #6e8fb3 12%, var(--surface));
          color: #6484a2;
          border-color: color-mix(in srgb, #6e8fb3 32%, var(--border));
        }

        .student-admin-campus-嘉義 {
          background: color-mix(in srgb, #a8615b 11%, var(--surface));
          color: #9a5b56;
          border-color: color-mix(in srgb, #a8615b 30%, var(--border));
        }

        .student-admin-campus-員林 {
          background: color-mix(in srgb, #8a7aa6 12%, var(--surface));
          color: #7f7099;
          border-color: color-mix(in srgb, #8a7aa6 30%, var(--border));
        }

        .student-admin-usage {
          width: 130px;
          display: grid;
          grid-template-columns: auto 1fr;
          align-items: baseline;
          gap: 4px;
          color: var(--text-secondary);
          font-size: 12px;
        }

        .student-admin-usage strong {
          color: var(--text);
          font-size: 16px;
        }

        .student-admin-progress {
          grid-column: 1 / -1;
          height: 4px;
          border-radius: 999px;
          overflow: hidden;
          background: var(--border);
        }

        .student-admin-progress span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: var(--accent-gold);
        }

        .student-admin-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 800;
        }

        .student-admin-status i {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: block;
        }

        .student-admin-status-active {
          color: var(--success);
        }

        .student-admin-status-active i {
          background: var(--success);
        }

        .student-admin-status-inactive {
          color: var(--text-secondary);
        }

        .student-admin-status-inactive i {
          background: var(--text-secondary);
        }

        .student-admin-align-right {
          text-align: right !important;
        }

        .student-admin-toggle-button {
          min-height: 34px;
          border-radius: 10px;
          padding: 0 11px;
          border: 1px solid;
          background: transparent;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .student-admin-toggle-button.danger {
          border-color: color-mix(in srgb, var(--danger) 32%, var(--border));
          color: var(--danger);
        }

        .student-admin-toggle-button.success {
          border-color: color-mix(in srgb, var(--success) 32%, var(--border));
          color: var(--success);
        }

        .student-admin-toggle-button:disabled {
          opacity: 0.55;
          cursor: wait;
        }

        .student-admin-empty {
          padding: 42px 18px;
          text-align: center;
          color: var(--text-secondary);
        }

        @media (max-width: 900px) {
          .student-admin-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .student-admin-add-card {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .student-admin-header-inner,
          .student-admin-container {
            width: min(100% - 24px, 1180px);
          }

          .student-admin-header-inner {
            min-height: 180px;
            padding: 22px 0;
            align-items: flex-start;
            flex-direction: column;
          }

          .student-admin-header-actions {
            width: 100%;
            justify-content: space-between;
          }

          .student-admin-kpis {
            grid-template-columns: 1fr 1fr;
          }

          .student-admin-kpi {
            padding: 16px;
          }

          .student-admin-add-card,
          .student-admin-table-card {
            padding: 17px;
          }

          .student-admin-add-form,
          .student-admin-search-row {
            grid-template-columns: 1fr;
          }

          .student-admin-toolbar {
            align-items: stretch;
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}

function Kpi({
  label,
  value,
  note,
  tone = "",
}: {
  label: string;
  value: number;
  note: string;
  tone?: "success" | "danger" | "gold" | "";
}) {
  return (
    <article className={`student-admin-kpi ${tone}`}>
      <div className="student-admin-kpi-label">{label}</div>
      <div className="student-admin-kpi-value hh-number">{value}</div>
      <div className="student-admin-kpi-note">{note}</div>
    </article>
  );
}
