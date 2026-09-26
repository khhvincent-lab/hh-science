'use client';
import {useState} from 'react';
import type {ChemistryArticle} from '@/lib/chemistry-articles';
export default function ChemistryPractice({slug,questions}:{slug:string;questions:ChemistryArticle['questions']}){
 const [answers,setAnswers]=useState<Record<number,number>>({});const [submitted,setSubmitted]=useState(false);
 const complete=questions.every((_,i)=>answers[i]!==undefined);
 return <section className="chem-practice"><h2>素養挑戰</h2><p>先試著作答，再看詳解。練習不扣每日解題額度。</p><form onSubmit={e=>{e.preventDefault();if(complete)setSubmitted(true);}}>{questions.map((q,i)=><fieldset key={`${slug}-${i}`}><legend>{i+1}. {q.prompt}</legend>{q.options.map((o,j)=><label className="chem-option" key={j}><input type="radio" name={`q-${i}`} value={j} checked={answers[i]===j} onChange={()=>{setAnswers({...answers,[i]:j});setSubmitted(false);}}/>{String.fromCharCode(65+j)}. {o}</label>)}{submitted&&<div className="chem-feedback"><strong>{answers[i]===q.answer?'✓ 答對了':'再想一想'} · 答案 {String.fromCharCode(65+q.answer)}</strong><p>{q.explanation}</p></div>}</fieldset>)}<button className="chem-submit" disabled={!complete} type="submit">{complete?'查看成績與詳解':'完成三題後查看詳解'}</button>{submitted&&<p role="status">本次答對 {questions.filter((q,i)=>answers[i]===q.answer).length}／{questions.length} 題。可以修改答案再練習。</p>}</form></section>;
}
