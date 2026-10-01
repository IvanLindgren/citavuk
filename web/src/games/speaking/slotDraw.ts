/**
 * Отрисовка автомата тем на Canvas 2D. Всё рисуется в виртуальных координатах
 * (`SlotLayout.w × h`): сцена сама масштабирует холст, поэтому раскладка не
 * зависит от размера экрана. Корпус, стекло и передняя стенка лотка —
 * статические слои, сцена их кеширует; барабаны, вывеска, медальон, лампочки,
 * бегущая строка, рычаг и все эффекты рисуются покадрово.
 */
import { DISPLAY_FAMILY, PIXEL_FAMILY, WORDMARK_FAMILY } from './slotAssets';
import type { Particle } from './slotFx';
import { mod, type ReelId, type SlotLayoutKind } from './slotMath';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
export interface Circle { x: number; y: number; r: number }

/** Ячейка ленты: для центрального барабана — тема, для боковых — жанр. */
export interface SlotCell { id: string; label: string; hint?: boolean }

export const PIXEL_FONT = `"${PIXEL_FAMILY}", "Press Start 2P", "Courier New", monospace`;
/** Вывеска, темы и реплики — Ruslan Display: старинная афиша в духе фокусника. */
export const DISPLAY_FONT = `"${DISPLAY_FAMILY}", "Ruslan Display", Georgia, serif`;
export const WORDMARK_FONT = `"${WORDMARK_FAMILY}", Lora, Georgia, serif`;
/** Межстрочный интервал тем на барабане. */
const TEXT_LINE = 1.24;

export interface DotGrid { x: number; y: number; pitch: number; cols: number; rows: number }

export interface SlotLayout {
  kind: SlotLayoutKind;
  w: number;
  h: number;
  body: Rect;
  sign: Rect;
  frame: Rect;
  ticker: Rect;
  dots: DotGrid;
  tray: Rect;
  reels: Record<ReelId, Rect>;
  /** Шаг ячеек в ленте каждого барабана: у центрального крупнее — там читается тема. */
  pitch: Record<ReelId, number>;
  text: { pad: number; max: number; min: number; lines: number };
  lever: { pivot: Point; length: number; knob: number; zone: Rect };
  bulbR: number;
  /** Лампочки только вокруг вывески: огней немного, чтобы взгляд держался на теме и Читавуке. */
  bulbs: Point[];
  /** Блестящие места латуни — там вспыхивают искорки. */
  brass: Point[];
  /** Центр и радиус лучей за автоматом. */
  rays: Circle;
  /** Где стоит Читавук: точка между ступнями и масштаб рисунка. */
  wolf: { x: number; y: number; scale: number };
}

const GOLD = '#c9a24b';
const GOLD_BRIGHT = '#e0bd6b';
const GOLD_PALE = '#fff0c0';
const RED = '#9e2b25';
const INK = '#2b2118';
const TAU = Math.PI * 2;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 });

export function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const k = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + k, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  ctx.closePath();
}

/** Точки по периметру прямоугольника по часовой стрелке, начиная с левого верхнего угла. */
function perimeter(rect: Rect, step: number): Point[] {
  const total = 2 * (rect.w + rect.h);
  const count = Math.max(4, Math.round(total / step));
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    let d = (i * total) / count;
    if (d < rect.w) points.push({ x: rect.x + d, y: rect.y });
    else if ((d -= rect.w) < rect.h) points.push({ x: rect.x + rect.w, y: rect.y + d });
    else if ((d -= rect.h) < rect.w) points.push({ x: rect.x + rect.w - d, y: rect.y + rect.h });
    else points.push({ x: rect.x, y: rect.y + rect.h - (d - rect.w) });
  }
  return points;
}

interface Spec {
  w: number;
  h: number;
  body: Rect;
  sign: Rect;
  frame: Rect;
  ticker: Rect;
  tray: Rect;
  wolf: SlotLayout['wolf'];
  pad: number;
  side: number;
  gap: number;
  pitch: { side: number; center: number };
  text: SlotLayout['text'];
  lever: SlotLayout['lever'];
  bulbR: number;
  signStep: number;
}

function build(kind: SlotLayoutKind, s: Spec): SlotLayout {
  const area: Rect = { x: s.frame.x + s.pad, y: s.frame.y + s.pad, w: s.frame.w - s.pad * 2, h: s.frame.h - s.pad * 2 };
  const reels: Record<ReelId, Rect> = {
    left: { ...area, w: s.side },
    center: { ...area, x: area.x + s.side + s.gap, w: area.w - (s.side + s.gap) * 2 },
    right: { ...area, x: area.x + area.w - s.side, w: s.side },
  };
  // Бегущая строка — матрица 8 × N квадратных светодиодов, как клетка пиксельного шрифта.
  const panel = grow(s.ticker, -5);
  const pitch = (panel.h - 6) / 8;
  const cols = Math.floor((panel.w - 8) / pitch);
  const dots: DotGrid = { x: panel.x + (panel.w - cols * pitch) / 2, y: panel.y + 3, pitch, cols, rows: 8 };
  const brass = [...perimeter(grow(s.frame, 3), 60), ...perimeter(grow(s.sign, 3), 60)];
  return {
    kind,
    w: s.w,
    h: s.h,
    body: s.body,
    sign: s.sign,
    frame: s.frame,
    ticker: s.ticker,
    dots,
    tray: s.tray,
    reels,
    pitch: { left: s.pitch.side, center: s.pitch.center, right: s.pitch.side },
    text: s.text,
    lever: s.lever,
    bulbR: s.bulbR,
    bulbs: perimeter(grow(s.sign, -9), s.signStep),
    brass,
    rays: { x: s.body.x + s.body.w / 2, y: s.frame.y + s.frame.h * 0.4, r: s.w * 0.75 },
    wolf: s.wolf,
  };
}

