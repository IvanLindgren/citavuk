/**
 * Читавук-фокусник у автомата. Рисунок — SVG, обведённый по референсу
 * `design/citavuk_magician_reference.webp` (скрипты — `tools/citavuk_magician`):
 * голова, туловище, хвост, рукав, кулак, лапа и цилиндр лежат отдельными
 * файлами в `public/img/citavuk-magician/` и двигаются каждый вокруг своей оси.
 * Все координаты ниже — в пикселях референса 1254 × 1254.
 *
 * Сцена растеризует детали один раз под текущий масштаб и каждый кадр
 * собирает персонажа из готовых картинок, поэтому SVG не пересчитывается.
 */

export type WolfPart = 'head' | 'torso' | 'tail' | 'fist' | 'sleeve' | 'paw' | 'hat';
export const WOLF_PARTS: readonly WolfPart[] = ['head', 'torso', 'tail', 'fist', 'sleeve', 'paw', 'hat'];

/** Где деталь лежала на референсе: так все они встают на место без подгонки. */
export const WOLF_BOXES: Record<WolfPart, { x: number; y: number; w: number; h: number }> = {
  head: { x: 30, y: 34, w: 778, h: 702 },
  torso: { x: 57, y: 684, w: 591, h: 546 },
  tail: { x: 602, y: 822, w: 201, h: 330 },
  fist: { x: 426, y: 855, w: 109, h: 135 },
  sleeve: { x: 891, y: 390, w: 337, h: 262 },
  paw: { x: 852, y: 276, w: 195, h: 190 },
  hat: { x: 795, y: 726, w: 448, h: 350 },
};

/** Во сколько раз деталь мельче своего места на референсе: рука и цилиндр нарисованы крупнее туловища. */
export const WOLF_PART_SCALE: Record<WolfPart, number> = { head: 1, torso: 1, tail: 1, fist: 1, sleeve: 0.62, paw: 0.62, hat: 0.74 };

/** Опорная точка персонажа — между ступнями: её сцена ставит на пол или на крышу автомата. */
export const WOLF_FEET = { x: 430, y: 1222 };
/** Высота от ступней до макушки цилиндра в пикселях референса. */
export const WOLF_HEIGHT = 1290;

const NECK = { x: 400, y: 700 };
const TAIL_BASE = { x: 640, y: 1100 };
/** Локоть правой руки на туловище: отсюда растёт поднятый рукав. */
const ELBOW = { x: 594, y: 912 };
/** Плечо левой руки — она прячется за спиной и выходит помахать публике. */
const SHOULDER_LEFT = { x: 212, y: 846 };
/** Конец рукава поднятой руки (база) и середина манжеты, откуда выходит кисть. */
const SLEEVE_BASE = { x: 1186, y: 566 };
const SLEEVE_CUFF = { x: 958, y: 446 };
const SLEEVE_DIR = Math.atan2(SLEEVE_CUFF.y - SLEEVE_BASE.y, SLEEVE_CUFF.x - SLEEVE_BASE.x);
/** Поднятая рука нарисована крупнее туловища — уменьшаем до его масштаба. */
const ARM_SCALE = WOLF_PART_SCALE.sleeve;
/** Запястье и середина кулака на референсе; костяшки смотрят влево. */
const FIST_WRIST = { x: 522, y: 918 };
const FIST_GRIP = { x: 472, y: 916 };
/** Цилиндр: середина полей на рисунке и место на макушке. */
const HAT_BRIM = { x: 1012, y: 990 };
const HAT_ON_HEAD = { x: 408, y: 262 };
const HAT_TILT = -0.24;
const HAT_SCALE = WOLF_PART_SCALE.hat;
/** Волшебная палочка в масштабе туловища. */
const WAND_FRONT = 300;
const WAND_BACK = 44;
const WAND_WIDTH = 17;
const WAND_TIP = 46;

const FACE = '#fcecde';
const INK = '#2a1b1a';
const EYES = [
  { x: 252, y: 518, rx: 49, ry: 50, stars: [{ x: 226, y: 523, s: 9 }, { x: 262, y: 537, s: 7 }] },
  { x: 514, y: 571, rx: 49, ry: 53, stars: [{ x: 518, y: 590, s: 9 }] },
];
const MOUTH = { x: 380, y: 612 };

