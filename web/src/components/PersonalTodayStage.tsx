import { useEffect, useState } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { LuArrowRight, LuCheck, LuLock, LuSparkles } from 'react-icons/lu';

import type { PersonalPlan } from '../api/personal';
import { KIND_LABELS, KindIcon, lessonKind } from '../personal/kinds';
import { CardBack, CardFace, WaxSeal } from './PersonalPlayingCard';
import { Button } from './ui';
import './playing-card.css';

const REVEALED_KEY = 'citavuk-personal-revealed';

/** Новая карта дня переворачивается один раз, дальше лежит лицом вверх. */
function shouldReveal(stamp: string) {
  try {
    return localStorage.getItem(REVEALED_KEY) !== stamp;
  } catch {
    return false;
  }
}

function rememberReveal(stamp: string) {
  try {
    localStorage.setItem(REVEALED_KEY, stamp);
  } catch {
    // Без хранилища карта перевернётся ещё раз — не беда.
  }
}

const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
  const distance = 120 + (i % 3) * 34;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.9, size: 7 + (i % 3) * 3, delay: (i % 4) * 0.03 };
});

function Sparks() {
  return (
    <span className="today-sparks" aria-hidden="true">
      {SPARKS.map((s, i) => (
        <motion.span
          key={i}
          className="today-spark"
          style={{ width: s.size, height: s.size }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.2, rotate: 45 }}
          animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: [0.2, 1, 0.6], rotate: 45 }}
          transition={{ duration: 1.1, delay: s.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </span>
  );
}

/** Тридцать делений колоды: пройденные — цветом масти, сегодняшнее мерцает. */
export function DeckProgress({ plan }: { plan: PersonalPlan }) {
  const reduced = useReducedMotion();
  const done = plan.lessons.filter((l) => l.completedAt).length;
  return (
    <div className="deck-progress">
      <div className="deck-progress-pips" role="img" aria-label={`Пройдено ${done} из 30`}>
        {Array.from({ length: 30 }, (_, i) => {
          const day = i + 1;
          const lesson = plan.lessons.find((l) => l.day === day);
          const kind = lessonKind(plan.outline.find((o) => o.day === day)?.kind);
          const state = lesson?.completedAt ? 'done' : day === plan.today ? 'today' : day < plan.today ? 'open' : 'locked';
          return (
            <motion.span
              key={day}
              className={`deck-pip kind-${kind} is-${state}`}
              initial={reduced ? false : { scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ delay: 0.25 + i * 0.022, type: 'spring', stiffness: 380, damping: 24 }}
            />
          );
        })}
      </div>
      <p>
        Пройдено <b>{done}</b> из 30 · уровень <b>{plan.profile.level}</b>
      </p>
    </div>
  );
}

export function PersonalTodayStage({ plan, onOpen }: { plan: PersonalPlan; onOpen: (day: number) => void }) {
  const reduced = useReducedMotion();
  const day = plan.today;
  const meta = plan.outline.find((o) => o.day === day);
  const lesson = plan.lessons.find((l) => l.day === day);
  const next = plan.outline.find((o) => o.day === day + 1);
  const kind = lessonKind(meta?.kind);
  const title = meta?.title || `Урок ${day}`;
  const done = !!lesson?.completedAt;
  const stamp = `${plan.id}:${day}`;
  const [revealing] = useState(() => !reduced && !done && shouldReveal(stamp));
  const [burst, setBurst] = useState(false);

  // Переворот: сначала видна рубашка, карта поворачивается лицом.
  const flip = useMotionValue(revealing ? 180 : 0);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const tiltX = useSpring(useTransform(y, [-1, 1], [8, -8]), { stiffness: 160, damping: 18 });
  const tiltY = useSpring(useTransform(x, [-1, 1], [-10, 10]), { stiffness: 160, damping: 18 });
  const glareX = useTransform(x, [-1, 1], ['0%', '100%']);
  const glareY = useTransform(y, [-1, 1], ['0%', '100%']);

  useEffect(() => {
    if (!revealing) return;
    const controls = animate(flip, 0, {
      delay: 0.55,
      duration: 1.05,
      ease: [0.3, 0.9, 0.25, 1],
      onUpdate: (v) => {
        if (v < 70) setBurst(true);
      },
      onComplete: () => rememberReveal(stamp),
    });
    return () => controls.stop();
  }, [revealing, flip, stamp]);

  if (!lesson) return null;
  const month = String(plan.month).padStart(2, '0');

  return (
    <section className={`today-stage kind-${kind}`} aria-labelledby="today-title">
      <div className="today-table">
        <span className="today-stack" aria-hidden="true">
          <span />
          <span />
        </span>
        <motion.div
          className="today-float"
          animate={reduced ? undefined : { y: [0, -7, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.button
            type="button"
            className={`today-card personal-card is-open kind-${kind}`}
            aria-label={`Открыть карту дня: ${title}`}
            onClick={() => onOpen(day)}
            onPointerMove={(e) => {
              if (reduced || e.pointerType !== 'mouse') return;
              const b = e.currentTarget.getBoundingClientRect();
              x.set(Math.max(-1, Math.min(1, ((e.clientX - b.left) / b.width) * 2 - 1)));
              y.set(Math.max(-1, Math.min(1, ((e.clientY - b.top) / b.height) * 2 - 1)));
            }}
            onPointerLeave={() => {
              x.set(0);
              y.set(0);
            }}
            style={reduced ? undefined : { rotateX: tiltX, rotateY: tiltY, transformPerspective: 1100 }}
            whileTap={reduced ? undefined : { scale: 0.97 }}
          >
            <motion.span className="today-flip" style={{ rotateY: flip }}>
              <span className="today-side today-front">
                <CardFace day={day} kind={kind} title={title} art={`/personal/months/${month}.webp`}>
                  <span className="personal-card-bottom">
                    {done ? (
                      <>
                        <LuCheck /> В коллекции
                      </>
                    ) : (
                      <>
                        Открыть <LuArrowRight />
                      </>
                    )}
                  </span>
                </CardFace>
                {done && lesson.score !== undefined && (
                  <span className="card-seal-slot is-large">
                    <WaxSeal score={`${lesson.score}/${lesson.total}`} />
                  </span>
                )}
                <motion.span
                  className="card-glare"
                  style={reduced ? undefined : { backgroundPositionX: glareX, backgroundPositionY: glareY }}
                />
                <span className="card-sheen" />
              </span>
              <span className="today-side today-back">
                <CardBack day={day} />
              </span>
            </motion.span>
          </motion.button>
        </motion.div>
        {burst && <Sparks />}
      </div>

      <motion.div
        className="today-copy"
        initial={reduced ? false : { opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: revealing ? 1.2 : 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="personal-eyebrow">
          <LuSparkles aria-hidden /> Карта дня · {day} из 30
        </p>
        <h2 id="today-title" className="today-title" lang="sr">
          {title}
        </h2>
        <span className="today-kind">
          <KindIcon kind={kind} />
          {KIND_LABELS[kind]}
        </span>
        {meta?.goal && <p className="today-goal">{meta.goal}</p>}
        <div className="today-actions">
          {done ? (
            <>
              <span className="today-done">
                <LuCheck aria-hidden /> Пройдена: {lesson.score} из {lesson.total}
              </span>
              <Button variant="secondary" onClick={() => onOpen(day)}>
                Повторить урок
              </Button>
            </>
          ) : (
            <Button size="lg" onClick={() => onOpen(day)}>
              Открыть карту <LuArrowRight aria-hidden />
            </Button>
          )}
        </div>
        {next && (
          <p className="today-next">
            <LuLock aria-hidden /> Завтра откроется: <b lang="sr">{next.title}</b>
          </p>
        )}
        <DeckProgress plan={plan} />
      </motion.div>
    </section>
  );
}
