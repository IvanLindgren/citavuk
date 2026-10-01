/**
 * Частицы автомата: фонтан монет и конфетти при выпадении темы, пушки
 * конфетти по бокам, искры от рычага и барабанов, монеты, которые сыплются в
 * лоток. Координаты виртуальные, время — секунды, кадры роли не играют.
 */

export type ParticleKind = 'coin' | 'confetti' | 'spark' | 'smoke';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  age: number;
  life: number;
  color: string;
  gravity: number;
  /** Дно лотка: монета подпрыгивает на нём и остаётся лежать. */
  floor?: number;
}

const CONFETTI = ['#c23b33', '#e0bd6b', '#fff0c0', '#9e2b25', '#f3d58a', '#ff7a5c'];
const SPARKS = ['#fff6d0', '#ffd27a', '#ffb347'];
const MAX_AIR = 180;
const MAX_TRAY = 40;

const pick = <T,>(items: readonly T[], rng: () => number): T => items[Math.floor(rng() * items.length)]!;

export class ParticleField {
  /** Летят поверх автомата. */
  air: Particle[] = [];
  /** Лежат в лотке — рисуются за его передней стенкой. */
  tray: Particle[] = [];

  get alive(): boolean {
    return this.air.length > 0 || this.tray.length > 0;
  }

  clear() {
    this.air = [];
    this.tray = [];
  }

  private push(p: Particle) {
    if (p.floor !== undefined) {
      if (this.tray.length < MAX_TRAY) this.tray.push(p);
    } else if (this.air.length < MAX_AIR) this.air.push(p);
  }

  private spray(kind: ParticleKind, count: number, x: number, y: number, angle: number, spread: number, speed: [number, number], scale: number, rng: () => number) {
    for (let i = 0; i < count; i++) {
      const a = angle + (rng() - 0.5) * spread;
      const v = (speed[0] + rng() * (speed[1] - speed[0])) * scale;
      this.push({
        kind,
        x: x + (rng() - 0.5) * 30 * scale,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        rot: rng() * Math.PI * 2,
        spin: (rng() - 0.5) * (kind === 'confetti' ? 22 : 12),
        size: (kind === 'coin' ? 14 : kind === 'spark' ? 10 : 9) * scale * (0.75 + rng() * 0.5),
        age: 0,
        life: kind === 'spark' ? 0.5 + rng() * 0.4 : 1.2 + rng() * 0.8,
        color: kind === 'coin' ? '#f1cd6e' : kind === 'spark' ? pick(SPARKS, rng) : pick(CONFETTI, rng),
        gravity: kind === 'spark' ? 500 : kind === 'confetti' ? 900 : 1900,
      });
    }
  }

  /** Фонтан из окна с темой: монеты, конфетти и искры веером вверх. */
  fountain(x: number, y: number, scale: number, rng: () => number = Math.random) {
    this.spray('coin', 16, x, y, -Math.PI / 2, 2.1, [620, 1180], scale, rng);
    this.spray('confetti', 34, x, y, -Math.PI / 2, 2.4, [520, 1100], scale, rng);
    this.spray('spark', 18, x, y, -Math.PI / 2, 3, [280, 620], scale, rng);
  }

  /** Пушка конфетти из угла корпуса; `dir` — куда клонится струя (1 — вправо). */
  cannon(x: number, y: number, dir: 1 | -1, scale: number, rng: () => number = Math.random) {
    const angle = -Math.PI / 2 + dir * 0.42;
    this.spray('confetti', 30, x, y, angle, 0.7, [760, 1350], scale, rng);
    this.spray('spark', 8, x, y, angle, 0.9, [400, 800], scale, rng);
  }

  /** Короткий сноп искр — удар рычага о упор, щелчок барабана. */
  sparks(x: number, y: number, scale: number, count = 10, rng: () => number = Math.random) {
    this.spray('spark', count, x, y, -Math.PI / 2, Math.PI * 1.6, [180, 480], scale, rng);
  }

  /** Шлейф за кончиком палочки: медленные искорки, которые гаснут на месте. */
  trail(x: number, y: number, scale: number, rng: () => number = Math.random) {
    this.spray('spark', 1, x, y, -Math.PI / 2, Math.PI * 2, [20, 90], scale, rng);
    const last = this.air[this.air.length - 1];
    if (last) {
      last.gravity = 60;
      last.life = 0.45 + rng() * 0.35;
      last.size *= 0.7;
    }
  }

  /** Клуб волшебного дыма — «фокус» над окном с темой. */
  puff(x: number, y: number, w: number, scale: number, rng: () => number = Math.random) {
    for (let i = 0; i < 9; i++) {
      this.push({
        kind: 'smoke',
        x: x + (rng() - 0.5) * w,
        y: y + (rng() - 0.5) * w * 0.3,
        vx: (rng() - 0.5) * 120 * scale,
        vy: -(40 + rng() * 90) * scale,
        rot: 0,
        spin: 0,
        size: (36 + rng() * 34) * scale,
        age: 0,
        life: 0.8 + rng() * 0.5,
        color: '#ffffff',
        gravity: -40,
      });
    }
  }

  /** Монета падает в лоток и подпрыгивает на дне. */
  dropCoin(x: number, y: number, floor: number, scale: number, rng: () => number = Math.random) {
    this.push({
      kind: 'coin',
      x: x + (rng() - 0.5) * 80 * scale,
      y,
      vx: (rng() - 0.5) * 160 * scale,
      vy: (80 + rng() * 120) * scale,
      rot: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 16,
      size: 12 * scale * (0.85 + rng() * 0.3),
      age: 0,
      life: 3 + rng() * 0.8,
      color: '#f1cd6e',
      gravity: 1700,
      floor: floor - rng() * 6 * scale,
    });
  }

  step(dt: number, bottom: number, walls?: { left: number; right: number }) {
    const move = (p: Particle) => {
      p.age += dt;
      p.vy += p.gravity * dt;
      const drag = p.kind === 'confetti' ? 1.6 : p.kind === 'spark' ? 2.2 : p.kind === 'smoke' ? 2.5 : 0.4;
      p.vx *= 1 - Math.min(1, drag * dt);
      if (p.kind === 'confetti') p.vy = Math.min(p.vy, 260);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.floor !== undefined) {
        if (p.y >= p.floor && p.vy > 0) {
          p.y = p.floor;
          p.vy = Math.abs(p.vy) < 90 ? 0 : -p.vy * 0.36;
          p.vx *= 0.6;
          p.spin *= 0.55;
          if (p.vy === 0) p.gravity = 0;
        }
        if (walls) {
          if (p.x < walls.left) { p.x = walls.left; p.vx = Math.abs(p.vx) * 0.5; }
          if (p.x > walls.right) { p.x = walls.right; p.vx = -Math.abs(p.vx) * 0.5; }
        }
      }
    };
    for (const p of this.air) move(p);
    for (const p of this.tray) move(p);
    this.air = this.air.filter((p) => p.age < p.life && p.y < bottom);
    this.tray = this.tray.filter((p) => p.age < p.life);
  }
}
