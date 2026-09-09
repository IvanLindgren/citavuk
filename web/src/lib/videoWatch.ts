export type WatchEvent = { event: 'view' | 'quick_skip' | 'complete'; dwellMs: number };

/** Только время реального воспроизведения. Буферизация, пауза и фон не входят. */
export class VideoWatch {
  private started: number | null = null;
  private elapsed = 0;
  private finished = false;
  private failed = false;
  playing(now: number) {
    if (this.started === null && !this.finished) this.started = now;
  }
  pause(now: number) {
    if (this.started !== null) this.elapsed += Math.max(0, now - this.started);
    this.started = null;
  }
  fail(now: number) { this.pause(now); this.failed = true; }
  finish(now: number, durationSeconds: number): WatchEvent[] {
    if (this.finished) return [];
    this.pause(now); this.finished = true;
    // Не обучаем подбор на недоступном ролике или заблокированном autoplay.
    if (this.failed || this.elapsed <= 0) return [];
    const dwellMs = Math.min(3_600_000, Math.round(this.elapsed));
    if (dwellMs < 2000) return [{ event: 'quick_skip', dwellMs }];
    const events: WatchEvent[] = [{ event: 'view', dwellMs }];
    if (durationSeconds > 0 && dwellMs >= Math.max(3000, durationSeconds * 800)) events.push({ event: 'complete', dwellMs });
    return events;
  }
}

/** Горизонтальный жест и небольшое дрожание пальца не листают ленту. */
export function videoSwipe(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dy) < 48 || Math.abs(dy) < Math.abs(dx) * 1.3) return 0;
  return dy < 0 ? 1 : -1;
}
