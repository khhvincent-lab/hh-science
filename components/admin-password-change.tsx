"use client";
import { useState } from "react";
export default function AdminPasswordChange(){
 const [expanded,setExpanded]=useState(false),[current,setCurrent]=useState(""),[next,setNext]=useState(""),[confirm,setConfirm]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 async function submit(){
  if(next!==confirm){setStatus("兩次新密碼不一致。");return;}
  setBusy(true);setStatus("");
  try { const r=await fetch("/api/admin/change-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword:current,newPassword:next})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"更新失敗");setStatus("已修改，請重新登入。");setCurrent("");setNext("");setConfirm("");window.location.reload();
  }catch(e){setStatus(e instanceof Error?e.message:"更新失敗");}finally{setBusy(false);}
 }
 return <div style={{padding:"12px 0"}}><button type="button" className="admin-sidebar-link" onClick={()=>setExpanded(!expanded)}>🔐 修改我的密碼</button>
 {expanded&&<div style={{display:"grid",gap:8,paddingTop:12}}>
 <input className="hh-input" aria-label="目前密碼" type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)} placeholder="目前密碼"/>
 <input className="hh-input" aria-label="新密碼" type="password" autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)} placeholder="新密碼（至少 10 碼）"/>
 <input className="hh-input" aria-label="確認新密碼" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="再次輸入新密碼"/>
 <button type="button" className="hh-button-primary" disabled={busy||!current||!next||!confirm} onClick={()=>void submit()}>儲存新密碼</button>{status&&<small role="status">{status}</small>}
 </div>}</div>;
}
