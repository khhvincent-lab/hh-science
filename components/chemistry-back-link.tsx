'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

export default function ChemistryBackLink(){
 const isArticle=usePathname()!=='/chemistry';
 return <Link href={isArticle?'/chemistry':'/'} className="chem-home-link"><span aria-hidden="true">←</span>{isArticle?'文章列表':'解題首頁'}</Link>;
}
