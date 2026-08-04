import { useEffect, useState, type FormEvent } from 'react';
import { LuBookOpen, LuClock3, LuFilePlus2, LuSend } from 'react-icons/lu';

import {
  getTeacherApplication,
  getTeacherLessons,
  getTeacherSubmissions,
  getTeacherProfile,
  reviewTeacherSubmission,
  updateTeacherProfile,
  submitTeacherApplication,
  type Lesson,
  type TeacherApplication,
  type LessonSubmission,
  type TeacherProfile,
} from '../api/lessons';
import { ApiError } from '../api/client';
import { Button, ErrorNote, Spinner } from '../components/ui';
import { Link, useRouter } from '../lib/router';
import { useAuth } from '../state/auth';

const inputClass = 'w-full rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2.5 outline-none transition-colors focus:border-[var(--accent)]';

export function Teachers() {
  const { account, loading: authLoading } = useAuth();
  const { navigate } = useRouter();
  const [application, setApplication] = useState<TeacherApplication | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !account) navigate('/login');
  }, [account, authLoading, navigate]);

  useEffect(() => {
    if (!account) return;
    getTeacherApplication()
      .then(async (result) => {
        setApplication(result);
        if (result.status === 'approved') setLessons(await getTeacherLessons());
      })
      .catch((caught: unknown) => setError(messageOf(caught)));
  }, [account]);

  if (authLoading || (account && !application && !error)) return <PageLoader />;
  if (!account) return null;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-bold uppercase text-[var(--accent)]">Для преподавателей</p>
        <h1 className="mt-2 text-3xl sm:text-4xl">Создавайте уроки сербского</h1>
        <p className="mt-4 leading-7 text-[var(--text-muted)]">
          Теория, упражнения и ветвящиеся диалоги в одном уроке. Сейчас публикация
          бесплатна: публичные материалы проходят модерацию, урок по ссылке доступен сразу.
        </p>
      </header>

      {error && <div className="mt-7"><ErrorNote>{error}</ErrorNote></div>}
      {application?.status === 'approved' ? (
        <TeacherWorkspace lessons={lessons} />
      ) : (
        <ApplicationPanel application={application ?? { status: 'none' }} onSaved={setApplication} />
      )}
    </main>
  );
}