const LAYOUTS: Record<SlotLayoutKind, SlotLayout> = {
  // Компьютер: Читавук в полный рост слева, автомат справа от него.
  wide: build('wide', {
    w: 1200,
    h: 700,
    body: { x: 360, y: 130, w: 740, h: 538 },
    sign: { x: 506, y: 52, w: 448, h: 96 },
    frame: { x: 400, y: 176, w: 660, h: 330 },
    ticker: { x: 450, y: 518, w: 560, h: 52 },
    tray: { x: 530, y: 580, w: 400, h: 76 },
    wolf: { x: 170, y: 686, scale: 0.42 },
    pad: 14,
    side: 104,
    gap: 12,
    pitch: { side: 104, center: 150 },
    text: { pad: 16, max: 36, min: 16, lines: 5 },
    lever: { pivot: { x: 1116, y: 352 }, length: 200, knob: 27, zone: { x: 1072, y: 90, w: 128, h: 420 } },
    bulbR: 10,
    signStep: 52,
  }),
  // Телефон: автомат на всю ширину, Читавук стоит на крыше слева от вывески.
  compact: build('compact', {
    w: 600,
    h: 824,
    body: { x: 8, y: 260, w: 516, h: 536 },
    sign: { x: 214, y: 178, w: 300, h: 84 },
    frame: { x: 22, y: 298, w: 488, h: 366 },
    ticker: { x: 46, y: 674, w: 440, h: 46 },
    tray: { x: 126, y: 728, w: 280, h: 60 },
    wolf: { x: 112, y: 270, scale: 0.198 },
    pad: 8,
    side: 54,
    gap: 8,
    pitch: { side: 116, center: 206 },
    text: { pad: 10, max: 36, min: 16, lines: 6 },
    lever: { pivot: { x: 542, y: 500 }, length: 158, knob: 21, zone: { x: 500, y: 294, w: 100, h: 340 } },
    bulbR: 8,
    signStep: 44,
  }),
};
export const slotLayout = (kind: SlotLayoutKind): SlotLayout => LAYOUTS[kind];

/** Верх и низ хода рычага в виртуальных координатах — для перевода движения пальца в положение. */
export function leverTravel(L: SlotLayout) {
  return { restY: L.lever.pivot.y - L.lever.length, downY: L.lever.pivot.y + L.lever.length * 0.42 };
}

/** Рычаг качается к зрителю: шар уходит вниз, растёт и сдвигается вправо. */
export function leverKnob(L: SlotLayout, value: number) {
  const angle = value * 2;
  return {
    x: L.lever.pivot.x + 8 + 22 * Math.sin(angle),
    y: L.lever.pivot.y - L.lever.length * Math.cos(angle),
    scale: 1 + 0.5 * Math.abs(Math.sin(angle)),
  };
}

// ——— Текст ———

interface Fit { size: number; lines: string[] }
const fits = new Map<string, Fit>();

/** Шрифты догрузились — прежние раскладки строк могли измериться запасным шрифтом. */
export function clearTextCaches() {
  fits.clear();
  tickerBitmaps.clear();
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Самый крупный шрифт, при котором тема помещается в окно в заданное число строк. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, t: SlotLayout['text']): Fit {
  const key = `${text}|${Math.round(maxW)}|${Math.round(maxH)}|${t.max}|${t.min}|${t.lines}`;
  const hit = fits.get(key);
  if (hit) return hit;
  let fit: Fit | null = null;
  for (let size = t.max; size >= t.min && !fit; size--) {
    ctx.font = `${size}px ${DISPLAY_FONT}`;
    const lines = wrapWords(ctx, text, maxW);
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (lines.length <= t.lines && lines.length * size * TEXT_LINE <= maxH && widest <= maxW) fit = { size, lines };
  }
  if (!fit) {
    ctx.font = `${t.min}px ${DISPLAY_FONT}`;
    const lines = wrapWords(ctx, text, maxW);
    const kept = lines.slice(0, t.lines);
    if (lines.length > t.lines) kept[t.lines - 1] = `${kept[t.lines - 1]!.replace(/[\s.,;:!?]+$/, '')}…`;
    fit = { size: t.min, lines: kept };
  }
  if (fits.size > 400) fits.clear();
  fits.set(key, fit);
  return fit;
}

// ——— Статические слои ———

function brassGradient(ctx: CanvasRenderingContext2D, r: Rect): CanvasGradient {
  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  g.addColorStop(0, '#f8e3a0');
  g.addColorStop(0.18, '#e0bd6b');
  g.addColorStop(0.5, '#a9832f');
  g.addColorStop(0.82, '#d6b15e');
  g.addColorStop(1, '#6f5118');
  return g;
}

function rivet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.5, x, y, r);
  g.addColorStop(0, GOLD_PALE);
  g.addColorStop(1, '#7a5a17');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Корпус, вывеска, оправы окна, медальона и строки, лоток — всё, что не двигается. */
