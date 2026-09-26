'use client';
import {useState} from 'react';
import {useChemistryTracking} from './use-chemistry-tracking';
import type {ChemistryArticle} from '@/lib/chemistry-articles';

export default function ChemistryPractice({slug,questions}:{slug:string;questions:ChemistryArticle['questions']}){
 const tracking=useChemistryTracking(slug);
 const [answers,setAnswers]=useState<Record<number,number>>({});
 const [submitted,setSubmitted]=useState(false);
 const complete=questions.every((_,i)=>answers[i]!==undefined);
 return <section id="practice" className="chem-practice">
  <h2><span>04</span> 素養挑戰</h2>
  <p>每題四選一，依文章與圖表判讀。完成後查看詳解，練習不扣每日解題額度。</p>
  <form onSubmit={e=>{e.preventDefault();if(complete){setSubmitted(true);void tracking.complete(questions.map((_,i)=>answers[i]));}}}>
   {questions.map((q,i)=>{
    const questionId=`${slug}-question-${i}`;
    return <div className="chem-question" key={questionId} role="group" aria-labelledby={questionId}>
     <h3 id={questionId}><span className="chem-question-number">{String(i+1).padStart(2,'0')}</span><span>{q.prompt}</span></h3>
     <div className="chem-options">
      {q.options.map((option,j)=><label className="chem-option" key={j}>
       <input type="radio" name={`${slug}-q-${i}`} value={j} checked={answers[i]===j} onChange={()=>{setAnswers({...answers,[i]:j});setSubmitted(false);}}/>
       <span className="chem-option-letter" aria-hidden="true">{String.fromCharCode(65+j)}</span>
       <span className="chem-option-copy"><span className="chem-sr-only">{String.fromCharCode(65+j)}. </span>{option}</span>
      </label>)}
     </div>
     {submitted&&<div className="chem-feedback" data-correct={answers[i]===q.answer}>
      <strong>{answers[i]===q.answer?'✓ 答對了':'再想一想'} · 答案 {String.fromCharCode(65+q.answer)}</strong><p>{q.explanation}</p>
     </div>}
    </div>;
   })}
   <button className="chem-submit" disabled={!complete} type="submit">{complete?'查看成績與詳解':'完成三題後查看詳解'}</button>
   {submitted&&<p role="status">本次答對 {questions.filter((q,i)=>answers[i]===q.answer).length}／{questions.length} 題。可以修改答案再練習。</p>}
   {submitted&&tracking.syncFailed&&<p>詳解已顯示，作答統計尚未同步。<button type="button" onClick={()=>void tracking.complete(questions.map((_,i)=>answers[i]))}>重試同步</button></p>}
  </form>
 </section>;
}
