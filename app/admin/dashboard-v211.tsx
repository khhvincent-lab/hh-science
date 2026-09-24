"use client";

import { useEffect, useMemo, useState } from "react";
import {useUrlState} from "@/components/admin/use-url-state";
import styles from "./dashboard-v211.module.css";

type Dashboard = {
  today: { questions: number; students: number; cost: number; averageCost: number };
  month: { questions: number; cost: number; referenceCases: number; referenceMatches: number };
};
type ClassRow = {
  classId: string; label: string; students: number; todayActive: number;
  todayQuestions: number; monthQuestions: number; monthCostTwd: number;
};
type Insights = {
  daily: { day: string; questions: number; costUsd: number }[];
  pending: number;
  pendingAnswerConflicts: number;
  costByRole: { primary: number; verifier: number; other: number };
  heatmap: Record<string, Record<string, number>>;
};
const TWD_RATE = 32.5;
const money = (usd: number) => `NT$${(usd * TWD_RATE).toLocaleString("zh-TW", { maximumFractionDigits: 2 })}`;
const number = (value: number) => value.toLocaleString("zh-TW");
type TrendMetric = "questions" | "costUsd";
type AccuracyRange = "1" | "7" | "30" | "all";
type Accuracy = { referenceCases: number; referenceMatches: number; pendingReview: number; reviewedCases: number; reviewedCorrect: number; automaticCases: number; automaticMatches: number; invalidCases: number };

function Trend({ rows, metric }: { rows: Insights["daily"]; metric: TrendMetric }) {
  const values = rows.map((row) => metric === "questions" ? row.questions : row.costUsd * TWD_RATE);
  const peak = Math.max(0, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(peak / 4, 0.01)));
  const step = Math.ceil(peak / 4 / magnitude) * magnitude || (metric === "questions" ? 1 : 0.01);
  const ceiling = Math.max(step * 4, metric === "questions" ? 4 : 0.04);
  const x = (index: number) => 66 + index * 584 / Math.max(1, rows.length - 1);
  const y = (value: number) => 183 - value / ceiling * 146;
  const formatTick = (value: number) => metric === "questions" ? number(Math.round(value)) : value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
  const ticks = rows.length <= 7 ? rows : rows.filter((_, i) => i % 5 === 0 || i === rows.length - 1);
  return <div className={styles.chart}>
    <svg viewBox="0 0 680 223" role="img" aria-label={`${metric === "questions" ? "每日解題題數" : "每日 AI 成本，台幣"}趨勢圖，左側有數字刻度`}>
      {[4, 3, 2, 1, 0].map((level) => { const yy = y(level * ceiling / 4); return <g key={level}><line x1="66" y1={yy} x2="650" y2={yy} className={styles.gridline} /><text x="57" y={yy + 3} textAnchor="end" className={styles.axisLabel}>{formatTick(level * ceiling / 4)}</text></g>; })}
      {rows.length > 0 && <polyline points={values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} className={metric === "questions" ? styles.questionsLine : styles.costLine} />}
      {values.map((value, index) => <circle key={rows[index].day} cx={x(index)} cy={y(value)} r={rows.length > 7 ? 2.5 : 4} className={metric === "questions" ? styles.questionPoint : styles.costPoint}><title>{rows[index].day}：{metric === "questions" ? `${formatTick(value)} 題` : `NT$${formatTick(value)}`}</title></circle>)}
      {ticks.map((row) => {
        const index = rows.indexOf(row);
        return <text key={row.day} x={x(index)} y="213" textAnchor="middle" className={styles.axisLabel}>{row.day.slice(5)}</text>;
      })}
    </svg>
    {peak === 0 && <div className={styles.chartNote}>所選期間尚無{metric === "questions" ? "解題" : "AI 成本"}紀錄。</div>}
    <div className={styles.dailyStrip}>{rows.slice(-7).map((row) => <div key={row.day}><span>{row.day.slice(5)}</span><strong>{metric === "questions" ? `${number(row.questions)} 題` : money(row.costUsd)}</strong></div>)}</div>
  </div>;
}

