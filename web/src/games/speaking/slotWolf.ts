/**
 * Читавук-фокусник у автомата. Рисунок — SVG, обведённый по референсу
 * `design/citavuk_magician_reference.webp` (скрипты — `tools/citavuk_magician`):
 * голова, туловище, хвост, рукав, лапа и цилиндр лежат отдельными
 * файлами в `public/img/citavuk-magician/` и двигаются каждый вокруг своей оси.
 * Все координаты ниже — в пикселях референса 1254 × 1254.
 *
 * Сцена растеризует детали один раз под текущий масштаб и каждый кадр
 * собирает персонажа из готовых картинок, поэтому SVG не пересчитывается.
 */

export type WolfPart = 'head' | 'torso' | 'tail' | 'sleeve' | 'paw' | 'hat';
export const WOLF_PARTS: readonly WolfPart[] = ['head', 'torso', 'tail', 'sleeve', 'paw', 'hat'];

/** Где деталь лежала на референсе: так все они встают на место без подгонки. */
export const WOLF_BOXES: Record<WolfPart, { x: number; y: number; w: number; h: number }> = {
  head: { x: 30, y: 34, w: 778, h: 702 },
  torso: { x: 57, y: 684, w: 591, h: 546 },
  tail: { x: 602, y: 822, w: 201, h: 330 },
  sleeve: { x: 891, y: 390, w: 337, h: 262 },
  paw: { x: 852, y: 276, w: 195, h: 190 },
  hat: { x: 795, y: 726, w: 448, h: 350 },
};

/** Во сколько раз деталь мельче своего места на референсе: рука и цилиндр нарисованы крупнее туловища. */
export const WOLF_PART_SCALE: Record<WolfPart, number> = { head: 1, torso: 1, tail: 1, sleeve: 0.62, paw: 0.62, hat: 0.74 };

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
/**
 * Срез манжеты на рисунке рукава (по нему build.py отделял лапу). Кисть выходит
 * из середины среза перпендикулярно ему — иначе запястье «ломается»: срез
 * повёрнут к оси рукава почти на 40°.
 */
const CUFF_EDGE = [{ x: 884, y: 466 }, { x: 1040, y: 394 }] as const;
export const CUFF_MID = { x: (CUFF_EDGE[0].x + CUFF_EDGE[1].x) / 2, y: (CUFF_EDGE[0].y + CUFF_EDGE[1].y) / 2 };
/** Нормаль к срезу, наружу из рукава: в эту сторону смотрит предплечье. */
const FOREARM_DIR = Math.atan2(CUFF_EDGE[1].y - CUFF_EDGE[0].y, CUFF_EDGE[1].x - CUFF_EDGE[0].x) - Math.PI / 2;
/** Поднятая рука нарисована крупнее туловища — уменьшаем до его масштаба. */
const ARM_SCALE = WOLF_PART_SCALE.sleeve;
/**
 * Кулак рисуется вектором в drawFist в координатах референса: костяшки влево,
 * большой палец сверху. Запястье — его правый край, хват — середина.
 */
