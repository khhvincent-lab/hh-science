"use client";

type Destination={id:string;title:string;detail:string};
const teachingGroups=[
  {title:"日常校正",description:"平常處理題目與教材",items:[
    {id:"teachingOverview",title:"教學總覽",detail:"查看進度與下一步"},
    {id:"teachingQuestions",title:"教師校正",detail:"AI 答錯一題，在這裡修正"},
    {id:"teachingExamples",title:"解題範例庫",detail:"保存值得重用的解法"},
    {id:"teachingImages",title:"教學圖庫",detail:"提供講義圖與示意圖"},
  ]},
  {title:"AI 教學",description:"設定解題時參考的教法",items:[
    {id:"teachingRuleLibrary",title:"教學規則庫",detail:"訂下特定題型的教法"},
    {id:"teachingCoach",title:"AI 教練",detail:"討論並整理教學偏好"},
  ]},
  {title:"進階設定",description:"較少使用的系統資料",items:[
    {id:"teachingTraining",title:"訓練資料",detail:"檢視與匯出核准資料"},
    {id:"teachingSettings",title:"全站預設",detail:"調整全站共同的解題設定"},
  ]},
];
const workspaces:{key:string;title:string;intro:string;items:Destination[]}[]=[
  {key:"classes",title:"班務管理",intro:"從班級動態到學生名單，日常管理集中處理。",items:[{id:"chemistryAnalytics",title:"專欄成效",detail:"閱讀人數與三題完成率"},{id:"usage",title:"使用狀況",detail:"活躍度與解題分布"},{id:"students",title:"學生管理",detail:"名單、帳號與批次新增"},{id:"classes",title:"班級管理",detail:"組織、開放科目與升班"}]},
  {key:"models",title:"AI 模型中心",intro:"分開掌握解題策略、運作表現與成本。",items:[{id:"ai",title:"模型設定",detail:"模型分工與解題額度"},{id:"comparison",title:"模型比較",detail:"盲測評分與品質比較"},{id:"analytics",title:"運作分析",detail:"使用量、品質與回應"},{id:"cost",title:"成本分析",detail:"模型費用與每日趨勢"}]},
  {key:"teaching",title:"教學引擎",intro:"先處理題目，再把好解法保存為範例或規則。",items:teachingGroups.flatMap(group=>group.items)},
];
export function workspaceFor(section:string){return workspaces.find(group=>group.items.some(item=>item.id===section))?.key||"none";}
export default function WorkspaceNavigation({section,onNavigate}:{section:string;onNavigate:(section:string)=>void}){
  const workspace=workspaces.find(group=>group.items.some(item=>item.id===section));if(!workspace)return null;
  const teaching=workspace.key==="teaching";
  return <section className="workspace-navigation"><div className="workspace-intro"><span className="workspace-marker" aria-hidden="true"/><div><span className="workspace-kicker">{workspace.title}</span><p>{workspace.intro}</p></div></div><label className="workspace-mobile-switch"><span>切換功能</span><select className="hh-select" value={section} onChange={event=>onNavigate(event.target.value)}>{teaching?teachingGroups.map(group=><optgroup key={group.title} label={group.title}>{group.items.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>):workspace.items.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{teaching?<nav aria-label="教學引擎功能" className="workspace-teaching-groups">{teachingGroups.map(group=><div className="workspace-teaching-group" key={group.title}><div className="workspace-group-heading"><strong>{group.title}</strong><span>{group.description}</span></div><div className="workspace-destinations">{group.items.map(item=><button type="button" key={item.id} aria-current={section===item.id?"page":undefined} onClick={()=>onNavigate(item.id)}><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}</div></div>)}</nav>:<nav aria-label={`${workspace.title}分頁`} className="workspace-destinations">{workspace.items.map((item,index)=><button type="button" key={item.id} aria-current={section===item.id?"page":undefined} onClick={()=>onNavigate(item.id)}><span className="workspace-tab-index">{String(index+1).padStart(2,"0")}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className="workspace-tab-arrow" aria-hidden="true">↗</span></button>)}</nav>}</section>;
}
