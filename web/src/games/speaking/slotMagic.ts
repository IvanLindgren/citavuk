/**
 * Режиссура фокуса: какая поза у Читавука в каждый момент. Чистые функции от
 * времени — без DOM, чтобы проверяться тестами и не зависеть от частоты кадров.
 *
 * Сценарий синхронен с барабанами (`slotMath.ts`): «Алле-оп!» на рывке рычага,
 * палочка кружит над автоматом, по очереди указывает на левый и правый
 * барабан в момент их остановки, целится в центр, пока он тянет, и на
 * выпадении темы — «Та-дам!» с подброшенным цилиндром и поклоном.
 */
import { REEL_DELAY_MS, REEL_STOP_MS, easeInOutSine, smoothstep } from './slotMath';
import { WOLF_REST, nearAngle, type WolfPose } from './slotWolf';

/** Когда палочка «бьёт» по барабану — ровно в момент его остановки. */
export const ZAP_AT = {
  left: REEL_DELAY_MS + REEL_STOP_MS.left,
  right: REEL_DELAY_MS + REEL_STOP_MS.right,
  center: REEL_DELAY_MS + REEL_STOP_MS.center,
} as const;
export const PULL_MS = 600;
const CIRCLE_END = 1350;
/** Палочка рассекает воздух на каждом полукруге над автоматом. */
export const SWISH_AT = [620, 980, 1340] as const;
/** «Та-дам» и поклон после выпадения темы. */
export const TADA_MS = 1300;
export const BOW_MS = 1000;
/** Раз в столько Читавук сам зовёт дёрнуть рычаг. */
export const INVITE_EVERY_MS = 9000;
const INVITE_FIRST_MS = 2400;
const INVITE_MS = 1700;
const BLINK_EVERY_MS = 3700;

const UP = -1.5;
const TADA_ARM = -1.15;

/** Углы от локтя до целей, радианы в координатах сцены. */
export interface MagicAims {
  machine: number;
  left: number;
  right: number;
  center: number;
  lever: number;
}

export interface MagicInput {
  now: number;
  createdAt: number;
  /** Начало текущего вращения; null — ещё ни разу не крутили. */
  spinStart: number | null;
  /** Когда выпала тема (остановился центральный барабан); null — ещё не выпала. */
  winAt: number | null;
  /** Не анимировать: reduced motion. */
  calm: boolean;
  everSpun: boolean;
  aims: MagicAims;
}

