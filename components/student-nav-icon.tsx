type Props = {kind:'home'|'analysis'|'history'};
export default function StudentNavIcon({kind}:Props){
 return <svg className="student-nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{kind==='home'?<><path d="m3 10 9-7 9 7"/><path d="M5 9v11h5v-6h4v6h5V9"/></>:kind==='analysis'?<><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h4m-4 4 2 2 5-5"/></>:<><path d="M3 11a9 9 0 1 1 2.5 7M3 5v6h6"/><path d="M12 7v5l3 2"/></>}</svg>;
}
