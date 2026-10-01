/**
 * Игровой автомат тем: общая сцена для сайта и приложения (там она живёт в
 * WebView). Три барабана — два со значками жанра по бокам и широкий с
 * названиями тем в центре; рычаг справа, неоновая вывеска и бегущая строка.
 * Рядом Читавук-фокусник: на каждом вращении показывает фокус с автоматом
 * (slotWolf.ts — рисунок, slotMagic.ts — сценарий).
 *
 * Тему выбирает экран до вращения: сцена только красиво доводит барабаны до
 * неё. Время полностью от часов, а не от кадров. Пока ничего не происходит,
 * автомат тихо переливается огнями, но только если он на экране, вкладка
 * видна и человек не просил убрать анимацию.
 */
import type { SlotAssets, SlotFontSource } from './slotAssets';
import {
  clearTextCaches,
  drawBloom,
  drawBubble,
  drawBulbs,
  drawCabinet,
  drawFront,
  drawGlass,
  drawGlint,
  drawLever,
  drawParticles,
  drawPayline,
  drawRays,
  drawReel,
  drawRim,
  drawSmoke,
  drawSign,
  drawTicker,
  drawTwinkles,
  drawZap,
  leverKnob,
  leverTravel,
  makeBulbSprites,
  makeSignSprites,
  slotLayout,
  tickerBitmap,
  type BulbColor,
  type BulbSprites,
  type SignSprites,
  type SlotCell,
  type SlotLayout,
  type Twinkle,
} from './slotDraw';
import { ParticleField } from './slotFx';
import { PULL_MS, ZAP_AT, magicPose, type MagicOutput } from './slotMagic';
import {
  WOLF_BOXES,
  WOLF_PARTS,
  WOLF_PART_SCALE,
  WOLF_REST,
  aim,
  drawWolf,
  wolfFrames,
  type WolfFrames,
  type WolfPart,
  type WolfSprites,
} from './slotWolf';
import {
  LEVER_HOLD_MS,
  LEVER_PULL_MS,
  LEVER_RETURN_MS,
  LEVER_TRIGGER,
  REEL_DELAY_MS,
  REEL_IDS,
  REEL_STOP_MS,
  REEL_TRAVEL,
  SLOT_SPIN_MS,
  STRIP_LENGTH,
  bulbLevel,
  buildStrip,
  leverAuto,
  leverReturn,
  mod,
  reelPosition,
  reelSpeed,
  slotLayoutOfCanvas,
  slotStop,
  type ReelId,
  type ReelRun,
} from './slotMath';

export interface SlotGenre { id: string; ru: string; art?: string }
export interface SlotTopic { id: string; genre: string; ru: string }
export type SlotSoundKind = 'pull' | 'release' | 'tick' | 'stop' | 'coin' | 'win' | 'zap' | 'magic';

export interface SlotCallbacks {
  /** Тема выпала и анимация дошла до конца. */
  landed(): void;
  /** Игрок дёрнул рычаг рукой — экран должен выбрать тему и вызвать spin. */
  pull(): void;
  failed(): void;
  sound?(kind: SlotSoundKind, detail?: number): void;
}

export interface SlotScene {
  setData(genres: SlotGenre[], topics: SlotTopic[]): void;
  setTitle(title: string): void;
  spin(topic: SlotTopic, reduced: boolean): void;
  dispose(): void;
}

interface ReelState {
  cells: SlotCell[];
  pos: number;
  speed: number;
  run: ReelRun | null;
  cell: number;
  stopped: boolean;
  /** Когда барабан встал — для вспышки и толчка корпуса. */
  stoppedAt: number;
}

type LeverMode = 'rest' | 'drag' | 'held' | 'auto' | 'return';

const HINT_TOPIC: SlotCell = { id: '__hint', label: 'Потяни рычаг!', hint: true };
const HINT_GENRE: SlotCell = { id: '__hint', label: '?', hint: true };
/** Значок для жанра без рисунка — тот же пузырь, что и на сайте. */
const FALLBACK_ART = '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>';
/** Сколько после выпадения темы продолжается праздник. */
const WIN_FX_MS = 3600;
/** Сколько длится «включение» автомата: неон мигает, лампочки загораются по кругу. */
const INTRO_MS = 1500;
/** В покое кадр не чаще, чем раз в столько миллисекунд. */
const IDLE_FRAME_MS = 32;