export default function DashboardV211({
  dashboard, loading, error, isSuperAdmin, onNavigate,
}: {
  dashboard: Dashboard | null;
  loading: boolean;
  error: string;
  isSuperAdmin: boolean;
  onNavigate: (section: "usage" | "cost" | "teachingQuestions" | "siteQuestions", focus?: "pending") => void;
}) {
  const [range, setRange] = useUrlState<7|30>("trend_days",7,[7,30]);
  const [trendMetric, setTrendMetric] = useUrlState<TrendMetric>("trend_metric","questions",["questions","costUsd"]);
  const [accuracyRange, setAccuracyRange] = useUrlState<AccuracyRange>("accuracy_days","30",["1","7","30","all"]);
  const [accuracy, setAccuracy] = useState<Accuracy | null>(null);
  const [accuracyLoading, setAccuracyLoading] = useState(true);
  const [accuracyError, setAccuracyError] = useState("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [extraError, setExtraError] = useState("");
  const [extraLoading, setExtraLoading] = useState(true);
  const [costThreshold, setCostThreshold] = useState<number | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState("");
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdMessage, setThresholdMessage] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setExtraLoading(true);
      setExtraError("");
      setInsights(null);
      setClasses([]);
      setCostThreshold(null);
      try {
        const [classResponse, insightsResponse, thresholdResponse] = await Promise.all([
          fetch("/api/admin/class-overview", { cache: "no-store" }),
          fetch(`/api/admin/dashboard-insights?range=${range}`, { cache: "no-store" }),
          fetch("/api/admin/cost-alert-settings", { cache: "no-store" }),
        ]);
        if (!classResponse.ok || !insightsResponse.ok) throw new Error("讀取趨勢或班級分析失敗，請按右上方「重新整理」。");
        const [classData, insightsData] = await Promise.all([classResponse.json(), insightsResponse.json()]);
        if (!active) return;
        setClasses(Array.isArray(classData.rows) ? classData.rows : []);
        setInsights(insightsData);
        if (thresholdResponse.ok) {
          const thresholdData = await thresholdResponse.json();
          if (active) {
            const value = Number(thresholdData.monthlyThresholdTwd) || null;
            setCostThreshold(value);
            setThresholdDraft(value === null ? "" : String(value));
          }
        }
      } catch (caught) {
        if (active) setExtraError(caught instanceof Error ? caught.message : "讀取儀表板分析資料失敗。");
      } finally {
        if (active) setExtraLoading(false);
      }
    };
    if (dashboard) void load();
    return () => { active = false; };
  }, [dashboard, range]);

  useEffect(() => {
    if (!dashboard) return;
    const controller = new AbortController();
    fetch(`/api/admin/dashboard-accuracy?range=${accuracyRange}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "讀取解題正確率失敗。");
        return data as Accuracy;
      })
      .then((data) => { if (!controller.signal.aborted) setAccuracy(data); })
      .catch((caught) => { if (!controller.signal.aborted) setAccuracyError(caught instanceof Error ? caught.message : "讀取解題正確率失敗。"); })
      .finally(() => { if (!controller.signal.aborted) setAccuracyLoading(false); });
    return () => controller.abort();
  }, [dashboard, accuracyRange]);

  const ranked = useMemo(() => [...classes].sort((a, b) => b.todayQuestions - a.todayQuestions), [classes]);
  const totalStudents = classes.reduce((sum, row) => sum + row.students, 0);
  const maximum = Math.max(1, ...ranked.map((row) => row.todayQuestions));
  const lastSeven = insights?.daily.slice(-7) ?? [];
  const heatMax = Math.max(1, ...Object.values(insights?.heatmap ?? {}).flatMap((days) => Object.values(days)));
  const costParts = insights?.costByRole;
  const costTotal = costParts ? costParts.primary + costParts.verifier + costParts.other : 0;
  const monthlyAlert = costThreshold !== null && dashboard && dashboard.month.cost * TWD_RATE >= costThreshold;

  async function saveThreshold() {
    const value = Number(thresholdDraft);
    if (!Number.isFinite(value) || value <= 0 || value > 3_000_000) {
      setThresholdMessage("請輸入 1 至 3,000,000 元的警示金額。");
      return;
    }
    setThresholdSaving(true);
    setThresholdMessage("");
    try {
      const response = await fetch("/api/admin/cost-alert-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyThresholdTwd: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "儲存警示金額失敗。");
      setCostThreshold(Number(body.monthlyThresholdTwd));
      setThresholdDraft(String(body.monthlyThresholdTwd));
      setThresholdMessage("警示金額已更新。");
    } catch (caught) {
      setThresholdMessage(caught instanceof Error ? caught.message : "儲存警示金額失敗。");
    } finally {
      setThresholdSaving(false);
    }
  }

  function selectAccuracyRange(value: AccuracyRange) {
    if (value === accuracyRange) return;
    setAccuracy(null);
    setAccuracyError("");
    setAccuracyLoading(true);
    setAccuracyRange(value);
  }

  if (loading && !dashboard) return <div className="hh-card admin-state-card">正在讀取管理資料…</div>;
  if (error && !dashboard) return <div className="admin-notice danger">{error}</div>;
  if (!dashboard) return null;
  return <div className={styles.dashboard}>
    <div className={styles.intro}><div><div className={styles.eyebrow}>OPERATIONS OVERVIEW / V2.2.0</div><h2>今天的解題實驗室</h2><p>掌握解題使用、班級動態與 AI 成本。所有數字依目前登入權限顯示。</p></div><span className={styles.live}>台灣時間 · 即時資料</span></div>
    {error && <div className="admin-notice danger">{error}</div>}
    <div className={styles.kpis}>
      <article className={styles.kpi}><span>今日解題</span><strong>{number(dashboard.today.questions)} <small>題</small></strong><em>本月 {number(dashboard.month.questions)} 題</em></article>
      <article className={styles.kpi}><span>今日使用學生</span><strong>{number(dashboard.today.students)} <small>人</small></strong><em>{insights ? `授權班級共 ${number(totalStudents)} 人` : "正在讀取班級人數"}</em></article>
      <article className={styles.kpi}><span>待處理題目</span><strong>{insights ? number(insights.pending) : "—"} <small>題</small></strong><em>教師校正佇列中的待處理題目</em></article>
      <article className={styles.kpi}><span>今日 AI 成本</span><strong>{money(dashboard.today.cost)}</strong><em>平均每題 {money(dashboard.today.averageCost)}</em></article>
    </div>
    {extraError && <div className="admin-notice danger">{extraError}</div>}
    <div className={styles.columns}>
      <div className={styles.primary}>
        <section className={styles.panel}><div className={styles.panelHead}><div><h3>{trendMetric === "questions" ? "解題數量趨勢" : "AI 成本趨勢"}</h3><p>{trendMetric === "questions" ? "每日解題題數" : "每日 AI 成本 · 台幣估計值"}</p></div><div className={styles.segment}><button type="button" className={range === 7 ? styles.active : ""} onClick={() => setRange(7)}>7 天</button><button type="button" className={range === 30 ? styles.active : ""} onClick={() => setRange(30)}>30 天</button></div></div><div className={styles.metricSwitch} role="group" aria-label="選擇趨勢項目"><button type="button" aria-pressed={trendMetric === "questions"} className={trendMetric === "questions" ? styles.selected : ""} onClick={() => setTrendMetric("questions")}><i className={styles.cyanDot} />解題數量</button><button type="button" aria-pressed={trendMetric === "costUsd"} className={trendMetric === "costUsd" ? styles.selected : ""} onClick={() => setTrendMetric("costUsd")}><i className={styles.amberDot} />AI 成本</button></div>{extraLoading && !insights ? <div className={styles.emptyChart}>正在讀取趨勢…</div> : <Trend rows={insights?.daily ?? []} metric={trendMetric} />}</section>
        <section className={styles.panel}><div className={styles.panelHead}><div><h3>AI 成本概覽</h3><p>今日費用組成 · 以估計匯率換算台幣</p></div><button type="button" className={styles.link} onClick={() => onNavigate("cost")}>成本明細 →</button></div><div className={styles.costTotal}>{money(dashboard.today.cost)} <small>平均每題 {money(dashboard.today.averageCost)}</small></div>{costParts && costTotal > 0 ? <><div className={styles.costBar}><i style={{ width: `${costParts.primary / costTotal * 100}%` }} /><i style={{ width: `${costParts.verifier / costTotal * 100}%` }} /><i style={{ width: `${costParts.other / costTotal * 100}%` }} /></div><div className={styles.costLines}><div><span>主解模型</span><strong>{money(costParts.primary)}</strong></div><div><span>覆核與仲裁</span><strong>{money(costParts.verifier)}</strong></div><div><span>其他呼叫與追問</span><strong>{money(costParts.other)}</strong></div></div></> : <div className={styles.empty}>今日尚無可分析的模型費用。</div>}<div className={styles.monthCost}>本月累計 {money(dashboard.month.cost)}</div>{isSuperAdmin && <div className={styles.threshold}><label htmlFor="dashboard-cost-threshold">本月成本警示（NT$）</label><input id="dashboard-cost-threshold" type="number" min="1" max="3000000" value={thresholdDraft} onChange={(event) => setThresholdDraft(event.target.value)} /><button type="button" disabled={thresholdSaving} onClick={() => void saveThreshold()}>{thresholdSaving ? "儲存中…" : "儲存"}</button></div>}{thresholdMessage && <p className={styles.feedback} role="status">{thresholdMessage}</p>}</section>
        <section className={styles.panel}><div className={styles.panelHead}><div><h3>班級使用概況</h3><p>按今日解題數排序，點選查看完整使用狀況</p></div><button type="button" className={styles.link} onClick={() => onNavigate("usage")}>完整班級分析 →</button></div>{ranked.length ? <div className={styles.classList}>{ranked.slice(0, 5).map((row) => <button type="button" key={row.classId} className={styles.classRow} onClick={() => onNavigate("usage")}><div><strong>{row.label}</strong><small>今日登入 {row.todayActive} / {row.students} 人 · 本月 {row.monthQuestions} 題</small></div><b>{row.todayQuestions} 題</b><span className={styles.track}><i style={{ width: `${row.todayQuestions / maximum * 100}%` }} /></span></button>)}</div> : <div className={styles.empty}>目前沒有可查看的班級。</div>}</section>
        <section className={styles.panel}><div className={styles.panelHead}><div><h3>班級活躍分析</h3><p>最近七天各班的每日解題量，顏色越亮表示題數越多</p></div></div>{ranked.length && lastSeven.length ? <div className={styles.heatmap}><div className={styles.heatHead}><span>班級</span>{lastSeven.map((row) => <span key={row.day}>{row.day.slice(5)}</span>)}</div>{ranked.slice(0, 4).map((row) => <div className={styles.heatRow} key={row.classId}><span title={row.label}>{row.label.split(" · ").slice(-1)[0]}</span>{lastSeven.map(({ day }) => { const count = insights?.heatmap[row.classId]?.[day] ?? 0; return <i key={day} title={`${day}：${count} 題`} style={{ opacity: count === 0 ? .13 : .28 + count / heatMax * .72 }} />; })}</div>)}</div> : <div className={styles.empty}>目前沒有可分析的班級紀錄。</div>}</section>
      </div>
      <div className={styles.secondary}>
        <section className={`${styles.panel} ${styles.accuracyPanel}`}><div className={styles.panelHead}><div><h3>解題正確率</h3><p>可判定題目的比對結果，納入老師覆核</p></div></div><div className={styles.accuracyRanges} role="group" aria-label="正確率統計期間">{([ ["1", "1 天"], ["7", "7 天"], ["30", "30 天"], ["all", "全部"] ] as const).map(([value, label]) => <button type="button" key={value} className={accuracyRange === value ? styles.selected : ""} aria-pressed={accuracyRange === value} onClick={() => selectAccuracyRange(value)}>{label}</button>)}</div><strong className={styles.accuracyValue}>{accuracyLoading ? "…" : accuracy?.referenceCases ? `${Math.round(accuracy.referenceMatches / accuracy.referenceCases * 100)}%` : "—"}</strong><p className={styles.accuracyDetail}>{accuracyError || (accuracyLoading ? "正在統計…" : accuracy?.referenceCases ? `${number(accuracy.referenceMatches)} 題正確／${number(accuracy.referenceCases)} 題可判定` : "這段期間尚無可比對的題目")}</p>{!accuracyLoading && !accuracyError && Boolean(accuracy?.pendingReview) && <button type="button" className={styles.reviewLink} onClick={() => onNavigate("siteQuestions", "pending")}>{number(accuracy?.pendingReview || 0)} 題答案不一致，前往核對 →</button>}{!accuracyLoading && accuracy && <div className={styles.accuracyDetail}><p>參考答案吻合率：{accuracy.automaticCases ? `${Math.round(accuracy.automaticMatches / accuracy.automaticCases * 100)}%（${accuracy.automaticMatches}/${accuracy.automaticCases}）` : "—"}</p><p>老師覆核正確率：{accuracy.reviewedCases ? `${Math.round(accuracy.reviewedCorrect / accuracy.reviewedCases * 100)}%（${accuracy.reviewedCorrect}/${accuracy.reviewedCases}）` : "尚無覆核"}</p><p>題目有誤排除：{accuracy.invalidCases || 0} 題</p></div>}<small className={styles.accuracyNote}>未填參考答案、題目有誤及所有待核對題目均不計入。自動吻合不等於老師已確認。</small></section>
        <section className={styles.panel}><div className={styles.panelHead}><div><h3>智慧提醒</h3><p>依目前可核對的資料顯示</p></div></div><div className={styles.alerts}>{insights && insights.pending > 0 && <button type="button" onClick={() => onNavigate("teachingQuestions")}><i className={styles.amberDot} /><span><strong>{insights.pending} 題等待教師校正</strong><small>其中 {insights.pendingAnswerConflicts} 題標記為答案問題 · 查看題目 →</small></span></button>}{monthlyAlert && <button type="button" onClick={() => onNavigate("cost")}><i className={styles.amberDot} /><span><strong>本月成本達到警示門檻</strong><small>目前 {money(dashboard.month.cost)} · 查看成本明細 →</small></span></button>}{insights && insights.pending === 0 && !monthlyAlert && <p className={styles.empty}>目前沒有需要關注的事項。</p>}</div></section>
      </div>
    </div>
  </div>;
}
