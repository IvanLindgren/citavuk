export const ROULETTE_SPIN_MS = 4200;
const TAU = Math.PI * 2;
export function rouletteStop(index: number, count: number, current = 0) {
  if (count < 1 || index < 0 || index >= count) throw new RangeError('Invalid roulette sector');
  const center = (index + .5) * TAU / count;
  const desired = Math.PI / 2 - center;
  const delta = ((desired - current) % TAU + TAU) % TAU;
  return current + 5 * TAU + delta;
}
export function rouletteProgress(elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / ROULETTE_SPIN_MS));
  return 1 - (1 - t) ** 4;
}
