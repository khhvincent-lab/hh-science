"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type InstitutionRow = {id:string; name:string; region_id?:string; brand_title?:string|null};
type RegionRow = {id:string; name:string};
type ClassRow = { id:string; name:string; academic_year?:number; institution_id?:string; institutions?:{name?:string}|null };
type Teacher = { id:string; username:string; display_name:string; role:string; active:boolean; classIds:string[]; institutionIds:string[]; last_login_at?:string|null };
type Brand = { name:string; english_name:string; admin_name:string; primary_color:string };

export default function AdminPlatformSettings({ actor, onBrandChanged }: { actor?:{id:string;role:string}|null; onBrandChanged?:()=>void }) {
  const [teachers,setTeachers]=useState<Teacher[]>([]);
  const [classes,setClasses]=useState<ClassRow[]>([]);
  const [institutions,setInstitutions]=useState<InstitutionRow[]>([]);
  const [regions,setRegions]=useState<RegionRow[]>([]);
  const [brand,setBrand]=useState<Brand>({name:"解題實驗室",english_name:"L.H. Science Lab",admin_name:"教師管理中心",primary_color:"#30463B"});
  const [username,setUsername]=useState(""); const [displayName,setDisplayName]=useState(""); const [password,setPassword]=useState("");
  const [institutionIds,setInstitutionIds]=useState<string[]>([]);
  const [role,setRole]=useState("teacher"); const [message,setMessage]=useState(""); const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const accountFeedbackRef=useRef<HTMLDivElement>(null);
  const [accountFeedback,setAccountFeedback]=useState<{kind:"error"|"success";text:string}|null>(null);
  const [accountLoadError,setAccountLoadError]=useState("");
  const load=useCallback(async()=>{
    const [tr,or,br]=await Promise.all([fetch("/api/admin/teachers",{cache:"no-store"}),fetch("/api/admin/organizations?all=1",{cache:"no-store"}),fetch("/api/admin/brand",{cache:"no-store"})]);
    const [td,od,bd]=await Promise.all([tr.json(),or.json(),br.json()]);
    if(!tr.ok) throw new Error(td.error||"讀取教師帳號失敗。");
    if(!or.ok) throw new Error(od.error||"讀取班級失敗。");
    setTeachers(td.teachers||[]); setClasses(od.classes||[]); setInstitutions(od.institutions||[]); setRegions(od.regions||[]); if(bd.brand)setBrand(bd.brand);
  },[]);
  useEffect(()=>{void load().catch(e=>setAccountLoadError(e instanceof Error?e.message:"讀取設定失敗。"));},[load]);
  const teacherRows=useMemo(()=>teachers.filter(t=>t.id!==actor?.id),[teachers,actor?.id]);
  const isOwner=actor?.role==="super_admin";
  const canCreate=(r:string)=>isOwner&&r==="teacher";
  const visibleInstitutions=isOwner?institutions:institutions.filter(i=>(teachers.find(t=>t.id===actor?.id)?.institutionIds||[]).includes(i.id));
  const institutionLabel=(i:InstitutionRow)=>`${regions.find(r=>r.id===i.region_id)?.name||"未分類"}｜${i.name}`;
  function accountStatus(kind:"error"|"success",text:string){
    setAccountFeedback({kind,text});
    // 錯誤就在「新增帳號」旁，無須捲回整個後台頂部尋找訊息。
    requestAnimationFrame(()=>accountFeedbackRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"}));
  }
  async function addTeacher(){
    if(busy)return;
    setError("");setMessage("");setAccountFeedback(null);
    const login=username.trim().toLowerCase(), name=displayName.trim();
    if(!/^[a-z0-9._-]{3,40}$/.test(login))return accountStatus("error","請填寫登入帳號：3～40 碼英文小寫、數字、點、底線或連字號。");
    if(!name||name.length>40)return accountStatus("error","請填寫教師姓名，最多 40 字。");
    if(password.length<10||password.length>128)return accountStatus("error","請設定 10～128 碼初始密碼。");
    if(role!=="super_admin"&&!institutionIds.length)return accountStatus("error","請先勾選至少一間補習班；教師將自動管理該補習班的所有班級。");
    if(!canCreate(role))return accountStatus("error","目前登入的管理員沒有建立此角色的權限。");
    setBusy(true);
    let created=false;
    try{
      const r=await fetch("/api/admin/teachers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:login,displayName:name,password,role,institutionIds:role==="super_admin"?[]:institutionIds}),signal:AbortSignal.timeout(25000)});
      const raw=await r.text();let d:{error?:string;teacher?:Teacher}={};
      try{d=JSON.parse(raw);}catch{if(!r.ok)throw new Error(`伺服器回應 ${r.status}，請查看 Vercel Function Logs。`);}
      if(!r.ok)throw new Error(d.error||`建立帳號失敗（HTTP ${r.status}）。`);
      created=true;
      setUsername("");setDisplayName("");setPassword("");setInstitutionIds([]);
      accountStatus("success",`「${name}」帳號已建立。請用新帳號與初始密碼登入確認。`);
      try{await load();setAccountLoadError("");}catch(refreshError){
        setAccountLoadError(refreshError instanceof Error?refreshError.message:"名單更新失敗。");
        accountStatus("success",`「${name}」帳號已建立，但清單更新失敗；請按「重新整理教師名單」，不要重複建立。`);
      }
    }catch(e){if(!created){
      const text=e instanceof Error?e.message:"建立帳號失敗，請稍後再試。";
      accountStatus("error",e instanceof Error&&e.name==="TimeoutError"?"新增請求逾時，請先重新整理教師名單確認是否已建立，再決定是否重試。":text);
    }}
    finally{setBusy(false);}
  }
  async function updateTeacher(id:string,patch:any){
    setError("");setMessage(""); const r=await fetch("/api/admin/teachers",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...patch})});const d=await r.json();if(!r.ok){setError(d.error||"更新教師失敗。");return;}setMessage("教師權限已更新。");await load();
  }
  async function deleteTeacher(t:Teacher){
    if(!window.confirm(`確定刪除「${t.display_name}」(@${t.username})？\n帳號將無法再登入，但保留歷史解題與校正紀錄。`))return;
    if(window.prompt(`最後確認：請輸入帳號 ${t.username} 才能刪除。`)!==t.username)return;
    setBusy(true);setError("");setMessage("");
    try{const r=await fetch("/api/admin/teachers",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:t.id})});const d=await r.json();if(!r.ok)throw new Error(d.error||"刪除帳號失敗。");setMessage("帳號已刪除，歷史紀錄仍保留。");await load();}
    catch(e){setError(e instanceof Error?e.message:"刪除帳號失敗。");}finally{setBusy(false);}
  }
  async function resetTeacherPassword(t:Teacher){
    const next=window.prompt(`重設「${t.display_name}」密碼：請輸入新密碼（至少 10 碼）。`);
    if(next===null)return;
    if(next.length<10||next.length>128){setError("密碼長度須為 10 至 128 碼。");return;}
    if(!window.confirm(`確定重設 ${t.display_name} 的密碼？舊登入憑證將失效。`))return;
    await updateTeacher(t.id,{password:next});
  }
  async function saveInstitutionTitle(id:string,title:string){
    setBusy(true);setError("");setMessage("");
    try {
      const r=await fetch("/api/admin/organizations",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"update_institution_title",institutionId:id,brandTitle:title})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||"儲存失敗。");
      setMessage("補習班顯示標題已更新，學生下次進入時生效。");await load();
    }catch(e){setError(e instanceof Error?e.message:"儲存失敗。");}finally{setBusy(false);}
  }
  async function saveBrand(){
    setBusy(true);setError("");setMessage("");try{const r=await fetch("/api/admin/brand",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:brand.name,englishName:brand.english_name,adminName:brand.admin_name,primaryColor:brand.primary_color})});const d=await r.json();if(!r.ok)throw new Error(d.error||"儲存品牌失敗。");setMessage("品牌設定已更新；網址不會改變。已安裝的 PWA 名稱/圖示可能需重新加入主畫面才會更新。");onBrandChanged?.();await load();}catch(e){setError(e instanceof Error?e.message:"儲存品牌失敗。");}finally{setBusy(false);}
  }
  return <div className="admin-platform-stack">
    {message&&<div className="admin-notice success">{message}</div>}{error&&<div className="admin-notice danger">{error}</div>}
    {<section className="hh-card admin-panel">
      <div className="admin-panel-heading"><div><div className="hh-eyebrow">BRANDING</div><h2 className="hh-display">品牌設定</h2><p>修改網站顯示品牌；主網址維持原本網址，不會自動更換。</p></div></div>
      {!isOwner&&<div className="admin-notice">僅總管理員可調整品牌；以下顯示目前設定。</div>}
      <fieldset disabled={!isOwner} className="admin-readonly-fieldset"><div className="admin-settings-grid">
        <label className="admin-field"><span>品牌名稱</span><input className="hh-input" value={brand.name||""} onChange={e=>setBrand({...brand,name:e.target.value})}/></label>
        <label className="admin-field"><span>英文名稱</span><input className="hh-input" value={brand.english_name||""} onChange={e=>setBrand({...brand,english_name:e.target.value})}/></label>
        <label className="admin-field"><span>管理中心名稱</span><input className="hh-input" value={brand.admin_name||""} onChange={e=>setBrand({...brand,admin_name:e.target.value})}/></label>
        <label className="admin-field"><span>識別色</span><input className="hh-input" type="color" value={brand.primary_color||"#30463B"} onChange={e=>setBrand({...brand,primary_color:e.target.value})}/></label>
      </div><div className="admin-actions"><button className="hh-button-primary" type="button" onClick={()=>void saveBrand()} disabled={busy||!isOwner}>儲存品牌設定</button></div></fieldset>
    </section>}
    {<section className="hh-card admin-panel">
      <div className="admin-panel-heading"><div><div className="hh-eyebrow">INSTITUTION BRANDING</div><h2 className="hh-display">各補習班顯示標題</h2><p>每個補習班可使用獨立名稱。留白時沿用上方全站品牌；不會改變網址或其他補習班資料。</p></div></div>
      <div className="teacher-account-list">{institutions.map(institution=><InstitutionTitleEditor key={institution.id} institution={{...institution,name:institutionLabel(institution)}} disabled={busy||!isOwner} onSave={saveInstitutionTitle}/>)}</div>
    </section>}
    <section className="hh-card admin-panel">
      <div className="admin-panel-heading"><div><div className="hh-eyebrow">TEACHER ACCOUNTS</div><h2 className="hh-display">管理員分級與教師帳號</h2><p>僅保留總管理員與教師兩種身分；由總管理員勾選補習班，教師自動管理授權補習班的全部班級與學生。</p></div></div>
      {accountLoadError&&<div className="admin-notice danger" role="alert">教師名單或補習班讀取異常：{accountLoadError} <button type="button" className="admin-ghost-button" onClick={()=>void load().then(()=>setAccountLoadError("")).catch(e=>setAccountLoadError(e instanceof Error?e.message:"重新讀取失敗"))}>重新整理教師名單</button></div>}
      {!isOwner&&<div className="admin-notice">教師帳號與授權由總管理員統一管理；此處為唯讀。</div>}
      <fieldset disabled={!isOwner} className="admin-readonly-fieldset"><div className="admin-settings-grid">
        <label className="admin-field"><span>帳號角色</span><select className="hh-input" value="teacher" disabled><option value="teacher">教師</option></select></label>
        <label className="admin-field"><span>登入帳號</span><input className="hh-input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="例如 wang.chem"/></label>
        <label className="admin-field"><span>顯示姓名</span><input className="hh-input" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="例如 王老師"/></label>
        <label className="admin-field"><span>初始密碼</span><input className="hh-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 10 碼"/></label>
      </div>
      {<div className="teacher-class-picker"><strong>補習班授權（可勾選多間）</strong><div className="teacher-class-grid">{visibleInstitutions.map(i=><label key={i.id} className="teacher-class-chip"><input type="checkbox" checked={institutionIds.includes(i.id)} onChange={e=>setInstitutionIds(old=>e.target.checked?[...old,i.id]:old.filter(x=>x!==i.id))}/><span>{institutionLabel(i)}</span></label>)}</div></div>}
      {role==="teacher"&&<p className="v2-scope-tip">教師自動管理所選補習班的全部班級，包含未來新增的班級。</p>}
      <div className="admin-actions"><button className="hh-button-primary" type="button" onClick={()=>void addTeacher()} disabled={busy||!isOwner}>{busy?"正在建立帳號…":"新增教師帳號"}</button></div></fieldset>
      <div ref={accountFeedbackRef} aria-live="polite" aria-atomic="true">{accountFeedback&&<div role={accountFeedback.kind==="error"?"alert":"status"} className={`admin-notice ${accountFeedback.kind==="error"?"danger":"success"}`}>{accountFeedback.text}</div>}</div>
      <div className="teacher-account-list">{!isOwner&&<p>已授權補習班：{visibleInstitutions.map(institutionLabel).join("、")||"尚未授權"}</p>}{teacherRows.map(t=><div key={t.id} className="teacher-account-row" style={{display:"grid",gap:10}}><div><strong>{t.display_name}</strong><small>@{t.username} · {t.role==="super_admin"?"總管理員":"教師"} · {t.active?"啟用":"停用"}</small></div>
      {t.role!=="super_admin"&&<div className="teacher-class-grid compact">{visibleInstitutions.map(i=><label key={i.id} className="teacher-class-chip"><input type="checkbox" checked={(t.institutionIds||[]).includes(i.id)} disabled={!isOwner} onChange={e=>{const next=e.target.checked?[...(t.institutionIds||[]),i.id]:(t.institutionIds||[]).filter(x=>x!==i.id);void updateTeacher(t.id,{institutionIds:next});}}/><span>{institutionLabel(i)}</span></label>)}</div>}
      {t.role==="teacher"&&<small>已授權補習班的所有班級</small>}
      <div className="v2-account-actions"><button type="button" disabled={!isOwner} className="admin-ghost-button" onClick={()=>void resetTeacherPassword(t)}>重設密碼</button><button type="button" disabled={!isOwner} className="admin-ghost-button" onClick={()=>void updateTeacher(t.id,{active:!t.active})}>{t.active?"停用":"啟用"}</button><button type="button" className="v2-danger-button" disabled={busy||!isOwner} onClick={()=>void deleteTeacher(t)}>刪除帳號</button></div></div>)}</div>
    </section>
  </div>;
}

function InstitutionTitleEditor({institution,disabled,onSave}:{institution:InstitutionRow;disabled:boolean;onSave:(id:string,title:string)=>Promise<void>}) {
  const [title,setTitle]=useState(institution.brand_title||"");
  useEffect(()=>{setTitle(institution.brand_title||"");},[institution.brand_title]);
  return <div className="teacher-account-row"><div><strong>{institution.name}</strong><small>學生端標題</small></div><input className="hh-input" aria-label={`${institution.name} 顯示標題`} value={title} disabled={disabled} maxLength={80} placeholder="留白 = 全站品牌" onChange={e=>setTitle(e.target.value)}/><button type="button" className="hh-button-secondary" disabled={disabled || title===(institution.brand_title||"")} onClick={()=>void onSave(institution.id,title)}>儲存</button></div>;
}