export function drawCabinet(ctx: CanvasRenderingContext2D, L: SlotLayout) {
  const { body, sign, frame, tray, lever, ticker, dots } = L;
  const wide = L.kind === 'wide';
  const floorY = body.y + body.h + 6;
  ctx.save();
  ctx.translate(body.x + body.w / 2, floorY);
  ctx.scale(1, 0.1);
  const shadow = ctx.createRadialGradient(0, 0, 10, 0, 0, body.w * 0.62);
  shadow.addColorStop(0, 'rgba(20,8,4,.45)');
  shadow.addColorStop(1, 'rgba(20,8,4,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(-body.w, -body.w, body.w * 2, body.w * 2);
  ctx.restore();

  // Латунный кант и красный лак корпуса.
  roundRect(ctx, body, wide ? 44 : 34);
  ctx.fillStyle = brassGradient(ctx, body);
  ctx.fill();
  const lacquer = grow(body, -9);
  roundRect(ctx, lacquer, wide ? 36 : 27);
  const paint = ctx.createLinearGradient(lacquer.x, 0, lacquer.x + lacquer.w, 0);
  paint.addColorStop(0, '#7a1c17');
  paint.addColorStop(0.12, '#c4433a');
  paint.addColorStop(0.5, '#a12d26');
  paint.addColorStop(0.88, '#7d1f1a');
  paint.addColorStop(1, '#4e110e');
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Ромбовая насечка по лаку — как на старых автоматах.
  ctx.strokeStyle = 'rgba(255,220,160,.06)';
  ctx.lineWidth = 2;
  const step = wide ? 34 : 28;
  ctx.beginPath();
  for (let x = lacquer.x - lacquer.h; x < lacquer.x + lacquer.w + lacquer.h; x += step) {
    ctx.moveTo(x, lacquer.y);
    ctx.lineTo(x + lacquer.h, lacquer.y + lacquer.h);
    ctx.moveTo(x, lacquer.y + lacquer.h);
    ctx.lineTo(x + lacquer.h, lacquer.y);
  }
  ctx.stroke();
  const sheen = ctx.createLinearGradient(0, lacquer.y, 0, lacquer.y + lacquer.h);
  sheen.addColorStop(0, 'rgba(255,255,255,.26)');
  sheen.addColorStop(0.22, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.75, 'rgba(0,0,0,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,.38)');
  ctx.fillStyle = sheen;
  ctx.fillRect(lacquer.x, lacquer.y, lacquer.w, lacquer.h);
  ctx.restore();
  // Хромовые полосы по бокам.
  for (const x of [lacquer.x + 10, lacquer.x + lacquer.w - 16]) {
    const chrome = ctx.createLinearGradient(x, 0, x + 6, 0);
    chrome.addColorStop(0, '#fff6dc');
    chrome.addColorStop(1, '#8a6a1d');
    ctx.fillStyle = chrome;
    roundRect(ctx, { x, y: lacquer.y + 44, w: 6, h: lacquer.h - 88 }, 3);
    ctx.fill();
  }
  for (const [x, y] of [
    [body.x + 24, body.y + 24],
    [body.x + body.w - 24, body.y + 24],
    [body.x + 24, body.y + body.h - 24],
    [body.x + body.w - 24, body.y + body.h - 24],
  ] as const) rivet(ctx, x, y, 6);

  // Оправа окна.
  roundRect(ctx, frame, 28);
  ctx.fillStyle = brassGradient(ctx, frame);
  ctx.fill();
  roundRect(ctx, grow(frame, -5), 24);
  ctx.strokeStyle = 'rgba(255,246,214,.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  roundRect(ctx, grow(frame, -9), 22);
  ctx.fillStyle = '#120605';
  ctx.fill();

  // Вывеска: тёмная плашка в латуни, неоновые буквы рисуются покадрово.
  roundRect(ctx, grow(sign, 6), 26);
  ctx.fillStyle = brassGradient(ctx, grow(sign, 6));
  ctx.fill();
  roundRect(ctx, sign, 21);
  const plate = ctx.createLinearGradient(0, sign.y, 0, sign.y + sign.h);
  plate.addColorStop(0, '#2a0806');
  plate.addColorStop(1, '#120302');
  ctx.fillStyle = plate;
  ctx.fill();
  roundRect(ctx, grow(sign, -18), 10);
  ctx.strokeStyle = 'rgba(224,189,107,.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Бегущая строка: латунная рамка, чёрная панель и погашенные светодиоды.
  roundRect(ctx, ticker, 12);
  ctx.fillStyle = brassGradient(ctx, ticker);
  ctx.fill();
  roundRect(ctx, grow(ticker, -5), 8);
  ctx.fillStyle = '#080202';
  ctx.fill();
  ctx.fillStyle = 'rgba(120,40,20,.35)';
  const led = dots.pitch * 0.72;
  for (let c = 0; c < dots.cols; c++) {
    for (let r = 0; r < dots.rows; r++) ctx.fillRect(dots.x + c * dots.pitch, dots.y + r * dots.pitch, led, led);
  }

  // Лоток для монет: латунный край и тёмный проём, передняя стенка — отдельным слоем.
  roundRect(ctx, tray, 16);
  ctx.fillStyle = brassGradient(ctx, tray);
  ctx.fill();
  roundRect(ctx, grow(tray, -6), 11);
  const hole = ctx.createLinearGradient(0, tray.y, 0, tray.y + tray.h);
  hole.addColorStop(0, '#020000');
  hole.addColorStop(1, '#2a0d08');
  ctx.fillStyle = hole;
  ctx.fill();

  // Основание рычага: латунная накладка и шарнир.
  const { x: px, y: py } = lever.pivot;
  const plateRect = { x: px - 30, y: py - 54, w: 44, h: 108 };
  roundRect(ctx, plateRect, 14);
  ctx.fillStyle = brassGradient(ctx, plateRect);
  ctx.fill();
  roundRect(ctx, grow(plateRect, -6), 9);
  ctx.fillStyle = 'rgba(20,8,4,.55)';
  ctx.fill();
  const boss = ctx.createRadialGradient(px - 6, py - 6, 2, px, py, 28);
  boss.addColorStop(0, GOLD_PALE);
  boss.addColorStop(0.5, GOLD);
  boss.addColorStop(1, '#6f5118');
  ctx.fillStyle = boss;
  ctx.beginPath();
  ctx.arc(px, py, 25, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2a1a08';
  ctx.beginPath();
  ctx.arc(px, py, 10, 0, TAU);
  ctx.fill();
}

/** Передняя стенка лотка: закрывает нижнюю половину проёма, монеты лежат за ней. */
export const trayLip = (L: SlotLayout): Rect => ({ x: L.tray.x, y: L.tray.y + L.tray.h * 0.48, w: L.tray.w, h: L.tray.h * 0.52 });

/** Передняя стенка лотка с надписью «Читавук» — поверх монет, которые в него падают. */
export function drawFront(ctx: CanvasRenderingContext2D, L: SlotLayout) {
  const lip = trayLip(L);
  roundRect(ctx, lip, 14);
  ctx.fillStyle = brassGradient(ctx, lip);
  ctx.fill();
  roundRect(ctx, grow(lip, -4), 10);
  ctx.strokeStyle = 'rgba(80,50,10,.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const size = Math.round(lip.h * 0.72);
  ctx.font = `700 ${size}px ${WORDMARK_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = lip.x + lip.w / 2;
  const cy = lip.y + lip.h / 2 + 1;
  // Надпись как в шапке сайта, только отлитая в латуни: тёмная гравировка и светлая кромка.
  ctx.fillStyle = 'rgba(255,248,220,.8)';
  ctx.fillText('Читавук', cx, cy + 1.6);
  ctx.fillStyle = '#3a2206';
  ctx.fillText('Читавук', cx, cy);
}

/** Стекло поверх барабанов: цилиндрическая тень сверху и снизу, блик, стрелки линии выигрыша. */
export function drawGlass(ctx: CanvasRenderingContext2D, L: SlotLayout) {
  for (const id of ['left', 'center', 'right'] as const) {
    const r = L.reels[id];
    ctx.save();
    roundRect(ctx, r, 12);
    ctx.clip();
    const vertical = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    vertical.addColorStop(0, 'rgba(18,6,4,.9)');
    vertical.addColorStop(0.18, 'rgba(18,6,4,.32)');
    vertical.addColorStop(0.5, 'rgba(18,6,4,0)');
    vertical.addColorStop(0.82, 'rgba(18,6,4,.32)');
    vertical.addColorStop(1, 'rgba(18,6,4,.9)');
    ctx.fillStyle = vertical;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const horizontal = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    horizontal.addColorStop(0, 'rgba(18,6,4,.45)');
    horizontal.addColorStop(0.1, 'rgba(18,6,4,0)');
    horizontal.addColorStop(0.9, 'rgba(18,6,4,0)');
    horizontal.addColorStop(1, 'rgba(18,6,4,.45)');
    ctx.fillStyle = horizontal;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const gloss = ctx.createLinearGradient(r.x, r.y, r.x + r.w * 0.8, r.y + r.h * 0.55);
    gloss.addColorStop(0, 'rgba(255,255,255,.22)');
    gloss.addColorStop(0.6, 'rgba(255,255,255,.03)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(r.x, r.y, r.w, r.h * 0.6);
    ctx.restore();
    roundRect(ctx, r, 12);
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  paylineArrows(ctx, L, GOLD_BRIGHT);
}

function paylineArrows(ctx: CanvasRenderingContext2D, L: SlotLayout, color: string) {
  const left = L.reels.left;
  const right = L.reels.right;
  const cy = left.y + left.h / 2;
  const a = L.kind === 'wide' ? 12 : 8;
  for (const [x, dir] of [[left.x - 1, 1], [right.x + right.w + 1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x - dir * a, cy - a * 0.9);
    ctx.lineTo(x - dir * a, cy + a * 0.9);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#6f5118';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ——— Покадровые слои ———

/** Лучи за автоматом: медленно вращаются, на выпадении темы разгораются. */
export function drawRays(ctx: CanvasRenderingContext2D, L: SlotLayout, angle: number, alpha: number, scale: number) {
  if (alpha < 0.01) return;
  const { x, y } = L.rays;
  const R = L.rays.r * scale;
  const g = ctx.createRadialGradient(x, y, R * 0.05, x, y, R);
  g.addColorStop(0, `rgba(255,214,120,${alpha})`);
  g.addColorStop(0.45, `rgba(255,190,90,${alpha * 0.45})`);
  g.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.beginPath();
  const count = 18;
  for (let i = 0; i < count; i++) {
    const a0 = angle + (i * TAU) / count;
    const a1 = a0 + TAU / count / 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a0) * R, y + Math.sin(a0) * R);
    ctx.lineTo(x + Math.cos(a1) * R, y + Math.sin(a1) * R);
    ctx.closePath();
  }
  ctx.fillStyle = g;
  ctx.fill();
}

export interface ReelDraw {
  id: ReelId;
  cells: readonly SlotCell[];
  /** Положение в ячейках: целое — ячейка точно в центре. */
  pos: number;
  /** Скорость в ячейках в секунду — для размытия движения. */
  speed: number;
  /** Подсветка выпавшей ячейки, 0..1. */
  glow: number;
  /** «Вздох» итоговой ячейки в момент выпадения, 0..1. */
  pop: number;
  /** Вспышка в момент остановки барабана, 0..1. */
  flash: number;
}

export type IconSource = (genreId: string) => HTMLCanvasElement | null;

function drawCell(
  ctx: CanvasRenderingContext2D,
  L: SlotLayout,
  id: ReelId,
  r: Rect,
  cell: SlotCell,
  cx: number,
  cy: number,
  scale: number,
  alpha: number,
  icon: IconSource,
  lit: number,
  smear: number,
) {
  const pitch = L.pitch[id];
  if (cy < r.y - pitch || cy > r.y + r.h + pitch) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  if (id === 'center') {
    const fit = fitText(ctx, cell.label, r.w - L.text.pad * 2, pitch - 14, L.text);
    ctx.font = `${fit.size}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lineHeight = fit.size * TEXT_LINE;
    const top = -((fit.lines.length - 1) * lineHeight) / 2;
    fit.lines.forEach((line, i) => {
      const y = top + i * lineHeight;
      if (smear < 0.98) {
        ctx.globalAlpha = alpha * (1 - smear);
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.fillText(line, 0, y + 2);
        ctx.fillStyle = cell.hint ? RED : INK;
        ctx.fillText(line, 0, y);
      }
      if (smear > 0.02) {
        // На большой скорости строки превращаются в тёмные штрихи — так читается быстрое вращение.
        const width = ctx.measureText(line).width * 0.94;
        ctx.globalAlpha = alpha * smear * 0.45;
        ctx.fillStyle = INK;
        ctx.fillRect(-width / 2, y - fit.size * 0.3, width, fit.size * 0.6);
      }
    });
  } else {
    const size = Math.min(r.w * 0.74, pitch * 0.74);
    if (cell.hint) {
      ctx.font = `${Math.round(size * 0.9)}px ${DISPLAY_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = RED;
      ctx.fillText('?', 0, 3);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.62, 0, TAU);
      ctx.fillStyle = `rgba(158,43,37,${0.08 + 0.25 * lit})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(201,162,75,.95)';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (lit > 0.02) {
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.72, 0, TAU);
        ctx.strokeStyle = `rgba(224,189,107,${lit})`;
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      const img = icon(cell.id);
      if (img) ctx.drawImage(img, -size / 2, -size / 2, size, size);
    }
  }
  ctx.restore();
}

