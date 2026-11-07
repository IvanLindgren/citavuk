import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { IconType } from 'react-icons';
import {
  LuArrowRight,
  LuCheck,
  LuClapperboard,
  LuFlame,
  LuGraduationCap,
  LuLanguages,
  LuListChecks,
  LuLogIn,
  LuNewspaper,
  LuPenLine,
  LuPower,
  LuShuffle,
} from 'react-icons/lu';

import { loadDaily, type DailyState } from '../api/daily';
import { getVideoPicks, type VideoInterest, type VideoPick } from '../api/news';
import { Confetti, Glory } from '../components/Celebration';
import { DailyPanel } from '../components/DailyWindow';
import { LiteYouTube } from '../components/LiteYouTube';
import { Mascot } from '../components/Mascot';
import { ButtonLink, Spinner } from '../components/ui';
import { lessonUnlocked, loadCourse, loadProgress } from '../course/data';
import type { CourseBundle, CourseLesson, CourseProgress } from '../course/types';
import {
  CHECKLIST_ITEMS,
  checklistStreak,
  dayKey,
  markChecklist,
  today,
  updateChecklist,
  useChecklist,
  type ChecklistItem,
} from '../lib/checklist';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';
import './checklist.css';

/**
 * Чек-лист дня: урок курса, слова дня, ролик на сербском и чтение.
 *
 * Включается по желанию. Пункты отмечаются сами, когда дело сделано (урок
 * пройден, слова выучены, ролик досмотрен, заметка открыта), и вручную —
 * если сделано в приложении или где-то ещё.
 */

const ITEMS: Record<ChecklistItem, { title: string; blurb: string; tag: string; icon: IconType }> = {
  lesson: { title: 'Урок курса', blurb: 'Следующий непройденный урок', tag: '≈ 10 минут', icon: LuGraduationCap },
  words: { title: 'Слова дня', blurb: 'Десять слов по твоему уровню', tag: '≈ 5 минут', icon: LuLanguages },
  video: { title: 'Видео на сербском', blurb: 'Ролик сербского блогера под твои интересы', tag: '≈ 10 минут', icon: LuClapperboard },
  read: { title: 'Почитать', blurb: 'Заметка из «Вестей» или свой текст', tag: '≈ 5 минут', icon: LuNewspaper },
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function Checklist() {
  useSeo({
    title: 'Чек-лист дня — Читавук',
    description: 'Урок, слова, видео и новость на сербском: четыре коротких дела на каждый день.',
    noindex: true,
  });
  const state = useChecklist();
  return state.enabled ? <Board /> : <Intro />;
}

/* --- Включение ----------------------------------------------------------- */

function Intro() {
  const reduce = useReducedMotion() ?? false;
  return (
    <main className="dan">
      <section className="dan-intro">
        <Mascot pose="citavuk_zdravo" alt="" className="dan-intro-wolf" float priority pet={false} />
        <p className="dan-eyebrow">
          <LuListChecks /> Чек-лист дня
        </p>
        <h1>Четыре коротких дела — каждый день</h1>
        <p className="dan-lead">
          Урок курса, слова дня, ролик сербского блогера и свежая новость. Читавук сам подбирает, что делать сегодня, а ты
          отмечаешь сделанное.
        </p>
        <ul className="dan-preview">
          {CHECKLIST_ITEMS.map((item, index) => {
            const meta = ITEMS[item];
            const Icon = meta.icon;
            return (
              <motion.li
                key={item}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.08, duration: 0.45, ease: EASE }}
              >
                <span className="dan-task-icon">
                  <Icon />
                </span>
                <strong>{meta.title}</strong>
                <span>{meta.blurb}</span>
              </motion.li>
            );
          })}
        </ul>
        <button type="button" className="dan-enable" onClick={() => updateChecklist((state) => ({ ...state, enabled: true }))}>
          <LuPower /> Включить чек-лист
        </button>
        <p className="dan-note">Отметки хранятся на этом устройстве. Выключить можно внизу страницы.</p>
      </section>
    </main>
  );
}

/* --- Список -------------------------------------------------------------- */

