/**
 * Звук дуэли с переводчиком.
 *
 * Файлы синтезированы (tools/build_duel_sounds.py) и лежат в /sounds/duel.
 * Грузятся не при загрузке сайта, а при входе в бой: набор весит около
 * двухсот килобайт, и человеку, который не открывал это упражнение, они не
 * нужны.
 *
 * Отличие от звуков курса (src/course/sounds.ts) — пул экземпляров. Клик
 * клавиши срабатывает по нескольку раз в секунду, и одиночный элемент просто
 * обрывал бы сам себя: в Safari повторный play() на играющем элементе не
 * перематывает его в начало.
 */

const MUTED_KEY = 'citavuk-duel-muted';

/** Ступеней клика столько же, сколько файлов key_*.wav. */
export const KEY_STEPS = 8;

const VOLUME = {
  key: 0.5,
  hit: 0.8,
  crit: 0.9,
  guard: 0.6,
  charge: 0.45,
  alarm: 0.5,
  start: 0.75,
  combo: 0.5,
  victory: 0.7,
  defeat: 0.6,
} as const;

export type DuelSound = keyof typeof VOLUME;

/** Сколько экземпляров держать на файл: столько ударов может звучать внахлёст. */
const POOL = 3;

interface Voice {
  players: HTMLAudioElement[];
  next: number;
}

const voices = new Map<string, Voice>();
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function duelMuted(): boolean {
  return muted;
}

export function setDuelMuted(value: boolean): void {
  muted = value;
  if (muted) {
    for (const voice of voices.values()) {
      for (const player of voice.players) player.pause();
    }
  }
  try {
    localStorage.setItem(MUTED_KEY, value ? '1' : '0');
  } catch {
    // В приватном режиме переключатель работает до закрытия вкладки.
  }
}

function fileOf(key: string): string {
  return `/sounds/duel/${key}.wav`;
}

function voiceOf(key: string, volume: number): Voice {
  const existing = voices.get(key);
  if (existing) return existing;
  const players = Array.from({ length: POOL }, () => {
    const player = new Audio(fileOf(key));
    player.preload = 'auto';
    player.volume = volume;
    return player;
  });
  const voice: Voice = { players, next: 0 };
  voices.set(key, voice);
  return voice;
}

/**
 * Прогревает набор. Вызывать при входе в бой: первый удар не должен
 * опаздывать на время загрузки файла.
 */
export function preloadDuelSounds(): void {
  if (typeof Audio === 'undefined') return;
  for (const [name, volume] of Object.entries(VOLUME) as Array<[DuelSound, number]>) {
    if (name === 'key') {
      for (let step = 0; step < KEY_STEPS; step += 1) voiceOf(`key_${step}`, volume);
    } else {
      voiceOf(name, volume);
    }
  }
}

function play(key: string, volume: number, rate = 1): void {
  if (muted || typeof Audio === 'undefined') return;
  const voice = voiceOf(key, volume);
  const player = voice.players[voice.next] as HTMLAudioElement;
  voice.next = (voice.next + 1) % voice.players.length;
  player.currentTime = 0;
  player.volume = volume;
  player.playbackRate = rate;
  void player.play().catch(() => {
    // До первого действия человека браузер звук не пускает. Бой начинается с
    // нажатия кнопки, так что к первому удару разрешение уже есть.
  });
}

export function playDuel(name: Exclude<DuelSound, 'key'>, rate = 1): void {
  play(name, VOLUME[name], rate);
}

/** Клик клавиши. `step` — ступень серии, 0..7. */
export function playDuelKey(step: number): void {
  const index = Math.min(KEY_STEPS - 1, Math.max(0, Math.round(step)));
  play(`key_${index}`, VOLUME.key);
}