export function drawReel(ctx: CanvasRenderingContext2D, L: SlotLayout, d: ReelDraw, icon: IconSource) {
  const r = L.reels[d.id];
  const length = d.cells.length;
  ctx.save();
  roundRect(ctx, r, 12);
  ctx.clip();
  const paper = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
  paper.addColorStop(0, '#e6d2a6');
  paper.addColorStop(0.5, '#fdf3da');
  paper.addColorStop(1, '#e6d2a6');
  ctx.fillStyle = paper;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (d.glow > 0.01) {
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.max(r.w, r.h) * 0.8);
    glow.addColorStop(0, `rgba(255,205,110,${0.9 * d.glow})`);
    glow.addColorStop(1, 'rgba(255,205,110,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  if (d.flash > 0.01) {
    ctx.fillStyle = `rgba(255,236,170,${0.45 * d.flash})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  if (length) {
    const pitch = L.pitch[d.id];
    const base = Math.round(d.pos);
    const blur = clamp01((d.speed - 2.5) / 10);
    const smear = d.id === 'center' ? clamp01((blur - 0.35) / 0.4) : 0;
    for (let k = -2; k <= 2; k++) {
      const index = base + k;
      const cell = d.cells[mod(index, length)]!;
      const y = cy + (d.pos - index) * pitch;
      const dist = Math.min(1, Math.abs(y - cy) / pitch);
      const scale = (1 - 0.12 * dist) * (1 + 0.08 * d.pop * (1 - dist));
      const alpha = (1 - 0.3 * dist) * (1 - 0.3 * blur);
      const lit = d.glow * (1 - dist);
      if (blur > 0.05) {
        // Размытие движения: несколько прозрачных копий вдоль хода ленты.
        for (const off of [-1, 0, 1]) {
          drawCell(ctx, L, d.id, r, cell, cx, y + off * blur * pitch * 0.2, scale, alpha * (off === 0 ? 0.7 : 0.4), icon, lit, smear);
        }
      } else drawCell(ctx, L, d.id, r, cell, cx, y, scale, alpha, icon, lit, 0);
    }
  }
  ctx.restore();
}

/** Свечение по оправе окна: золотое на выпадении, красное «сердцебиение» перед остановкой. */
export function drawRim(ctx: CanvasRenderingContext2D, L: SlotLayout, amount: number, rgb: string) {
  if (amount < 0.01) return;
  const rim = grow(L.frame, -9);
  for (const [width, alpha] of [[22, 0.1], [12, 0.22], [5, 0.65]] as const) {
    roundRect(ctx, rim, 22);
    ctx.strokeStyle = `rgba(${rgb},${alpha * amount})`;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

/** Лазерная линия выигрыша: прочерчивает все три окна слева направо. */
export function drawPayline(ctx: CanvasRenderingContext2D, L: SlotLayout, progress: number, alpha: number) {
  if (alpha < 0.01 || progress <= 0) return;
  const left = L.reels.left;
  const right = L.reels.right;
  const y = left.y + left.h / 2;
  const x0 = left.x - 6;
  const x1 = x0 + (right.x + right.w + 12 - x0) * clamp01(progress);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const [width, color] of [
    [26, `rgba(255,120,60,${0.16 * alpha})`],
    [12, `rgba(255,190,90,${0.3 * alpha})`],
    [3, `rgba(255,250,220,${0.8 * alpha})`],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  ctx.restore();
  paylineArrows(ctx, L, alpha > 0.5 ? '#fff6d0' : GOLD_BRIGHT);
}

/** Блик, пробегающий по стеклу. `progress` 0..1. */
export function drawGlint(ctx: CanvasRenderingContext2D, L: SlotLayout, progress: number) {
  if (progress <= 0 || progress >= 1) return;
  const area = L.frame;
  const x = area.x - 160 + (area.w + 320) * progress;
  for (const id of ['left', 'center', 'right'] as const) {
    ctx.save();
    roundRect(ctx, L.reels[id], 12);
    ctx.clip();
    ctx.translate(x, area.y);
    ctx.transform(1, 0, -0.45, 1, 0, 0);
    const g = ctx.createLinearGradient(-60, 0, 60, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-60, 0, 120, area.h);
    ctx.restore();
  }
}

/** Вспышка света от окна в момент выпадения. */
export function drawBloom(ctx: CanvasRenderingContext2D, L: SlotLayout, amount: number) {
  if (amount < 0.01) return;
  const r = L.reels.center;
  const x = r.x + r.w / 2;
  const y = r.y + r.h / 2;
  const g = ctx.createRadialGradient(x, y, 10, x, y, L.w * 0.6);
  g.addColorStop(0, `rgba(255,252,235,${0.85 * amount})`);
  g.addColorStop(0.35, `rgba(255,220,140,${0.4 * amount})`);
  g.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.restore();
}

// ——— Вывеска-неон ———

export interface SignSprites {
  letters: { on: HTMLCanvasElement; off: HTMLCanvasElement; x: number; w: number }[];
  size: number;
  pad: number;
}

/**
 * Буквы вывески — отдельные спрайты со свечением: так каждую можно подбросить
 * и мигнуть ею, не пересчитывая тяжёлое размытие на каждом кадре.
 */
export function makeSignSprites(L: SlotLayout, title: string, pixelsPerUnit: number): SignSprites {
  const text = title.toUpperCase();
  const probe = document.createElement('canvas').getContext('2d')!;
  let size = L.kind === 'wide' ? 74 : 56;
  probe.font = `${size}px ${DISPLAY_FONT}`;
  while (size > 16 && probe.measureText(text).width > L.sign.w - 70) {
    size -= 2;
    probe.font = `${size}px ${DISPLAY_FONT}`;
  }
  const pad = size * 0.7;
  const total = probe.measureText(text).width;
  let x = L.sign.x + (L.sign.w - total) / 2;
  const letters = [...text].map((char) => {
    const w = probe.measureText(char).width;
    const make = (paint: (g: CanvasRenderingContext2D) => void) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil((w + pad * 2) * pixelsPerUnit));
      canvas.height = Math.max(1, Math.ceil((size + pad * 2) * pixelsPerUnit));
      const g = canvas.getContext('2d')!;
      g.scale(pixelsPerUnit, pixelsPerUnit);
      g.font = `${size}px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      paint(g);
      return canvas;
    };
    const cx = pad + w / 2;
    const cy = pad + size / 2 + size * 0.04;
    const on = make((g) => {
      // Размытие тени задаётся в пикселях устройства, поэтому умножается на масштаб.
      for (const [blur, color] of [
        [size * 0.55, 'rgba(255,110,30,.95)'],
        [size * 0.25, 'rgba(255,170,60,.95)'],
        [size * 0.08, 'rgba(255,230,150,1)'],
      ] as const) {
        g.shadowColor = color;
        g.shadowBlur = blur * pixelsPerUnit;
        g.fillStyle = color;
        g.fillText(char, cx, cy);
      }
      g.shadowBlur = 0;
      g.fillStyle = '#fff8e0';
      g.fillText(char, cx, cy);
    });
    const off = make((g) => {
      g.fillStyle = '#3a1409';
      g.fillText(char, cx, cy + 2);
      g.fillStyle = '#6b3418';
      g.fillText(char, cx, cy);
    });
    const letter = { on, off, x, w };
    x += w;
    return letter;
  });
  return { letters, size, pad };
}

