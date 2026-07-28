/**
 * Звук перелистывания страницы.
 *
 * Сэмпл лежит файлом (`/sounds/page_turn.wav`, ~36 КБ) и грузится при первом
 * воспроизведении. Синтезированный на лету шелест звучал свистом фильтра, а не
 * бумагой; сам файл собирается скриптом tools/make_page_turn.py.
 *
 * Контекст создаётся при первом воспроизведении: браузер держит `AudioContext`,
 * созданный до действия пользователя, в состоянии `suspended`.
 */

const SOURCE = '/sounds/page_turn.wav';

/** Громкость. Звук — фон под чтением, а не событие. */
const VOLUME = 0.5;

let context: AudioContext | null = null;
let sample: AudioBuffer | null = null;
let loading: Promise<AudioBuffer | null> | null = null;

function audioContext(): AudioContext | null {
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

function load(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (loading) return loading;
  loading = fetch(SOURCE)
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .then((bytes) => (bytes ? ctx.decodeAudioData(bytes) : null))
    .then((buffer) => {
      sample = buffer;
      return buffer;
    })
    .catch(() => null);
  return loading;
}

function emit(ctx: AudioContext, buffer: AudioBuffer): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  // Небольшой разброс высоты: одинаковые щелчки подряд звучат механически.
  source.playbackRate.value = 0.94 + Math.random() * 0.12;

  const gain = ctx.createGain();
  gain.gain.value = VOLUME;

  source.connect(gain).connect(ctx.destination);
  source.start();
}

export function playPageTurn(enabled: boolean): void {
  if (!enabled) return;
  const ctx = audioContext();
  if (!ctx) return;

  // Вкладка могла уйти в фон и усыпить контекст.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  if (sample) {
    emit(ctx, sample);
    return;
  }
  // Первое перелистывание играет с задержкой загрузки — но не молча.
  void load(ctx).then((buffer) => {
    if (buffer && context === ctx) emit(ctx, buffer);
  });
}

/** Освобождает звуковое устройство: читалка закрыта, шелестеть больше нечему. */
export function releasePageTurn(): void {
  const ctx = context;
  context = null;
  sample = null;
  loading = null;
  void ctx?.close().catch(() => {});
}
