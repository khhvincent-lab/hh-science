import Link from 'next/link';
import './reading.css';
export default function ReadingLayout({children}:{children:React.ReactNode}) {
  return <main className="chem-reading"><nav aria-label="專欄導覽"><Link href="/">← 解題實驗室</Link><Link href="/chemistry">每週化學</Link></nav>{children}<footer>從生活讀懂化學，練習用證據思考。</footer></main>;
}