const cellKey = (cell: SlotCell) => cell.id;
const topicCell = (topic: SlotTopic): SlotCell => ({ id: topic.id, label: topic.ru });
const genreCell = (genre: SlotGenre): SlotCell => ({ id: genre.id, label: genre.ru });
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const blankReel = (): ReelState => ({ cells: [], pos: 0, speed: 0, run: null, cell: 0, stopped: true, stoppedAt: -1e9 });
/** Детерминированный «шум» для мерцания неона: одинаковый на каждом кадре одного окна. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const fontLoads = new Map<string, Promise<void>>();
function loadFonts(list: readonly SlotFontSource[]): Promise<void> {
  if (typeof FontFace !== 'function' || !document.fonts) return Promise.resolve();
  return Promise.allSettled(
    list.map((font) => {
      const key = `${font.family}|${font.url}`;
      let job = fontLoads.get(key);
      if (!job) {
        const face = new FontFace(font.family, `url("${font.url}")`, {
          unicodeRange: font.unicodeRange ?? 'U+0-10FFFF',
          weight: font.weight ?? '400',
          display: 'block',
        });
        job = face.load().then((loaded) => {
          document.fonts.add(loaded);
        });
        fontLoads.set(key, job);
      }
      return job;
    }),
  ).then(() => undefined);
}

export function createSlotScene(canvas: HTMLCanvasElement, callbacks: SlotCallbacks, assets: SlotAssets): SlotScene {
  const ctx = canvas.getContext('2d');
  const host = canvas.parentElement;
  if (!ctx || !host) throw new Error('Canvas 2D недоступен');
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  let genres: SlotGenre[] = [];
  let topics: SlotTopic[] = [];
  let title = 'Говори!';
  const art = new Map<string, string>();
  const reels: Record<ReelId, ReelState> = { left: blankReel(), right: blankReel(), center: blankReel() };
  const fx = new ParticleField();
  const twinkles: Twinkle[] = [];

  let layout: SlotLayout = slotLayout('wide');
  let dpr = 1;
  let pixelsPerUnit = 1;
  let cssScale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let cabinet: HTMLCanvasElement | null = null;
  let glass: HTMLCanvasElement | null = null;
  let front: HTMLCanvasElement | null = null;
  let bulbs: BulbSprites | null = null;
  let sign: SignSprites | null = null;

  let spinning = false;
  let everSpun = false;
  let spinStart = 0;
  let won = false;
  let winAt = 0;
  let wonGenre = '';
  let landedFired = false;
  let coinsDropped = 0;
  const createdAt = performance.now();
  let lastNow = createdAt;
  let lastDraw = 0;
  let rayAngle = 0;
  let nextTwinkle = 0;
  let knocks: { at: number; amp: number }[] = [];
  let reducedNow = false;
  const reducedPref = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const calm = () => reducedPref || reducedNow;

  let leverMode: LeverMode = 'rest';
  let leverValue = 0;
  let leverFrom = 0;
  let leverStart = 0;
  let leverReleased = false;
  let leverBottomed = false;
  let pullPending = false;
  let pullTimer = 0;
  let hover = false;
  let drag: { id: number; startY: number; moved: number } | null = null;

  let raf = 0;
  let onScreen = true;
  let disposed = false;

  // Детали Читавука: SVG грузятся один раз и растеризуются под текущий масштаб.
  const wolfImages: Partial<Record<WolfPart, HTMLImageElement>> = {};
  const wolfSprites: WolfSprites = {};
  let wolfKey = '';
  for (const part of WOLF_PARTS) {
    const src = assets.wolf[part];
    if (!src) continue;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (disposed) return;
      wolfImages[part] = img;
      wolfKey = '';
      kick();
    };
    img.src = src;
  }
  const rasterWolf = () => {
    const key = `${pixelsPerUnit}|${layout.kind}|${Object.keys(wolfImages).length}`;
    if (key === wolfKey) return;
    wolfKey = key;
    for (const part of WOLF_PARTS) {
      const img = wolfImages[part];
      if (!img) continue;
      const box = WOLF_BOXES[part];
      const k = pixelsPerUnit * layout.wolf.scale * WOLF_PART_SCALE[part];
      const bitmap = document.createElement('canvas');
      bitmap.width = Math.max(1, Math.ceil(box.w * k));
      bitmap.height = Math.max(1, Math.ceil(box.h * k));
      bitmap.getContext('2d')?.drawImage(img, 0, 0, bitmap.width, bitmap.height);
      wolfSprites[part] = bitmap;
    }
  };
  let magic: MagicOutput = { pose: WOLF_REST, glow: 0, trail: false, bubble: null };
  let frames: WolfFrames | null = null;
  let zaps: { from: { x: number; y: number }; to: { x: number; y: number }; at: number; seed: number }[] = [];
  let fired = { magic: false, left: false, right: false, center: false };
  let lastTrail = 0;

  const icons = new Map<string, HTMLCanvasElement | null>();
  const iconFor = (id: string): HTMLCanvasElement | null => {
    if (icons.has(id)) return icons.get(id)!;
    icons.set(id, null);
    // Разметку значка отдаёт сервер и проверяет (`speaking.validArt`): простые фигуры без скриптов.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 24 24" fill="none" stroke="#5a1814" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${art.get(id) || FALLBACK_ART}</svg>`;
    const img = new Image();
    img.onload = () => {
      if (disposed) return;
      const bitmap = document.createElement('canvas');
      bitmap.width = bitmap.height = 160;
      bitmap.getContext('2d')?.drawImage(img, 0, 0, 160, 160);
      icons.set(id, bitmap);
      kick();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return null;
  };

  const genreOf = (id: string): SlotGenre => genres.find((genre) => genre.id === id) ?? { id, ru: id };
  const topicPool = (): SlotCell[] => (topics.length ? topics.map(topicCell) : [HINT_TOPIC]);
  const genrePool = (): SlotCell[] => (genres.length ? genres.map(genreCell) : [HINT_GENRE]);
  const motto = () => `${title.replace(/[!?.]+$/, '').toUpperCase()} ПО-СЕРБСКИ!`;

  /** Покой: барабаны стоят на подсказке «Потяни рычаг!», рядом — случайные темы и жанры. */
  const ensureIdle = () => {
    if (reels.center.cells.length) return;
    reels.center.cells = buildStrip(topicPool(), cellKey, STRIP_LENGTH.center, new Map([[0, HINT_TOPIC]]));
    for (const id of ['left', 'right'] as const) {
      reels[id].cells = buildStrip(genrePool(), cellKey, STRIP_LENGTH[id], new Map([[0, HINT_GENRE]]));
    }
  };

  // ——— Слои и размер ———

  const layer = (paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement => {
    const bitmap = document.createElement('canvas');
    bitmap.width = Math.max(1, Math.round(layout.w * pixelsPerUnit));
    bitmap.height = Math.max(1, Math.round(layout.h * pixelsPerUnit));
    const g = bitmap.getContext('2d')!;
    g.scale(bitmap.width / layout.w, bitmap.height / layout.h);
    paint(g);
    return bitmap;
  };
  const rebuildLayers = () => {
    cabinet = layer((g) => drawCabinet(g, layout));
    glass = layer((g) => drawGlass(g, layout));
    front = layer((g) => drawFront(g, layout));
    bulbs = makeBulbSprites(layout, pixelsPerUnit);
    sign = makeSignSprites(layout, title, pixelsPerUnit);
  };

  const zone = document.createElement('div');
  zone.setAttribute('aria-hidden', 'true');
  zone.style.cssText = 'position:absolute;touch-action:none;cursor:grab;-webkit-tap-highlight-color:transparent;user-select:none;';
  host.appendChild(zone);
  const placeZone = () => {
    const z = layout.lever.zone;
    zone.style.left = `${canvas.offsetLeft + offsetX / dpr + z.x * cssScale}px`;
    zone.style.top = `${canvas.offsetTop + offsetY / dpr + z.y * cssScale}px`;
    zone.style.width = `${z.w * cssScale}px`;
    zone.style.height = `${z.h * cssScale}px`;
  };

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    layout = slotLayout(slotLayoutOfCanvas(w, h));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    cssScale = Math.min(w / layout.w, h / layout.h);
    pixelsPerUnit = cssScale * dpr;
    offsetX = ((w - layout.w * cssScale) / 2) * dpr;
    offsetY = ((h - layout.h * cssScale) / 2) * dpr;
    rebuildLayers();
    placeZone();
    kick();
  };

  // ——— Рычаг ———

  const startReturn = () => {
    leverMode = 'return';
    leverFrom = leverValue;
    leverStart = performance.now();
    leverReleased = true;
    kick();
  };

  const triggerPull = (kind: 'held' | 'auto') => {
    pullPending = true;
    if (kind === 'auto') {
      leverMode = 'auto';
      leverStart = performance.now();
      leverReleased = false;
      callbacks.sound?.('pull');
    } else leverMode = 'held';
    callbacks.pull();
    // Экран не откликнулся (уже идёт игра) — рычаг возвращается сам.
    window.clearTimeout(pullTimer);
    pullTimer = window.setTimeout(() => {
      if (!pullPending) return;
      pullPending = false;
      if (leverMode === 'held') startReturn();
    }, 700);
    kick();
  };

  zone.addEventListener('pointerdown', (event) => {
    if (spinning || pullPending || disposed || event.button > 0) return;
    event.preventDefault();
    zone.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, startY: event.clientY, moved: 0 };
    leverMode = 'drag';
    leverValue = 0;
    zone.style.cursor = 'grabbing';
    kick();
  });
  zone.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { restY, downY } = leverTravel(layout);
    const travel = Math.max(40, (downY - restY) * cssScale * 0.75);
    const dy = event.clientY - drag.startY;
    drag.moved = Math.max(drag.moved, Math.abs(dy));
    leverValue = clamp01(dy / travel);
    kick();
  });
  const release = (event: PointerEvent, cancelled: boolean) => {
    if (!drag || event.pointerId !== drag.id) return;
    const finished = drag;
    drag = null;
    zone.style.cursor = 'grab';
    if (cancelled) startReturn();
    else if (leverValue >= LEVER_TRIGGER) triggerPull('held');
    else if (finished.moved < 8) triggerPull('auto');
    else startReturn();
  };
  zone.addEventListener('pointerup', (event) => release(event, false));
  zone.addEventListener('pointercancel', (event) => release(event, true));
  zone.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') {
      hover = true;
      kick();
    }
  });
  zone.addEventListener('pointerleave', () => {
    hover = false;
    kick();
  });

  // ——— Цикл кадров ———

  const sinceWin = (now: number) => (won ? now - winAt : -1);
  const celebrating = (now: number) => won && !calm() && now - winAt < WIN_FX_MS;
  const intro = (now: number) => !calm() && now - createdAt < INTRO_MS;
  const busy = (now: number) => spinning || leverMode !== 'rest' || fx.alive || celebrating(now) || intro(now);
  const idleAnimated = () => !calm() && onScreen;

  function kick() {
    if (disposed || document.hidden || raf) return;
    raf = requestAnimationFrame(frame);
  }

  function frame(now: number) {
    raf = 0;
    if (disposed || document.hidden) return;
    const hot = busy(now);
    // В покое достаточно ~30 кадров в секунду: строка бежит, огни переливаются.
    if (hot || now - lastDraw >= IDLE_FRAME_MS || !lastDraw) {
      update(now);
      draw(now);
      lastDraw = now;
    }
    if (hot || idleAnimated()) raf = requestAnimationFrame(frame);
  }

  function knock(now: number, amp: number) {
    if (!calm()) knocks.push({ at: now, amp });
  }

  function update(now: number) {
    const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    const L = layout;
    const scale = L.kind === 'wide' ? 1 : 0.72;

    if (leverMode === 'auto') {
      const t = now - leverStart;
      leverValue = leverAuto(t);
      if (!leverReleased && t >= LEVER_PULL_MS + LEVER_HOLD_MS) {
        leverReleased = true;
        callbacks.sound?.('release');
      }
      if (t >= LEVER_PULL_MS + LEVER_HOLD_MS + LEVER_RETURN_MS) {
        leverMode = 'rest';
        leverValue = 0;
      }
    } else if (leverMode === 'return') {
      const s = now - leverStart;
      leverValue = leverReturn(leverFrom, s);
      if (s >= LEVER_RETURN_MS) {
        leverMode = 'rest';
        leverValue = 0;
      }
    }
    // Рычаг ударился об упор: искры и толчок корпуса.
    if (leverValue >= 0.97 && !leverBottomed) {
      leverBottomed = true;
      if (!calm()) {
        const k = leverKnob(L, leverValue);
        fx.sparks(k.x, k.y + L.lever.knob, scale, 12);
        knock(now, 3);
      }
    } else if (leverValue < 0.5) leverBottomed = false;

    if (spinning) {
      const elapsed = now - spinStart;
      const t = elapsed - REEL_DELAY_MS;
      REEL_IDS.forEach((id, order) => {
        const reel = reels[id];
        const run = reel.run;
        if (!run) return;
        reel.pos = reelPosition(run, t);
        reel.speed = reelSpeed(run, t);
        const cell = Math.round(reel.pos);
        if (cell !== reel.cell) {
          reel.cell = cell;
          if (id === 'center' && !reel.stopped && reel.speed < 16 && t < run.stopMs - 280) callbacks.sound?.('tick', cell);
        }
        if (!reel.stopped && t >= run.stopMs) {
          reel.stopped = true;
          reel.speed = 0;
          reel.stoppedAt = now;
          callbacks.sound?.('stop', order);
          knock(now, id === 'center' ? 0 : 2.5);
          if (!calm() && id !== 'center') {
            const r = L.reels[id];
            fx.sparks(r.x + r.w / 2, r.y + 4, scale, 8);
          }
        }
      });
      if (!won && reels.center.stopped) {
        won = true;
        winAt = now;
        coinsDropped = 0;
        knock(now, 6);
        callbacks.sound?.('win');
        if (!calm()) {
          const r = L.reels.center;
          fx.fountain(r.x + r.w / 2, r.y + 10, scale);
          const b = L.body;
          fx.cannon(b.x + 30, b.y + b.h - 40, 1, scale);
          fx.cannon(b.x + b.w - 30, b.y + b.h - 40, -1, scale);
        }
      }
      if (elapsed >= SLOT_SPIN_MS && !landedFired) {
        landedFired = true;
        spinning = false;
        callbacks.landed();
      }
    }

    // Монеты сыплются в лоток, каждая со звоном.
    const sw = sinceWin(now);
    if (won && !calm() && sw > 120 && coinsDropped < 14 && sw > 120 + coinsDropped * 85) {
      coinsDropped++;
      const tray = L.tray;
      fx.dropCoin(tray.x + tray.w / 2, tray.y + 6, tray.y + tray.h * 0.5 + 2, scale);
      if (coinsDropped % 2 === 1) callbacks.sound?.('coin');
    }
    // Фокус Читавука: поза, шлейф искр за палочкой и удары палочкой по барабанам.
    const spot = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    const goals = {
      machine: spot(L.frame),
      left: spot(L.reels.left),
      right: spot(L.reels.right),
      center: spot(L.reels.center),
      lever: { x: L.lever.pivot.x + 8, y: L.lever.pivot.y - L.lever.length },
    };
    const elbow = wolfFrames(L.wolf, WOLF_REST).elbow;
    magic = magicPose({
      now,
      createdAt,
      spinStart: everSpun ? spinStart : null,
      winAt: won ? winAt : null,
      calm: calm(),
      everSpun,
      aims: {
        machine: aim(elbow, goals.machine),
        left: aim(elbow, goals.left),
        right: aim(elbow, goals.right),
        center: aim(elbow, goals.center),
        lever: aim(elbow, goals.lever),
      },
    });
    frames = wolfFrames(L.wolf, magic.pose);
    if (!calm()) {
      if (magic.trail && now - lastTrail > 26) {
        lastTrail = now;
        fx.trail(frames.tip.x, frames.tip.y, scale);
      }
      const t = now - spinStart;
      if (everSpun && (spinning || won)) {
        if (!fired.magic && t >= PULL_MS * 0.75) {
          // Взмах палочкой — над окном клубится волшебный дым.
          fired.magic = true;
          fx.puff(goals.machine.x, goals.machine.y, L.frame.w * 0.55, scale * 0.8);
          callbacks.sound?.('magic');
        }
        for (const [index, id] of (['left', 'right', 'center'] as const).entries()) {
          if (fired[id] || t < ZAP_AT[id]) continue;
          fired[id] = true;
          zaps.push({ from: frames.tip, to: goals[id], at: now, seed: Math.random() * 100 });
          fx.sparks(goals[id].x, goals[id].y, scale, id === 'center' ? 22 : 12);
          callbacks.sound?.('zap', index);
          if (id === 'center') fx.puff(goals.center.x, goals.center.y, L.reels.center.w * 0.8, scale);
        }
      }
    }
    zaps = zaps.filter((z) => now - z.at < 400);

    const tray = L.tray;
    fx.step(dt, L.h + 80, { left: tray.x + 18, right: tray.x + tray.w - 18 });

    // Искорки на латуни: в покое изредка, на празднике — россыпью.
    for (const t of twinkles) t.age += dt * 1000;
    for (let i = twinkles.length - 1; i >= 0; i--) if (twinkles[i]!.age >= twinkles[i]!.life) twinkles.splice(i, 1);
    if (!calm() && now >= nextTwinkle && L.brass.length) {
      const spot = L.brass[Math.floor(Math.random() * L.brass.length)]!;
      twinkles.push({ x: spot.x, y: spot.y, age: 0, life: 500 + Math.random() * 400, size: (10 + Math.random() * 6) * (L.kind === 'wide' ? 1 : 0.8) });
      nextTwinkle = now + (celebrating(now) ? 90 : spinning ? 320 : 900);
    }

    // Лучи: в покое еле плывут, при вращении разгоняются, на выпадении — вспыхивают.
    const raySpeed = celebrating(now) ? 0.25 + 1.3 * (1 - sw / WIN_FX_MS) : spinning ? 0.45 : 0.07;
    if (!calm()) rayAngle += raySpeed * dt;

    knocks = knocks.filter((k) => now - k.at < 420);
  }

  function draw(now: number) {
    if (!cabinet || !glass || !front || !bulbs || !sign) return;
    ensureIdle();
    const c = ctx!;
    const L = layout;
    const still = calm();
    const sw = sinceWin(now);
    const party = celebrating(now);
    const sinceStart = now - createdAt;
    const anticipation = spinning && reels.left.stopped && reels.right.stopped && !reels.center.stopped;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(pixelsPerUnit, 0, 0, pixelsPerUnit, offsetX, offsetY);

    // Лучи стоят позади автомата и не трясутся вместе с ним.
    const rayAlpha = still
      ? won ? 0.32 : 0.2
      : party
        ? 0.3 + 0.45 * clamp01(1 - (sw - 300) / 2800)
        : anticipation ? 0.3 + 0.08 * Math.sin(now / 60) : spinning ? 0.24 : 0.14;
    drawRays(c, L, rayAngle, rayAlpha, party ? 1 + 0.06 * Math.sin(sw / 120) : 1);

    let shake = 0;
    for (const k of knocks) {
      const age = now - k.at;
      shake += Math.sin(age * 0.09) * k.amp * (1 - age / 420);
    }
    c.translate(shake, Math.abs(shake) * 0.3);
    const shaken = () => c.setTransform(pixelsPerUnit, 0, 0, pixelsPerUnit, offsetX + shake * pixelsPerUnit, offsetY + Math.abs(shake) * 0.3 * pixelsPerUnit);
    c.drawImage(cabinet, 0, 0, L.w, L.h);

    // Неоновая вывеска.
    const letters = sign.letters.length;
    const signLevel = (i: number) => {
      if (still) return 1;
      if (sinceStart < INTRO_MS) {
        // Включение неона: буквы загораются по очереди, кое-какие мигают.
        const t = sinceStart - 260 - i * 70;
        if (t < 0) return 0;
        if (t < 360) return hash(i * 13 + Math.floor(t / 70)) > 0.45 ? 1 : 0.15;
        return 1;
      }
      if (anticipation) return 0.65 + 0.35 * (hash(Math.floor(now / 50) + i) > 0.3 ? 1 : 0);
      if (party) return 1;
      if (spinning) return 0.85 + 0.15 * Math.sin(now / 80 + i);
      // Раз в несколько секунд одна буква «подгорает», как у старой вывески.
      const period = Math.floor(now / 6500);
      const flick = Math.floor(hash(period) * letters);
      const into = now - period * 6500;
      return i === flick && into < 260 && hash(Math.floor(into / 45) + period) > 0.5 ? 0.2 : 1;
    };
    const signLift = (i: number) => {
      if (!party || sw > 2600) return 0;
      const wave = Math.sin((sw / 1000) * Math.PI * 2 * 1.3 - i * 0.6);
      return Math.max(0, wave) * (L.kind === 'wide' ? 12 : 9) * (1 - sw / 2600);
    };
    drawSign(c, L, sign, signLevel, signLift);

    // Барабаны и стекло.
    const glow = won ? (still ? 0.7 : (0.55 + 0.45 * clamp01(1 - (sw - 250) / 2200)) * clamp01(sw / 250)) : 0;
    const pop = party ? Math.sin(clamp01(sw / 420) * Math.PI) : 0;
    for (const id of REEL_IDS) {
      const reel = reels[id];
      const flash = still ? 0 : clamp01(1 - (now - reel.stoppedAt) / 320);
      drawReel(c, L, { id, cells: reel.cells, pos: reel.pos, speed: reel.speed, glow, pop: id === 'center' ? pop : 0, flash }, iconFor);
    }
    c.drawImage(glass, 0, 0, L.w, L.h);
    if (!still && !spinning && !party) {
      const cycle = (now - createdAt) % 5200;
      drawGlint(c, L, (cycle - 1200) / 900);
    }
    if (anticipation) drawRim(c, L, 0.55 + 0.45 * Math.sin(now / 55), '255,70,50');
    else if (won) drawRim(c, L, still ? 0.6 : clamp01(1 - sw / 3200) * (0.75 + 0.25 * Math.sin(sw / 140)), '255,214,120');
    if (won && !still) {
      // Лазер прочерчивает линию и быстро гаснет, чтобы не мешать читать тему.
      const fade = sw < 550 ? 1 : clamp01(1 - (sw - 550) / 500);
      drawPayline(c, L, sw / 320, fade);
    }

    // Бегущая строка.
    drawTickerNow(c, now, anticipation, sinceStart);

    // Монеты в лотке — за передней стенкой.
    drawParticles(c, fx.tray);
    c.drawImage(front, 0, 0, L.w, L.h);

    // Лампочки.
    let level: (i: number) => number;
    let color: (i: number) => BulbColor = () => 0;
    if (still) level = () => (won ? 0.9 : 0.6);
    else if (sinceStart < INTRO_MS && !spinning && !won) level = (i) => (sinceStart - 200 > i * 9 ? 1 : 0.05);
    else if (anticipation) {
      level = (i) => (Math.floor(now / 110) % 2 === i % 2 ? 1 : 0.12);
      color = () => 1;
    } else if (spinning) {
      level = (i) => bulbLevel(i, 'spin', now - spinStart);
      color = (i) => mod(Math.floor(i / 2) + Math.floor((now - spinStart) / 380), 3) as BulbColor;
    } else if (party && sw < 2700) {
      level = (i) => bulbLevel(i, 'win', sw);
      color = (i) => mod(i + Math.floor(sw / 150), 3) as BulbColor;
    } else {
      // Покой: огни вывески неспешно бегут «змейкой».
      level = (i) => (mod(i - now / 300, 4) < 1.2 ? 1 : 0.3);
      color = () => 2;
    }
    drawBulbs(c, L, bulbs, level, color);

    // Рычаг и всё, что летает поверх.
    const idleLever = !spinning && leverMode === 'rest' && !still && !party;
    const phase = (now % 2400) / 2400;
    drawLever(c, L, leverValue, hover, idleLever && phase < 0.6 ? phase / 0.6 : -1);
    drawTwinkles(c, twinkles);
    drawSmoke(c, fx.air);

    // Читавук стоит перед автоматом и не трясётся вместе с ним.
    if (frames) {
      rasterWolf();
      drawWolf(c, [pixelsPerUnit, 0, 0, pixelsPerUnit, offsetX, offsetY], wolfSprites, frames, magic.pose, still ? 0 : magic.glow);
      shaken();
    }
    for (const z of zaps) drawZap(c, z.from, z.to, now - z.at, z.seed);
    drawParticles(c, fx.air);
    if (party) drawBloom(c, L, clamp01(1 - sw / 380));
    if (frames && magic.bubble) {
      c.setTransform(pixelsPerUnit, 0, 0, pixelsPerUnit, offsetX, offsetY);
      drawBubble(c, L, frames.speech.x, frames.speech.y, magic.bubble.text, magic.bubble.appear);
    }
  }

  function drawTickerNow(c: CanvasRenderingContext2D, now: number, anticipation: boolean, sinceStart: number) {
    const L = layout;
    if (calm()) {
      drawTicker(c, L, tickerBitmap(won ? 'ТЕМА ВЫПАЛА!' : 'ПОТЯНИ РЫЧАГ!'), 'center', 0, 1, '255,180,70');
      return;
    }
    const sw = sinceWin(now);
    if (!spinning && !won && sinceStart < 600) return;
    if (anticipation) {
      drawTicker(c, L, tickerBitmap('ЕЩЁ ЧУТЬ...'), 'center', 0, Math.floor(now / 140) % 2 ? 1 : 0.35, '255,90,60');
    } else if (spinning && !won) {
      drawTicker(c, L, tickerBitmap('КРУТИМ БАРАБАНЫ! * УДАЧИ! * '), 'scroll', (now - spinStart) / 1000 * 110, 1, '255,130,60');
    } else if (won && sw < 1900) {
      drawTicker(c, L, tickerBitmap('ТЕМА ВЫПАЛА!'), 'center', 0, Math.floor(sw / 170) % 2 ? 0.25 : 1, '255,214,90');
    } else if (won) {
      const genre = genreOf(wonGenre).ru.toUpperCase();
      drawTicker(c, L, tickerBitmap(`ТЕМА: ${genre} * ${motto()} * `), 'scroll', (sw - 1900) / 1000 * 55, 1, '255,200,90');
    } else {
      drawTicker(c, L, tickerBitmap(`ПОТЯНИ РЫЧАГ! * ${motto()} * `), 'scroll', (sinceStart - 600) / 1000 * 50, 1, '255,170,60');
    }
  }

  // ——— Подписки ———

  const resizer = new ResizeObserver(resize);
  resizer.observe(canvas);
  const seen =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          onScreen = entries.some((entry) => entry.isIntersecting);
          if (onScreen) kick();
        })
      : null;
  seen?.observe(canvas);
  const onVisibility = () => {
    if (!document.hidden) kick();
  };
  document.addEventListener('visibilitychange', onVisibility);
  // Шрифты догрузились — перерисовываем вывеску, надпись и пересчитываем переносы строк.
  void loadFonts(assets.fonts).then(() => {
    if (disposed) return;
    clearTextCaches();
    if (cabinet) rebuildLayers();
    kick();
  });
  resize();

  // ——— Внешний интерфейс ———

  const finishInstantly = () => {
    for (const id of REEL_IDS) {
      const reel = reels[id];
      if (reel.run) reel.pos = reel.run.to;
      reel.run = null;
      reel.speed = 0;
      reel.stopped = true;
    }
    spinning = false;
    won = true;
    winAt = performance.now();
    landedFired = true;
    callbacks.landed();
    kick();
  };

  return {
    setData(nextGenres, nextTopics) {
      genres = nextGenres;
      topics = nextTopics;
      for (const genre of nextGenres) if (genre.art) art.set(genre.id, genre.art);
      // Пока ничего не крутили, барабаны показывают пул, который выбрал игрок.
      if (!everSpun && !spinning) {
        for (const id of REEL_IDS) reels[id].cells = [];
        ensureIdle();
      }
      kick();
    },

    setTitle(next) {
      if (next === title) return;
      title = next;
      if (cabinet) sign = makeSignSprites(layout, title, pixelsPerUnit);
      kick();
    },

    spin(topic, reduced) {
      if (spinning || disposed) return;
      everSpun = true;
      reducedNow = reduced;
      ensureIdle();
      window.clearTimeout(pullTimer);
      if (drag) {
        drag = null;
        zone.style.cursor = 'grab';
      }
      const now = performance.now();
      if (leverMode === 'held') {
        leverFrom = leverValue;
        leverMode = 'return';
        leverStart = now;
        leverReleased = true;
        callbacks.sound?.('release');
      } else if (leverMode !== 'auto' && !reduced) {
        leverMode = 'auto';
        leverStart = now;
        leverReleased = false;
        callbacks.sound?.('pull');
      }
      pullPending = false;

      const topicCells = topicPool();
      const genreCells = genrePool();
      for (const id of REEL_IDS) {
        const reel = reels[id];
        const length = STRIP_LENGTH[id];
        const from = Math.round(reel.pos);
        // Три видимые ячейки остаются на местах, чтобы лента не «прыгала» в начале вращения.
        const start = mod(from, length);
        const fixed = new Map<number, SlotCell>();
        for (const d of [-1, 0, 1]) fixed.set(start + d, reel.cells[mod(start + d, length)]!);
        const targetIndex = mod(start + REEL_TRAVEL[id], length);
        const target = id === 'center' ? topicCell(topic) : genreCell(genreOf(topic.genre));
        fixed.set(targetIndex, target);
        reel.cells = buildStrip(id === 'center' ? topicCells : genreCells, cellKey, length, fixed);
        reel.pos = from;
        reel.cell = from;
        reel.speed = 0;
        reel.stopped = false;
        reel.stoppedAt = -1e9;
        reel.run = { from, to: slotStop(from, targetIndex, length, REEL_TRAVEL[id]), stopMs: REEL_STOP_MS[id] };
      }
      fx.clear();
      zaps = [];
      fired = { magic: false, left: false, right: false, center: false };
      won = false;
      wonGenre = topic.genre;
      landedFired = false;
      spinning = true;
      spinStart = now;
      lastNow = now;
      if (reduced) {
        leverMode = 'rest';
        leverValue = 0;
        finishInstantly();
        return;
      }
      kick();
    },

    dispose() {
      disposed = true;
      spinning = false;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(pullTimer);
      resizer.disconnect();
      seen?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      zone.remove();
      fx.clear();
    },
  };
}
