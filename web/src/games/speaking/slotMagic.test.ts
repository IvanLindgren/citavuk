import { describe, expect, it } from 'vitest';
import { BOW_MS, INVITE_EVERY_MS, PULL_MS, TADA_MS, ZAP_AT, magicPose, type MagicInput } from './slotMagic';
import { REEL_DELAY_MS, REEL_STOP_MS } from './slotMath';
import { WOLF_REST, nearAngle, wolfFrames } from './slotWolf';

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

  it('кончик палочки там, куда смотрит рука', () => {
    for (const arm of [-1.5, -0.6, 0, 0.6, 2.5]) {
      const f = wolfFrames(place, { ...WOLF_REST, arm, wand: 0 });
      const angle = Math.atan2(f.tip.y - f.elbow.y, f.tip.x - f.elbow.x);
      expect(Math.abs(nearAngle(arm, angle) - arm)).toBeLessThan(0.15);
      expect(Math.hypot(f.tip.x - f.elbow.x, f.tip.y - f.elbow.y)).toBeGreaterThan(100 * place.scale);
    }
  });

  it('подскок поднимает всего персонажа, а ступни стоят в точке опоры', () => {
    const rest = wolfFrames(place, WOLF_REST);
    const jump = wolfFrames(place, { ...WOLF_REST, hop: 40 });
    expect(jump.elbow.y).toBeCloseTo(rest.elbow.y - 40 * place.scale, 5);
    expect(jump.elbow.x).toBeCloseTo(rest.elbow.x, 5);
  });
});
