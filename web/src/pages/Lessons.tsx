import { useEffect, useState } from 'react';
import { LuClock3, LuFilter, LuGraduationCap, LuSearch } from 'react-icons/lu';

import { getPublicLessons, type Lesson } from '../api/lessons';
import { ApiError } from '../api/client';
import { ErrorNote, Spinner } from '../components/ui';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';

const selectClass = 'rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]';

export function Lessons() {
  useSeo({
    title: 'Уроки сербского языка от преподавателей — бесплатно',
    description:
      'Бесплатные уроки сербского языка от преподавателей: лексика, грамматика, говорение и письмо с упражнениями. Уровни от A1 до C2, латиница и кириллица.',
  });
  const [filters, setFilters] = useState({ level:'', type:'', script:'' });
  const [items, setItems] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    getPublicLessons(filters).then(setItems).catch((caught)=>setError(messageOf(caught))).finally(()=>setLoading(false));
  }, [filters]);

  return <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
    <header className="max-w-3xl"><p className="text-sm font-bold uppercase text-[var(--accent)]">Уроки сообщества</p><h1 className="mt-2 text-3xl sm:text-4xl">Сербский от преподавателей</h1><p className="mt-4 leading-7 text-[var(--text-muted)]">Бесплатные отдельные уроки, проверенные администрацией Читавука.</p></header>
    <section className="mt-8 flex flex-wrap items-center gap-3 border-y border-[var(--line)] py-4" aria-label="Фильтры"><LuFilter className="text-[var(--accent)]"/><select className={selectClass} value={filters.level} onChange={(e)=>setFilters({...filters,level:e.target.value})}><option value="">Все уровни</option>{['A1','A2','B1','B2','C1','C2'].map((x)=><option key={x}>{x}</option>)}</select><select className={selectClass} value={filters.type} onChange={(e)=>setFilters({...filters,type:e.target.value})}><option value="">Все направления</option><option value="lexicon">Лексика</option><option value="grammar">Грамматика</option><option value="speaking">Говорение</option><option value="writing">Письмо</option></select><select className={selectClass} value={filters.script} onChange={(e)=>setFilters({...filters,script:e.target.value})}><option value="">Обе письменности</option><option value="latin">Латиница</option><option value="cyrillic">Кириллица</option></select></section>
    {error&&<div className="mt-6"><ErrorNote>{error}</ErrorNote></div>}
    {loading?<div className="grid min-h-72 place-items-center"><Spinner className="size-6"/></div>:error?null:items.length===0?<div className="py-20 text-center"><LuSearch className="mx-auto size-9 text-[var(--text-muted)]"/><h2 className="mt-4 text-xl">Уроков с такими фильтрами пока нет</h2></div>:<div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((lesson)=><LessonTile key={lesson.id} lesson={lesson}/>)}</div>}
  </main>;
}

function LessonTile({lesson}:{lesson:Lesson}){return <Link to={`/lessons/${lesson.slug}`} className="group min-w-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] transition-colors hover:border-[var(--accent)]">{lesson.coverUrl&&<div className="aspect-[16/9] overflow-hidden bg-[var(--bg-sunken)]"><img src={lesson.coverUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" loading="lazy"/></div>}<div className="p-5"><div className="flex items-center justify-between gap-3"><span className="rounded-md bg-[var(--accent)]/10 px-2 py-1 text-xs font-bold text-[var(--accent)]">{lesson.level}</span><span className="text-xs text-[var(--text-muted)]">{label(lesson.lessonType)}</span></div><h2 className="mt-4 line-clamp-3 break-words text-xl group-hover:text-[var(--accent)]">{lesson.title}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-muted)]">{lesson.summary}</p><div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--text-muted)]"><span className="inline-flex items-center gap-1"><LuClock3/>{lesson.estimatedMinutes} мин</span><span className="inline-flex min-w-0 items-center gap-1"><LuGraduationCap className="shrink-0"/><span className="truncate">{lesson.authorName}</span></span></div></div></Link>}
function label(type:Lesson['lessonType']){return ({lexicon:'Лексика',grammar:'Грамматика',speaking:'Говорение',writing:'Письмо'} as const)[type]}
function messageOf(error:unknown){return error instanceof ApiError||error instanceof Error?error.message:'Неизвестная ошибка.'}