export interface MagicOutput {
  pose: WolfPose;
  /** Свечение кончика палочки, 0..1. */
  glow: number;
  /** Сыплются ли искры за палочкой. */
  trail: boolean;
  bubble: { text: string; appear: number } | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
const lerpAngle = (a: number, b: number, t: number) => a + (nearAngle(a, b) - a) * clamp01(t);
const bump = (t: number) => Math.sin(Math.PI * clamp01(t));
const talk = (t: number) => 0.35 + 0.65 * Math.abs(Math.sin(t / 75));
const appear = (t: number, from: number, to: number) => (t < from || t > to ? 0 : Math.min(1, (t - from) / 180, (to - t) / 160));

/** Покой: дышит, моргает, покачивает хвостом; раз в несколько секунд зовёт к рычагу. */
export function idlePose(input: MagicInput, invites = true): MagicOutput {
  const { now, createdAt, aims } = input;
  const life = Math.max(0, now - createdAt);
  const blinkPhase = life % BLINK_EVERY_MS;
  const pose: WolfPose = {
    ...WOLF_REST,
    breathe: 0.012 * Math.sin(now / 650),
    tail: 0.07 * Math.sin(now / 520),
    headTilt: 0.03 * Math.sin(now / 1400),
    blink: blinkPhase < 170 ? Math.sin((Math.PI * blinkPhase) / 170) : 0,
  };
  let bubble: MagicOutput['bubble'] = null;
  const invite = life - INVITE_FIRST_MS;
  const sinceWin = input.winAt === null ? Infinity : now - input.winAt;
  if (invites && invite >= 0 && sinceWin > TADA_MS + BOW_MS + 2500) {
    const g = invite % INVITE_EVERY_MS;
    if (g < INVITE_MS) {
      const k = smoothstep(g / 350) * (1 - smoothstep((g - INVITE_MS + 400) / 400));
      pose.arm = lerpAngle(WOLF_REST.arm, aims.lever, k);
      pose.wand = lerp(WOLF_REST.wand, 0, k);
      pose.headTilt += 0.05 * k;
      if (g > 200 && g < 1300) pose.mouth = talk(g);
      bubble = { text: input.everSpun ? 'Ещё фокус?' : 'Потяни рычаг!', appear: appear(g, 150, INVITE_MS - 150) };
    }
  }
  return { pose, glow: 0.1, trail: false, bubble };
}

/** Поза во время вращения, `t` — миллисекунды от рывка рычага. */
export function spinPose(input: MagicInput, t: number): MagicOutput {
  const { aims } = input;
  const base = idlePose(input, false).pose;
  const pose: WolfPose = { ...base, blink: 0, breathe: 0.01 * Math.sin(t / 200), tail: 0.12 * Math.sin(t / 160) };
  let glow = 0.4;
  let trail = false;
  let bubble: MagicOutput['bubble'] = null;
  const upArm = nearAngle(WOLF_REST.arm, UP);
  if (t < PULL_MS) {
    // «Алле-оп!»: вскидывает палочку, второй лапой приветствует публику, подпрыгивает.
    const k = easeInOutSine(t / 240);
    pose.arm = lerp(WOLF_REST.arm, upArm, k);
    pose.wand = lerp(WOLF_REST.wand, 0, k);
    pose.wave = easeInOutSine(t / 300);
    pose.hop = 30 * bump(t / 420);
    pose.headTilt = -0.08 * k;
    pose.mouth = 1;
    glow = 0.6;
  } else if (t < CIRCLE_END) {
    // Палочка кружит над автоматом, за ней тянется шлейф искр.
    const swirl = aims.machine - 0.55 + 0.5 * Math.sin((t - PULL_MS) / 115);
    const k = easeInOutSine((t - PULL_MS) / 260);
    pose.arm = lerpAngle(upArm, swirl, k);
    pose.wand = 0;
    pose.wave = 1 - easeInOutSine((t - PULL_MS) / 300);
    pose.mouth = talk(t);
    pose.headTilt = -0.05 + 0.04 * Math.sin(t / 160);
    trail = true;
    glow = 0.7;
  } else {
    // Указывает на барабан, который вот-вот встанет; потом — на центральный.
    const swirlEnd = aims.machine - 0.55 + 0.5 * Math.sin((CIRCLE_END - PULL_MS) / 115);
    let arm: number;
    if (t < ZAP_AT.left) arm = lerpAngle(swirlEnd, aims.left, easeInOutSine((t - CIRCLE_END) / 280));
    else if (t < ZAP_AT.right) arm = lerpAngle(aims.left, aims.right, easeInOutSine((t - ZAP_AT.left - 250) / 300));
    else arm = lerpAngle(aims.right, aims.center, easeInOutSine((t - ZAP_AT.right - 150) / 300));
    // Напряжение перед центральным: палочка дрожит всё сильнее.
    const tension = t > ZAP_AT.right ? clamp01((t - ZAP_AT.right) / (ZAP_AT.center - ZAP_AT.right)) : 0;
    pose.arm = arm + tension * 0.05 * Math.sin(t / 22);
    pose.wand = 0;
    pose.mouth = t < ZAP_AT.right ? talk(t) * 0.6 : 0;
    pose.headTilt = 0.05 * Math.sin(t / 300) - tension * 0.04;
    trail = tension === 0 || Math.sin(t / 40) > 0;
    glow = 0.5 + 0.5 * tension;
  }
  if (t > 60 && t < 1300) bubble = { text: 'Алле-оп!', appear: appear(t, 60, 1300) };
  return { pose, glow, trail, bubble };
}

/** «Та-дам!» и поклон, `s` — миллисекунды после выпадения темы. */
export function winPose(input: MagicInput, s: number): MagicOutput {
  const idle = idlePose(input, false).pose;
  const pose: WolfPose = { ...idle };
  const start = nearAngle(WOLF_REST.arm, input.aims.center);
  const tada = nearAngle(start, TADA_ARM);
  if (s < TADA_MS) {
    const k = easeInOutSine(s / 160);
    pose.arm = lerp(start, tada, k);
    pose.wand = lerp(0, -0.35, k);
    pose.wave = easeInOutSine(s / 220);
    pose.hop = 46 * bump(s / 480);
    pose.hatLift = 170 * bump(s / 900);
    pose.hatSpin = Math.PI * 2 * easeInOutSine(s / 900);
    pose.mouth = 1;
    pose.blink = s > 150 && s < 950 ? 1 : 0;
    pose.tail = 0.3 * Math.sin(s / 55);
    pose.headTilt = 0.06 * Math.sin(s / 120);
  } else if (s < TADA_MS + BOW_MS) {
    // Поклон публике.
    const b = (s - TADA_MS) / BOW_MS;
    pose.lean = 0.17 * bump(b);
    pose.arm = lerp(tada, nearAngle(tada, WOLF_REST.arm), easeInOutSine(b * 1.4));
    pose.wand = lerp(-0.35, WOLF_REST.wand, easeInOutSine(b * 1.4));
    pose.wave = 1 - easeInOutSine(b * 1.6);
    pose.mouth = 0.3 * (1 - b);
    pose.tail = 0.15 * Math.sin(s / 90) * (1 - b);
  } else {
    return idlePose(input);
  }
  const bubble = s > 80 && s < 1700 ? { text: 'Та-дам!', appear: appear(s, 80, 1700) } : null;
  return { pose, glow: s < TADA_MS ? 1 - s / TADA_MS : 0.1, trail: s < 700, bubble };
}

/** Главный вход: поза Читавука в момент `now`. */
export function magicPose(input: MagicInput): MagicOutput {
  if (input.calm) {
    // Без анимации: в покое — как на референсе, после выпадения — застывшее «Та-дам».
    if (input.winAt !== null) return { pose: { ...WOLF_REST, arm: TADA_ARM, wand: -0.35, wave: 1, mouth: 0.8 }, glow: 0.6, trail: false, bubble: null };
    return { pose: WOLF_REST, glow: 0, trail: false, bubble: null };
  }
  if (input.winAt !== null && input.now >= input.winAt) return winPose(input, input.now - input.winAt);
  if (input.spinStart !== null && input.now >= input.spinStart && input.winAt === null) return spinPose(input, input.now - input.spinStart);
  return idlePose(input);
}
