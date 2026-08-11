/**
 * Счёт сцены сада: где что стоит, насколько выросло и как качается.
 *
 * Сервер отдаёт рост на момент ответа. Если ничего не делать, цветок замрёт до
 * следующей перезагрузки — а смотреть надо на живой сад, поэтому клиент
 * досчитывает рост между ответами по той же формуле, что и сервер, и время от
 * времени сверяется с ним.
 */

export const STAGE_HOURS = 4;
export const MAX_GROWTH = 5;

/** Рост цветка через elapsedMs после ответа сервера. */
export function projectedGrowth(
  plant: { growth: number; speed: number },
  elapsedMs: number,
): number {
  const hours = Math.max(0, elapsedMs) / 3_600_000;
  const grown = plant.growth + (hours / STAGE_HOURS) * plant.speed;
  return Math.min(MAX_GROWTH, Math.max(0, grown));
}

export function stageOf(growth: number): number {
  return Math.min(MAX_GROWTH - 1, Math.max(0, Math.floor(growth)));
}

export function isBlooming(growth: number): boolean {
  return growth >= MAX_GROWTH;
}

// Доля высоты грядки по целым стадиям. Между ними значение считается плавно:
// иначе цветок дёргался бы раз в четыре часа вместо того, чтобы расти.
const HEIGHTS = [4, 18, 40, 66, 87, 100];

export function growthHeight(growth: number): number {
  const clamped = Math.min(Math.max(growth, 0), MAX_GROWTH);
  const index = Math.min(Math.floor(clamped), HEIGHTS.length - 2);
  const lower = HEIGHTS[index] ?? 0;
  const upper = HEIGHTS[index + 1] ?? 100;
  return lower + (upper - lower) * (clamped - index);
}

/** До семени ещё ничего не проклюнулось — в лунке лежит семя. */
export function showsSeed(growth: number): boolean {
  return growth < 0.5;
}

export interface Sway {
  duration: number;
  delay: number;
  tilt: number;
}

/**
 * Покачивание грядки. Постоянное для номера: иначе при каждой перерисовке
 * весь сад дёргался бы разом, как будто по нему прошла судорога.
 */
export function swayFor(slot: number): Sway {
  const noise = Math.sin((slot + 1) * 12.9898) * 43758.5453;
  const fraction = noise - Math.floor(noise);
  return {
    duration: Number((3.2 + fraction * 2.6).toFixed(2)),
    delay: Number((-fraction * 5).toFixed(2)),
    tilt: Number((1.1 + fraction * 1.6).toFixed(2)),
  };
}

/** Грядки рядами: сад — это поле, а не список. */
export function bedRows(slots: number, perRow: number): number[][] {
  const width = Math.max(1, perRow);
  const rows: number[][] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    const row = Math.floor(slot / width);
    (rows[row] ??= []).push(slot);
  }
  return rows;
}

/** Доля ширины ряда, на которой стоит грядка: по ней ходит садовник. */
export function bedPosition(index: number, count: number): number {
  if (count <= 0) return 50;
  return ((index + 0.5) / count) * 100;
}
