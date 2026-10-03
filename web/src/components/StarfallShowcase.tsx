import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LuArrowRight, LuSparkles } from 'react-icons/lu';

import { getSupportShowcase, type SupportShowcase as Showcase } from '../api/donations';
import { t } from '../lib/i18n';
import { Link } from '../lib/router';
import { PERKS, SUPPORTER_THRESHOLD } from '../lib/supportPerks';
import './starfall.css';

/** Размер арта. Все координаты сцены — в процентах от него, а не от рамки. */
const ART_W = 1536;
const ART_H = 1024;

/** Нарисованные на арте звёзды: поверх каждой загорается живая искра. */
const PAINTED_STARS: Array<[x: number, y: number, size: number]> = [
  [59, 12.5, 1.6], [48, 16.5, 1.3], [70, 19.5, 1.1], [79, 6.5, 1], [94.5, 8.5, 1],
  [49.5, 30, 0.9], [39.5, 37.5, 1.2], [76, 29.5, 0.9], [45.5, 47, 0.9], [84.5, 49, 0.8],
  [55.5, 24.2, 0.5], [90.5, 30.2, 0.5], [83.5, 34.4, 0.5], [92.5, 44.5, 0.5], [95, 24, 0.5],
];

/**
 * Где на небе может зажечься имя. Подобраны по свободному небу: не на кроне,
 * не на луне и не на голове Читавука. Имя растёт вправо от своей звезды.
 */
const SLOTS: Array<[x: number, y: number]> = [
  [45, 8], [63, 5.5], [51.5, 20], [66, 25], [44, 31], [84, 34], [85, 45], [36, 47], [41, 41.5], [71, 12],
];

/** Глаза Читавука: в них отражается каждое новое имя. */
const EYES: Array<[x: number, y: number]> = [[61.2, 49.2], [65.9, 51.6]];

const MAX_SHOWN = 5;
/** Сколько места справа от звезды нужно имени, в пикселях. */
const NAME_SPAN_PX = 175;
const SPAWN_EVERY_MS = 2600;
const LIFETIME_MS = 9000;

type Focus = { x: number; y: number };
type Lit = { id: number; name: string; slot: number; fading: boolean; streak: boolean; spotlight: boolean };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function shortName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  return clean.length > 22 ? `${clean.slice(0, 21)}…` : clean;
}

/**
 * Арт растягивается как object-fit: cover, но координаты нужны точные: имя
 * должно гореть на небе, а не на дереве. Поэтому «сцену» размером с арт
 * считаем сами и заодно узнаём, какая часть неба сейчас в кадре.
 */
function useStage(frame: React.RefObject<HTMLDivElement | null>, focus: Focus) {
  const [box, setBox] = useState({ w: ART_W, h: ART_H, left: 0, top: 0, fw: ART_W, fh: ART_H });
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const fw = el.clientWidth;
      const fh = el.clientHeight;
      if (!fw || !fh) return;
      const scale = Math.max(fw / ART_W, fh / ART_H) * 1.03;
      const w = ART_W * scale;
      const h = ART_H * scale;
      setBox({ w, h, left: (fw - w) * focus.x, top: (fh - h) * focus.y, fw, fh });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame, focus.x, focus.y]);
  return box;
}

function useAwake(target: React.RefObject<HTMLElement | null>) {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setAwake(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setAwake(true); observer.disconnect(); }
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);
  return awake;
}

