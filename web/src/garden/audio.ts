export type GardenSound = 'step' | 'plant' | 'water' | 'bloom' | 'ui';

let context: AudioContext | null = null;
let lastStep = 0;

export function readGardenSoundSetting(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem('citavuk:garden-sound') !== 'off';
}

export function saveGardenSoundSetting(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('citavuk:garden-sound', enabled ? 'on' : 'off');
  }
}

export function unlockGardenAudio(): void {
  const audio = getContext();
  if (audio?.state === 'suspended') void audio.resume();
  if (music && music.paused) void music.play().catch(() => undefined);
}

/**
 * Фоновая музыка сада.
 *
 * Браузер не даст зазвучать до первого касания страницы, поэтому трек заводится
 * заранее и по-настоящему стартует в unlockGardenAudio — там же, где
 * просыпаются остальные звуки. Громкость намеренно низкая: это фон, под который
 * занимаются, а не саундтрек.
 */
const MUSIC = '/sounds/garden/ambient.mp3';
let music: HTMLAudioElement | null = null;

export function startGardenMusic(enabled: boolean): void {
  if (typeof window === 'undefined' || !enabled) return;
  if (!music) {
    music = new Audio(MUSIC);
    music.loop = true;
    music.preload = 'auto';
    music.volume = 0.22;
  }
  void music.play().catch(() => undefined);
}

export function stopGardenMusic(): void {
  music?.pause();
  if (music) music.currentTime = 0;
  music = null;
}

export function playGardenSound(sound: GardenSound, enabled = true): void {
  if (!enabled) return;
  const audio = getContext();
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;

  if (sound === 'step') {
    if (now - lastStep < 0.18) return;
    lastStep = now;
    noise(audio, now, 0.07, 0.018, 520);
    tone(audio, now, 92, 62, 0.065, 0.018, 'triangle');
    return;
  }
  if (sound === 'plant') {
    tone(audio, now, 210, 115, 0.13, 0.035, 'triangle');
    noise(audio, now, 0.08, 0.012, 850);
    return;
  }
  if (sound === 'water') {
    noise(audio, now, 0.42, 0.028, 1800);
    tone(audio, now + 0.06, 720, 480, 0.12, 0.018, 'sine');
    tone(audio, now + 0.21, 610, 410, 0.11, 0.016, 'sine');
    return;
  }
  if (sound === 'bloom') {
    tone(audio, now, 440, 440, 0.16, 0.025, 'sine');
    tone(audio, now + 0.08, 554, 554, 0.2, 0.022, 'sine');
    tone(audio, now + 0.16, 659, 659, 0.24, 0.02, 'sine');
    return;
  }
  tone(audio, now, 180, 145, 0.045, 0.016, 'square');
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  context ??= new window.AudioContext();
  return context;
}

function tone(
  audio: AudioContext,
  start: number,
  from: number,
  to: number,
  duration: number,
  volume: number,
  type: OscillatorType,
): void {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise(
  audio: AudioContext,
  start: number,
  duration: number,
  volume: number,
  frequency: number,
): void {
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(start);
}
