import { describe, expect, it } from 'vitest';
import { BOW_MS, INVITE_EVERY_MS, PULL_MS, TADA_MS, ZAP_AT, magicPose, type MagicInput } from './slotMagic';
import { REEL_DELAY_MS, REEL_STOP_MS } from './slotMath';
import { CUFF_MID, WOLF_REST, aim, aimWand, apply, nearAngle, wolfFrames } from './slotWolf';

const aims = { machine: -0.1, left: -0.45, right: 0.05, center: -0.2, lever: -0.35 };
const input = (patch: Partial<MagicInput>): MagicInput => ({
  now: 0,
  createdAt: 0,
  spinStart: null,
  winAt: null,
  calm: false,
  everSpun: false,
  aims,
  ...patch,
});

describe('сценарий фокуса', () => {
  it('палочка бьёт по барабану ровно в момент его остановки', () => {
    expect(ZAP_AT.left).toBe(REEL_DELAY_MS + REEL_STOP_MS.left);
    expect(ZAP_AT.right).toBe(REEL_DELAY_MS + REEL_STOP_MS.right);
    expect(ZAP_AT.center).toBe(REEL_DELAY_MS + REEL_STOP_MS.center);
  });

  it('рука движется плавно: без рывков между фазами вращения и после выпадения', () => {
    const start = 10_000;
    const winAt = start + ZAP_AT.center;
    let last = magicPose(input({ now: start, spinStart: start, everSpun: true })).pose.arm;
    for (let t = 5; t < ZAP_AT.center + TADA_MS + BOW_MS + 600; t += 5) {
      const now = start + t;
      const pose = magicPose(input({ now, spinStart: start, everSpun: true, winAt: now >= winAt ? winAt : null })).pose;
      const arm = nearAngle(last, pose.arm);
      expect(Math.abs(arm - last)).toBeLessThan(0.25);
      last = arm;
    }
  });

  it('в «Алле-оп» палочка вскинута вверх, Читавук подпрыгивает и говорит', () => {
    const out = magicPose(input({ now: 300, spinStart: 0, everSpun: true }));
    expect(Math.sin(out.pose.arm)).toBeLessThan(-0.6);
    expect(out.pose.hop).toBeGreaterThan(10);
    expect(out.pose.mouth).toBe(1);
    expect(out.bubble?.text).toBe('Алле-оп!');
  });

  it('перед остановкой барабана палочка нацелена на него', () => {
    const left = magicPose(input({ now: ZAP_AT.left - 1, spinStart: 0, everSpun: true })).pose.arm;
    expect(Math.abs(nearAngle(aims.left, left) - aims.left)).toBeLessThan(0.05);
    const right = magicPose(input({ now: ZAP_AT.right - 1, spinStart: 0, everSpun: true })).pose.arm;
    expect(Math.abs(nearAngle(aims.right, right) - aims.right)).toBeLessThan(0.05);
    const center = magicPose(input({ now: ZAP_AT.center - 5, spinStart: 0, everSpun: true })).pose.arm;
    expect(Math.abs(nearAngle(aims.center, center) - aims.center)).toBeLessThan(0.08);
  });

  it('«Та-дам»: цилиндр подлетает, лапа машет публике, потом поклон и покой', () => {
    const tada = magicPose(input({ now: 5_450, spinStart: 1_000, winAt: 5_000, everSpun: true }));
    expect(tada.pose.hatLift).toBeGreaterThan(100);
    expect(tada.pose.wave).toBe(1);
    expect(tada.bubble?.text).toBe('Та-дам!');
    const bow = magicPose(input({ now: 5_000 + TADA_MS + BOW_MS / 2, spinStart: 1_000, winAt: 5_000, everSpun: true }));
    expect(bow.pose.lean).toBeGreaterThan(0.1);
    const after = magicPose(input({ now: 5_000 + TADA_MS + BOW_MS + 100, spinStart: 1_000, winAt: 5_000, everSpun: true }));
    expect(after.pose.arm).toBeCloseTo(WOLF_REST.arm, 5);
    expect(after.pose.hatLift).toBe(0);
  });

  it('в покое время от времени зовёт дёрнуть рычаг', () => {
    const quiet = magicPose(input({ now: 1_000 }));
    expect(quiet.bubble).toBeNull();
    const invite = magicPose(input({ now: 2_400 + 700 }));
    expect(invite.bubble?.text).toBe('Потяни рычаг!');
    const again = magicPose(input({ now: 2_400 + INVITE_EVERY_MS + 700, everSpun: true, winAt: -100_000 }));
    expect(again.bubble?.text).toBe('Ещё фокус?');
  });

  it('при reduced motion поза не меняется со временем', () => {
    const a = magicPose(input({ now: 300, spinStart: 0, everSpun: true, calm: true }));
    const b = magicPose(input({ now: 1_300, spinStart: 0, everSpun: true, calm: true }));
    expect(a).toEqual(b);
    expect(a.bubble).toBeNull();
    const won = magicPose(input({ now: 9_000, spinStart: 0, winAt: 4_000, everSpun: true, calm: true }));
    expect(won.pose.wave).toBe(1);
    expect(PULL_MS).toBeGreaterThan(0);
  });
});

