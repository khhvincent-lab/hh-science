"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./smart-dashboard.css";

type Snapshot = {
  today:{questions:number;students:number;cost:number;averageCost:number};
  month:{questions:number;cost:number;averageCost:number};
};
type Slot = {model:string;provider:string;reasoning:string};
type Router = {mode:"single"|"multi";primary:Slot;verifier:Slot} | null;
type ClassRow = {
  classId:string;label:string;students:number;todayActive:number;
  todayQuestions:number;monthQuestions:number;monthCostTwd:number;
};
type Insights = {
  pendingCorrections:number;disputedToday:number;
  repeatedFollowupsToday:number;repeatStudentsToday:number;inspectedAt:string;
};
type Navigation = "siteQuestions"|"usage"|"cost"|"teachingQuestions"|"ai";
type Focus = "issue"|"followup";
type Props = {
  dashboard:Snapshot|null;
  solverSettings:Router;
  loading:boolean;
  error:string;
  isSuperAdmin:boolean;
  scopeKey:string;
  displayName:string;
  formatCost:(usd:number)=>string;
  modelName:(model:string)=>string;
  onNavigate:(section:Navigation,focus?:Focus)=>void;
  onRefresh:()=>Promise<void>;
};
const integer = (value:number)=>Number(value||0).toLocaleString("zh-TW");
const pendingLabel = (count:number)=> count ? integer(count) : "0";