/** `level(i)` — яркость буквы 0..1, `lift(i)` — насколько она подброшена вверх. */
export function drawSign(ctx: CanvasRenderingContext2D, L: SlotLayout, s: SignSprites, level: (i: number) => number, lift: (i: number) => number) {
  const y = L.sign.y + (L.sign.h - s.size) / 2 - s.pad;
  s.letters.forEach((letter, i) => {
    const w = letter.w + s.pad * 2;
    const h = s.size + s.pad * 2;
    const dy = -lift(i);
    ctx.drawImage(letter.off, letter.x - s.pad, y + dy, w, h);
    const amount = clamp01(level(i));
    if (amount > 0.01) {
      ctx.globalAlpha = amount;
      ctx.drawImage(letter.on, letter.x - s.pad, y + dy, w, h);
      ctx.globalAlpha = 1;
    }
  });
}

/** Пиксельная звёздочка-крест: квадрат 2 × 2 в центре и лучи из квадратиков. */
export function pixelStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const p = Math.max(1, size / 4);
  ctx.fillStyle = color;
  ctx.fillRect(x - p, y - p, p * 2, p * 2);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    ctx.fillRect(x + dx * p * 1.5 - p / 2, y + dy * p * 1.5 - p / 2, p, p);
    ctx.fillRect(x + dx * p * 2.5 - p / 2, y + dy * p * 2.5 - p / 2, p, p);
  }
}

