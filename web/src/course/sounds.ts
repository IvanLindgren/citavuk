const SOUND_MUTED_KEY = 'citavuk-course-muted';

const files = {
  correct: '/course/sounds/correct.wav',
  incorrect: '/course/sounds/incorrect.wav',
  complete: '/course/sounds/lesson_complete.wav',
} as const;

let muted = readMuted();
const templates = new Map<keyof typeof files, HTMLAudioElement>();
const activePlayers = new Set<HTMLAudioElement>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function courseSoundsMuted(): boolean {
  return muted;
}

export function setCourseSoundsMuted(value: boolean): void {
  muted = value;
  if (muted) {
    for (const player of activePlayers) player.pause();
    activePlayers.clear();
  } else {
    preloadCourseSounds();
  }
  try {
    localStorage.setItem(SOUND_MUTED_KEY, value ? '1' : '0');
  } catch {
    // В приватном режиме настройка остаётся рабочей до закрытия вкладки.
  }
}

export function preloadCourseSounds(): void {
  if (muted) return;
  for (const name of Object.keys(files) as Array<keyof typeof files>) {
    getTemplate(name);
  }
}

export function playCourseSound(name: keyof typeof files): void {
  if (muted) return;

  // Отдельный экземпляр на каждое событие: повторный быстрый ответ больше не
  // обрывает предыдущий звук и не застревает на currentTime=0 в Safari.
  const player = getTemplate(name).cloneNode(true) as HTMLAudioElement;
  player.volume = name === 'complete' ? 0.62 : 0.52;
  activePlayers.add(player);
  const release = () => activePlayers.delete(player);
  player.addEventListener('ended', release, { once: true });
  player.addEventListener('error', release, { once: true });

  void player.play().catch(() => {
    release();
    // Автовоспроизведение может быть запрещено до первого действия пользователя.
  });
}

function getTemplate(name: keyof typeof files): HTMLAudioElement {
  const existing = templates.get(name);
  if (existing) return existing;
  const player = new Audio(files[name]);
  player.preload = 'auto';
  player.load();
  templates.set(name, player);
  return player;
}