export default function SmartDashboard({
  dashboard, solverSettings, loading, error, isSuperAdmin, scopeKey,
  displayName, formatCost, modelName, onNavigate, onRefresh,
}:Props) {
  const [classes,setClasses] = useState<ClassRow[]>([]);
  const [insights,setInsights] = useState<Insights|null>(null);
  const [insightError,setInsightError] = useState("");
  const [overviewLoading,setOverviewLoading] = useState(true);
  const [alertThreshold,setAlertThreshold] = useState("500");
  const [thresholdLoading,setThresholdLoading] = useState(true);
  const [thresholdSaving,setThresholdSaving] = useState(false);
  const [thresholdMessage,setThresholdMessage] = useState("");
  const [revision,setRevision] = useState(0);
  const [refreshing,setRefreshing] = useState(false);

  useEffect(()=>{
    let cancelled=false;
    async function loadOverview(){
      setOverviewLoading(true);
      setInsights(null);
      setInsightError("");
      try{
        const [classResponse,insightResponse]=await Promise.all([
          fetch("/api/admin/class-overview",{cache:"no-store"}),
          fetch("/api/admin/overview-insights",{cache:"no-store"}),
        ]);
        const [classData,insightData]=await Promise.all([classResponse.json(),insightResponse.json()]);
        if(cancelled)return;
        if(classResponse.ok)setClasses(Array.isArray(classData.rows)?classData.rows:[]);
        else setClasses([]);
        if(insightResponse.ok)setInsights(insightData);
        else setInsightError(insightData.error||"智慧關注資料目前無法使用。");
        if(!classResponse.ok)setInsightError(current=>[current,"班級統計目前無法使用。"].filter(Boolean).join(" "));
      }catch(err){
        if(cancelled)return;
        setClasses([]);
        setInsights(null);
        setInsightError(err instanceof Error?err.message:"智慧關注資料目前無法使用。");
      }finally{
        if(!cancelled)setOverviewLoading(false);
      }
    }
    void loadOverview();
    return ()=>{cancelled=true;};
  },[scopeKey,revision,dashboard?.today.questions,dashboard?.month.questions]);

  useEffect(()=>{
    let cancelled=false;
    async function loadThreshold(){
      setThresholdLoading(true);
      setThresholdMessage("");
      try{
        const response=await fetch("/api/admin/cost-alert-settings",{cache:"no-store"});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||"成本警示設定讀取失敗。");
        if(!cancelled)setAlertThreshold(String(data.monthlyThresholdTwd??500));
      }catch(err){
        if(!cancelled)setThresholdMessage(err instanceof Error?err.message:"成本警示設定讀取失敗。");
      }finally{
        if(!cancelled)setThresholdLoading(false);
      }
    }
    void loadThreshold();
    return ()=>{cancelled=true;};
  },[scopeKey]);

  const activeTotal=classes.reduce((sum,row)=>sum+row.students,0);
  const todayActive=classes.reduce((sum,row)=>sum+row.todayActive,0);
  const participation=activeTotal?Math.round(todayActive/activeTotal*100):null;
  const monthCost=dashboard?Number(dashboard.month.cost)*32.5:0;
  const threshold=Number(alertThreshold);
  const reachedCostAlert=Boolean(dashboard&&threshold>0&&Number.isFinite(threshold)&&monthCost>=threshold);
  const attention = useMemo(()=>{
    if(!insights)return [];
    const items:Array<{key:string;eyebrow:string;heading:string;note:string;tone:"amber"|"rose"|"blue";section:Navigation;focus?:Focus}>=[];
    if(insights.pendingCorrections>0)items.push({
      key:"pending",eyebrow:"教師校正 · 累積待辦",
      heading:`有 ${integer(insights.pendingCorrections)} 題等待教師處理`,
      note:"查看已標記為待校正的題目，不會將尚未核對的答案視為錯誤。",
      tone:"amber",section:"teachingQuestions",
    });
    if(insights.disputedToday>0)items.push({
      key:"disputed",eyebrow:"模型爭議 · 今日",
      heading:`今天有 ${integer(insights.disputedToday)} 題標記為爭議`,
      note:"查看解題記錄及驗算情形，由教師判斷是否需要校正。",
      tone:"rose",section:"siteQuestions",focus:"issue",
    });
    if(insights.repeatedFollowupsToday>0)items.push({
      key:"followups",eyebrow:"連續追問 · 今日",
      heading:`${integer(insights.repeatedFollowupsToday)} 題被學生追問至少 2 次`,
      note:`涉及 ${integer(insights.repeatStudentsToday)} 位學生；追問次數不是答案錯誤的證據。`,
      tone:"blue",section:"siteQuestions",focus:"followup",
    });
    if(reachedCostAlert)items.push({
      key:"cost",eyebrow:"成本提醒 · 本月",
      heading:"本月估算成本已達提醒門檻",
      note:`目前 ${formatCost(dashboard?.month.cost||0)}，提醒門檻 NT$${integer(threshold)}。`,
      tone:"amber",section:"cost",
    });
    return items;
  },[insights,reachedCostAlert,dashboard?.month.cost,threshold,formatCost]);

  async function saveThreshold(){
    const value=Number(alertThreshold);
    if(!Number.isFinite(value)||value<=0||value>3000000){
      setThresholdMessage("提醒門檻必須大於 0，且不超過 NT$3,000,000。");return;
    }
    setThresholdSaving(true);setThresholdMessage("");
    try{
      const response=await fetch("/api/admin/cost-alert-settings",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({monthlyThresholdTwd:value}),
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"儲存成本提醒設定失敗。");
      setAlertThreshold(String(data.monthlyThresholdTwd));
      setThresholdMessage("提醒門檻已更新。");
    }catch(err){setThresholdMessage(err instanceof Error?err.message:"儲存失敗。");}
    finally{setThresholdSaving(false);}
  }
  async function refresh(){
    if(refreshing)return;
    setRefreshing(true);
    try{await onRefresh();setRevision(v=>v+1);}
    finally{setRefreshing(false);}
  }

  if(loading&&!dashboard)return <div className="hh-card admin-state-card">正在整理今日營運資料…</div>;
  if(error&&!dashboard)return <div className="admin-notice danger">{error}</div>;
  if(!dashboard)return <div className="hh-card admin-state-card">目前無法取得營運資料。</div>;

  const visibleClasses=[...classes].sort((a,b)=>b.todayQuestions-a.todayQuestions||a.label.localeCompare(b.label,"zh-TW")).slice(0,4);
  const primary=solverSettings?.primary?.model?modelName(solverSettings.primary.model):"資料載入中";
  const verifier=solverSettings?.mode==="multi"&&solverSettings.verifier?.model?modelName(solverSettings.verifier.model):"未啟用";

  return <div className="admin-stack admin-dashboard-stack v211-dashboard">
    <header className="v211-head hh-card admin-panel">
      <div>
        <div className="hh-eyebrow">INTELLIGENT ACADEMIC OVERVIEW</div>
        <h2 className="hh-display">今天的解題實驗室</h2>
        <p>{displayName? `${displayName} · `:""}{isSuperAdmin?"總管理員":"教師"}的營運工作台。優先看待辦，再深入查看統計。</p>
        <div className="v211-head-tags">
          <span>今日 · 臺灣時間</span>
          <span>{isSuperAdmin?"依目前選取的檢視範圍":"僅包含授權補習班"}</span>
        </div>
      </div>
      <button type="button" className="hh-button-secondary v211-refresh" onClick={()=>void refresh()} disabled={refreshing} aria-label="重新整理營運與關注資料">
        {refreshing?"更新中…":"↻ 重新整理"}
      </button>
    </header>

    <section className="v211-kpis" aria-label="關鍵營運數字">
      <button type="button" className="v211-kpi" onClick={()=>onNavigate("siteQuestions")}>
        <span>今日完成解題</span><strong>{integer(dashboard.today.questions)}</strong><small>題 · 查看題目 →</small>
      </button>
      <button type="button" className="v211-kpi" onClick={()=>onNavigate("usage")}>
        <span>今日使用學生</span><strong>{integer(dashboard.today.students)}</strong>
        <small>{participation===null?"查看班級參與 →":`已記錄班級參與 ${participation}% →`}</small>
      </button>
      <button type="button" className="v211-kpi v211-kpi-attention" onClick={()=>onNavigate("teachingQuestions")}>
        <span>累積待教師校正</span>
        <strong>{insights?pendingLabel(insights.pendingCorrections):"—"}</strong>
        <small>{overviewLoading?"整理中…":insightError?"關注資料讀取失敗":"查看待處理題目 →"}</small>
      </button>
      <button type="button" className="v211-kpi" onClick={()=>onNavigate("cost")}>
        <span>今日估算 API 成本</span><strong className="v211-money">{formatCost(dashboard.today.cost)}</strong>
        <small>平均每題 {formatCost(dashboard.today.averageCost)} →</small>
      </button>
    </section>

    <section className="hh-card admin-panel v211-attention">
      <div className="v211-section-head">
        <div><div className="hh-eyebrow">ACTION CENTER</div><h2 className="hh-display">現在值得關注</h2></div>
        {insights&&<span className="v211-insight-count">{attention.length? `${attention.length} 項提醒`:"目前無待辦提醒"}</span>}
      </div>
      <p className="v211-section-caption">依待校正、模型爭議、連續追問與成本門檻整理；不以追問或模型一致推定答案正確率。</p>
      {overviewLoading?<div className="v211-empty">正在檢查教學與營運訊號…</div>:
      insightError?<div className="admin-notice danger">{insightError} 請稍後重新整理；目前不顯示「全部正常」的結論。</div>:
      attention.length?<div className="v211-attention-grid">{attention.map(item=>
        <button type="button" key={item.key} className={`v211-attention-item ${item.tone}`} onClick={()=>onNavigate(item.section,item.focus)}>
          <span>{item.eyebrow}</span><strong>{item.heading}</strong><small>{item.note}</small><em>前往處理 →</em>
        </button>,
      )}</div>:<div className="v211-clear"><span aria-hidden="true">✓</span><div><strong>目前沒有達到提醒條件的事項</strong><p>尚未發現待校正、今日爭議、連續追問或成本超標；這不等於所有 AI 解答都已經驗證。</p></div></div>}
    </section>

    <div className="v211-secondary-grid">
      <section className="hh-card admin-panel v211-classes">
        <div className="v211-section-head">
          <div><div className="hh-eyebrow">CLASS PULSE</div><h2 className="hh-display">班級活動概況</h2></div>
          <button type="button" className="v211-link" onClick={()=>onNavigate("usage")}>完整分析 →</button>
        </div>
        {overviewLoading?<div className="v211-empty">整理班級資料中…</div>:
        classes.length===0?<div className="v211-empty">{insightError?"班級統計暫時無法載入。":"目前沒有可查看的班級。"}</div>:
        <><div className="v211-class-list">{visibleClasses.map(row=>{
          const rate=row.students?Math.round(row.todayActive/row.students*100):0;
          return <button type="button" className="v211-class-item" key={row.classId} onClick={()=>onNavigate("usage")}>
            <strong title={row.label}>{row.label}</strong>
            <span>{integer(row.todayActive)} / {integer(row.students)} 人今日解題 · {integer(row.todayQuestions)} 題</span>
            <div className="v211-track" aria-label={`今日解題學生比例 ${rate}%`}>
              <span style={{width:`${Math.min(100,Math.max(0,rate))}%`}}/>
            </div>
          </button>;
        })}</div>
        <p className="v211-footnote">顯示今日解題量較多的 4 個班級；完整名單、零使用班級和每班成本請至「使用狀況」查看。</p></>}
      </section>

      <section className="hh-card admin-panel v211-status">
        <div className="v211-section-head"><div><div className="hh-eyebrow">MONTHLY CONTEXT</div><h2 className="hh-display">本月與模型</h2></div></div>
        <div className="v211-month-metrics">
          <div><span>本月完成解題</span><strong>{integer(dashboard.month.questions)} 題</strong></div>
          <div><span>本月估算 API 成本</span><strong>{formatCost(dashboard.month.cost)}</strong></div>
        </div>
        <div className="v211-model-summary">
          <span>目前解題流程</span>
          <strong>{solverSettings?.mode==="single"?"單模型解題":"智慧多模型解題"}</strong>
          <small>Primary · {primary}</small>
          {solverSettings?.mode==="multi"&&<small>Verifier · {verifier}</small>}
          <button type="button" className="v211-link" onClick={()=>onNavigate("ai")}>查看模型配置 →</button>
        </div>
        <details className="v211-alert-config">
          <summary>成本提醒門檻 {reachedCostAlert?"· 已達門檻":""}</summary>
          <p>這是全站共用的月成本提醒設定。教師可以查看，但僅總管理員能修改。</p>
          <div className="v211-alert-controls">
            <label><span>每月提醒金額（NT$）</span>
              <input className="hh-input" type="number" min={1} max={3000000} step={10}
                value={alertThreshold} disabled={!isSuperAdmin||thresholdLoading||thresholdSaving}
                onChange={e=>setAlertThreshold(e.target.value)}/>
            </label>
            <button type="button" className="hh-button-secondary" disabled={!isSuperAdmin||thresholdLoading||thresholdSaving} onClick={()=>void saveThreshold()}>
              {thresholdSaving?"儲存中…":"儲存設定"}
            </button>
          </div>
          {thresholdMessage&&<p role="status" className="v211-config-message">{thresholdMessage}</p>}
        </details>
      </section>
    </div>
    {error&&<div className="admin-notice danger">{error}</div>}
  </div>;
}
