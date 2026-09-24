"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { captureSolutionImage } from "@/lib/solution-image-export";

export default function SolutionImageDownload({children,title}:{children:ReactNode;title:string}) {
  const card=useRef<HTMLDivElement>(null);
  const pending=useRef<Promise<File>|null>(null);
  const [prepared,setPrepared]=useState<File|null>(null);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const build=useCallback(async()=>{
    const root=card.current;
    if(!root)throw new Error("解析內容尚未準備完成。");
    return captureSolutionImage(root,`解題紀錄-${title.replace(/[\\/:*?"<>|]/g,"")}.png`);
  },[title]);
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(()=>{const job=pending.current||build();pending.current=job;void job.then(file=>{if(active)setPrepared(file);}).catch(()=>{}).finally(()=>{if(pending.current===job)pending.current=null;});},300);
    return()=>{active=false;clearTimeout(timer);};
  },[build]);
  async function save(){
    if(saving)return;setSaving(true);setMessage("");
    try {
      if(!prepared&&!pending.current)pending.current=build();
      const file=prepared||await pending.current!;setPrepared(file);
      if(navigator.share&&navigator.canShare?.({files:[file]})){
        try{await navigator.share({title:"解題紀錄",files:[file]});setMessage("已開啟分享選單，可選擇儲存影像。");return;}
        catch(error){if(error instanceof DOMException&&error.name==="AbortError")return;}
      }
      const url=URL.createObjectURL(file),link=document.createElement("a");link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage("圖片已產生；可從下載項目開啟並儲存。");
    }catch(error){setMessage(error instanceof Error?error.message:"儲存圖片失敗。");}finally{pending.current=null;setSaving(false);}
  }
  return <><div style={{display:"grid",gap:8,margin:"16px 0"}}><button type="button" className="hh-button-primary" disabled={saving} onClick={()=>void save()}>{saving?"正在產生解析圖片…":"儲存成圖片"}</button>{message&&<p role="status" style={{margin:0,fontSize:13}}>{message}</p>}</div><div aria-hidden="true" style={{position:"fixed",left:-12000,top:0,width:820,pointerEvents:"none",zIndex:-1000}}><div ref={card} className="history-export-paper" >{children}</div></div></>;
}