// ——— Лампочки ———

/** 0 — тёплая белая, 1 — красная, 2 — золотая. */
export type BulbColor = 0 | 1 | 2;
export interface BulbSprites { on: HTMLCanvasElement[]; off: HTMLCanvasElement; size: number }

const BULB_COLORS: readonly (readonly [string, string, string])[] = [
  // ореол, стекло, сердцевина
  ['255,214,110', '#ffe9a8', '#ffffff'],
  ['255,80,60', '#ff8a76', '#fff0ea'],
  ['255,170,40', '#ffc94a', '#fff6d8'],
];

/** Спрайты лампочки (погашенная и три цвета свечения) в пикселях устройства — рисуются дёшево. */
export function makeBulbSprites(L: SlotLayout, pixelsPerUnit: number): BulbSprites {
  const size = L.bulbR * 6;
  const px = Math.max(8, Math.ceil(size * pixelsPerUnit));
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(px / size, px / size);
    ctx.translate(size / 2, size / 2);
    return { canvas, ctx };
  };
  const r = L.bulbR;
  const off = make();
  const glass = off.ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
  glass.addColorStop(0, '#8a6a2a');
  glass.addColorStop(1, '#2e1c0a');
  off.ctx.fillStyle = glass;
  off.ctx.beginPath();
  off.ctx.arc(0, 0, r, 0, TAU);
  off.ctx.fill();
  off.ctx.strokeStyle = GOLD;
  off.ctx.lineWidth = 1.6;
  off.ctx.stroke();
  const on = BULB_COLORS.map(([halo, mid, core]) => {
    const sprite = make();
    const g = sprite.ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
    g.addColorStop(0, `rgba(${halo},.95)`);
    g.addColorStop(0.25, `rgba(${halo},.55)`);
    g.addColorStop(0.55, `rgba(${halo},.16)`);
    g.addColorStop(1, `rgba(${halo},0)`);
    sprite.ctx.fillStyle = g;
    sprite.ctx.fillRect(-r * 3, -r * 3, r * 6, r * 6);
    const bulb = sprite.ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r * 0.95);
    bulb.addColorStop(0, core);
    bulb.addColorStop(1, mid);
    sprite.ctx.fillStyle = bulb;
    sprite.ctx.beginPath();
    sprite.ctx.arc(0, 0, r * 0.95, 0, TAU);
    sprite.ctx.fill();
    return sprite.canvas;
  });
  return { on, off: off.canvas, size };
}