function useFocus(): Focus {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow ? { x: 0.62, y: 0.42 } : { x: 0.5, y: 0.42 };
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Звезда у имени: пухлая, со скруглёнными лучами — в манере самого арта. */
function NameStar() {
  const id = useId();
  return (
    <svg className="sf-name-star" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="50%" cy="46%" r="58%">
          <stop offset="0" stopColor="#fffdf0" />
          <stop offset="0.55" stopColor="#fbe7a4" />
          <stop offset="1" stopColor="#f2c868" />
        </radialGradient>
      </defs>
      <path
        d="M12 3.2Q14.7 9.3 20.8 12 14.7 14.7 12 20.8 9.3 14.7 3.2 12 9.3 9.3 12 3.2Z"
        fill={`url(#${id})`} stroke="#dca04a" strokeWidth="2.4" strokeLinejoin="round" paintOrder="stroke"
      />
      <ellipse cx="10.3" cy="10" rx="1.6" ry="1" fill="#fff" opacity="0.8" transform="rotate(-35 10.3 10)" />
    </svg>
  );
}

/** Небо, где загораются и гаснут имена друзей. */
function useNightSky(names: string[], spotlight: string | null, awake: boolean, freeSlots: number[]) {
  const [lit, setLit] = useState<Lit[]>([]);
  const [glint, setGlint] = useState(0);
  const queue = useRef<string[]>([]);
  const nextId = useRef(1);
  const slotsRef = useRef(freeSlots);
  slotsRef.current = freeSlots;

  useEffect(() => {
    if (!awake || names.length === 0) return;
    const pool = names.filter(n => n !== spotlight);
    const refill = () => { queue.current = shuffle(pool); };
    refill();

    const spawn = (current: Lit[]) => {
      const used = new Set(current.map(l => l.slot));
      const free = slotsRef.current.filter(s => !used.has(s));
      if (free.length === 0) return current;
      if (queue.current.length === 0) refill();
      const shown = new Set(current.map(l => l.name));
      let name = queue.current.shift();
      if (name && shown.has(name) && pool.length > current.length) name = queue.current.shift() ?? name;
      if (!name || shown.has(name)) return current;
      setGlint(g => g + 1);
      return [...current, {
        id: nextId.current++,
        name,
        slot: free[Math.floor(Math.random() * free.length)]!,
        fading: false,
        streak: Math.random() < 0.55,
        spotlight: false,
      }];
    };

    if (reducedMotion()) {
      let still: Lit[] = [];
      for (let i = 0; i < Math.min(MAX_SHOWN, pool.length); i++) still = spawn(still);
      setLit(still);
      return;
    }

    const born = new Map<number, number>();
    const tick = () => {
      setLit(current => {
        const now = Date.now();
        let next = current.filter(l => !(l.fading && now - (born.get(l.id) ?? now) > LIFETIME_MS + 1600));
        const alive = next.filter(l => !l.fading);
        const oldest = alive.find(l => now - (born.get(l.id) ?? now) > LIFETIME_MS);
        if (oldest) next = next.map(l => (l.id === oldest.id ? { ...l, fading: true } : l));
        if (next.filter(l => !l.fading).length < Math.min(MAX_SHOWN, pool.length)) {
          const before = nextId.current;
          next = spawn(next);
          if (nextId.current !== before) born.set(nextId.current - 1, now);
        }
        return next;
      });
    };
    const first = window.setTimeout(tick, 2300);
    const timer = window.setInterval(tick, SPAWN_EVERY_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [awake, names, spotlight]);

  return { lit, glint };
}

export function StarfallShowcase() {
  const [data, setData] = useState<Showcase | null>(null);
  const section = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const focus = useFocus();
  const stage = useStage(frame, focus);
  const awake = useAwake(section);

  useEffect(() => {
    let alive = true;
    getSupportShowcase().then(d => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const names = useMemo(() => [...new Set((data?.supporters ?? []).map(s => shortName(s.name)).filter(Boolean))], [data]);
  const spotlight = data?.spotlight ? shortName(data.spotlight.name) : null;

  // В кадре на телефоне только середина неба: имя за краем никто не увидит.
  const freeSlots = useMemo(() => {
    return SLOTS.map((_, i) => i).filter(i => {
      const [x, y] = SLOTS[i]!;
      const px = stage.left + (x / 100) * stage.w;
      const py = stage.top + (y / 100) * stage.h;
      // На широком экране слева текст: имя под ним читалось бы как часть заголовка.
      const minX = stage.fw >= 768 ? stage.fw * 0.44 : 12;
      return px > minX && px + NAME_SPAN_PX < stage.fw && py > 18 && py < stage.fh - 18 && !(spotlight && i === 0);
    });
  }, [stage, spotlight]);

  const { lit, glint } = useNightSky(names, spotlight, awake, freeSlots);

  // Лёгкий параллакс от курсора: слои неба смещаются по-разному.
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || reducedMotion()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--px', (((event.clientX - rect.left) / rect.width) * 2 - 1).toFixed(3));
    event.currentTarget.style.setProperty('--py', (((event.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
  };

  const at = (x: number, y: number): CSSProperties => ({ left: `${x}%`, top: `${y}%` });
  const slotAt = (i: number) => { const [x, y] = SLOTS[i] ?? [50, 20]; return at(x, y); };
  const heading = t('Каждая звезда здесь — друг Читавука');

  return (
    <section ref={section} aria-label="Друзья Читавука" className={`px-5 py-10 sm:py-14 ${awake ? 'sf-awake' : ''}`}>
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-gold/40 bg-[var(--bg-raised)] shadow-[var(--shadow-soft)]">
        <div className="sf-scene" onPointerMove={onPointerMove} onPointerLeave={e => { e.currentTarget.style.setProperty('--px', '0'); e.currentTarget.style.setProperty('--py', '0'); }}>
        <div ref={frame} className="sf-frame">
          <div className="sf-stage" style={{ width: stage.w, height: stage.h, left: stage.left, top: stage.top }} aria-hidden="true">
            <picture className="sf-layer sf-art">
              <source media="(max-width: 767px)" srcSet="/img/citavuk-night-900.webp" />
              <img src="/img/citavuk-night.webp" alt="" width={ART_W} height={ART_H} loading="lazy" decoding="async" />
            </picture>

            <div className="sf-layer sf-near">
              <span className="sf-moon" />
              {PAINTED_STARS.map(([x, y, size], i) => (
                <span key={i} className="sf-spark" style={{ ...at(x, y), '--s': size, '--i': i, '--tw': `${3 + ((i * 7) % 5)}s` } as CSSProperties} />
              ))}
              {EYES.map(([x, y], i) => <span key={`${glint}-${i}`} className={`sf-glint ${glint ? 'is-on' : ''}`} style={at(x, y)} />)}
              <span className="sf-mist sf-mist-a" />
              <span className="sf-mist sf-mist-b" />
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="sf-firefly" style={{ ...at(8 + ((i * 37) % 86), 70 + ((i * 13) % 24)), '--i': i } as CSSProperties} />
              ))}
            </div>

            <div className="sf-layer sf-far">
              <span className="sf-anchor" style={at(44, 26)}><span className="sf-comet sf-comet-intro" /></span>
              {spotlight && (
                <span className="sf-name is-spotlight" style={slotAt(0)}>
                  <NameStar />{spotlight}
                </span>
              )}
              {lit.map(l => (
                <span key={l.id} className={`sf-name ${l.fading ? 'is-fading' : ''} ${l.streak ? 'has-streak' : ''}`} style={slotAt(l.slot)}>
                  {l.streak && <span className="sf-comet" />}
                  <NameStar />{l.name}
                </span>
              ))}
            </div>
            <div className="sf-veil" />
          </div>

          <div className="sf-scrim" />
        </div>
          <div className="sf-copy">
            <h2 className="sf-title">
              {heading.split(' ').map((word, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{word}</span>)}
            </h2>
            <p className="sf-lead">
              Я делаю Читавук один и хочу, чтобы учить сербский было проще и интереснее
            </p>
            <p className="sf-lead">
              Твоя поддержка помогает оплачивать сервер, перевод и озвучку, исправлять ошибки и выпускать новые возможности
            </p>
            {data?.spotlight?.message && (
              <figure className="sf-quote">
                <blockquote>«{data.spotlight.message}»</blockquote>
                <figcaption>— {data.spotlight.name}</figcaption>
              </figure>
            )}
            <div className="sf-actions">
              <Link to="/support" className="sf-cta">Поддержать Читавук</Link>
              <Link to="/supporters" className="sf-more">Все друзья<LuArrowRight aria-hidden="true" /></Link>
            </div>
          </div>
          <p className="sr-only">
            {names.length > 0 ? `Друзья Читавука: ${names.slice(0, 20).join(', ')}.` : ''}
          </p>
        </div>

        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center">
          <div className="sf-shots">
            <figure className="sf-shot sf-shot-a">
              <img src="/img/friends-padezi.webp" alt="Игра «Уничтожь эти падежи»: печатная машинка Читавука" width={720} height={529} loading="lazy" decoding="async" />
              <figcaption>Уничтожь эти падежи</figcaption>
            </figure>
            <figure className="sf-shot sf-shot-b">
              <img src="/img/friends-govori.webp" alt="Игра «Говори!»: автомат тем с Читавуком-фокусником" width={720} height={395} loading="lazy" decoding="async" />
              <figcaption>Говори!</figcaption>
            </figure>
          </div>
          <div>
            <h3 className="font-display text-2xl">Что открывается друзьям</h3>
            <ul className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {PERKS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
                  <div>
                    <p className="font-semibold leading-snug">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 sm:p-5">
              <LuSparkles aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-gold" />
              <p className="text-sm leading-relaxed">
                За {SUPPORTER_THRESHOLD} рублей вы навсегда получаете статус друга Читавука, значок в профиле и доступ к закрытой библиотеке
                <span className="mt-2 block text-[var(--text-muted)]">А ещё можете править страницы книг и пробовать новые игры раньше остальных</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
