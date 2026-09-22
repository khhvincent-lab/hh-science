"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type InstitutionRow = {id:string; name:string; brand_title?:string|null};
type ClassRow = { id:string; name:string; academic_year?:number; institution_id?:string; institutions?:{name?:string}|null };
type Teacher = { id:string; username:string; display_name:string; role:string; active:boolean; classIds:string[]; institutionIds:string[]; last_login_at?:string|null };
type Brand = { name:string; english_name:string; admin_name:string; primary_color:string };

export default function AdminPlatformSettings({ actor, onBrandChanged }: { actor?:{id:string;role:string}|null; onBrandChanged?:()=>void }) {
  const [teachers,setTeachers]=useState<Teacher[]>([]);
  const [classes,setClasses]=useState<ClassRow[]>([]);
  const [institutions,setInstitutions]=useState<InstitutionRow[]>([]);
  const [brand,setBrand]=useState<Brand>({name:"解題實驗室",english_name:"H.H. Science Lab",admin_name:"教師管理中心",primary_color:"#30463B"});
  const [username,setUsername]=useState(""); const [displayName,setDisplayName]=useState(""); const [password,setPassword]=useState("");
  const [classIds,setClassIds]=useState<string[]>([]); const [institutionIds,setInstitutionIds]=useState<string[]>([]);
  const [role,setRole]=useState("teacher"); const [message,setMessage]=useState(""); const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    const [tr,or,br]=await Promise.all([fetch("/api/admin/teachers",{cache:"no-store"}),fetch("/api/admin/organizations?all=1",{cache:"no-store"}),fetch("/api/admin/brand",{cache:"no-store"})]);
    const [td,od,bd]=await Promise.all([tr.json(),or.json(),br.json()]);
    if(!tr.ok) throw new Error(td.error||"讀取教師帳號失敗。");
    if(!or.ok) throw new Error(od.error||"讀取班級失敗。");
    setTeachers(td.teachers||[]); setClasses(od.classes||[]); setInstitutions(od.institutions||[]); if(bd.brand)setBrand(bd.brand);
  },[]);
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"讀取設定失敗。"));},[load]);
  const teacherRows=useMemo(()=>teachers.filter(t=>t.id!==actor?.id),[teachers,actor?.id]);
  const canCreate=(r:string)=>actor?.role==="super_admin"||actor?.role==="platform_admin"&&["institution_admin","teacher"].includes(r)||actor?.role==="institution_admin"&&r==="teacher";
  const visibleInstitutions=actor?.role==="super_admin"?institutions:institutions.filter(i=>(teachers.find(t=>t.id===actor?.id)?.institutionIds||[]).includes(i.id));
  const availableClasses=classes.filter(c=>institutionIds.includes(c.institution_id||""));
  async function addTeacher(){
    setBusy(true);setError("");setMessage("");
    try{const r=await fetch("/api/admin/teachers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,displayName,password,role,institutionIds:role==="super_admin"?[]:institutionIds,classIds:role==="teacher"?classIds:[]})});const d=await r.json();if(!r.ok)throw new Error(d.error||"建立教師失敗。");setUsername("");setDisplayName("");setPassword("");setClassIds([]);setInstitutionIds([]);setMessage("教師帳號已建立。");await load();}catch(e){setError(e instanceof Error?e.message:"建立教師失敗。");}finally{setBusy(false);}
  }
  async function updateTeacher(id:string,patch:any){
    setError("");setMessage(""); const r=await fetch("/api/admin/teachers",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...patch})});const d=await r.json();if(!r.ok){setError(d.error||"更新教師失敗。");return;}setMessage("教師權限已更新。");await load();
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
    {actor?.role==="super_admin"&&<section className="hh-card admin-panel">
      <div className="admin-panel-heading"><div><div className="hh-eyebrow">BRANDING</div><h2 className="hh-display">品牌設定</h2><p>修改網站顯示品牌；主網址維持原本網址，不會自動更換。</p></div></div>
      <div className="admin-settings-grid">
        <label className="admin-field"><span>品牌名稱</span><input className="hh-input" value={brand.name||""} onChange={e=>setBrand({...brand,name:e.target.value})}/></label>
        <label className="admin-field"><span>英文名稱</span><input className="hh-input" value={brand.english_name||""} onChange={e=>setBrand({...brand,english_name:e.target.value})}/></label>
        <label className="admin-field"><span>管理中心名稱</span><input className="hh-input" value={brand.admin_name||""} onChange={e=>setBrand({...brand,admin_name:e.target.value})}/></label>
        <label className="admin-field"><span>識別色</span><input className="hh-input" type="color" value={brand.primary_color||"#30463B"} onChange={e=>setBrand({...brand,primary_color:e.target.value})}/></label>
      </div><div className="admin-actions"><button className="hh-button-primary" type="button" onClick={()=>void saveBrand()} disabled={busy}>儲存品牌設定</button></div>
    </section>}
    {actor?.role==="super_admin"&&<section className="hh-card admin-panel">
      <div className="admin-panel-heading"><div><div className="hh-eyebrow">INSTITUTION BRANDING</div><h2 className="hh-display">各補習班顯示標題</h2><p>每個補習班可使用獨立名稱。留白時沿用上方全站品牌；不會改變網址或其他補習班資料。</p></div></div>
      <div className="teacher-account-list">{institutions.map(institution=><InstitutionTitleEditor key={institution.id} institution={institution} disabled={busy} onSave={saveInstitutionTitle}/>)}</div>
    </section>}
    <section className="hh-card admin-panel">
      <div className="admin-panel-heading"><div><div className="hh-eyebrow">TEACHER ACCOUNTS</div><h2 className="hh-display">管理員分級與教師帳號</h2><p>總管理員／跨補習班管理員／補習班管理員／教師，依補習班與班級限制資料範圍。</p></div></div>
      <div className="admin-settings-grid">
        <label className="admin-field"><span>帳號角色</span><select className="hh-input" value={role} onChange={e=>{setRole(e.target.value);setClassIds([]);setInstitutionIds([]);}}>{[["super_admin","總管理員"],["platform_admin","跨補習班管理員"],["institution_admin","補習班管理員"],["teacher","教師"]].filter(x=>canCreate(x[0])).map(x=><option value={x[0]} key={x[0]}>{x[1]}</option>)}</select></label>
        <label className="admin-field"><span>登入帳號</span><input className="hh-input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="例如 wang.chem"/></label>
        <label className="admin-field"><span>顯示姓名</span><input className="hh-input" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="例如 王老師"/></label>
        <label className="admin-field"><span>初始密碼</span><input className="hh-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 10 碼"/></label>
      </div>
      {role!=="super_admin"&&<div className="teacher-class-picker"><strong>補習班授權（補習班管理員限一間）</strong><div className="teacher-class-grid">{visibleInstitutions.map(i=><label key={i.id} className="teacher-class-chip"><input type="checkbox" checked={institutionIds.includes(i.id)} onChange={e=>setInstitutionIds(old=>e.target.checked?(role==="institution_admin"?[i.id]:[...old,i.id]):old.filter(x=>x!==i.id))}/><span>{i.name}</span></label>)}</div></div>}
      {role==="teacher"&&<div className="teacher-class-picker"><strong>可管理班級</strong><div className="teacher-class-grid">{availableClasses.map(c=><label key={c.id} className="teacher-class-chip"><input type="checkbox" checked={classIds.includes(c.id)} onChange={e=>setClassIds(e.target.checked?[...classIds,c.id]:classIds.filter(x=>x!==c.id))}/><span>{c.name}</span></label>)}</div></div>}
      <div className="admin-actions"><button className="hh-button-primary" type="button" onClick={()=>void addTeacher()} disabled={busy}>新增帳號</button></div>
      <div className="teacher-account-list">{teacherRows.map(t=><div key={t.id} className="teacher-account-row" style={{display:"grid",gap:10}}><div><strong>{t.display_name}</strong><small>@{t.username} · {{super_admin:"總管理員",platform_admin:"跨補習班管理員",institution_admin:"補習班管理員",teacher:"教師"}[t.role]||t.role} · {t.active?"啟用":"停用"}</small></div>
      {actor?.role==="super_admin"&&<label className="admin-field"><span>角色</span><select className="hh-input" value={t.role} onChange={e=>void updateTeacher(t.id,{role:e.target.value})}>{[["super_admin","總管理員"],["platform_admin","跨補習班管理員"],["institution_admin","補習班管理員"],["teacher","教師"]].map(x=><option value={x[0]} key={x[0]}>{x[1]}</option>)}</select></label>}
      {t.role!=="super_admin"&&<div className="teacher-class-grid compact">{visibleInstitutions.map(i=><label key={i.id} className="teacher-class-chip"><input type="checkbox" checked={(t.institutionIds||[]).includes(i.id)} onChange={e=>{const next=e.target.checked?(t.role==="institution_admin"?[i.id]:[...(t.institutionIds||[]),i.id]):(t.institutionIds||[]).filter(x=>x!==i.id);void updateTeacher(t.id,{institutionIds:next,classIds:(t.classIds||[]).filter(cid=>classes.some(c=>c.id===cid&&next.includes(c.institution_id||"")))});}}/><span>{i.name}</span></label>)}</div>}
      {t.role==="teacher"&&<div className="teacher-class-grid compact">{classes.filter(c=>(t.institutionIds||[]).includes(c.institution_id||"")).map(c=><label key={c.id} className="teacher-class-chip"><input type="checkbox" checked={(t.classIds||[]).includes(c.id)} onChange={e=>{const next=e.target.checked?[...(t.classIds||[]),c.id]:(t.classIds||[]).filter(x=>x!==c.id);void updateTeacher(t.id,{classIds:next});}}/><span>{c.name}</span></label>)}</div>}
      <button type="button" className="admin-ghost-button" onClick={()=>void updateTeacher(t.id,{active:!t.active})}>{t.active?"停用":"啟用"}</button></div>)}</div>
    </section>
  </div>;
}

function InstitutionTitleEditor({institution,disabled,onSave}:{institution:InstitutionRow;disabled:boolean;onSave:(id:string,title:string)=>Promise<void>}) {
  const [title,setTitle]=useState(institution.brand_title||"");
  useEffect(()=>{setTitle(institution.brand_title||"");},[institution.brand_title]);
  return <div className="teacher-account-row"><div><strong>{institution.name}</strong><small>學生端標題</small></div><input className="hh-input" aria-label={`${institution.name} 顯示標題`} value={title} maxLength={80} placeholder="留白 = 全站品牌" onChange={e=>setTitle(e.target.value)}/><button type="button" className="hh-button-secondary" disabled={disabled || title===(institution.brand_title||"")} onClick={()=>void onSave(institution.id,title)}>儲存</button></div>;
}
