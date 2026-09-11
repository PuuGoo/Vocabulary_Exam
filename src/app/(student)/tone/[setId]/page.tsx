"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import StudyModeNav from "@/components/StudyModeNav";
import { cx } from "@/components/ui";
import { getAvailableModes, getWordDisplayForms } from "@/lib/languages";
import { buildToneExercise, gradeToneSelection } from "@/lib/toneTrainer";

type Word = { id:number; term?:string|null; alternateTerm?:string|null; pronunciation?:string|null; meaning:string };
type SetDetail = { id:number; name:string; type:string; languageCode?:string|null; languageSettings?:unknown; words:Word[] };

export default function ToneTrainerPage() {
  const { setId } = useParams<{setId:string}>();
  const [set,setSet]=useState<SetDetail|null>(null); const [index,setIndex]=useState(0);
  const [selected,setSelected]=useState<number[]>([]); const [checked,setChecked]=useState(false); const [error,setError]=useState(false);
  const [outcomes,setOutcomes]=useState<Record<number,boolean>>({});
  const runId=useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  useEffect(()=>{let active=true; fetch(`/api/sets/${setId}`).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(active)setSet(data.set);}).catch(()=>active&&setError(true));return()=>{active=false;};},[setId]);
  const words=useMemo(()=>set?.languageCode==="zh-CN"?set.words.filter(word=>buildToneExercise(word.pronunciation).eligible):[],[set]);
  const word=words[index]; const exercise=word?buildToneExercise(word.pronunciation):null;
  const grade=checked&&word?gradeToneSelection(word.pronunciation||"",selected):null;
  function choose(syllableIndex:number,tone:number){if(checked)return;setSelected(current=>{const next=[...current];next[syllableIndex]=tone;return next;});}
  async function check(){if(!word||!exercise?.eligible||selected.some(value=>value===undefined)||selected.length!==exercise.syllables.length)return;setChecked(true);const result=gradeToneSelection(word.pronunciation||"",selected);setOutcomes(current=>({...current,[word.id]:result.correct}));void fetch("/api/learning/mastery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wordId:word.id,skill:"tone_accuracy",result:result.correct?"correct":"incorrect",sourceMode:"tone",eventKey:`tone-${runId.current}-${word.id}-${index}`})});}
  function next(){if(index===words.length-1&&set){const final={...outcomes,...(word&&grade?{[word.id]:grade.correct}:{})};void fetch("/api/results",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({setId:set.id,setName:set.name,mode:"tone",score:Object.values(final).filter(Boolean).length,total:words.length,wrongWordIds:words.filter(item=>final[item.id]===false).map(item=>item.id),practicedWordIds:words.map(item=>item.id),wordsPracticed:words.length})});}setIndex(value=>value+1);setSelected([]);setChecked(false);}
  if(error)return <div className={cx.empty}>Không thể tải bài luyện thanh điệu.</div>;
  if(!set)return <div className={cx.empty}>Đang tải…</div>;
  if(set.languageCode!=="zh-CN")return <div className={cx.empty}>Thanh điệu chỉ dành cho bộ Tiếng Trung.</div>;
  if(!words.length)return <div className={cx.panel}><StudyModeNav setId={set.id} active="tone" languageCode={set.languageCode}/><div className={cx.empty}>Bộ này chưa có Pinyin đủ thông tin thanh điệu để luyện.</div></div>;
  if(!word||!exercise?.eligible)return <section className={`${cx.panel} text-center`}><h1 className="text-2xl font-extrabold">Hoàn thành luyện thanh điệu</h1><p className="mt-2 text-muted">Đã luyện {words.length} từ.</p></section>;
  const display=getWordDisplayForms(word,set);
  return <main className="mx-auto max-w-3xl"><StudyModeNav setId={set.id} active="tone" languageCode={set.languageCode} availableModes={getAvailableModes(set)}/><section className={`${cx.panel} text-center`}>
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Thanh điệu · {index+1}/{words.length}</p><h1 className="mt-3 font-serif text-5xl font-bold">{display.primary}</h1><p className="mt-2 text-lg text-muted">{word.meaning}</p>
    <div className="mt-7 grid gap-4">{exercise.syllables.map((syllable,syllableIndex)=><fieldset key={`${syllable.base}-${syllableIndex}`} className="rounded-2xl border border-line p-4"><legend className="px-2 text-lg font-bold">{syllable.base}</legend><div className="grid grid-cols-5 gap-2">{[1,2,3,4,0].map(tone=><button key={tone} type="button" aria-label={tone?`Thanh ${tone}`:"Thanh nhẹ"} aria-pressed={selected[syllableIndex]===tone} onClick={()=>choose(syllableIndex,tone)} className={`min-h-12 rounded-xl border font-bold ${selected[syllableIndex]===tone?"border-gold bg-goldpale text-golddark":"border-line bg-white"}`}>{tone||"Nhẹ"}</button>)}</div></fieldset>)}</div>
    {grade&&<div className={`mt-5 rounded-xl p-4 ${grade.correct?"bg-okbg text-ok":"bg-badbg text-bad"}`}><b>{grade.correct?"✓ Chính xác":`Chưa đúng · ${grade.correctCount}/${grade.total} thanh đúng`}</b><div className="mt-1 text-ink">Pinyin chuẩn: <strong>{exercise.canonical}</strong></div><div className="mt-1 text-sm text-muted">Đáp án thanh: {exercise.syllables.map(item=>item.tone||"nhẹ").join(" + ")}</div></div>}
    <div className="mt-6 flex justify-center gap-2">{!checked?<button type="button" className={`${cx.btn} ${cx.btnGold}`} onClick={check}>Kiểm tra</button>:<button type="button" className={`${cx.btn} ${cx.btnGold}`} onClick={next}>{index===words.length-1?"Xem kết quả":"Tiếp theo"}</button>}</div>
  </section></main>;
}
