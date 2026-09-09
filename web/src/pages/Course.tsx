import { useEffect, useState } from 'react';
import { LuBookOpen, LuCheck, LuDumbbell, LuFlame, LuMessageCircle, LuVolume2, LuVolumeX, LuSparkles } from 'react-icons/lu';
import { CourseStartDialog } from '../course/CourseStartDialog';
import { CourseArt, CourseJourney, CourseNext, courseDone } from '../course/CourseJourney';
import { lessonUnlocked, loadCourse, loadProgress, syncCourseProgress } from '../course/data';
import { courseSoundsMuted, playCourseSound, setCourseSoundsMuted } from '../course/sounds';
import type { CourseBundle, CourseProgress } from '../course/types';
import { Button, Spinner } from '../components/ui';
import { Link } from '../lib/router';
import { useAuth } from '../state/auth';
import { useSeo } from '../lib/seo';
import { useStudy } from '../lib/useStudy';
import './course-journey.css';

export function Course() {
  const { account } = useAuth();
  return <CourseSession key={account?.id ?? 'guest'} />;
}

function CourseSession() {
  const { account } = useAuth();
  const study = useStudy();
  useSeo({ title: 'Курс сербского с Читавуком', description: 'От азбуки до причастий: понятные правила, практика и твой маршрут изучения сербского.' });
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(courseSoundsMuted);
  const [startLesson, setStartLesson] = useState<CourseBundle['units'][number]['skills'][number]['lessons'][number] | null>(null);
  useEffect(() => {
    let active = true;
    void loadCourse().then(course => { if (active) { setBundle(course); setProgress(loadProgress(course)); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить курс.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!bundle) return;
    const refresh = () => setProgress(loadProgress(bundle));
    window.addEventListener('citavuk-course-progress', refresh);
    return () => window.removeEventListener('citavuk-course-progress', refresh);
  }, [bundle]);
  useEffect(() => {
    if (!bundle || !account) return;
    let active = true;
    void syncCourseProgress(bundle).then(value => { if (active) setProgress(value); }).catch(() => {});
    return () => { active = false; };
  }, [account, bundle]);

  if (!account) return <main className="journey-signin"><CourseArt pose="guide" hero /><div><p className="journey-eyebrow">Учимся вместе</p><h1>Курс сербского</h1><p>Разбирай правила и пробуй их в упражнениях. Войди, чтобы твои результаты сохранились на всех устройствах.</p><div><Link className="journey-primary" to="/login?mode=register">Создать аккаунт</Link><Link className="journey-quiet" to="/login">Войти</Link></div></div></main>;
  if (error) return <main className="journey-signin"><CourseArt pose="reading" /><div><h1>Не удалось открыть курс</h1><p>{error}</p><Button onClick={() => location.reload()}>Попробовать снова</Button></div></main>;
  if (!bundle || !progress) return <div className="grid min-h-[60vh] place-items-center"><Spinner /></div>;
  const lessons = bundle.units.flatMap(u => u.skills.flatMap(s => s.lessons));
  const completed = lessons.filter(l => courseDone(progress.lessons[l.id]?.status)).length;
  const next = lessons.find(l => lessonUnlocked(l, progress) && !courseDone(progress.lessons[l.id]?.status) && !progress.lessons[l.id]?.skipped);
  const percent = lessons.length ? Math.round(completed / lessons.length * 100) : 0;
  return <main className="course-journey">
    <section className="journey-hero">
      <div className="journey-hero-copy">
        <p className="journey-eyebrow">Твой маршрут</p><h1>Курс сербского</h1>
        <p className="journey-subtitle">От азбуки до причастий. Разбирайся в правилах и сразу пробуй их в деле.</p>
        <CourseNext lesson={next} />
        {next && <p className="journey-next-title">Следующий урок: <strong>{next.title}</strong></p>}
        <div className="journey-metrics">
          <div><LuFlame /><strong>{study?.current ?? progress.streak.currentDays}</strong><span>дней в серии</span></div>
          <div><LuSparkles /><strong>{progress.xp}</strong><span>опыт</span></div>
          <div><LuCheck /><strong>{completed} / {lessons.length}</strong><span>уроки пройдены</span></div>
        </div>
      </div>
      <div className="journey-hero-art"><CourseArt pose="guide" hero /></div>
      <button type="button" className="journey-sound" aria-pressed={!muted} aria-label={muted ? 'Включить звуки курса' : 'Выключить звуки курса'} onClick={() => { const next = !muted; setMuted(next); setCourseSoundsMuted(next); if (!next) playCourseSound('correct'); }}>{muted ? <LuVolumeX /> : <LuVolume2 />}<span>Звуки {muted ? 'выключены' : 'включены'}</span></button>
    </section>
    <div className="journey-layout">
      <aside className="journey-index">
        <h2>Твоя программа</h2>
        <div className="journey-progress-label"><span>Пройдено</span><strong>{percent}%</strong></div>
        <progress value={completed} max={lessons.length || 1} aria-label="Прогресс курса" />
        <nav aria-label="Разделы курса">{bundle.units.map((unit, i) => <a key={unit.id} href={`#chapter-${i}`} onClick={e => { e.preventDefault(); document.getElementById(`chapter-${i}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }}><span>{String(i+1).padStart(2,'0')}</span>{unit.title}</a>)}</nav>
        <Link className="journey-resource" to="/trainer"><LuDumbbell /><span>Тренажёрка<small>Повтори нужную тему</small></span></Link>
        <Link className="journey-resource" to="/dialogues"><LuMessageCircle /><span>Игровые диалоги<small>Попробуй себя в разговоре</small></span></Link>
        <p className="journey-index-note"><LuBookOpen />Знакомые темы можно пропустить: нажми на урок с замком и подтверди, что уже знаешь предыдущее.</p>
      </aside>
      <div className="journey-chapters">{bundle.units.map((unit, index) => <CourseJourney key={unit.id} unit={unit} index={index} progress={progress} currentId={next?.id} onLocked={setStartLesson} />)}</div>
    </div>
    {startLesson && <CourseStartDialog bundle={bundle} lesson={startLesson} close={() => setStartLesson(null)} />}
  </main>;
}
