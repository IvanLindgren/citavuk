/**
 * Звуки автомата через Web Audio — синтез, без файлов. Только сайт: во Flutter
 * страница звука не просит, как и раньше. Звук необязателен, любая ошибка молча
 * глотается.
 */
import type { SlotSoundKind } from './slotScene';

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

function tone(ctx: AudioContext, type: OscillatorType, from: number, to: number, start: number, length: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** Короткий шумовой щелчок — «железо» механики. */
function click(ctx: AudioContext, start: number, length: number, volume: number) {
  const size = Math.max(1, Math.floor(ctx.sampleRate * length));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(volume, start);
  source.connect(gain).connect(ctx.destination);
  source.start(start);
}

export function playSlotSound(kind: SlotSoundKind, detail = 0) {
  const ctx = context();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    switch (kind) {
      case 'pull':
        // Рычаг идёт вниз: глухой удар и трещотка храповика.
        tone(ctx, 'sine', 120, 55, now, 0.16, 0.09);
        for (let i = 0; i < 5; i++) click(ctx, now + 0.03 + i * 0.05, 0.012, 0.05);
        break;
      case 'release':
        click(ctx, now, 0.03, 0.08);
        tone(ctx, 'square', 220, 110, now, 0.08, 0.025);
        break;
      case 'tick':
        tone(ctx, 'square', 880 + (detail % 3) * 110, 660, now, 0.03, 0.012);
        break;
      case 'stop':
        // Барабан встал: стук об упор и короткий восьмибитный «бип».
        tone(ctx, 'triangle', 240 - detail * 25, 110, now, 0.11, 0.1);
        click(ctx, now, 0.02, 0.07);
        tone(ctx, 'square', 523 + detail * 131, 523 + detail * 131, now + 0.02, 0.06, 0.02);
        break;
      case 'coin':
        // Классическая «монетка» аркадных автоматов: си, потом ми октавой выше.
        tone(ctx, 'square', 988, 988, now, 0.07, 0.022);
        tone(ctx, 'square', 1319, 1319, now + 0.07, 0.22, 0.022);
        break;
      case 'magic':
        // Взмах палочкой: быстрый блестящий перебор вверх.
        [1319, 1568, 1976, 2637].forEach((hz, i) => tone(ctx, 'triangle', hz, hz, now + i * 0.04, 0.18, 0.02));
        break;
      case 'zap':
        // Палочка «бьёт» по барабану: короткий восьмибитный выстрел.
        tone(ctx, 'square', 1800 - detail * 200, 300, now, 0.12, 0.02);
        break;
      case 'win':
        // Восьмибитные фанфары: арпеджио вверх и аккорд.
        [523, 659, 784, 1047, 784, 1047].forEach((hz, i) => tone(ctx, 'square', hz, hz, now + i * 0.075, 0.12, 0.028));
        [523, 659, 784].forEach((hz) => tone(ctx, 'triangle', hz, hz, now + 0.46, 0.7, 0.05));
        for (let i = 0; i < 6; i++) tone(ctx, 'triangle', 2600 + Math.random() * 900, 2200, now + 0.25 + i * 0.07, 0.07, 0.014);
        break;
    }
  } catch {
    // Звук необязателен.
  }
}
