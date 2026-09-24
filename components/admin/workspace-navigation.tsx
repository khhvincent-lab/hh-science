"use client";

type Destination={id:string;title:string;detail:string};
const workspaces:{key:string;title:string;intro:string;items:Destination[]}[]=[
  {key:"classes",title:"班務管理",intro:"從班級動態到學生名單，日常管理集中處理。",items:[{id:"usage",title:"使用狀況",detail:"活躍度與解題分布"},{id:"students",title:"學生管理",detail:"名單、帳號與批次新增"},{id:"classes",title:"班級管理",detail:"組織、開放科目與升班"}]},
  {key:"models",title:"AI 模型中心",intro:"分開掌握解題策略、運作表現與成本。",items:[{id:"ai",title:"模型設定",detail:"模型分工與解題額度"},{id:"analytics",title:"運作分析",detail:"使用量、品質與回應"},{id:"cost",title:"成本分析",detail:"模型費用與每日趨勢"}]},
  {key:"teaching",title:"教學引擎",intro:"從一題的校正，累積可重用的教學方法。",items:[{id:"teachingOverview",title:"教學總覽",detail:"知識累積與下一步"},{id:"teachingQuestions",title:"教師校正",detail:"檢視題目與改善解法"},{id:"teachingExamples",title:"範例庫",detail:"教師核准的解題案例"},{id:"teachingRuleLibrary",title:"規則庫",detail:"跨題重用的教學原則"},{id:"teachingCoach",title:"AI 教練",detail:"對話整理教學偏好"},{id:"teachingImages",title:"教學圖庫",detail:"講義圖片與科學圖模板"},{id:"teachingTraining",title:"訓練資料",detail:"整理與匯出教師知識"},{id:"teachingSettings",title:"全站預設",detail:"統一解題呈現方式"}]},
];
export function workspaceFor(section:string){return workspaces.find(group=>group.items.some(item=>item.id===section))?.key||"none";}
export default function WorkspaceNavigation({section,onNavigate}:{section:string;onNavigate:(section:string)=>void}){
  const workspace=workspaces.find(group=>group.items.some(item=>item.id===section));if(!workspace)return null;
  return <section className="workspace-navigation"><div className="workspace-intro"><span className="workspace-marker" aria-hidden="true"/><div><span className="workspace-kicker">{workspace.title}</span><p>{workspace.intro}</p></div></div><label className="workspace-mobile-switch"><span>切換分頁</span><select className="hh-select" value={section} onChange={event=>onNavigate(event.target.value)}>{workspace.items.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><nav aria-label={`${workspace.title}分頁`} className={`workspace-destinations ${workspace.key==="teaching"?"many":""}`}>{workspace.items.map((item,index)=><button type="button" key={item.id} aria-current={section===item.id?"page":undefined} onClick={()=>onNavigate(item.id)}><span className="workspace-tab-index">{String(index+1).padStart(2,"0")}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className="workspace-tab-arrow" aria-hidden="true">↗</span></button>)}</nav></section>;
}