const FIST_WRIST = { x: 524, y: 918 };
const FIST_GRIP = { x: 472, y: 916 };
/** Хват в кадре кисти: вдоль предплечья от манжеты. */
const GRIP_ALONG = FIST_WRIST.x - FIST_GRIP.x;
/** Ниже такой доли кулак не сплющивается, когда рука проходит вертикаль. */
const FIST_MIN_HEIGHT = 0.45;
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
/** Середина «:3» на референсе: рот открывается вниз от неё. */
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
  /**
   * Направление предплечья у манжеты, радианы в мире (0 — вправо, −π/2 — вверх).
   * Кисть выходит из манжеты ровно в эту сторону.
   */
  arm: number;
  /** Палочка относительно предплечья: мировой угол палочки = arm − wand; 0 — продолжает руку. */
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
  // Кулак у жилета, как на референсе; палочка смотрит вверх-вправо, к автомату,
  // и не закрывает мордочку.
  arm: 3.5,
  wand: -1.9,
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
  /** Палочка: начало — в хвате, ось +x — вдоль палочки к кончику. */
  wand: Mat;
  wave: Mat;
  /** Хват — середина кулака, через неё проходит палочка. */
  grip: { x: number; y: number };
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
  // Рука: рукав поставлен базой на локоть и повёрнут так, чтобы предплечье у манжеты
  // смотрело в pose.arm. Поклон наклоняет туловище, поэтому его вычитаем — угол мировой.
  let arm = translate(body, ELBOW.x, ELBOW.y);
  arm = rotate(arm, pose.arm - pose.lean - FOREARM_DIR);
  arm = scale(arm, ARM_SCALE);
  arm = translate(arm, -SLEEVE_BASE.x, -SLEEVE_BASE.y);
  // Кадр кисти: начало в середине манжеты, +x вдоль предплечья, масштаб туловища.
  let hand = translate(arm, CUFF_MID.x, CUFF_MID.y);
  hand = rotate(hand, FOREARM_DIR);
  hand = scale(hand, 1 / ARM_SCALE);
  // Большой палец всегда сверху: когда рука смотрит влево, кулак отражается по вертикали.
  // У вертикали кулак сжимается, но не до нуля — так видно, как поворачивается запястье.
  const c = Math.cos(pose.arm);
  const flip = (c < 0 ? -1 : 1) * Math.max(FIST_MIN_HEIGHT, Math.min(1, Math.abs(c) / 0.5));
  let fist = scale(hand, -1, flip);
  fist = translate(fist, -FIST_WRIST.x, -FIST_WRIST.y);
  // Палочка — в своём кадре без отражения: проходит через хват под углом arm − wand.
  let wand = translate(hand, GRIP_ALONG, 0);
  wand = rotate(wand, -pose.wand);
  // Левая рука — зеркальная копия поднятой, растёт из-за спины.
  let wave = translate(body, SHOULDER_LEFT.x, SHOULDER_LEFT.y);
  // Опущена вниз за спину (≈100°) → через бок поднята вверх-влево к публике (≈230°).
  const waveAngle = 1.75 + pose.wave * 2.5;
  wave = rotate(wave, waveAngle);
  wave = scale(wave, -ARM_SCALE, ARM_SCALE);
  wave = rotate(wave, -SLEEVE_DIR + Math.PI);
  wave = translate(wave, -SLEEVE_BASE.x, -SLEEVE_BASE.y);
  return {
    body,
    head,
    hat,
    tail,
    arm,
    fist,
    wand,
    wave,
    grip: apply(wand, 0, 0),
    tip: apply(wand, WAND_FRONT, 0),
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

function drawWand(ctx: CanvasRenderingContext2D, m: Mat, glow: number) {
  setMatrix(ctx, m);
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

/**
 * Кулак с палочкой. С референса кисть вырезалась с рваным краем, поэтому она
 * нарисована вектором в том же стиле: подушечки-костяшки, большой палец сверху.
 */
function drawFist(ctx: CanvasRenderingContext2D, m: Mat) {
  setMatrix(ctx, m);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const skin = ctx.createRadialGradient(462, 900, 8, 470, 920, 78);
  skin.addColorStop(0, '#fffaf4');
  skin.addColorStop(0.65, '#fbe9dd');
  skin.addColorStop(1, '#efcfbf');
  ctx.beginPath();
  ctx.moveTo(521, 868);
  ctx.bezierCurveTo(502, 854, 462, 851, 446, 864);
  ctx.bezierCurveTo(428, 872, 422, 893, 434, 903);
  ctx.bezierCurveTo(419, 912, 419, 932, 433, 939);
  ctx.bezierCurveTo(420, 949, 424, 969, 442, 974);
  ctx.bezierCurveTo(466, 985, 508, 982, 523, 966);
  ctx.bezierCurveTo(536, 950, 536, 884, 521, 868);
  ctx.closePath();
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.stroke();
  // Розовая тень снизу — как на рисунке лап.
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(232,160,150,.28)';
  ctx.beginPath();
  ctx.ellipse(478, 978, 56, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Складки между пальцами.
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(435, 903);
  ctx.quadraticCurveTo(450, 906, 462, 901);
  ctx.moveTo(434, 939);
  ctx.quadraticCurveTo(449, 942, 461, 937);
  ctx.stroke();
  // Большой палец обхватывает палочку сверху.
  ctx.beginPath();
  ctx.moveTo(452, 877);
  ctx.bezierCurveTo(460, 861, 503, 860, 512, 875);
  ctx.bezierCurveTo(517, 886, 503, 894, 488, 892);
  ctx.bezierCurveTo(472, 890, 455, 893, 452, 877);
  ctx.closePath();
  ctx.fillStyle = '#fdf0e6';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.stroke();
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
    // Рот открывается под «:3», как у мультяшного волчонка: тёмный полукруг с язычком,
    // верх — по линии рта, уголки остаются на месте.
    const open = Math.min(1, pose.mouth);
    const w = 22 + 6 * open;
    const top = MOUTH.y + 6;
    const depth = 8 + 30 * open;
    ctx.beginPath();
    ctx.moveTo(MOUTH.x - w, top);
    ctx.quadraticCurveTo(MOUTH.x, top - 5, MOUTH.x + w, top);
    ctx.bezierCurveTo(MOUTH.x + w, top + depth * 0.9, MOUTH.x + w * 0.45, top + depth, MOUTH.x, top + depth);
    ctx.bezierCurveTo(MOUTH.x - w * 0.45, top + depth, MOUTH.x - w, top + depth * 0.9, MOUTH.x - w, top);
    ctx.closePath();
    ctx.fillStyle = '#7a2228';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#f0858c';
    ctx.beginPath();
    ctx.ellipse(MOUTH.x, top + depth + 2, w * 0.68, depth * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke();
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
  drawWand(ctx, f.wand, wandGlow);
  drawFist(ctx, f.fist);
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

/**
 * Угол руки, при котором прямая палочка (wand = 0) смотрит точно на цель.
 * Палочка выходит из кулака, а кулак смещается вместе с рукой, поэтому угол
 * уточняется по хвату — двух шагов хватает с запасом.
 */
export function aimWand(place: WolfPlace, target: { x: number; y: number }, rest: WolfPose = WOLF_REST): number {
  let angle = aim(wolfFrames(place, rest).elbow, target);
  for (let i = 0; i < 3; i++) angle = aim(wolfFrames(place, { ...rest, arm: angle, wand: 0 }).grip, target);
  return angle;
}

/** Ближайший эквивалент угла `to` к углу `from`: рука не крутится «через спину». */
export function nearAngle(from: number, to: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}