export function drawBulbs(ctx: CanvasRenderingContext2D, L: SlotLayout, sprites: BulbSprites, level: (index: number) => number, color: (index: number) => BulbColor) {
  const half = sprites.size / 2;
  for (const p of L.bulbs) ctx.drawImage(sprites.off, p.x - half, p.y - half, sprites.size, sprites.size);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  L.bulbs.forEach((p, i) => {
    const amount = clamp01(level(i));
    if (amount < 0.02) return;
    ctx.globalAlpha = amount;
    ctx.drawImage(sprites.on[color(i)]!, p.x - half, p.y - half, sprites.size, sprites.size);
  });
  ctx.restore();
}

// ——— Бегущая строка ———

export interface TickerBitmap { cols: number; bits: Uint8Array }
const tickerBitmaps = new Map<string, TickerBitmap>();

/**
 * Текст в светодиодах: пиксельный шрифт нарисован в сетке 8 × 8, поэтому
 * рендерим его в 8 пикселей высотой, и каждый пиксель становится диодом.
 */
export function tickerBitmap(text: string): TickerBitmap {
  const hit = tickerBitmaps.get(text);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `8px ${PIXEL_FONT}`;
  const cols = Math.max(1, Math.ceil(ctx.measureText(text).width));
  canvas.width = cols;
  canvas.height = 8;
  ctx.font = `8px ${PIXEL_FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  // Глиф Press Start 2P занимает ровно 8 строк над базовой линией, включая хвосты Щ, Д, у, р.
  ctx.fillText(text, 0, 8);
  const data = ctx.getImageData(0, 0, cols, 8).data;
  const bits = new Uint8Array(cols * 8);
  for (let r = 0; r < 8; r++) for (let c = 0; c < cols; c++) bits[r * cols + c] = data[(r * cols + c) * 4 + 3]! > 110 ? 1 : 0;
  const bitmap = { cols, bits };
  if (tickerBitmaps.size > 40) tickerBitmaps.clear();
  tickerBitmaps.set(text, bitmap);
  return bitmap;
}

/**
 * `scroll` — строка бежит справа налево, `offset` — сдвиг в диодах;
 * `center` — текст стоит по центру. `brightness` 0..1, `rgb` — цвет свечения.
 */
export function drawTicker(ctx: CanvasRenderingContext2D, L: SlotLayout, bitmap: TickerBitmap, mode: 'scroll' | 'center', offset: number, brightness: number, rgb: string) {
  if (brightness < 0.02) return;
  const { dots } = L;
  const led = dots.pitch * 0.72;
  const period = bitmap.cols + dots.cols;
  const start = Math.floor((dots.cols - bitmap.cols) / 2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [spread, alpha] of [[dots.pitch * 0.6, 0.2], [0, 1]] as const) {
    ctx.fillStyle = `rgba(${rgb},${alpha * brightness})`;
    for (let c = 0; c < dots.cols; c++) {
      const col = mode === 'center' ? c - start : mod(c + Math.floor(offset) - dots.cols, period);
      if (col < 0 || col >= bitmap.cols) continue;
      for (let r = 0; r < 8; r++) {
        if (!bitmap.bits[r * bitmap.cols + col]) continue;
        ctx.fillRect(dots.x + c * dots.pitch - spread / 2, dots.y + r * dots.pitch - spread / 2, led + spread, led + spread);
      }
    }
  }
  ctx.restore();
}

// ——— Рычаг ———

/** Рычаг: рукоять с блеском, шар-рукоять и шарнир. `invite` — фаза кольца-приглашения (-1 — нет). */
export function drawLever(ctx: CanvasRenderingContext2D, L: SlotLayout, value: number, hover: boolean, invite: number) {
  const { pivot, knob } = L.lever;
  const k = leverKnob(L, value);
  const width = (L.kind === 'wide' ? 15 : 12) * (0.9 + 0.2 * k.scale);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3a2a10';
  ctx.lineWidth = width + 4;
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(k.x, k.y);
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,192,.8)';
  ctx.lineWidth = Math.max(2, width * 0.22);
  ctx.beginPath();
  ctx.moveTo(pivot.x - width * 0.22, pivot.y);
  ctx.lineTo(k.x - width * 0.22, k.y);
  ctx.stroke();
  const cap = ctx.createRadialGradient(pivot.x - 3, pivot.y - 3, 1, pivot.x, pivot.y, 14);
  cap.addColorStop(0, GOLD_PALE);
  cap.addColorStop(1, '#8a6a1d');
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 13, 0, TAU);
  ctx.fill();

  const radius = knob * k.scale;
  if (hover || invite >= 0) {
    const pulse = invite >= 0 ? invite : 0;
    for (const [extra, alpha] of [[0.25, 0.6], [0.6, 0.3]] as const) {
      ctx.beginPath();
      ctx.arc(k.x, k.y, radius * (1.15 + extra * (hover ? 0.6 : pulse)), 0, TAU);
      ctx.strokeStyle = `rgba(255,220,130,${hover ? alpha : alpha * (1 - pulse)})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }
  const ball = ctx.createRadialGradient(k.x - radius * 0.35, k.y - radius * 0.4, radius * 0.1, k.x, k.y, radius);
  ball.addColorStop(0, '#ffb0a2');
  ball.addColorStop(0.45, '#d4453b');
  ball.addColorStop(1, '#62100c');
  ctx.fillStyle = ball;
  ctx.beginPath();
  ctx.arc(k.x, k.y, radius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.beginPath();
  ctx.ellipse(k.x - radius * 0.36, k.y - radius * 0.42, radius * 0.28, radius * 0.16, -0.7, 0, TAU);
  ctx.fill();
}