export interface WolfPose {
  /** Подскок вверх, в пикселях референса. */
  hop: number;
  /** Наклон всего тела вокруг ступней (поклон — плюс). */
  lean: number;
  /** Дыхание: растяжение туловища по вертикали. */
  breathe: number;
  headTilt: number;
  tail: number;
  /** Направление предплечья с палочкой, радианы в мире (0 — вправо, −π/2 — вверх). */
  arm: number;
  /** Угол палочки относительно предплечья: 0 — продолжает руку, −π/2 — торчит вверх из кулака. */
  wand: number;
  /** Левая рука: 0 — за спиной, 1 — поднята к публике. */
  wave: number;
  /** Цилиндр подлетает: подъём над головой и поворот. */
  hatLift: number;
  hatSpin: number;
  /** 0 — глаза открыты, 1 — закрыты. */
  blink: number;
  /** 0 — рот «:3», 1 — широко открыт. */
  mouth: number;
}

export const WOLF_REST: WolfPose = {
  hop: 0,
  lean: 0,
  breathe: 0,
  headTilt: 0,
  tail: 0,
  arm: Math.PI - 0.1,
  // Палочка смотрит вверх-вправо, к автомату, и не закрывает мордочку.
  wand: -2.15,
  wave: 0,
  hatLift: 0,
  hatSpin: 0,
  blink: 0,
  mouth: 0,
};

