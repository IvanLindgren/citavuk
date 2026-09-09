import { LuBookOpen, LuCheck, LuFlag, LuLockKeyhole, LuMessageCircle, LuPencilLine, LuPlay, LuRotateCcw, LuStar, LuTrophy } from 'react-icons/lu';
import { lessonUnlocked } from './data';
import type { CourseBundle, CourseProgress } from './types';
import { Link } from '../lib/router';

type Unit = CourseBundle['units'][number];
type Lesson = Unit['skills'][number]['lessons'][number];
export const courseDone = (status?: string) => ['completed', 'mastered', 'needsReview'].includes(status ?? '');
export function CourseArt({ pose, hero = false }: { pose: 'guide' | 'reading' | 'celebrate'; hero?: boolean }) {
  return <img className="journey-mascot" src={`/course/art/citavuk-${pose}-v1.webp`} width={720} height={720} alt="" loading={hero ? 'eager' : 'lazy'} decoding="async" />;
}

/** Геометрия не зависит от длины подписи; для неё выделяется отдельная строка. */
export function journeyLayout(unit: Unit) {
  let y = 58, index = 0;
  const labels: { title: string; y: number }[] = [];
  const nodes: { lesson: Lesson; x: number; y: number }[] = [];
  const wave = [.27, .27, .47, .67, .67, .47];
  for (const skill of unit.skills) {
    labels.push({ title: skill.title, y: y - 42 });
    for (const lesson of skill.lessons) {
      nodes.push({ lesson, x: wave[index++ % wave.length]!, y });
      y += 230;
    }
    y += 44;
  }
  return { labels, nodes, height: y + 4 };
}

function LessonGlyph({ lesson, locked, done }: { lesson: Lesson; locked: boolean; done: boolean }) {
  if (locked) return <LuLockKeyhole />;
  if (lesson.isCheckpoint) return <LuTrophy />;
  if (done) return <LuCheck />;
  if (lesson.exercises.some(e => e.type === 'reading_qa')) return <LuBookOpen />;
  if (lesson.exercises.some(e => e.type === 'sentence_builder')) return <LuMessageCircle />;
  if (lesson.exercises.some(e => e.type === 'fill_blank')) return <LuPencilLine />;
  return <LuStar />;
}

export function CourseJourney({ unit, index, progress, currentId, onLocked }: {
  unit: Unit; index: number; progress: CourseProgress; currentId?: string; onLocked: (lesson: Lesson) => void;
}) {
  const { labels, nodes, height } = journeyLayout(unit);
  const completed = nodes.filter(n => courseDone(progress.lessons[n.lesson.id]?.status)).length;
  const done = completed === nodes.length && nodes.length > 0;
  return <section className={`journey-unit journey-tone-${index % 3}`} id={`chapter-${index}`}>
    <header className="journey-unit-header">
      <div><span className="journey-eyebrow">Раздел {index + 1}</span><h2>{unit.title}</h2><p>{unit.description}</p></div>
      <span className="journey-unit-count" aria-label={`Пройдено ${completed} из ${nodes.length} уроков`}><LuFlag />{completed} / {nodes.length}</span>
    </header>
    <div className="journey-scene" style={{ height }}>
      <svg className="journey-line" viewBox={`0 0 720 ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {nodes.slice(1).map((node, n) => {
          const from = nodes[n]!;
          const y1 = from.y + 57, y2 = node.y + 57;
          return <path key={node.lesson.id} className={courseDone(progress.lessons[from.lesson.id]?.status) ? 'is-done' : ''} d={`M ${from.x * 720} ${y1} C ${from.x * 720} ${(y1+y2)/2}, ${node.x * 720} ${(y1+y2)/2}, ${node.x * 720} ${y2}`} />;
        })}
      </svg>
      {labels.map((label, n) => <h3 key={n} className="journey-skill" style={{ top: label.y }}><span>{label.title}</span></h3>)}
      {nodes.length > 0 && <div className="journey-scene-mascot" style={{ top: nodes[0]!.y + 30 }}>
        <CourseArt pose={done ? 'celebrate' : index % 2 === 0 ? 'guide' : 'reading'} />
      </div>}
      {nodes.map(({ lesson, x, y }) => {
        const record = progress.lessons[lesson.id];
        const done = courseDone(record?.status);
        const unlocked = lessonUnlocked(lesson, progress);
        const current = lesson.id === currentId;
        const body = <>
          <span className="journey-node-hint">{current ? record?.status === 'inProgress' ? 'Продолжить' : 'Начать' : ''}</span>
          <span className={`journey-node-face ${done ? 'is-done' : unlocked ? 'is-open' : 'is-locked'} ${current ? 'is-current' : ''}`}><LessonGlyph lesson={lesson} locked={!unlocked} done={done} /></span>
          <span className="journey-node-title">{lesson.title}</span>
          <span className="journey-node-meta">{done ? `${Math.round((record?.bestScore ?? 0)*100)}% верно` : record?.skipped ? 'Знакомая тема' : lesson.isCheckpoint ? 'Проверка знаний' : `${lesson.exercises.length} заданий`}</span>
        </>;
        return <div className="journey-node" key={lesson.id} style={{ left: `${x*100}%`, top: y }} data-lesson-id={lesson.id}>
          {unlocked ? <Link to={`/course/lesson/${lesson.id}`} aria-current={current ? 'step' : undefined} aria-label={`${done ? 'Повторить' : 'Начать'}: ${lesson.title}`}>{body}</Link>
            : <button type="button" onClick={() => onLocked(lesson)} aria-label={`Открыть урок ${lesson.title}. Подтвердить знание предыдущих тем`}>{body}</button>}
        </div>;
      })}
    </div>
    {done && <div className="journey-chapter-complete"><LuTrophy />Раздел пройден<Link to={`/course/lesson/${nodes[0]!.lesson.id}`}><LuRotateCcw />Повторить</Link></div>}
  </section>;
}

export function CourseNext({ lesson }: { lesson?: Lesson }) {
  return lesson ? <Link className="journey-primary" to={`/course/lesson/${lesson.id}`}><LuPlay />Продолжить занятия</Link> : <span className="journey-primary"><LuTrophy />Курс пройден</span>;
}