describe('скелет Читавука', () => {
  const place = { x: 200, y: 680, scale: 0.44 };
  const arms = Array.from({ length: 24 }, (_, i) => -Math.PI + (i * Math.PI) / 12);

  it('запястье всегда в манжете, а кисть смотрит туда же, куда предплечье', () => {
    for (const arm of arms) {
      const f = wolfFrames(place, { ...WOLF_REST, arm, wand: 0 });
      const cuff = apply(f.arm, CUFF_MID.x, CUFF_MID.y);
      const grip = f.grip;
      // Хват лежит на прямой из манжеты в сторону arm — кисть не согнута в запястье.
      expect(Math.abs(nearAngle(arm, aim(cuff, grip)) - arm)).toBeLessThan(1e-6);
      expect(Math.hypot(grip.x - cuff.x, grip.y - cuff.y)).toBeGreaterThan(10 * place.scale);
    }
  });

  it('большой палец сверху, куда бы ни показывала рука', () => {
    for (const arm of arms) {
      if (Math.abs(Math.cos(arm)) < 0.5) continue;
      const f = wolfFrames(place, { ...WOLF_REST, arm });
      // Ноготь большого пальца и низ кулака на рисунке drawFist.
      const thumb = apply(f.fist, 484, 868);
      const palm = apply(f.fist, 478, 978);
      expect(thumb.y).toBeLessThan(palm.y);
    }
  });

  it('кулак не выворачивается: плавно идёт за рукой, без скачков размера', () => {
    let last = wolfFrames(place, { ...WOLF_REST, arm: -Math.PI }).fist;
    for (let a = -Math.PI; a <= Math.PI; a += 0.02) {
      const fist = wolfFrames(place, { ...WOLF_REST, arm: a }).fist;
      const height = Math.hypot(fist[2], fist[3]) / place.scale;
      expect(height).toBeGreaterThanOrEqual(0.45 - 1e-9);
      expect(height).toBeLessThanOrEqual(1 + 1e-9);
      // Направление костяшек (ось x кадра кулака) меняется понемногу.
      const before = Math.atan2(-last[1], -last[0]);
      const now = Math.atan2(-fist[1], -fist[0]);
      expect(Math.abs(nearAngle(before, now) - before)).toBeLessThan(0.05);
      last = fist;
    }
  });

  it('палочка выходит из хвата под углом arm − wand', () => {
    for (const arm of [-1.5, -0.3, 0.6, 2.5, 3.5]) {
      for (const wand of [0, -0.35, -1.9]) {
        const f = wolfFrames(place, { ...WOLF_REST, arm, wand });
        expect(Math.abs(nearAngle(arm - wand, aim(f.grip, f.tip)) - (arm - wand))).toBeLessThan(1e-6);
      }
    }
  });

  it('aimWand наводит палочку точно на цель', () => {
    for (const target of [{ x: 520, y: 380 }, { x: 900, y: 300 }, { x: 640, y: 120 }, { x: 1150, y: 220 }]) {
      const arm = aimWand(place, target);
      const f = wolfFrames(place, { ...WOLF_REST, arm, wand: 0 });
      const miss = Math.abs(nearAngle(arm, aim(f.grip, target)) - arm);
      expect(miss).toBeLessThan((2 * Math.PI) / 180);
    }
  });

  it('подскок поднимает всего персонажа, а ступни стоят в точке опоры', () => {
    const rest = wolfFrames(place, WOLF_REST);
    const jump = wolfFrames(place, { ...WOLF_REST, hop: 40 });
    expect(jump.elbow.y).toBeCloseTo(rest.elbow.y - 40 * place.scale, 5);
    expect(jump.elbow.x).toBeCloseTo(rest.elbow.x, 5);
  });
});
