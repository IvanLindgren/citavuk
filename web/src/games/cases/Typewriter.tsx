import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LuCornerDownLeft, LuDelete } from 'react-icons/lu';

import { pawForKey, SERBIAN_LETTERS, TYPEWRITER_ROWS } from './keyboard';
import './typewriter.css';

export interface PrintedLine {
  id: number;
  before: string;
  typed: string;
  after: string;
  status: 'ok' | 'slip' | 'wrong';
  correct?: string;
  missing?: string[];
}

export interface KeyStrike {
  key: string;
  id: number;
}

/** Кончик пальца в долях рисунка лапы: им лапа попадает в клавишу. */
const FINGERTIP = { x: 0.5, y: 0.047 };

type PawState = { x: number; y: number; angle: number; press: boolean; resting: boolean };

export function Typewriter({
  lines,
  before,
  typed,
  after,
  strike,
  returning,
  onKey,
}: {
  lines: PrintedLine[];
  before: string;
  typed: string;
  after: string;
  strike: KeyStrike | null;
  /** Каретка возвращается — лист плавно едет вправо. */
  returning: boolean;
  onKey: (key: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const keyRefs = useRef(new Map<string, HTMLElement>());
  const [pressed, setPressed] = useState<string | null>(null);
  const [paws, setPaws] = useState<{ left: PawState; right: PawState } | null>(null);
  const timers = useRef<number[]>([]);

  // Положение покоя: лапы лежат на передней панели под пробелом.
  const restPositions = () => {
    const stage = stageRef.current;
    const space = keyRefs.current.get(' ');
    if (!stage || !space) return null;
    const box = stage.getBoundingClientRect();
    const spaceBox = space.getBoundingClientRect();
    // Кончики пальцев — на передней панели под пробелом.
    const y = spaceBox.bottom - box.top + spaceBox.height * 1.5;
    return {
      left: { x: box.width * 0.3, y, angle: 6, press: false, resting: true },
      right: { x: box.width * 0.7, y, angle: -6, press: false, resting: true },
    };
  };

  useLayoutEffect(() => {
    setPaws(restPositions());
    const onResize = () => setPaws(restPositions());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  useLayoutEffect(() => {
    if (!strike) return;
    const stage = stageRef.current;
    const target = keyRefs.current.get(strike.key);
    const rest = restPositions();
    if (!stage || !target || !rest) return;
    const box = stage.getBoundingClientRect();
    const keyBox = target.getBoundingClientRect();
    const x = keyBox.left - box.left + keyBox.width / 2;
    const y = keyBox.top - box.top + keyBox.height / 2;
    const side = strike.key === ' ' ? (Math.random() < 0.5 ? 'left' : 'right') : pawForKey(strike.key);
    const home = rest[side];
    // Лапа тянется наискосок — чуть наклоняем её в сторону клавиши.
    const angle = Math.max(-16, Math.min(16, (x - home.x) / 14));

    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setPressed(strike.key);
    setPaws((current) => ({
      ...(current ?? rest),
      [side]: { x, y: y + keyBox.height * 0.12, angle, press: true, resting: false },
    }));
    timers.current.push(
      window.setTimeout(() => {
        setPressed(null);
        setPaws((current) => current && {
          ...current,
          [side]: { x, y: y - keyBox.height * 0.35, angle, press: false, resting: false },
        });
      }, 110),
      window.setTimeout(() => setPaws(restPositions()), 900),
    );
  }, [strike]);

  const register = (key: string) => (element: HTMLElement | null) => {
    if (element) keyRefs.current.set(key, element);
    else keyRefs.current.delete(key);
  };

  const key = (letter: string) => (
    <button
      key={letter}
      ref={register(letter)}
      type="button"
      tabIndex={-1}
      aria-label={letter}
      className={['tw-key', SERBIAN_LETTERS.includes(letter) ? 'is-serbian' : '', pressed === letter ? 'is-pressed' : ''].join(' ')}
      onPointerDown={(event) => {
        event.preventDefault();
        onKey(letter);
      }}
    >
      <span className="tw-key-face">{letter.toLocaleUpperCase('sr')}</span>
    </button>
  );

  const lineLength = (before ? before.length + 1 : 0) + typed.length;

  return (
    <div ref={stageRef} className="tw-stage">
      <div className="tw-paper-window" aria-live="polite">
        <div
          className={['tw-paper', returning ? 'is-returning' : ''].join(' ')}
          style={{ transform: `translateX(calc(-3ch - ${lineLength}ch))` }}
        >
          {/* Блок пересоздаётся на каждой новой строке и целиком въезжает
              снизу: лист поднимается на строку, как при переводе каретки. */}
          <div key={lines.length} className="tw-line-feed">
            {lines.slice(-8).map((line) => (
              <span key={line.id} className="tw-line">
                <PrintedText line={line} />
              </span>
            ))}
            <span className="tw-line">
              {before && `${before} `}
              {typed}
              <span className="tw-caret" aria-hidden="true" />
              {after && <span className="tw-ink-faint">{after.startsWith('!') || after.startsWith('.') ? after : ` ${after}`}</span>}
            </span>
          </div>
        </div>
        <span className="tw-guide" aria-hidden="true" />
      </div>

      <div className="tw-platen">
        <span className="tw-bail" aria-hidden="true" />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Возврат каретки: напечатать ответ"
          className={['tw-lever', returning ? 'is-pulled' : ''].join(' ')}
          onPointerDown={(event) => {
            event.preventDefault();
            onKey('enter');
          }}
        />
      </div>

      <div className="tw-body">
        <div className="tw-basket" aria-hidden="true" />
        <div className="tw-decal" aria-hidden="true">
          Čitavuk
          <small>pisaća mašina</small>
        </div>
        {TYPEWRITER_ROWS.map((row, index) => (
          <div key={index} className={`tw-row tw-row-${index + 1}`}>
            {row.map(key)}
            {index === 2 && (
              <IconKey refKey="enter" register={register} pressed={pressed} label="Напечатать ответ" onKey={onKey}>
                <LuCornerDownLeft aria-hidden="true" />
              </IconKey>
            )}
          </div>
        ))}
        <div className="tw-space-row">
          <button
            ref={register(' ')}
            type="button"
            tabIndex={-1}
            aria-label="Пробел"
            className={['tw-space', pressed === ' ' ? 'is-pressed' : ''].join(' ')}
            onPointerDown={(event) => {
              event.preventDefault();
              onKey(' ');
            }}
          />
          {/* «Стереть» у пробела, а не в первом ряду: так верхний ряд короче
              и клавиши на телефоне крупнее. */}
          <IconKey refKey="backspace" register={register} pressed={pressed} label="Стереть букву" onKey={onKey}>
            <LuDelete aria-hidden="true" />
          </IconKey>
        </div>
      </div>

      {paws && (
        <>
          <Paw state={paws.left} side="left" />
          <Paw state={paws.right} side="right" />
        </>
      )}
    </div>
  );
}

function IconKey({
  refKey,
  register,
  pressed,
  label,
  onKey,
  children,
}: {
  refKey: string;
  register: (key: string) => (element: HTMLElement | null) => void;
  pressed: string | null;
  label: string;
  onKey: (key: string) => void;
  children: ReactNode;
}) {
  return (
    <button
      ref={register(refKey)}
      type="button"
      tabIndex={-1}
      aria-label={label}
      className={['tw-key', pressed === refKey ? 'is-pressed' : ''].join(' ')}
      onPointerDown={(event) => {
        event.preventDefault();
        onKey(refKey);
      }}
    >
      <span className="tw-key-face">{children}</span>
    </button>
  );
}

function PrintedText({ line }: { line: PrintedLine }) {
  const lead = line.before ? `${line.before} ` : '';
  const tail = line.after ? (line.after.startsWith('!') || line.after.startsWith('.') ? line.after : ` ${line.after}`) : '';
  if (line.status === 'wrong') {
    return (
      <>
        {lead}
        {line.typed && <><span className="tw-ink-struck">{line.typed}</span>{' '}</>}
        <span className="tw-ink-red">{line.correct}</span>
        {tail}
      </>
    );
  }
  if (line.status === 'slip') {
    return (
      <>
        {lead}
        <span className="tw-slip">{line.typed}</span>
        {tail}
        <span className="tw-margin-note">{`нужна ${line.missing?.join(', ')}`}</span>
      </>
    );
  }
  return (
    <>
      {lead}
      {line.typed}
      {tail}
    </>
  );
}

/**
 * Лапа Читавука: серый мех, светлые пальцы и рукав вышитой рубахи — как у
 * маскота. Рисунок длинный: нижняя часть уходит за край сцены, поэтому, когда
 * лапа тянется к верхнему ряду, открывается рука, а не обрубок.
 */
function Paw({ state, side }: { state: PawState; side: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const x = state.x - size.width * FINGERTIP.x;
  const y = state.y - size.height * FINGERTIP.y;
  const squash = state.press ? ' scale(0.94, 0.9)' : '';
  const mirror = side === 'right' ? ' scaleX(-1)' : '';

  return (
    <div
      ref={ref}
      className={['tw-paw', state.resting ? 'is-resting' : ''].join(' ')}
      style={{ transform: `translate(${x}px, ${y}px) rotate(${state.angle}deg)${mirror}${squash}` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 360" width="100%" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`fur-${side}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#6b6e79" />
            <stop offset="0.5" stopColor="#9da1ac" />
            <stop offset="1" stopColor="#686b76" />
          </linearGradient>
          <linearGradient id={`sleeve-${side}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#ded6c5" />
            <stop offset="0.5" stopColor="#fdfaf3" />
            <stop offset="1" stopColor="#d8cfbd" />
          </linearGradient>
        </defs>
        {/* Рукав вышитой рубахи: ближе к зрителю — шире */}
        <path d="M13 214 Q6 290 0 360 L120 360 Q114 290 107 214 Z" fill={`url(#sleeve-${side})`} stroke="#2e2a2f" strokeWidth="3.5" />
        <path d="M11 236 L109 236" stroke="#b3261e" strokeWidth="6" />
        <path d="M11 250 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l6 8" fill="none" stroke="#b3261e" strokeWidth="3" strokeLinejoin="round" />
        <path d="M10 258 L110 258" stroke="#2e2a2f" strokeWidth="2.2" />
        {[28, 50, 72, 94].map((cx) => (
          <path key={cx} d={`M${cx - 5} 270 l10 10 M${cx + 5} 270 l-10 10`} stroke="#b3261e" strokeWidth="2.6" strokeLinecap="round" />
        ))}
        {/* Кружевной край рукава */}
        <path d="M13 214 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0" fill="#fdfaf3" stroke="#2e2a2f" strokeWidth="2.5" strokeLinejoin="round" />
        {/* Предплечье в меху */}
        <path d="M27 92 Q20 160 17 216 L103 216 Q100 160 93 92 Z" fill={`url(#fur-${side})`} stroke="#2e2a2f" strokeWidth="3.5" />
        <path d="M60 104 Q57 160 58 206" fill="none" stroke="#c4c7cf" strokeWidth="7" strokeLinecap="round" opacity="0.55" />
        <path d="M24 140 q-6 4 -3 10 M96 150 q6 4 3 10 M22 180 q-6 5 -2 11" fill="none" stroke="#c4c7cf" strokeWidth="3" strokeLinecap="round" />
        {/* Пушистая манжета меха на запястье */}
        <path d="M22 96 q7 -9 14 0 q7 -9 14 0 q7 -9 14 0 q7 -9 14 0 q7 -9 14 0 q6 -8 12 0 L96 106 Q60 116 24 106 Z" fill="#b9bcc5" stroke="#2e2a2f" strokeWidth="3" strokeLinejoin="round" />
        {/* Ладонь сверху, пальцы — к клавишам */}
        <ellipse cx="60" cy="60" rx="45" ry="38" fill="#a8acb6" stroke="#2e2a2f" strokeWidth="3.5" />
        {[
          [27, 30, 14],
          [48, 17, 15],
          [72, 17, 15],
          [93, 30, 14],
        ].map(([cx, cy, r]) => (
          <g key={cx}>
            <circle cx={cx} cy={cy} r={r} fill="#c9ccd4" stroke="#2e2a2f" strokeWidth="3.5" />
            <ellipse cx={cx} cy={cy! + 2} rx={r! * 0.45} ry={r! * 0.38} fill="#e9b7bd" opacity="0.9" />
            <path d={`M${cx! - 3.5} ${cy! - r! + 1} q3.5 -7 7 0`} fill="#f4f1ec" stroke="#2e2a2f" strokeWidth="2" strokeLinejoin="round" />
          </g>
        ))}
        <path d="M40 72 q20 12 40 0" fill="none" stroke="#7e828d" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