function ApplicationPanel({ application, onSaved }: { application: TeacherApplication; onSaved: (value: TeacherApplication) => void }) {
  const [serbianLevel, setSerbianLevel] = useState(application.serbianLevel ?? 'B2');
  const [nativeSpeaker, setNativeSpeaker] = useState(application.nativeSpeaker ?? false);
  const [russianLevel, setRussianLevel] = useState(application.russianLevel ?? '');
  const [certificates, setCertificates] = useState(application.certificates ?? '');
  const [experience, setExperience] = useState(application.teachingExperience ?? '');
  const [social, setSocial] = useState(application.socialLinks?.[0]?.url ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (application.status === 'pending') {
    return <StatusBand icon={<LuClock3 />} title="Заявка на рассмотрении" body="Администратор проверит опыт и ссылки. Решение появится здесь и придёт на почту." />;
  }

  const rejected = application.status === 'rejected' || application.status === 'suspended';
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      onSaved(await submitTeacherApplication({
        serbianLevel, nativeSpeaker, russianLevel, certificates,
        teachingExperience: experience,
        socialLinks: social ? [{ url: social }] : [], monetizationIntent: 'free',
      }));
    } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  };

  return (
    <section className="mt-10 max-w-3xl border-t border-[var(--line)] pt-8">
      <div className="mb-8 space-y-4 text-[var(--text-muted)]">
        <p className="leading-7">
          Привет! Автор сайта не является опытным преподавателем сербского, и, более того, он сам активно изучает сербский.
        </p>
        <p className="leading-7">
          Если вы являетесь учителем сербского или считаете, что хорошо знаете язык, то вы можете создать собственные уроки
          сербского и/или диалоги, а затем объединить их в пользовательский курс, который будет доступен всем или будет доступен
          платно, если вы считаете, что каждый труд должен быть оплачен. Также автор каждого курса будет вправе бесплатно
          рекламировать свои репетиторские услуги, онлайн-курсы, школы сербского языка и т. д. и т. п. при условии, что вы
          расскажете о Читавуке своим ученикам.
        </p>
      </div>
      {rejected && (
        <div className="mb-7 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
          <p className="font-semibold">Заявку можно исправить и отправить повторно</p>
          {application.adminComment && <p className="mt-2 text-sm text-[var(--text-muted)]">Комментарий: {application.adminComment}</p>}
        </div>
      )}
      <h2 className="text-2xl">Заявка преподавателя</h2>
      <form onSubmit={submit} className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">Уровень сербского
          <select className={inputClass} value={serbianLevel} onChange={(e) => setSerbianLevel(e.target.value)}>
            {['A1','A2','B1','B2','C1','C2'].map((level) => <option key={level}>{level}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-3 self-end rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm font-semibold">
          <input type="checkbox" checked={nativeSpeaker} onChange={(e) => setNativeSpeaker(e.target.checked)} /> Носитель сербского
        </label>
        {!nativeSpeaker && <label className="grid gap-2 text-sm font-semibold">Уровень русского
          <input required className={inputClass} value={russianLevel} onChange={(e) => setRussianLevel(e.target.value)} placeholder="Например, C1" />
        </label>}
        <label className="grid gap-2 text-sm font-semibold">Профессиональная ссылка
          <input className={inputClass} type="url" value={social} onChange={(e) => setSocial(e.target.value)} placeholder="Сайт, профиль или портфолио" />
        </label>
        <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Опыт преподавания
          <textarea required rows={5} className={inputClass} value={experience} onChange={(e) => setExperience(e.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Сертификаты и образование
          <textarea rows={3} className={inputClass} value={certificates} onChange={(e) => setCertificates(e.target.value)} />
        </label>
        {error && <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>}
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}><LuSend /> {busy ? 'Отправляем…' : 'Отправить заявку'}</Button></div>
      </form>
    </section>
  );
}

function TeacherWorkspace({ lessons }: { lessons: Lesson[] }) {
  const [submissions, setSubmissions] = useState<LessonSubmission[]>([]);
  const [feedback, setFeedback] = useState<Record<string,string>>({});
  useEffect(()=>{getTeacherSubmissions().then(setSubmissions).catch(()=>{})},[]);
  const review=async(item:LessonSubmission)=>{await reviewTeacherSubmission(item.id,'reviewed',feedback[item.id]??'');setSubmissions((old)=>old.filter((x)=>x.id!==item.id))};
  return (
    <><ProfileEditor/><section className="mt-10 border-t border-[var(--line)] pt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-2xl">Мои уроки</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{lessons.length || 'Пока ни одного'}</p></div>
        <Link to="/teachers/lessons/new" className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 font-semibold text-white"><LuFilePlus2 /> Новый урок</Link>
      </div>
      {lessons.length === 0 ? (
        <div className="mt-12 max-w-xl text-center"><LuBookOpen className="mx-auto size-10 text-[var(--accent)]" /><h3 className="mt-4 text-xl">Начните с небольшого урока</h3><p className="mt-2 text-[var(--text-muted)]">Одна тема, несколько примеров и короткая практика.</p></div>
      ) : (
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lessons.map((lesson) => <Link key={lesson.id} to={`/teachers/lessons/${lesson.id}`} className="min-w-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] transition-colors hover:border-[var(--accent)]">{lesson.coverUrl&&<div className="aspect-[16/8] overflow-hidden bg-[var(--bg-sunken)]"><img src={lesson.coverUrl} alt="" className="size-full object-cover" loading="lazy"/></div>}<div className="p-5"><div className="flex justify-between gap-3"><span className="text-xs font-bold uppercase text-[var(--accent)]">{lesson.level} · {typeLabel(lesson.lessonType)}</span><span className="text-xs text-[var(--text-muted)]">{statusLabel(lesson)}</span></div><h3 className="mt-3 line-clamp-2 break-words text-lg">{lesson.title}</h3><p className="mt-2 line-clamp-2 text-sm text-[var(--text-muted)]">{lesson.summary}</p></div></Link>)}
        </div>
      )}
    </section>{submissions.length>0&&<section className="mt-10 border-t border-[var(--line)] pt-8"><h2 className="text-2xl">Письменные работы</h2><div className="mt-5 space-y-4">{submissions.map((item)=><div key={item.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] p-5"><div className="flex flex-wrap justify-between gap-3"><h3 className="text-lg">{item.lessonTitle}</h3><span className="text-sm text-[var(--text-muted)]">{item.studentName}</span></div><p className="mt-4 whitespace-pre-wrap leading-7">{item.answer}</p><textarea className={`${inputClass} mt-4`} rows={3} placeholder="Отзыв ученику" value={feedback[item.id]??''} onChange={(e)=>setFeedback({...feedback,[item.id]:e.target.value})}/><div className="mt-3"><Button size="sm" onClick={()=>void review(item)}>Отправить отзыв</Button></div></div>)}</div></section>}</>
  );
}

function ProfileEditor(){
  const [profile,setProfile]=useState<TeacherProfile>({publicName:'',bio:'',organization:'',languages:['Сербский'],formats:[],website:'',socialLinks:[],avatarUrl:''});
  const [open,setOpen]=useState(false);const[message,setMessage]=useState('');
  useEffect(()=>{getTeacherProfile().then((value)=>setProfile((old)=>({...old,...value}))).catch(()=>{})},[]);
  const save=async()=>{try{setProfile(await updateTeacherProfile(profile));setMessage('Профиль сохранён.');setOpen(false)}catch(caught){setMessage(messageOf(caught))}};
  return <section className="mt-10 border-t border-[var(--line)] pt-8"><div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl">Профиль преподавателя</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Публичное имя, опыт и форматы работы без личной почты и телефона</p></div><Button size="sm" variant="secondary" onClick={()=>setOpen((value)=>!value)}>{open?'Закрыть':'Изменить'}</Button></div>{message&&<p className="mt-3 text-sm text-[var(--text-muted)]">{message}</p>}{open&&<div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">Публичное имя<input className={inputClass} value={profile.publicName} onChange={(e)=>setProfile({...profile,publicName:e.target.value})}/></label><label className="grid gap-2 text-sm font-semibold">Организация<input className={inputClass} value={profile.organization} onChange={(e)=>setProfile({...profile,organization:e.target.value})}/></label><label className="grid gap-2 text-sm font-semibold sm:col-span-2">О себе<textarea rows={4} className={inputClass} value={profile.bio} onChange={(e)=>setProfile({...profile,bio:e.target.value})}/></label><label className="grid gap-2 text-sm font-semibold">Языки через запятую<input className={inputClass} value={profile.languages.join(', ')} onChange={(e)=>setProfile({...profile,languages:e.target.value.split(',').map((x)=>x.trim()).filter(Boolean)})}/></label><label className="grid gap-2 text-sm font-semibold">Форматы занятий<input className={inputClass} value={profile.formats.join(', ')} onChange={(e)=>setProfile({...profile,formats:e.target.value.split(',').map((x)=>x.trim()).filter(Boolean)})}/></label><label className="grid gap-2 text-sm font-semibold sm:col-span-2">Сайт<input type="url" className={inputClass} value={profile.website} onChange={(e)=>setProfile({...profile,website:e.target.value})}/></label><div className="sm:col-span-2"><Button onClick={()=>void save()}>Сохранить профиль</Button></div></div>}</section>
}

function StatusBand({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <section className="mt-10 flex max-w-3xl gap-4 border-t border-[var(--line)] pt-8"><span className="mt-1 text-2xl text-[var(--accent)]">{icon}</span><div><h2 className="text-xl">{title}</h2><p className="mt-2 text-[var(--text-muted)]">{body}</p></div></section>;
}
function PageLoader() { return <main className="grid min-h-[60vh] place-items-center"><Spinner className="size-6" /></main>; }
function messageOf(error: unknown) { return error instanceof ApiError || error instanceof Error ? error.message : 'Неизвестная ошибка.'; }
function typeLabel(type: Lesson['lessonType']) { return ({lexicon:'Лексика',grammar:'Грамматика',speaking:'Говорение',writing:'Письмо'} as const)[type]; }
function statusLabel(lesson: Lesson) { if (lesson.revisionStatus === 'pending') return 'На модерации'; if (lesson.visibility === 'public') return 'Публичный'; if (lesson.visibility === 'unlisted') return 'По ссылке'; return 'Черновик'; }