/** Аффинная матрица [a b c d e f], как у CanvasRenderingContext2D.transform. */
export type Mat = readonly [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
export const translate = (m: Mat, x: number, y: number): Mat => mul(m, [1, 0, 0, 1, x, y]);
export const scale = (m: Mat, sx: number, sy = sx): Mat => mul(m, [sx, 0, 0, sy, 0, 0]);
export const rotate = (m: Mat, a: number): Mat => mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
export const apply = (m: Mat, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
/** Поворот вокруг точки. */
const around = (m: Mat, p: { x: number; y: number }, a: number): Mat => translate(rotate(translate(m, p.x, p.y), a), -p.x, -p.y);

/** Где стоит Читавук: точка ступней в координатах сцены и масштаб «пиксель референса → единица сцены». */
export interface WolfPlace { x: number; y: number; scale: number }

export interface WolfFrames {
  body: Mat;
  head: Mat;
  hat: Mat;
  tail: Mat;
  arm: Mat;
  fist: Mat;
  wave: Mat;
  /** Кончик палочки в координатах сцены — отсюда летят искры. */
  tip: { x: number; y: number };
  /** Локоть в координатах сцены — от него сцена целится палочкой. */
  elbow: { x: number; y: number };
  /** Над головой — сюда сцена ставит пузырь с репликой. */
  speech: { x: number; y: number };
}

/** Все системы координат персонажа для позы: по ним рисуем и считаем кончик палочки. */
export function wolfFrames(place: WolfPlace, pose: WolfPose): WolfFrames {
  let body = translate(IDENTITY, place.x, place.y - pose.hop * place.scale);
  body = scale(body, place.scale);
  body = rotate(body, pose.lean);
  body = translate(body, -WOLF_FEET.x, -WOLF_FEET.y);
  // Дыхание: растягиваем от ступней, голова и руки едут вместе с туловищем.
  body = translate(body, WOLF_FEET.x, WOLF_FEET.y);
  body = scale(body, 1, 1 + pose.breathe);
  body = translate(body, -WOLF_FEET.x, -WOLF_FEET.y);
  const head = around(body, NECK, pose.headTilt);
  let hat = translate(head, HAT_ON_HEAD.x, HAT_ON_HEAD.y - pose.hatLift);
  hat = rotate(hat, HAT_TILT + pose.hatSpin);
  hat = scale(hat, HAT_SCALE);
  hat = translate(hat, -HAT_BRIM.x, -HAT_BRIM.y);
  const tail = around(body, TAIL_BASE, pose.tail);
  // Рука: рукав поставлен базой на локоть и повёрнут так, чтобы смотреть в направлении pose.arm.
  // Тело не поворачивается (кроме поклона), поэтому мировой угол почти равен локальному.
  let arm = translate(body, ELBOW.x, ELBOW.y);
  arm = rotate(arm, pose.arm - pose.lean - SLEEVE_DIR);
  arm = scale(arm, ARM_SCALE);
  arm = translate(arm, -SLEEVE_BASE.x, -SLEEVE_BASE.y);
  // Кулак: запястье — в манжету, костяшки — вдоль руки (на рисунке они смотрят влево, то есть на π).
  let fist = translate(arm, SLEEVE_CUFF.x, SLEEVE_CUFF.y);
  fist = rotate(fist, SLEEVE_DIR - Math.PI);
  fist = scale(fist, 1 / ARM_SCALE);
  fist = translate(fist, -FIST_WRIST.x, -FIST_WRIST.y);
  // Левая рука — зеркальная копия поднятой, растёт из-за спины.
  let wave = translate(body, SHOULDER_LEFT.x, SHOULDER_LEFT.y);
  // Опущена вниз за спину (≈100°) → через бок поднята вверх-влево к публике (≈230°).
  const waveAngle = 1.75 + pose.wave * 2.5;
  wave = rotate(wave, waveAngle);
  wave = scale(wave, -ARM_SCALE, ARM_SCALE);
  wave = rotate(wave, -SLEEVE_DIR + Math.PI);
  wave = translate(wave, -SLEEVE_BASE.x, -SLEEVE_BASE.y);
  const wandDir = Math.PI - pose.wand;
  const tip = apply(fist, FIST_GRIP.x + Math.cos(wandDir) * WAND_FRONT, FIST_GRIP.y + Math.sin(wandDir) * WAND_FRONT);
  return {
    body,
    head,
    hat,
    tail,
    arm,
    fist,
    wave,
    tip,
    elbow: apply(body, ELBOW.x, ELBOW.y),
    speech: apply(head, 560, 40),
  };
}

export type WolfSprites = Partial<Record<WolfPart, CanvasImageSource>>;

/** Базовая матрица кадра (масштаб устройства и сдвиг холста): на неё умножается матрица каждой детали. */
let base: Mat = IDENTITY;
function setMatrix(ctx: CanvasRenderingContext2D, m: Mat) {
  const r = mul(base, m);
  ctx.setTransform(r[0], r[1], r[2], r[3], r[4], r[5]);
}

function put(ctx: CanvasRenderingContext2D, m: Mat, img: CanvasImageSource | undefined, part: WolfPart) {
  if (!img) return;
  const b = WOLF_BOXES[part];
  setMatrix(ctx, m);
  ctx.drawImage(img, b.x, b.y, b.w, b.h);
}

function wand(ctx: CanvasRenderingContext2D, m: Mat, angle: number, glow: number) {
  setMatrix(ctx, m);
  ctx.translate(FIST_GRIP.x, FIST_GRIP.y);
  ctx.rotate(Math.PI - angle);
  if (glow > 0.01) {
    const halo = ctx.createRadialGradient(WAND_FRONT, 0, 0, WAND_FRONT, 0, 70);
    halo.addColorStop(0, `rgba(255,240,180,${0.9 * glow})`);
    halo.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(WAND_FRONT, 0, 70, 0, Math.PI * 2);
    ctx.fill();
  }
  const r = WAND_WIDTH / 2;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(-WAND_BACK - 4, -r - 4, WAND_FRONT + WAND_BACK + 8, WAND_WIDTH + 8, r + 4);
  ctx.fill();
  const rod = ctx.createLinearGradient(0, -r, 0, r);
  rod.addColorStop(0, '#4a4452');
  rod.addColorStop(0.4, '#1c1a22');
  rod.addColorStop(1, '#0c0b10');
  ctx.fillStyle = rod;
  ctx.beginPath();
  ctx.roundRect(-WAND_BACK, -r, WAND_FRONT + WAND_BACK, WAND_WIDTH, r);
  ctx.fill();
  const ivory = ctx.createLinearGradient(0, -r, 0, r);
  ivory.addColorStop(0, '#ffffff');
  ivory.addColorStop(1, '#d9cfc4');
  ctx.fillStyle = ivory;
  ctx.beginPath();
  ctx.roundRect(WAND_FRONT - WAND_TIP, -r, WAND_TIP, WAND_WIDTH, r);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-WAND_BACK, -r, 26, WAND_WIDTH, r);
  ctx.fill();
}

function face(ctx: CanvasRenderingContext2D, m: Mat, pose: WolfPose) {
  setMatrix(ctx, m);
  // Звёздочки-блики в глазах — на рисунке они слишком мелкие для обводки.
  for (const eye of EYES) {
    for (const star of eye.stars) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(star.x, star.y - star.s);
      ctx.quadraticCurveTo(star.x, star.y, star.x + star.s, star.y);
      ctx.quadraticCurveTo(star.x, star.y, star.x, star.y + star.s);
      ctx.quadraticCurveTo(star.x, star.y, star.x - star.s, star.y);
      ctx.quadraticCurveTo(star.x, star.y, star.x, star.y - star.s);
      ctx.fill();
    }
  }
  if (pose.blink > 0.02) {
    for (const eye of EYES) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(eye.x, eye.y, eye.rx + 5, eye.ry + 5, 0, 0, Math.PI * 2);
      ctx.clip();
      const lid = eye.y - eye.ry - 6 + (eye.ry * 2 + 12) * Math.min(1, pose.blink);
      ctx.fillStyle = FACE;
      ctx.fillRect(eye.x - eye.rx - 8, eye.y - eye.ry - 8, eye.rx * 2 + 16, lid - (eye.y - eye.ry - 8));
      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineCap = 'round';
      ctx.lineWidth = 9;
      ctx.beginPath();
      if (pose.blink > 0.85) {
        // Закрытый глаз — дужка улыбкой.
        ctx.ellipse(eye.x, eye.y - 4, eye.rx * 0.8, eye.ry * 0.35, 0, 0.15 * Math.PI, 0.85 * Math.PI);
      } else {
        const lid = eye.y - eye.ry - 6 + (eye.ry * 2 + 12) * pose.blink;
        const half = Math.sqrt(Math.max(0, 1 - ((lid - eye.y) / (eye.ry + 5)) ** 2)) * (eye.rx + 3);
        ctx.moveTo(eye.x - half, lid);
        ctx.lineTo(eye.x + half, lid);
      }
      ctx.stroke();
    }
  }
  if (pose.mouth > 0.04) {
    const open = Math.min(1, pose.mouth);
    ctx.fillStyle = FACE;
    ctx.beginPath();
    ctx.ellipse(MOUTH.x, MOUTH.y + 4, 40, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    const w = 30;
    const h = 10 + 34 * open;
    ctx.beginPath();
    ctx.moveTo(MOUTH.x - w, MOUTH.y);
    ctx.quadraticCurveTo(MOUTH.x, MOUTH.y - 6, MOUTH.x + w, MOUTH.y);
    ctx.quadraticCurveTo(MOUTH.x + w * 0.8, MOUTH.y + h, MOUTH.x, MOUTH.y + h);
    ctx.quadraticCurveTo(MOUTH.x - w * 0.8, MOUTH.y + h, MOUTH.x - w, MOUTH.y);
    ctx.closePath();
    ctx.fillStyle = '#6e1f22';
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#e9727a';
    ctx.beginPath();
    ctx.ellipse(MOUTH.x, MOUTH.y + h, w * 0.7, h * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Рисует Читавука. `frame` — матрица кадра сцены (из виртуальных единиц в
 * пиксели холста), её же сцена использует для всего остального.
 */
export function drawWolf(ctx: CanvasRenderingContext2D, frame: Mat, sprites: WolfSprites, f: WolfFrames, pose: WolfPose, wandGlow: number) {
  base = frame;
  ctx.save();
  if (pose.wave > 0.02) {
    put(ctx, f.wave, sprites.sleeve, 'sleeve');
    put(ctx, f.wave, sprites.paw, 'paw');
  }
  put(ctx, f.tail, sprites.tail, 'tail');
  put(ctx, f.body, sprites.torso, 'torso');
  put(ctx, f.head, sprites.head, 'head');
  face(ctx, f.head, pose);
  put(ctx, f.hat, sprites.hat, 'hat');
  put(ctx, f.arm, sprites.sleeve, 'sleeve');
  wand(ctx, f.fist, pose.wand, wandGlow);
  put(ctx, f.fist, sprites.fist, 'fist');
  ctx.restore();
  base = IDENTITY;
}

/** Плавно смешивает две позы: `t` = 0 — первая, 1 — вторая. */
export function mixPose(a: WolfPose, b: WolfPose, t: number): WolfPose {
  const k = Math.max(0, Math.min(1, t));
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof WolfPose)[]) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

/** Угол от точки до точки — чтобы целиться палочкой. */
export const aim = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.atan2(to.y - from.y, to.x - from.x);

/** Ближайший эквивалент угла `to` к углу `from`: рука не крутится «через спину». */
export function nearAngle(from: number, to: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}
