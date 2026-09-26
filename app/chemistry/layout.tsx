import Link from 'next/link';
import './reading.css';
export default function ReadingLayout({children}:{children:React.ReactNode}) {
  return <div className="chem-shell"><header className="chem-topbar"><nav aria-label="專欄導覽"><Link href="/" className="chem-home-link"><span aria-hidden="true">←</span> 解題實驗室</Link><Link href="/chemistry" className="chem-brand">每週化學<span>CHEMISTRY WEEKLY</span></Link></nav></header><main className="chem-reading">{children}<footer>從生活讀懂化學，練習用證據思考。</footer></main></div>;
}
