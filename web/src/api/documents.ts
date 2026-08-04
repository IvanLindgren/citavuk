import { request } from './client';
import { parseBlocks, translatableText, withTranslation } from '../lib/blocks';

/**
 * Перевод загруженного документа на сербский.
 *
 * Перевод идёт заявкой и кусками, а не одним запросом. Книга переводится
 * минуты: единственный запрос упёрся бы в таймаут прокси, не показал бы хода
 * работ и при обрыве связи потерял бы всё сделанное — вместе с суточным
 * пределом, который к тому моменту уже израсходован.
 *
 * Что переводить, решает клиент: только здесь известно, где в книге текст, а
 * где адрес картинки или ячейка таблицы. Сервер переводит присланный список
 * строк один в один.
 */

export interface DocumentLanguage {
  /** Документ можно читать как есть. */
  serbian: boolean;
  /** Предполагаемый язык оригинала: 'sr', 'ru', 'en' либо пусто. */
  language: string;
  share: number;
  words: number;
  /** Есть ли чем переводить прямо сейчас. */
  translatable: boolean;
}

export interface TranslationQuota {
  available: boolean;
  /** Когда предел освободится, в формате RFC 3339. Пусто — доступно сейчас. */
  nextAt?: string;
  perDay: number;
  maxChars: number;
}

interface TranslationJob {
  jobId: string;
  provider: string;
  chars: number;
  providerNote: string;
}

/** Сколько абзацев отправлять на определение языка. */
const LANGUAGE_SAMPLE = 60;

/**
 * До какой длины укорачивается абзац в выборке.
 *
 * Язык виден по первым же словам, а вот целый абзац бывает огромным: у PDF в
 * один «абзац» иногда попадает целая страница. Шестьдесят таких абзацев
 * перевалили бы предел размера запроса, сервер ответил бы отказом — и книга
 * добавилась бы вообще без вопроса о переводе.
 */
const LANGUAGE_SAMPLE_CHARS = 600;

/**
 * Сколько знаков уходит в одном куске.
 *
 * Компромисс между числом запросов и временем ожидания одного ответа: на
 * восьми тысячах знаков книга умещается в пару десятков запросов, а каждый
 * отвечает за несколько секунд, поэтому полоса хода работ движется заметно.
 */
const CHUNK_CHARS = 8000;

/** Определяет, на сербском ли документ. Аккаунт не нужен. */
export async function detectLanguage(
  paragraphs: string[],
  signal?: AbortSignal,
): Promise<DocumentLanguage> {
  return request<DocumentLanguage>('/v1/documents/language', {
    method: 'POST',
    anonymous: true,
    body: { paragraphs: trimSample(sample(paragraphs, LANGUAGE_SAMPLE)) },
    signal,
  });
}

/** Сообщает, можно ли переводить документ сейчас. */
export async function translationQuota(): Promise<TranslationQuota> {
  return request<TranslationQuota>('/v1/documents/translation/quota');
}

export interface TranslationProgress {
  /** Доля выполненного, от 0 до 1. */
  ratio: number;
  /** Чем переводится документ — показывается человеку. */
  providerNote: string;
}

/**
 * Переводит книгу на сербский.
 *
 * Возвращает новый список абзацев той же длины: картинки остаются на своих
 * местах, у таблиц переводятся ячейки. Сохранение соответствия «абзац к
 * абзацу» — главный инвариант: сдвиг хотя бы на один элемент развалил бы всю
 * оставшуюся книгу, и заметно это стало бы не сразу.
 */
export async function translateDocument(
  title: string,
  paragraphs: string[],
  onProgress: (progress: TranslationProgress) => void = () => undefined,
  sourceLang = '',
  signal?: AbortSignal,
): Promise<string[]> {
  const blocks = parseBlocks(paragraphs);
  // Плоский список строк и карта «строка → её блок». Иначе после ответа
  // сервера было бы нечем разложить перевод обратно по ячейкам таблиц.
  const texts: string[] = [];
  const owner: number[] = [];
  blocks.forEach((block, index) => {
    for (const text of translatableText(block)) {
      texts.push(text);
      owner.push(index);
    }
  });

  const chars = texts.reduce((sum, text) => sum + text.length, 0);
  const job = await request<TranslationJob>('/v1/documents/translation', {
    method: 'POST',
    body: { title, chars, sourceLang },
    signal,
  });
  onProgress({ ratio: 0, providerNote: job.providerNote });

  const translated: string[] = [];
  let done = 0;

  for (let start = 0; start < texts.length; ) {
    let end = start;
    let size = 0;
    while (end < texts.length) {
      const length = (texts[end] ?? '').length;
      // Первая строка куска берётся всегда: иначе одна строка длиннее предела
      // остановила бы цикл навсегда.
      if (end > start && size + length > CHUNK_CHARS) break;
      size += length;
      end++;
    }

    const chunk = texts.slice(start, end);
    const result = await request<{ paragraphs: string[] }>(
      `/v1/documents/translation/${job.jobId}/chunk`,
      {
        method: 'POST',
        body: { paragraphs: chunk },
        // Кусок переводится внешним сервисом и может идти долго: обычные
        // двадцать секунд обрывали бы работу на ровном месте.
        timeoutMs: 180_000,
        signal,
      },
    );

    // Ответ обязан быть той же длины. Молча принять другой значит сдвинуть
    // весь остаток книги относительно оригинала.
    if (result.paragraphs.length !== chunk.length) {
      throw new Error('Переводчик вернул не столько абзацев, сколько получил.');
    }
    translated.push(...result.paragraphs);

    done += size;
    start = end;
    onProgress({
      ratio: chars > 0 ? Math.min(1, done / chars) : 1,
      providerNote: job.providerNote,
    });
  }

  // Заявка закрывается для отчёта; на предел это уже не влияет, поэтому
  // неудача здесь не должна отменять готовый перевод.
  void request(`/v1/documents/translation/${job.jobId}/finish`, {
    method: 'POST',
  }).catch(() => undefined);

  // Собираем абзацы обратно: каждому блоку — его строки, в исходном порядке.
  const out: string[] = [];
  let cursor = 0;
  blocks.forEach((block, index) => {
    const mine: string[] = [];
    while (cursor < owner.length && owner[cursor] === index) {
      // Оригинал — запасной вариант на случай, если перевода не нашлось:
      // пустая ячейка выглядела бы как потеря данных.
      mine.push(translated[cursor] ?? texts[cursor] ?? '');
      cursor++;
    }
    out.push(withTranslation(block, mine));
  });
  return out;
}

/**
 * Берёт абзацы равномерно по всему документу.
 *
 * Именно равномерно: у переводных книг начало занято выходными данными на
 * языке оригинала, а у сербских учебников — английским предисловием, и по
 * первым абзацам язык книги определился бы неверно.
 */
function sample(paragraphs: string[], limit: number): string[] {
  const meaningful = paragraphs.filter((text) => text.trim().length > 20);
  if (meaningful.length <= limit) return meaningful;

  const step = meaningful.length / limit;
  const out: string[] = [];
  for (let i = 0; i < limit; i++) {
    const paragraph = meaningful[Math.floor(i * step)];
    if (paragraph) out.push(paragraph);
  }
  return out;
}

/** Укорачивает абзацы выборки, чтобы запрос не упёрся в предел размера. */
function trimSample(paragraphs: string[]): string[] {
  return paragraphs.map((text) =>
    text.length > LANGUAGE_SAMPLE_CHARS ? text.slice(0, LANGUAGE_SAMPLE_CHARS) : text,
  );
}