// ——— Частицы и искорки ———

export function drawParticles(ctx: CanvasRenderingContext2D, items: readonly Particle[]) {
  for (const p of items) {
    if (p.kind === 'smoke') continue;
    ctx.save();
    ctx.globalAlpha = clamp01((p.life - p.age) / 0.45);
    ctx.translate(p.x, p.y);
    if (p.kind === 'coin') {
      const face = Math.cos(p.rot * 1.6);
      ctx.scale(Math.max(0.12, Math.abs(face)), 1);
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, TAU);
      ctx.fillStyle = face > 0 ? '#f1cd6e' : '#c79a3a';
      ctx.fill();
      ctx.strokeStyle = '#7a5a17';
      ctx.lineWidth = 2;
      ctx.stroke();
      const q = p.size * 0.22;
      ctx.fillStyle = '#8a6a1d';
      ctx.fillRect(-q, -p.size * 0.5, q * 2, p.size);
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.fillRect(-p.size * 0.6, -p.size * 0.6, q * 1.4, q * 1.4);
    } else if (p.kind === 'confetti') {
      ctx.rotate(p.rot * 0.2);
      ctx.scale(1, Math.cos(p.rot));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    } else {
      pixelStar(ctx, 0, 0, p.size, p.color);
    }
    ctx.restore();
  }
}

export interface Twinkle { x: number; y: number; age: number; life: number; size: number }

export function drawTwinkles(ctx: CanvasRenderingContext2D, items: readonly Twinkle[]) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of items) {
    const k = Math.sin(clamp01(t.age / t.life) * Math.PI);
    if (k < 0.05) continue;
    ctx.globalAlpha = k;
    pixelStar(ctx, t.x, t.y, t.size * (0.6 + 0.4 * k), '#fff6d0');
  }
  ctx.restore();
}

// ——— Фокусы Читавука ———

/**
 * Пузырь с репликой пиксельным шрифтом. `x, y` — куда указывает хвостик
 * (над головой), `appear` 0..1 — появление с лёгким перелётом.
 */
export function drawBubble(ctx: CanvasRenderingContext2D, L: SlotLayout, x: number, y: number, text: string, appear: number) {
  if (appear <= 0.01) return;
  const size = L.kind === 'wide' ? 30 : 21;
  ctx.save();
  ctx.font = `${size}px ${DISPLAY_FONT}`;
  const w = ctx.measureText(text).width + size * 1.6;
  const h = size * 2.2;
  // Пузырь не вылезает за край сцены.
  const bx = Math.max(6, Math.min(L.w - w - 6, x - size * 1.2));
  const by = Math.max(4, y - h - size * 0.9);
  const k = appear < 1 ? 1 + 0.18 * Math.sin(appear * Math.PI) - 0.18 * (1 - appear) : 1;
  ctx.translate(x, y);
  ctx.scale(k * Math.min(1, appear * 1.6), k * Math.min(1, appear * 1.6));
  ctx.translate(-x, -y);
  ctx.globalAlpha = Math.min(1, appear * 2);
  roundRect(ctx, { x: bx, y: by, w, h }, size * 0.5);
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = L.kind === 'wide' ? 4 : 3;
  ctx.fill();
  ctx.stroke();
  // Хвостик к голове.
  const tx = Math.max(bx + size, Math.min(bx + w - size, x));
  ctx.beginPath();
  ctx.moveTo(tx - size * 0.45, by + h - 2);
  ctx.lineTo(tx - size * 0.1, by + h + size * 0.75);
  ctx.lineTo(tx + size * 0.45, by + h - 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(tx - size * 0.42, by + h - 5, size * 0.84, 6);
  ctx.fillStyle = RED;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, by + h / 2 + 1);
  ctx.restore();
}

/** Волшебный луч от кончика палочки к барабану: зигзаг, который гаснет за долю секунды. */
export function drawZap(ctx: CanvasRenderingContext2D, from: Point, to: Point, age: number, seed: number) {
  const life = 320;
  if (age < 0 || age > life) return;
  const fade = 1 - age / life;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const points: Point[] = [from];
  for (let i = 1; i < 7; i++) {
    const t = i / 7;
    const wobble = (Math.sin(seed * 12.9 + i * 78.2) * 43758.5453) % 1;
    const off = wobble * len * 0.07;
    points.push({ x: from.x + dx * t + nx * off, y: from.y + dy * t + ny * off });
  }
  points.push(to);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [[16, `rgba(190,140,255,${0.25 * fade})`], [8, `rgba(255,214,120,${0.55 * fade})`], [3, `rgba(255,255,240,${fade})`]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.restore();
}

/** Клубы волшебного дыма: мягкие круги, которые растут и тают. */
export function drawSmoke(ctx: CanvasRenderingContext2D, items: readonly Particle[]) {
  for (const p of items) {
    if (p.kind !== 'smoke') continue;
    const k = p.age / p.life;
    const r = p.size * (0.6 + 1.6 * k);
    const a = (1 - k) * 0.75;
    const g = ctx.createRadialGradient(p.x, p.y, r * 0.1, p.x, p.y, r);
    g.addColorStop(0, `rgba(255,252,255,${a})`);
    g.addColorStop(0.6, `rgba(232,218,255,${a * 0.6})`);
    g.addColorStop(1, 'rgba(220,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
