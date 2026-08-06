/**
 * Нарезка текста на куски, которые синтезатор речи соглашается озвучить.
 *
 * `/audio/tts` отказывается озвучивать больше 400 символов и отвечает 400 Bad
 * Request. Реплика подкаста в этот предел укладывается всегда, поэтому предел и
 * не мешал, — а карточка Вукотока это 100–150 слов, то есть 700–1100 символов.
 * Озвучка карточек не работала вовсе: кнопка нажималась, запрос уходил, ответ
 * приходил пустой ошибкой, и значок молча возвращался в исходное положение.
 *
 * Резать надо по границе предложения. Речь синтезируется каждому куску отдельно,
 * и на стыке всегда слышна пауза: на точке она звучит как обычная пауза между
 * фразами, а посреди фразы — как заедание.
 */

/** Предел сервера. Меньше на единицу — за границу лучше не заходить впритык. */
export const TTS_MAX_CHARS = 399;

/**
 * Режет текст на куски не длиннее `maxChars`.
 *
 * Соседние предложения объединяются, пока помещаются: чем меньше кусков, тем
 * меньше пауз и запросов. Предложение длиннее предела режется по словам, а
 * слово длиннее предела — по символам; и то и другое в сербском тексте не
 * встречается, но пустой список вместо озвучки был бы хуже.
 */
export function speechChunks(text: string, maxChars = TTS_MAX_CHARS): string[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const value = current.trim();
    if (value !== '') chunks.push(value);
    current = '';
  };

  for (const sentence of splitSentences(trimmed)) {
    for (const part of fit(sentence, maxChars)) {
      if (current !== '' && current.length + part.length > maxChars) flush();
      current += part;
    }
  }
  flush();

  return chunks;
}

/** Предложения вместе с их знаками препинания и пробелом после. */
function splitSentences(text: string): string[] {
  return text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
}

/** Кусок, который сам по себе длиннее предела: режем по словам, потом по буквам. */
function fit(part: string, maxChars: number): string[] {
  if (part.length <= maxChars) return [part];

  const out: string[] = [];
  let current = '';
  for (const word of part.split(/(\s+)/)) {
    if (word.length > maxChars) {
      if (current !== '') { out.push(current); current = ''; }
      for (let at = 0; at < word.length; at += maxChars) {
        out.push(word.slice(at, at + maxChars));
      }
      continue;
    }
    if (current.length + word.length > maxChars) {
      out.push(current);
      current = '';
      // Пробел в начале куска съел бы место и ничего не дал бы речи.
      if (word.trim() === '') continue;
    }
    current += word;
  }
  if (current !== '') out.push(current);
  return out;
}
