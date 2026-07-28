import { request } from './client';

export interface TranslationResult {
  /** Перевод запрошенного фрагмента. */
  text: string;
  /** Перевод всего предложения, если слово переводилось в контексте. */
  sentence?: string;
  /** Кто перевёл: `deepl` или запасной провайдер. */
  provider: string;
  /** Ответ взят из общего кеша, квота переводчика не потрачена. */
  cached: boolean;
  /**
   * Слово получено выравниванием внутри переведённой фразы, а не переведено
   * в отрыве от неё.
   *
   * Разница существенная и её видно пользователю: без контекста нейронный
   * перевод одиночного слова ненадёжен — «kuća» отдельным словом DeepL
   * переводит как «собака», а внутри предложения — верно, «дом».
   */
  aligned: boolean;
}

/** Переводит связный фрагмент: фразу, предложение или абзац. */
export function translateText(
  text: string,
  signal?: AbortSignal,
): Promise<TranslationResult> {
  return request<TranslationResult>('/v1/translate', {
    method: 'POST',
    body: { text },
    anonymous: true,
    signal,
  });
}

/**
 * Переводит слово вместе с предложением, в котором оно стоит.
 *
 * `start` и `end` — смещения слова в строке. Здесь они в единицах UTF-16 (то
 * есть обычные индексы JavaScript), а сервер ждёт байтовые смещения UTF-8 —
 * пересчёт делает {@link utf8ByteOffset}. Для кириллицы это разные числа, и без
 * пересчёта тегом пометилось бы не то место.
 */
export function translateInContext(
  sentence: string,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<TranslationResult> {
  return request<TranslationResult>('/v1/translate/context', {
    method: 'POST',
    body: {
      sentence,
      start: utf8ByteOffset(sentence, start),
      end: utf8ByteOffset(sentence, end),
    },
    anonymous: true,
    signal,
  });
}

/**
 * Пересчитывает индекс строки JavaScript в смещение в байтах UTF-8.
 *
 * JavaScript индексирует строку в единицах UTF-16: кириллическая буква занимает
 * одну, но в UTF-8 весит два байта. Сервер написан на Go, где строка — это
 * байты, поэтому без пересчёта смещение слова в сербском тексте уехало бы
 * примерно вдвое и перевод вернулся бы для соседнего слова.
 */
export function utf8ByteOffset(text: string, index: number): number {
  if (index <= 0) return 0;
  const clamped = Math.min(index, text.length);
  return new TextEncoder().encode(text.slice(0, clamped)).length;
}

/**
 * Вырезает предложение вокруг слова.
 *
 * Переводчику нужен контекст, но не весь абзац: чем короче фрагмент, тем
 * стабильнее выравнивание и быстрее ответ. Возвращает окно и пересчитанные
 * относительно него границы слова.
 */
export function sentenceWindow(
  text: string,
  start: number,
  end: number,
  maxLength = 600,
): { text: string; start: number; end: number } {
  const enders = '.!?…\n';

  let from = 0;
  for (let i = start - 1; i >= 0; i--) {
    if (enders.includes(text[i] ?? '')) {
      from = i + 1;
      break;
    }
  }
  while (from < start && /\s/.test(text[from] ?? '')) from++;

  let to = text.length;
  for (let i = end; i < text.length; i++) {
    if (enders.includes(text[i] ?? '')) {
      to = i + 1;
      break;
    }
  }

  // Подстраховка от «предложения» длиной в страницу: в книгах встречаются
  // абзацы без единой точки.
  if (to - from > maxLength) {
    from = Math.max(0, start - maxLength / 3);
    to = Math.min(text.length, end + maxLength / 3);
  }

  return { text: text.slice(from, to), start: start - from, end: end - from };
}