function Board() {
  const state = useChecklist();
  const { account } = useAuth();
  const course = useCourse();
  const [daily, setDaily] = useState<DailyState | null>(null);
  const [dailyError, setDailyError] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);

  const pullDaily = useCallback(() => {
    if (!account) return;
    setDailyError(false);
    loadDaily()
      .then(setDaily)
      .catch(() => setDailyError(true));
  }, [account]);

  useEffect(() => {
    pullDaily();
  }, [pullDaily]);

  // Сделанное в других разделах отмечается само. Эффекты зависят только от
  // данных, а не от отметок, поэтому снятую вручную галочку они не вернут,
  // пока не случится что-то новое.
  const lessonToday = course !== null && course !== 'error' && course.doneToday;
  useEffect(() => {
    if (lessonToday) markChecklist('lesson');
  }, [lessonToday]);

  const set = daily?.set ?? null;
  const wordsDone = Boolean(set && set.words.length > 0 && set.learned.length >= set.words.length);
  useEffect(() => {
    if (wordsDone) markChecklist('words');
  }, [wordsDone]);

  const composed = Boolean(set?.lesson);
  useEffect(() => {
    if (composed) markChecklist('read');
  }, [composed]);

  const doneCount = CHECKLIST_ITEMS.filter((item) => state.done[item]).length;
  const all = doneCount === CHECKLIST_ITEMS.length;
  const wasAll = useRef(all);
  const [party, setParty] = useState(false);
  useEffect(() => {
    if (all && !wasAll.current) setParty(true);
    wasAll.current = all;
  }, [all]);

  const streak = checklistStreak(state.history);

  return (
    <main className="dan">
      {party && <Confetti />}
      <Hero done={doneCount} total={CHECKLIST_ITEMS.length} history={state.history} all={all} streak={streak} />

      <ol className="dan-list">
        <Task item="lesson" index={0} done={Boolean(state.done.lesson)}>
          <LessonTask course={course} />
        </Task>
        <Task item="words" index={1} done={Boolean(state.done.words)}>
          <WordsTask signedIn={Boolean(account)} daily={daily} error={dailyError} onOpen={() => setDailyOpen(true)} />
        </Task>
        <Task item="video" index={2} done={Boolean(state.done.video)}>
          <VideoTask interests={state.interests} chosen={state.video} />
        </Task>
        <Task item="read" index={3} done={Boolean(state.done.read)}>
          <ReadTask daily={daily} onCompose={() => setDailyOpen(true)} />
        </Task>
      </ol>

      <AnimatePresence>{all && <Finale streak={streak} />}</AnimatePresence>

      <footer className="dan-foot">
        <span>Отметки хранятся на этом устройстве и обнуляются в полночь.</span>
        <button type="button" onClick={() => updateChecklist((current) => ({ ...current, enabled: false }))}>
          <LuPower /> Выключить чек-лист
        </button>
      </footer>

      {dailyOpen && (
        <DailyPanel
          onClose={() => {
            setDailyOpen(false);
            pullDaily();
          }}
        />
      )}
    </main>
  );
}

const HEADLINES = ['Четыре дела на сегодня', 'Хорошее начало', 'Половина пути', 'Осталось одно дело'];

function Hero({ done, total, history, all, streak }: { done: number; total: number; history: string[]; all: boolean; streak: number }) {
  const now = new Date();
  const ru = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  let sr = '';
  try {
    sr = now.toLocaleDateString('sr-Cyrl-RS', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    sr = '';
  }
  return (
    <section className="dan-hero">
      <div className="dan-hero-text">
        <p className="dan-eyebrow">
          <LuListChecks /> Чек-лист дня
        </p>
        <h1>{all ? 'День засчитан' : HEADLINES[Math.min(done, HEADLINES.length - 1)]}</h1>
        <p className="dan-date">
          <span>{ru}</span>
          {sr && sr !== ru && (
            <span className="dan-date-sr" lang="sr">
              {sr}
            </span>
          )}
        </p>
        <Week history={history} part={done / total} />
        {streak > 1 && (
          <p className="dan-streak">
            <LuFlame /> Серия: {streak} дн. подряд
          </p>
        )}
      </div>
      <Ring done={done} total={total} all={all} />
    </section>
  );
}

function Ring({ done, total, all }: { done: number; total: number; all: boolean }) {
  const radius = 72;
  const length = 2 * Math.PI * radius;
  const gap = 10;
  const segment = length / total;
  return (
    <div className="dan-ring" data-all={all} role="img" aria-label={`Сделано ${done} из ${total}`}>
      <svg viewBox="0 0 180 180" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <circle
            key={`track-${index}`}
            className="dan-ring-track"
            cx="90"
            cy="90"
            r={radius}
            strokeDasharray={`${segment - gap} ${length - segment + gap}`}
            strokeDashoffset={-index * segment}
          />
        ))}
        {Array.from({ length: total }, (_, index) => (
          <circle
            key={`fill-${index}`}
            className="dan-ring-fill"
            data-on={index < done}
            cx="90"
            cy="90"
            r={radius}
            strokeDasharray={`${segment - gap} ${length - segment + gap}`}
            strokeDashoffset={-index * segment}
          />
        ))}
      </svg>
      <Mascot
        pose={all ? 'citavuk_slavlje' : done > 0 ? 'citavuk_cita' : 'citavuk_zdravo'}
        alt=""
        className="dan-ring-wolf"
        priority
        pet={false}
      />
      <span className="dan-ring-count">
        <b>{done}</b> из {total}
      </span>
    </div>
  );
}

