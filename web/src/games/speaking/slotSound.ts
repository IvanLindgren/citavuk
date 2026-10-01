/**
 * Звуки автомата и фокусов Читавука через Web Audio — синтез, без файлов:
 * механика автомата в восьмибитном духе, «голос» фокусника, свист палочки,
 * барабанная дробь, фанфары с тарелкой, свисток цилиндра и аплодисменты.
 * Звучит и на сайте, и в приложении (WebView). Звук необязателен, любая
 * ошибка молча глотается.
 */
import type { SlotSoundKind } from './slotScene';

let audio: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let master: AudioNode | null = null;

function context(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** Общий выход: усиление и компрессор — звуки слышны и не хрипят, когда накладываются. */
function output(ctx: AudioContext): AudioNode {
  if (master && master.context === ctx) return master;
  const gain = ctx.createGain();
  gain.gain.value = 2.4;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 8;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  gain.connect(limiter).connect(ctx.destination);
  master = gain;
  return gain;
}

/** Секунда белого шума — из неё режутся щелчки, свист, дробь и хлопки. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function tone(ctx: AudioContext, type: OscillatorType, from: number, to: number, start: number, length: number, volume: number, out: AudioNode = output(ctx)) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.01, length / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + length + 0.02);
  return osc;
}

/** Отрезок шума через фильтр: щелчок, «вжух», удар по малому барабану, хлопок. */
function hiss(ctx: AudioContext, start: number, length: number, volume: number, filter: BiquadFilterType, freq: number, freqEnd = freq, q = 1) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const band = ctx.createBiquadFilter();
  band.type = filter;
  band.Q.value = q;
  band.frequency.setValueAtTime(freq, start);
  if (freqEnd !== freq) band.frequency.exponentialRampToValueAtTime(freqEnd, start + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.015, length / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  source.connect(band).connect(gain).connect(output(ctx));
  source.start(start, Math.random() * 0.5, length + 0.05);
}

function click(ctx: AudioContext, start: number, length: number, volume: number) {
  hiss(ctx, start, length, volume, 'highpass', 1800);
}

/** «Голос» Читавука: пила через полосовой фильтр с вибрато — мультяшный слог. */
function syllable(ctx: AudioContext, start: number, from: number, to: number, length: number, volume: number) {
  const formant = ctx.createBiquadFilter();
  formant.type = 'bandpass';
  formant.frequency.value = 1400;
  formant.Q.value = 1.2;
  formant.connect(output(ctx));
  const osc = tone(ctx, 'sawtooth', from, to, start, length, volume, formant);
  const vibrato = ctx.createOscillator();
  const depth = ctx.createGain();
  vibrato.frequency.value = 9;
  depth.gain.value = from * 0.03;
  vibrato.connect(depth).connect(osc.frequency);
  vibrato.start(start);
  vibrato.stop(start + length);
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
        // Взмах палочкой: блестящий перебор вверх.
        [1319, 1568, 1976, 2637, 3136].forEach((hz, i) => tone(ctx, 'triangle', hz, hz, now + i * 0.045, 0.22, 0.022));
        break;
      case 'zap':
        // Палочка «бьёт» по барабану: искра с перезвоном.
        tone(ctx, 'square', 1800 - detail * 200, 300, now, 0.12, 0.02);
        hiss(ctx, now, 0.14, 0.05, 'bandpass', 5000, 1800, 2);
        tone(ctx, 'sine', 2093 + detail * 262, 2093 + detail * 262, now + 0.05, 0.3, 0.025);
        break;
      case 'allez':
        // «Ал-ле-ОП!» — три слога, последний выше и с подъёмом.
        syllable(ctx, now, 392, 415, 0.11, 0.09);
        syllable(ctx, now + 0.12, 392, 440, 0.1, 0.09);
        syllable(ctx, now + 0.25, 523, 784, 0.22, 0.11);
        break;
      case 'swish':
        // Палочка рассекает воздух.
        hiss(ctx, now, 0.26, 0.16, 'bandpass', 700, 3800, 3);
        break;
      case 'sparkle':
        tone(ctx, 'sine', 2400 + Math.random() * 1600, 2200, now, 0.12, 0.012);
        break;
      case 'drumroll': {
        // Барабанная дробь до остановки центрального барабана, нарастает.
        const length = Math.max(0.3, detail / 1000);
        for (let t = 0, i = 0; t < length; t += 0.045, i++) {
          const k = t / length;
          hiss(ctx, now + t, 0.05, 0.05 + 0.13 * k * k, 'highpass', 1500 + 900 * k);
          if (i % 4 === 0) tone(ctx, 'sine', 180, 90, now + t, 0.06, 0.05 + 0.07 * k);
        }
        break;
      }
      case 'tada': {
        // «Та-дам!»: медь (пила через фильтр), аккорд и удар тарелки.
        const brass = ctx.createBiquadFilter();
        brass.type = 'lowpass';
        brass.frequency.setValueAtTime(900, now);
        brass.frequency.exponentialRampToValueAtTime(2600, now + 0.25);
        brass.connect(output(ctx));
        tone(ctx, 'sawtooth', 523, 523, now, 0.13, 0.07, brass);
        for (const hz of [784, 988, 1175]) tone(ctx, 'sawtooth', hz, hz, now + 0.15, 0.85, 0.05, brass);
        hiss(ctx, now + 0.15, 1.3, 0.11, 'highpass', 6000);
        tone(ctx, 'sine', 110, 55, now + 0.15, 0.3, 0.12);
        break;
      }
      case 'hat': {
        // Цилиндр подлетает и падает обратно: свисток вверх и вниз.
        const osc = tone(ctx, 'sine', 600, 600, now, 0.9, 0.05);
        osc.frequency.cancelScheduledValues(now);
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1700, now + 0.4);
        osc.frequency.exponentialRampToValueAtTime(650, now + 0.88);
        click(ctx, now + 0.9, 0.03, 0.06);
        break;
      }
      case 'applause':
        // Публика хлопает на поклон.
        for (let i = 0; i < 40; i++) {
          const t = Math.random() * 1.4;
          hiss(ctx, now + t, 0.03 + Math.random() * 0.02, 0.1 * (1 - t / 1.6), 'bandpass', 1400 + Math.random() * 1600, 1200, 1.5);
        }
        break;
      case 'invite':
        // «Эй!» — Читавук зовёт дёрнуть рычаг.
        syllable(ctx, now, 523, 698, 0.14, 0.07);
        syllable(ctx, now + 0.17, 659, 880, 0.16, 0.07);
        break;
    }
  } catch {
    // Звук необязателен.
  }
}
