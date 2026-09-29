/**
 * Звуки печатной машинки через Web Audio.
 *
 * <audio> для такой частоты не годится: на быстром наборе он опаздывает и
 * обрывает предыдущий щелчок. Буферы декодируются один раз, каждый удар — свой
 * источник, поэтому щелчки накладываются, как у настоящей машинки.
 */

const KEY_FILES = [1, 2, 3, 4, 5, 6, 7].map((n) => `/sounds/typewriter/key-${n}.mp3`);
const MUTE_KEY = 'citavuk-typewriter-muted';

export type TypewriterSound = 'key' | 'space' | 'bell' | 'thud';

let context: AudioContext | null = null;
let buffers: { keys: AudioBuffer[]; space: AudioBuffer | null; bell: AudioBuffer | null } | null = null;
let loading: Promise<void> | null = null;
let lastKey = -1;

export function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Настройка проживёт до перезагрузки.
  }
}

async function decode(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Готовит звук. Вызывается из обработчика нажатия: браузер разрешает звук
 * только после жеста пользователя.
 */
export function primeTypewriterSounds(): Promise<void> {
  const Ctor = typeof window === 'undefined'
    ? undefined
    : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return Promise.resolve();
  if (!context) context = new Ctor();
  if (context.state === 'suspended') void context.resume();
  if (!loading) {
    const ctx = context;
    loading = Promise.all([
      Promise.all(KEY_FILES.map((url) => decode(ctx, url))),
      decode(ctx, '/sounds/typewriter/space.mp3'),
      decode(ctx, '/sounds/typewriter/bell.mp3'),
    ]).then(([keys, space, bell]) => {
      buffers = { keys: keys.filter((item): item is AudioBuffer => item !== null), space, bell };
    });
  }
  return loading;
}

function play(buffer: AudioBuffer | null | undefined, rate = 1, gain = 0.9) {
  if (!context || !buffer) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const volume = context.createGain();
  volume.gain.value = gain;
  source.connect(volume).connect(context.destination);
  source.start();
}

export function playTypewriter(sound: TypewriterSound) {
  if (!buffers) return;
  if (sound === 'bell') return play(buffers.bell, 1, 0.7);
  if (sound === 'space') return play(buffers.space ?? buffers.keys[0], 1, 0.8);
  if (!buffers.keys.length) return;
  // Соседние удары не повторяются, высота чуть гуляет — как у живых рычагов.
  let index = Math.floor(Math.random() * buffers.keys.length);
  if (index === lastKey && buffers.keys.length > 1) index = (index + 1) % buffers.keys.length;
  lastKey = index;
  if (sound === 'thud') return play(buffers.keys[index], 0.72, 1);
  play(buffers.keys[index], 0.94 + Math.random() * 0.12, 0.85);
}