function Week({ history, part }: { history: string[]; part: number }) {
  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index));
  }, []);
  const full = new Set(history);
  const todayKey = today();
  return (
    <ol className="dan-week" aria-label="Последние семь дней">
      {days.map((date) => {
        const key = dayKey(date);
        const isToday = key === todayKey;
        const closed = full.has(key);
        return (
          <li
            key={key}
            data-full={closed}
            data-today={isToday}
            style={isToday ? ({ '--dan-part': `${Math.round(part * 100)}%` } as CSSProperties) : undefined}
          >
            <span className="dan-week-day">{date.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
            <span className="dan-week-dot">{closed && <LuCheck />}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Task({ item, index, done, children }: { item: ChecklistItem; index: number; done: boolean; children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const meta = ITEMS[item];
  const Icon = meta.icon;
  return (
    <motion.li
      className="dan-task"
      data-done={done}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.07, duration: 0.5, ease: EASE }}
    >
      <button
        type="button"
        className="dan-check"
        aria-pressed={done}
        aria-label={done ? `Снять отметку: ${meta.title}` : `Отметить: ${meta.title}`}
        onClick={() => markChecklist(item, !done)}
      >
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <rect className="dan-check-box" x="4" y="4" width="32" height="32" rx="10" />
          <path className="dan-check-mark" d="M11.5 21l6 6 11-13" />
        </svg>
      </button>
      <div className="dan-task-body">
        <div className="dan-task-head">
          <span className="dan-task-icon">
            <Icon />
          </span>
          <h2>
            <span className="dan-strike">{meta.title}</span>
          </h2>
          <span className="dan-task-tag">{meta.tag}</span>
        </div>
        {children}
      </div>
      <AnimatePresence>
        {done && (
          <motion.span
            className="dan-stamp"
            aria-hidden="true"
            initial={reduce ? { opacity: 0 } : { scale: 1.9, opacity: 0, rotate: -26 }}
            animate={{ scale: 1, opacity: 1, rotate: -11 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 17 }}
          >
            Готово
          </motion.span>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/* --- Урок курса ---------------------------------------------------------- */

interface CourseState {
  next: CourseLesson | null;
  unit: string;
  doneToday: boolean;
  done: number;
  total: number;
}

function lessonDone(progress?: CourseProgress['lessons'][string]): boolean {
  return (
    Boolean(progress?.skipped) ||
    progress?.status === 'completed' ||
    progress?.status === 'mastered' ||
    progress?.status === 'needsReview'
  );
}

function readCourse(bundle: CourseBundle): CourseState {
  const progress = loadProgress(bundle);
  const todayKey = today();
  const state: CourseState = { next: null, unit: '', doneToday: false, done: 0, total: 0 };
  for (const unit of bundle.units) {
    for (const skill of unit.skills) {
      for (const lesson of skill.lessons) {
        const entry = progress.lessons[lesson.id];
        if (entry?.completedAt && dayKey(new Date(entry.completedAt)) === todayKey) state.doneToday = true;
        if (lesson.optional) continue;
        state.total += 1;
        if (lessonDone(entry)) {
          state.done += 1;
        } else if (!state.next && lessonUnlocked(lesson, progress)) {
          state.next = lesson;
          state.unit = unit.title;
        }
      }
    }
  }
  return state;
}

function useCourse(): CourseState | 'error' | null {
  const [state, setState] = useState<CourseState | 'error' | null>(null);
  useEffect(() => {
    let alive = true;
    let bundle: CourseBundle | null = null;
    const refresh = () => {
      if (alive && bundle) setState(readCourse(bundle));
    };
    loadCourse()
      .then((loaded) => {
        bundle = loaded;
        refresh();
      })
      .catch(() => {
        if (alive) setState('error');
      });
    window.addEventListener('citavuk-course-progress', refresh);
    return () => {
      alive = false;
      window.removeEventListener('citavuk-course-progress', refresh);
    };
  }, []);
  return state;
}

function LessonTask({ course }: { course: CourseState | 'error' | null }) {
  if (course === null) {
    return (
      <p className="dan-hint">
        <Spinner /> Ищем следующий урок…
      </p>
    );
  }
  if (course === 'error') {
    return (
      <>
        <p className="dan-hint">Курс сейчас не открылся.</p>
        <Link to="/course" className="dan-link">
          К курсу <LuArrowRight />
        </Link>
      </>
    );
  }
  if (!course.next) {
    return (
      <>
        <p className="dan-hint">Курс пройден целиком. Вместо нового урока — пять минут в тренажёрке.</p>
        <Link to="/trainer" className="dan-link">
          В тренажёрку <LuArrowRight />
        </Link>
      </>
    );
  }
  const share = course.total ? Math.round((course.done / course.total) * 100) : 0;
  return (
    <>
      <p className="dan-hint">Следующий непройденный урок курса.</p>
      <Link to={`/course/lesson/${encodeURIComponent(course.next.id)}`} className="dan-lesson">
        <span className="dan-lesson-unit">{course.unit}</span>
        <strong>{course.next.title}</strong>
        <span className="dan-meter" aria-hidden="true">
          <span style={{ width: `${share}%` }} />
        </span>
        <span className="dan-lesson-foot">
          <span>
            Пройдено {course.done} из {course.total}
          </span>
          <span className="dan-go">
            Пройти урок <LuArrowRight />
          </span>
        </span>
      </Link>
    </>
  );
}

/* --- Слова дня ----------------------------------------------------------- */

function WordsTask({
  signedIn,
  daily,
  error,
  onOpen,
}: {
  signedIn: boolean;
  daily: DailyState | null;
  error: boolean;
  onOpen: () => void;
}) {
  if (!signedIn) {
    return (
      <>
        <p className="dan-hint">Слова подбираются по твоему уровню и темам — для этого нужен аккаунт.</p>
        <ButtonLink to="/login?next=%2Fdan" variant="secondary" size="sm">
          <LuLogIn /> Войти
        </ButtonLink>
      </>
    );
  }
  if (error) return <p className="dan-hint">Слова дня сейчас не открылись. Загляни чуть позже.</p>;
  if (!daily) {
    return (
      <p className="dan-hint">
        <Spinner /> Собираем слова…
      </p>
    );
  }
  const set = daily.set;
  if (!set || !daily.configured) {
    return (
      <>
        <p className="dan-hint">Выбери темы — и Читавук соберёт десять слов на сегодня.</p>
        <button type="button" className="dan-link" onClick={onOpen}>
          Выбрать темы <LuArrowRight />
        </button>
      </>
    );
  }
  const learned = new Set(set.learned);
  const share = set.words.length ? Math.round((set.learned.length / set.words.length) * 100) : 0;
  return (
    <>
      <ul className="dan-words" aria-label="Слова на сегодня">
        {set.words.map((word) => (
          <li key={word.lemma} data-learned={learned.has(word.lemma)} lang="sr" title={word.translation}>
            {word.lemma}
          </li>
        ))}
      </ul>
      <div className="dan-words-foot">
        <span className="dan-meter" aria-hidden="true">
          <span style={{ width: `${share}%` }} />
        </span>
        <span>
          Выучено {set.learned.length} из {set.words.length}
        </span>
        <button type="button" className="dan-link" onClick={onOpen}>
          {set.learned.length ? 'Продолжить' : 'Учить слова'} <LuArrowRight />
        </button>
      </div>
    </>
  );
}

/* --- Видео --------------------------------------------------------------- */

function VideoTask({ interests, chosen }: { interests: string[]; chosen: string }) {
  const [picks, setPicks] = useState<VideoPick[] | null>(null);
  const [catalog, setCatalog] = useState<VideoInterest[]>([]);
  const [error, setError] = useState(false);
  const key = interests.join(',');

  useEffect(() => {
    const controller = new AbortController();
    setPicks(null);
    setError(false);
    getVideoPicks(key ? key.split(',') : [], controller.signal)
      .then((result) => {
        setCatalog(result.interests);
        setPicks(result.videos);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [key]);

  // Короткие ролики идут последними: за минуту вертикального видео язык не
  // услышать, но если других нет — лучше они, чем ничего.
  const pool = useMemo(() => {
    const all = picks ?? [];
    const long = all.filter((video) => !video.short);
    return long.length ? long : all;
  }, [picks]);

  const video = pool.find((item) => item.id === chosen) ?? null;

  // Ролик дня выбирается один раз и запоминается: подборка обновляется в
  // течение дня, и без этого он менялся бы при каждом заходе.
  useEffect(() => {
    if (!pool.length || pool.some((item) => item.id === chosen)) return;
    const seed = [...today()].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
    const pick = pool[seed % Math.min(pool.length, 12)];
    if (pick) updateChecklist((state) => ({ ...state, video: pick.id }));
  }, [pool, chosen]);

  const another = () => {
    if (!pool.length) return;
    const at = pool.findIndex((item) => item.id === chosen);
    const pick = pool[(at + 1 + Math.floor(Math.random() * Math.max(1, pool.length - 1))) % pool.length];
    if (pick) updateChecklist((state) => ({ ...state, video: pick.id }));
  };

  const toggle = (code: string) =>
    updateChecklist((state) => ({
      ...state,
      video: '',
      interests: state.interests.includes(code) ? state.interests.filter((item) => item !== code) : [...state.interests, code],
    }));

  const topic = catalog.find((item) => item.code === video?.interest)?.title;

  return (
    <>
      <p className="dan-hint">Живой сербский: блогеры, подкасты, путешествия. Ролик засчитается после минуты просмотра.</p>
      {catalog.length > 0 && (
        <div className="dan-chips" role="group" aria-label="Мои интересы">
          <button
            type="button"
            data-active={interests.length === 0}
            onClick={() => updateChecklist((state) => ({ ...state, video: '', interests: [] }))}
          >
            Всё подряд
          </button>
          {catalog.map((item) => (
            <button
              key={item.code}
              type="button"
              data-active={interests.includes(item.code)}
              onClick={() => toggle(item.code)}
              title={item.channels.join(', ')}
            >
              {item.title}
            </button>
          ))}
        </div>
      )}
      {error && <p className="dan-hint">Ролики сейчас не загрузились. Загляни чуть позже.</p>}
      {!error && !video && (
        <p className="dan-hint">
          <Spinner /> Подбираем ролик…
        </p>
      )}
      {video && (
        <div className="dan-video">
          <LiteYouTube id={video.id} title={video.title} watchedAfter={60} onWatched={() => markChecklist('video')} />
          <div className="dan-video-meta">
            <strong lang="sr">{video.title}</strong>
            <span>{[video.channel, topic].filter(Boolean).join(', ')}</span>
          </div>
          {pool.length > 1 && (
            <button type="button" className="dan-link" onClick={another}>
              <LuShuffle /> Другое видео
            </button>
          )}
        </div>
      )}
    </>
  );
}

/* --- Чтение -------------------------------------------------------------- */

function ReadTask({ daily, onCompose }: { daily: DailyState | null; onCompose: () => void }) {
  const set = daily?.set ?? null;
  const canOwn = Boolean(set && (set.lesson || daily?.canCompose));
  return (
    <>
      <p className="dan-hint">Одна заметка из свежего номера — или короткий текст из твоих слов дня.</p>
      <div className="dan-read">
        <Link to="/vesti" className="dan-read-card dan-read-news">
          <span className="dan-read-mast">Вести</span>
          <span className="dan-read-rule" aria-hidden="true" />
          <span className="dan-read-text">Номер выходит каждый час. Открой любую заметку: каждое слово переводится нажатием.</span>
          <span className="dan-go">
            Открыть газету <LuArrowRight />
          </span>
        </Link>
        {canOwn && (
          <button type="button" className="dan-read-card dan-read-own" onClick={onCompose}>
            <span className="dan-read-icon">
              <LuPenLine />
            </span>
            <strong>{set?.lesson ? 'Твой текст готов' : 'Свой текст'}</strong>
            <span className="dan-read-text">Читавук соберёт короткий рассказ из слов дня — с упражнениями.</span>
            <span className="dan-go">
              {set?.lesson ? 'Прочитать' : 'Составить'} <LuArrowRight />
            </span>
          </button>
        )}
      </div>
    </>
  );
}

/* --- Финал --------------------------------------------------------------- */

function Finale({ streak }: { streak: number }) {
  return (
    <motion.section
      className="dan-finale"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      <Glory>
        <Mascot pose="citavuk_slavlje" alt="" className="dan-finale-wolf" pet={false} />
      </Glory>
      <h2>Браво! День засчитан</h2>
      <p>
        {streak > 1 ? `Серия: ${streak} дн. подряд. ` : ''}
        Завтра Читавук соберёт новый список.
      </p>
    </motion.section>
  );
}
