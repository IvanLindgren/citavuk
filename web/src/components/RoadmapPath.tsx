import { motion, useReducedMotion } from 'framer-motion';

import {
  levelPassed,
  type RoadmapCategory,
  type RoadmapLevelView,
} from '../api/roadmap';

/**
 * Тропа по уровням: шесть стоянок, соединённых извилистой линией.
 *
 * Линия рисуется одним SVG во всю высоту блока, а стоянки лежат обычными
 * кнопками поверх него. Разложить их внутри самого SVG было бы проще, но текст
 * в SVG не переносится, не выделяется и плохо читается скринридером, а стоянка
 * — это в первую очередь кнопка с названием ступени.
 *
 * Координаты стоянок и узлы кривой считаются из одного и того же массива долей,
 * поэтому кружок всегда сидит ровно на линии, какой бы ни была ширина экрана.
 */

/** Насколько стоянка отклоняется от середины, в долях ширины. */
const SWING = 0.26;

/** Доля высоты, приходящаяся на одну стоянку. */
function stationY(index: number, count: number): number {
  return (index + 0.5) / count;
}

/** Сторона отклонения: змейка влево-вправо. */
function stationX(index: number): number {
  return 0.5 + (index % 2 === 0 ? -SWING : SWING);
}

/**
 * Кривая через все стоянки.
 *
 * Кубические кривые, а не ломаная: тропа должна выглядеть тропой. Управляющие
 * точки ставятся строго по вертикали от концов отрезка — тогда линия входит в
 * каждую стоянку вертикально и не даёт петель на узких экранах.
 */
function pathD(count: number, width: number, height: number): string {
  const point = (index: number) => ({
    x: stationX(index) * width,
    y: stationY(index, count) * height,
  });
  let d = `M ${point(0).x} ${point(0).y}`;
  for (let index = 1; index < count; index += 1) {
    const from = point(index - 1);
    const to = point(index);
    const bend = (to.y - from.y) / 2;
    d += ` C ${from.x} ${from.y + bend}, ${to.x} ${to.y - bend}, ${to.x} ${to.y}`;
  }
  return d;
}

export function RoadmapPath({
  levels,
  categories,
  selected,
  target,
  current,
  onSelect,
}: {
  levels: RoadmapLevelView[];
  categories: RoadmapCategory[];
  selected: string;
  target: string;
  current: string;
  onSelect: (level: string) => void;
}) {
  const reduced = useReducedMotion();
  const count = levels.length;
  // Единицы вымышленные: SVG растягивается по ширине, а высота задаётся
  // строкой сетки. Числа выбраны так, чтобы кривая была пологой.
  const width = 100;
  const height = 100 * count;

  return (
    <div className="relative mt-10" style={{ minHeight: `${count * 8.5}rem` }}>
      <svg
        className="absolute inset-0 size-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={pathD(count, width, height)}
          fill="none"
          stroke="var(--line)"
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Пройденная часть тропы: до последней взятой ступени. */}
        <motion.path
          d={pathD(count, width, height)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: passedFraction(levels, categories) }}
          transition={reduced ? { duration: 0 } : { duration: 1.1, ease: 'easeOut' }}
        />
      </svg>

      <ol className="relative grid" style={{ gridTemplateRows: `repeat(${count}, minmax(0, 1fr))` }}>
        {levels.map((level, index) => (
          <li
            key={level.level}
            className="flex items-center"
            style={{ justifyContent: index % 2 === 0 ? 'flex-start' : 'flex-end' }}
          >
            <Station
              level={level}
              categories={categories}
              selected={selected === level.level}
              isTarget={target === level.level}
              isCurrent={current === level.level}
              flipped={index % 2 === 1}
              onSelect={() => onSelect(level.level)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Доля тропы, которую человек уже прошёл.
 *
 * Считается по последней взятой ступени, а не по среднему проценту: тропа
 * показывает путь, а средняя величина по шести уровням говорила бы о нём
 * меньше, чем «вы дошли до B1».
 */
function passedFraction(
  levels: RoadmapLevelView[],
  categories: RoadmapCategory[],
): number {
  let passed = 0;
  for (const level of levels) {
    if (!levelPassed(level, categories)) break;
    passed += 1;
  }
  if (passed === 0) return 0;
  return Math.min(1, (passed - 0.5) / levels.length + 0.5 / levels.length);
}

function Station({
  level,
  categories,
  selected,
  isTarget,
  isCurrent,
  flipped,
  onSelect,
}: {
  level: RoadmapLevelView;
  categories: RoadmapCategory[];
  selected: boolean;
  isTarget: boolean;
  isCurrent: boolean;
  flipped: boolean;
  onSelect: () => void;
}) {
  const done = levelPassed(level, categories);
  const counted = categories.filter((category) => !category.planned);
  const ratio =
    counted.reduce(
      (sum, category) => sum + (level.categories[category.key]?.ratio ?? 0),
      0,
    ) / Math.max(1, counted.length);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex max-w-[19rem] items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
          : 'border-[var(--line)] bg-[var(--bg-raised)] hover:border-[var(--accent)]'
      } ${flipped ? 'flex-row-reverse text-right' : ''}`}
    >
      <ProgressRing ratio={ratio} done={done} label={level.level} />
      <span className="min-w-0">
        <span className="block font-display text-lg">{level.name}</span>
        <span className="block text-sm text-[var(--text-muted)]">
          {Math.round(ratio * 100)}%
          {isCurrent && ' · ваш уровень'}
          {isTarget && ' · цель'}
        </span>
      </span>
    </button>
  );
}

/** Кольцо прогресса с кодом ступени внутри. */
function ProgressRing({
  ratio,
  done,
  label,
}: {
  ratio: number;
  done: boolean;
  label: string;
}) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="relative grid size-14 shrink-0 place-items-center">
      <svg viewBox="0 0 52 52" className="absolute size-full -rotate-90">
        <circle cx="26" cy="26" r={radius} fill="var(--bg)" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke={done ? 'var(--accent)' : 'var(--accent)'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, ratio)))}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="relative font-display text-base font-bold">{label}</span>
    </span>
  );
}
