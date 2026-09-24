"use client";
import {useCallback,useEffect,useState,type SetStateAction} from 'react';
// URL contains navigation/filter values only, never student result or account data.
export function useUrlState<T extends string|number>(key:string,initial:T,allowed?:readonly T[],push=false){
 const read=useCallback(()=>{const raw=new URL(window.location.href).searchParams.get(key);if(raw===null)return initial;const value=(typeof initial==='number'?Number(raw):raw.slice(0,200)) as T;if(typeof value==='number'&&(!Number.isFinite(value)||value<0||value>100000))return initial;return allowed&&!allowed.includes(value)?initial:value;},[key,initial,JSON.stringify(allowed)]);
 const [value,setValue]=useState<T>(initial);
 useEffect(()=>{const sync=()=>setValue(read());sync();window.addEventListener('popstate',sync);window.addEventListener('admin-url-change',sync);return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('admin-url-change',sync);};},[read]);
 const update=useCallback((action:SetStateAction<T>)=>{
  const next=typeof action==='function'?action(read()):action;const url=new URL(window.location.href);url.searchParams.set(key,String(next));
  window.history[push?'pushState':'replaceState'](null,'',url);setValue(next);window.dispatchEvent(new Event('admin-url-change'));
 },[key,push,read]);
 return [value,update] as const;
}
