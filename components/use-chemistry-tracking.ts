'use client';
import {useEffect,useRef,useState} from 'react';

export function useChemistryTracking(slug:string) {
 const visitId = useRef<string | null>(null);
 const [syncFailed,setSyncFailed] = useState(false);
 function getVisitId() {
  if (!visitId.current) visitId.current = crypto.randomUUID();
  return visitId.current;
 }
 async function send(event:'view'|'complete',answers?:number[]) {
  const response = await fetch('/api/chemistry/events', {
   method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
   body:JSON.stringify({slug,visitId:getVisitId(),event,answers}),
  });
  if (!response.ok) throw new Error('sync failed');
 }
 useEffect(()=>{
  // Effects run only after the article opens; Next.js link prefetches do not count.
  void send('view').catch(()=>{});
  // This hook is mounted inside the practice component keyed by article slug.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[slug]);
 async function complete(answers:number[]) {
  setSyncFailed(false);
  try { await send('complete',answers); } catch { setSyncFailed(true); }
 }
 return {complete,syncFailed};
}
