import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  analyzeWord,
  type EnglishAnalysis,
  type ParadigmTable,
  type ReflexiveParticle,
  type WordAccent,
  type WordAnalysis,
} from '../api/analyze';
import { ApiError } from '../api/client';
import {
  sentenceWindow,
  translateInContext,
  translateText,
  type TranslationResult,
} from '../api/translate';
import { parseBlock } from '../lib/blocks';
import { BIONIC_RATIO, type BionicLevel } from '../lib/readerSettings';
import { Mascot, type MascotPose } from './Mascot';
import { Link } from '../lib/router';
import { saveVocabularyWord } from '../lib/vocabulary';
import { tokenize, type Token } from '../lib/tokenize';
import { useSync } from '../state/sync';
import { Spinner } from './ui';
import { TtsVoicePicker } from './TtsVoicePicker';
import { HiSpeakerWave, HiStop } from 'react-icons/hi2';
import { ttsAudioUrl } from '../api/listening';
import { serbianIpa, serbianIpaParts, splitAccented } from '../lib/serbianPronunciation';

export interface ReaderMark {
  start: number;
  end: number;
  kind: 'strong' | 'emphasis' | 'strike' | 'code' | 'link' | 'font' | 'size' | 'audio';
  value?: string;
}

/**
 * Сербский текст, в котором можно нажать любое слово и увидеть его перевод.
 *
 * Это ядро продукта, поэтому здесь же и главная особенность перевода: слово
 * переводится не отдельно, а внутри своего предложения. Разница видна прямо на
 * этих примерах — «kuća» в отрыве от фразы переводится как «собака», а в
 * контексте верно, «дом». Сервер помечает такой ответ признаком `aligned`, и
 * интерфейс показывает разницу честно, а не выдаёт догадку за словарную статью.
 */
export function WordReader({
  paragraphs,
  bookId = null,
  className = '',
  bionic = 0,
  paragraphClassName = '',
  paragraphStyle,
  paragraphMarks,
}: {
  paragraphs: string[];
  bookId?: string | null;
  className?: string;
  /** Выделение основы слова жирным — то же, что в приложении. */
  bionic?: BionicLevel;
  /** Оформление абзаца задаёт читалка: кегль, интерлиньяж, отступы. */
  paragraphClassName?: string;
  paragraphStyle?: CSSProperties;
  /** Inline Markdown formatting ranges for each source paragraph. */
  paragraphMarks?: ReaderMark[][];
}) {
  const { sync } = useSync();
  const readerRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<{
    paragraph: number;
    /** Номер ячейки, если слово нажали внутри таблицы. */
    cell?: number;
    token: Token;
  } | null>(null);
  // Куда ставить карточку: прямоугольник нажатого слова на экране.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [selectedPhrase, setSelectedPhrase] = useState<string | null>(null);
  // Где лежит выделенная фраза. Предложение перевести встаёт рядом с ней:
  // внизу экрана оно оставалось незамеченным, а на длинной странице человек
  // ещё и терял место, куда смотрел.
  const [phraseAnchor, setPhraseAnchor] = useState<DOMRect | null>(null);
  const [activePhrase, setActivePhrase] = useState<string | null>(null);

  const lookup = useWordLookup();
  const { result, analysis, error, loading } = lookup;

  useEffect(() => {
    let frame = 0;

    const updateSelection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selection = window.getSelection();
        const phrase = readerSelectionText(selection, readerRef.current);
        setSelectedPhrase(phrase);
        setPhraseAnchor(phrase ? selectionRect(selection) : null);
      });
    };

    document.addEventListener('selectionchange', updateSelection);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', updateSelection);
    };
  }, []);

  const selectWord = useCallback(
    async (
      paragraphIndex: number,
      token: Token,
      rect: DOMRect,
      // Ячейка таблицы: сам абзац там — служебная метка, поэтому и текст для
      // контекста, и номер ячейки приходят снаружи. Без номера выделение
      // подсветило бы одинаковое слово сразу во всех ячейках таблицы.
      cell?: { index: number; text: string },
    ) => {
      const text = cell?.text ?? paragraphs[paragraphIndex];
      if (!text) return;

      setActivePhrase(null);
      setSelectedPhrase(null);
      setSelected({ paragraph: paragraphIndex, cell: cell?.index, token });
      setAnchor(rect);

      // Запуск внутри пользовательского клика не блокируется политикой autoplay.
      playAudio(new Audio(ttsAudioUrl(token.text)));

      await lookup.lookupWord(text, token);
    },
    [lookup, paragraphs],
  );

  const translatePhrase = useCallback(
    async (phrase: string, rect: DOMRect | null) => {
      setSelected(null);
      // Карточка перевода встаёт там же, где стояло предложение перевести, —
      // у самой фразы.
      setAnchor(rect);
      setActivePhrase(phrase);
      await lookup.lookupPhrase(phrase);
    },
    [lookup],
  );

  const close = useCallback(() => {
    lookup.reset();
    setSelected(null);
    setSelectedPhrase(null);
    setActivePhrase(null);
    window.getSelection()?.removeAllRanges();
  }, [lookup]);

  // Escape закрывает карточку — привычное поведение для всплывающих панелей.
  useEffect(() => {
    if (!selected && !activePhrase) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, activePhrase, close]);

  // Возвратный глагол подсвечивается вместе со своей частицей: «se» — часть
  // слова, а не соседнее слово, и подсветка одного «zove» показывала бы разбор
  // не того, что переведено в карточке.
  const cliticStart = useMemo(() => {
    if (!selected || !analysis?.reflexive) return null;
    const paragraph = paragraphs[selected.paragraph] ?? '';
    const source =
      selected.cell === undefined ? plainTextOf(paragraph) : cellTextAt(paragraph, selected.cell);
    return companionStart(source, selected.token, analysis.reflexive);
  }, [analysis, paragraphs, selected]);

  return (
    <div className={className}>
      <div ref={readerRef} className={paragraphClassName ? '' : 'space-y-4'}>
        {paragraphs.map((paragraph, paragraphIndex) => {
          // Картинка и таблица — те же абзацы, но с меткой в начале
          // (см. lib/blocks.ts). Разбор идёт здесь, а не в читалке, чтобы
          // книга с иллюстрациями одинаково открывалась везде, где
          // используется WordReader: и в читалке, и в уроке, и в общей ссылке.
          const block = parseBlock(paragraph);
          if (block.kind === 'image') {
            return <BookImage key={paragraphIndex} url={block.url} alt={block.alt} />;
          }
          if (block.kind === 'table') {
            return (
              <BookTable
                key={paragraphIndex}
                rows={block.rows}
                bionic={bionic}
                style={paragraphStyle}
                selectedCell={
                  selected?.paragraph === paragraphIndex ? selected.cell ?? null : null
                }
                selectedStart={
                  selected?.paragraph === paragraphIndex ? selected.token.start : null
                }
                cliticStart={selected?.paragraph === paragraphIndex ? cliticStart : null}
                onSelect={(cellIndex, cellText, token, rect) =>
                  selectWord(paragraphIndex, token, rect, {
                    index: cellIndex,
                    text: cellText,
                  })
                }
              />
            );
          }

          return (
            <Paragraph
              key={paragraphIndex}
              text={block.text}
              bionic={bionic}
              className={paragraphClassName}
              style={paragraphStyle}
              marks={paragraphMarks?.[paragraphIndex] ?? []}
              selectedStart={
                selected?.paragraph === paragraphIndex ? selected.token.start : null
              }
              cliticStart={selected?.paragraph === paragraphIndex ? cliticStart : null}
              onSelect={(token, rect) => selectWord(paragraphIndex, token, rect)}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {selectedPhrase && !activePhrase && (
          <PhraseSelectionBar
            key={selectedPhrase}
            phrase={selectedPhrase}
            anchor={phraseAnchor}
            onTranslate={() => void translatePhrase(selectedPhrase, phraseAnchor)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(selected || activePhrase) && (
          <WordCard
            key={
              activePhrase
                ? `phrase-${activePhrase}`
                : `${selected!.paragraph}-${selected!.cell ?? ''}-${selected!.token.start}`
            }
            word={activePhrase ?? selected!.token.text}
            kind={activePhrase ? 'phrase' : 'word'}
            anchor={anchor}
            result={result}
            analysis={analysis}
            error={error}
            loading={loading}
            onClose={close}
            onSave={
              result
                ? async (asLemma) => {
                    const surface = activePhrase ?? selected!.token.text;
                    await saveFromCard(bookId, surface, analysis, result, asLemma);
                    void sync();
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Загрузка разбора и перевода — одна на все места, где можно нажать слово.
 *
 * Раньше у подкаста был свой упрощённый запрос и своя карточка: без разбора
 * формы, без таблиц склонения, без произношения и без выбора, что сохранить в
 * словарь. Одно и то же действие давало разный результат в зависимости от
 * раздела, и это выглядело поломкой, а не задумкой.
 */
export function useWordLookup() {
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [analysis, setAnalysis] = useState<WordAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Прошлый запрос отменяется: пользователь может быстро тыкать по словам, и
  // ответ на устаревший запрос не должен перебить свежий.
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  const begin = useCallback(() => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setResult(null);
    setAnalysis(null);
    setError(null);
    setLoading(true);
    return controller;
  }, []);

  const reset = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
    setResult(null);
    setAnalysis(null);
    setError(null);
    setLoading(false);
  }, []);

  const lookupWord = useCallback(
    async (text: string, token: Token) => {
      const controller = begin();
      const window = sentenceWindow(text, token.start, token.end);

      // Разбор идёт параллельно переводу и своей ошибкой перевод не рушит:
      // словарь знает не каждое слово, а перевод нужен всегда.
      // Предложение уходит вместе со словом: по нему сервер выбирает язык
      // («on», «to», «most» — одновременно сербские и английские слова) и
      // находит возвратную частицу «se», если она относится к этому глаголу.
      void analyzeWord(token.text, controller.signal, window.text, window.start, window.end)
        .then((parsed) => {
          if (!controller.signal.aborted) setAnalysis(parsed);
        })
        .catch(() => {});

      try {
        const translation = await translateInContext(
          window.text,
          window.start,
          window.end,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult(translation);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught.message : 'Не удалось перевести слово.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [begin],
  );

  const lookupPhrase = useCallback(
    async (phrase: string) => {
      const controller = begin();
      try {
        const translation = await translateText(phrase, controller.signal);
        if (controller.signal.aborted) return;
        setResult(translation);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiError ? caught.message : 'Не удалось перевести выделенную фразу.',
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [begin],
  );

  return { result, analysis, error, loading, lookupWord, lookupPhrase, reset };
}

/**
 * Разбор одного слова вне читалки: та же карточка, что в книгах.
 *
 * Нужна там, где текст выводится своей вёрсткой — в караоке подкаста строка
 * подсвечивается по ходу звука, и заменить её на WordReader целиком нельзя.
 */
export function WordLookupCard({
  sentence,
  token,
  anchor = null,
  bookId = null,
  onClose,
}: {
  sentence: string;
  token: Token;
  anchor?: DOMRect | null;
  bookId?: string | null;
  onClose: () => void;
}) {
  const { sync } = useSync();
  const { result, analysis, error, loading, lookupWord, reset } = useWordLookup();

  useEffect(() => {
    void lookupWord(sentence, token);
    return reset;
  }, [lookupWord, reset, sentence, token]);

  return (
    <WordCard
      word={token.text}
      kind="word"
      anchor={anchor}
      result={result}
      analysis={analysis}
      error={error}
      loading={loading}
      onClose={onClose}
      onSave={result ? (asLemma) => saveFromCard(bookId, token.text, analysis, result, asLemma).then(sync) : undefined}
    />
  );
}

/**
 * Сохранение слова в словарь: одинаковое для читалки и для подкаста.
 *
 * При сохранении словоформы в карточку кладётся ещё и разбор этой формы: иначе
 * через неделю непонятно, почему в словаре «svira», а не «svirati».
 */
async function saveFromCard(
  bookId: string | null,
  surface: string,
  analysis: WordAnalysis | null,
  result: TranslationResult,
  asLemma: boolean,
): Promise<void> {
  const lemma = analysis?.lemma ?? '';
  const label = formLabelOf(analysis);
  const forms: Record<string, unknown> = {};
  if (!asLemma && label) {
    forms['форма в тексте'] = label;
    if (lemma) forms['начальная форма'] = lemma;
  }
  // Возвратный глагол уходит в словарь вместе с частицей: «vratiti» и
  // «vratiti se» — разные слова, и карточка без «se» учила бы не тому.
  if (asLemma && analysis?.reflexive?.lemma) {
    await saveVocabularyWord({
      bookId,
      word: analysis.reflexive.lemma,
      lemma: analysis.reflexive.lemma,
      pos: analysis.upos,
      translation: result.text,
      forms,
    });
    return;
  }
  await saveVocabularyWord({
    bookId,
    word: asLemma && lemma ? lemma : surface,
    lemma,
    pos: analysis?.upos,
    translation: result.text,
    forms,
  });
}

/**
 * Иллюстрация из книги.
 *
 * Картинка лежит в общем хранилище и грузится лениво: в учебнике их десятки, и
 * тянуть их все при открытии книги значит потратить чужой трафик на страницы,
 * до которых читатель может и не дойти.
 *
 * Битая ссылка прячет картинку целиком, а не оставляет значок «нет файла»:
 * серый прямоугольник посреди текста выглядит как поломка читалки, хотя дело в
 * исходном документе.
 */
function BookImage({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <figure className="my-[var(--reader-gap)]">
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl"
      />
      {alt && (
        <figcaption className="mt-2 text-center text-sm italic opacity-70">
          {alt}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Таблица из книги.
 *
 * Ячейки остаются разбираемыми: в сербском учебнике таблица — это чаще всего
 * склонение или спряжение, то есть ровно то место, где по слову и хочется
 * нажать.
 *
 * Прокрутка своя, а не общая для страницы: широкая таблица иначе растянула бы
 * весь лист и увела текст за край экрана телефона.
 */
function BookTable({
  rows,
  bionic,
  style,
  selectedCell,
  selectedStart,
  cliticStart,
  onSelect,
}: {
  rows: string[][];
  bionic: BionicLevel;
  style?: CSSProperties;
  selectedCell: number | null;
  selectedStart: number | null;
  cliticStart: number | null;
  onSelect: (
    cellIndex: number,
    cellText: string,
    token: Token,
    anchor: DOMRect,
  ) => void;
}) {
  const [header, ...body] = rows;
  let cellIndex = 0;

  const cell = (text: string, index: number) => (
    <Paragraph
      text={text}
      bionic={bionic}
      className=""
      marks={[]}
      selectedStart={selectedCell === index ? selectedStart : null}
      cliticStart={selectedCell === index ? cliticStart : null}
      onSelect={(token, rect) => onSelect(index, text, token, rect)}
    />
  );

  return (
    <div
      className="my-[var(--reader-gap)] overflow-x-auto"
      style={style}
      // Прокрутку таблицы нужно уметь достать с клавиатуры, иначе её правая
      // часть недоступна тем, кто не пользуется мышью.
      tabIndex={0}
      role="group"
      aria-label="Таблица из книги"
    >
      <table className="w-full border-collapse text-[0.92em]">
        {header && (
          <thead>
            <tr>
              {header.map((text) => {
                const index = cellIndex++;
                return (
                  <th
                    key={index}
                    scope="col"
                    className="border border-current/20 px-3 py-2 text-left align-top font-semibold"
                  >
                    {cell(text, index)}
                  </th>
                );
              })}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((text) => {
                const index = cellIndex++;
                return (
                  <td
                    key={index}
                    className="border border-current/20 px-3 py-2 align-top"
                  >
                    {cell(text, index)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Paragraph({
  text,
  selectedStart,
  cliticStart,
  onSelect,
  bionic,
  className,
  style,
  marks,
}: {
  text: string;
  selectedStart: number | null;
  /** Начало возвратной частицы «se», если она относится к выбранному глаголу. */
  cliticStart: number | null;
  onSelect: (token: Token, anchor: DOMRect) => void;
  bionic: BionicLevel;
  className: string;
  style?: CSSProperties;
  marks: ReaderMark[];
}) {
  // Разбор строки не зависит от состояния, но и не бесплатен — считаем один раз
  // на текст, а не на каждую отрисовку выделения.
  const tokens = useMemo(() => tokenize(text), [text]);

  const activate = (token: Token, element: HTMLElement) => {
    if (!shouldOpenWord(window.getSelection())) return;
    onSelect(token, element.getBoundingClientRect());
  };

  return (
    <p
      className={
        className ||
        'reader-selectable font-display text-lg leading-relaxed sm:text-xl sm:leading-[1.85]'
      }
      style={style}
    >
      {tokens.map((token, index) =>
        token.isWord ? (
          <span
            key={index}
            onClick={(event) => activate(token, event.currentTarget)}
            data-reader-word
            className={[
              'reader-word transition-colors duration-150',
              'hover:bg-gold/35',
              selectedStart === token.start
                ? 'bg-gold/55 text-[var(--text)] shadow-[inset_0_-2px_0_0_var(--accent)]'
                : '',
              // Частица подсвечивается слабее глагола: она относится к нему,
              // но нажали всё-таки не на неё.
              cliticStart === token.start
                ? 'bg-gold/30 text-[var(--text)] shadow-[inset_0_-2px_0_0_var(--accent)]'
                : '',
            ].join(' ')}
          >
            {marks.length > 0
              ? <MarkedToken text={text} token={token} marks={marks} />
              : bionic > 0
                ? <BionicWord text={token.text} level={bionic} />
                : token.text}
          </span>
        ) : (
          <span key={index}>
            {marks.length > 0
              ? <MarkedToken text={text} token={token} marks={marks} />
              : token.text}
          </span>
        ),
      )}
    </p>
  );
}

function MarkedToken({ text, token, marks }: { text: string; token: Token; marks: ReaderMark[] }) {
  const boundaries = new Set([token.start, token.end]);
  for (const mark of marks) {
    if (mark.start > token.start && mark.start < token.end) boundaries.add(mark.start);
    if (mark.end > token.start && mark.end < token.end) boundaries.add(mark.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const pieces: ReactNode[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (start === undefined || end === undefined || start >= end) continue;
    const active = marks.filter((mark) => mark.start <= start && mark.end >= end);
    const value = text.slice(start, end);
    const style: CSSProperties = {};
    const classes: string[] = [];
    let href: string | undefined;
    for (const mark of active) {
      if (mark.kind === 'strong') style.fontWeight = 700;
      if (mark.kind === 'emphasis') style.fontStyle = 'italic';
      if (mark.kind === 'strike') style.textDecoration = 'line-through';
      if (mark.kind === 'font') style.fontFamily = mark.value === 'sans' ? 'var(--font-sans)' : 'var(--font-display)';
      if (mark.kind === 'size' && mark.value) style.fontSize = `${mark.value}px`;
      if (mark.kind === 'code') classes.push('rounded bg-[var(--bg-sunken)] px-1 py-0.5 font-mono text-[0.9em]');
      if (mark.kind === 'audio') classes.push('rounded bg-[var(--accent)] px-0.5 text-white');
      if (mark.kind === 'link') href = mark.value;
    }
    const key = `${start}-${end}`;
    pieces.push(href
      ? <a key={key} href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline decoration-1 underline-offset-2" style={style} onClick={(event) => event.stopPropagation()}>{value}</a>
      : <span key={key} className={classes.join(' ')} style={style}>{value}</span>);
  }
  return <>{pieces}</>;
}

/**
 * Слово с выделенной основой.
 *
 * Приём тот же, что в приложении: жирным набирается начало слова, и глаз
 * цепляется за него, не вчитываясь в окончание. На чужом языке это заметно
 * помогает — сербские падежные окончания длинные и все разные.
 *
 * Длина выделения считается по кодовым точкам, а не по индексу в строке:
 * `split('')` разорвал бы суррогатную пару, а `Intl.Segmenter` здесь избыточен —
 * в сербском нет составных графем, из-за которых он был бы нужен.
 */
export function bionicSplit(text: string, level: BionicLevel): [string, string] {
  const ratio = BIONIC_RATIO[level];
  if (ratio <= 0) return [text, ''];
  const letters = [...text];
  // Хотя бы одна буква, но не всё слово целиком: сплошь жирный текст перестаёт
  // выделять что-либо и просто утомляет.
  const head = Math.min(
    Math.max(1, Math.round(letters.length * ratio)),
    Math.max(1, letters.length - 1),
  );
  return [letters.slice(0, head).join(''), letters.slice(head).join('')];
}

function BionicWord({ text, level }: { text: string; level: BionicLevel }) {
  const [head, tail] = bionicSplit(text, level);
  return (
    <>
      <b className="font-bold">{head}</b>
      {tail}
    </>
  );
}

/**
 * Где в тексте лежит второе слово пары «глагол + se».
 *
 * Нажали глагол — ищется частица, нажали частицу — её глагол. Сервер называет
 * спутника написанием и стороной, а не смещением: пересылать байтовые смещения
 * Go в индексы JavaScript значит пересчитывать UTF-8 в UTF-16 в обе стороны и
 * ошибиться на кириллице.
 */
export function companionStart(
  text: string,
  token: Token,
  reflexive: ReflexiveParticle,
): number | null {
  const tokens = tokenize(text).filter((item) => item.isWord);
  const index = tokens.findIndex((item) => item.start === token.start);
  if (index < 0) return null;

  const wanted = reflexive.companion.toLocaleLowerCase('sr');
  const step = reflexive.before ? -1 : 1;
  for (let at = index + step; at >= 0 && at < tokens.length; at += step) {
    const candidate = tokens[at]!;
    if (candidate.text.toLocaleLowerCase('sr') === wanted) return candidate.start;
    // Дальше одного соседнего слова спутник ищется, только если сервер сказал,
    // что пара стоит не вплотную.
    if (reflexive.adjacent) return null;
  }
  return null;
}

/** Текст ячейки таблицы по её сквозному номеру — тому же, что в BookTable. */
function cellTextAt(paragraph: string, cell: number): string {
  const block = parseBlock(paragraph);
  return block.kind === 'table' ? block.rows.flat()[cell] ?? '' : '';
}

/** Текст обычного абзаца без служебной метки блока. */
function plainTextOf(paragraph: string): string {
  const block = parseBlock(paragraph);
  return block.kind === 'text' ? block.text : '';
}

/**
 * Одиночный клик открывает разбор, а протягивание мышью или долгое нажатие
 * остаётся нативным выделением текста. Проверяем не только `isCollapsed`:
 * Safari иногда сохраняет непустой текст в Selection ещё один тик после
 * отпускания пальца.
 */
export function shouldOpenWord(selection: Selection | null): boolean {
  return selection === null || selection.isCollapsed || selection.toString().trim() === '';
}

/**
 * Возвращает выделенную внутри читалки фразу. Диапазон, который начинается или
 * заканчивается за пределами текста книги, игнорируется, чтобы системное
 * выделение заголовков и кнопок не открывало переводчик.
 */
export function readerSelectionText(
  selection: Selection | null,
  root: HTMLElement | null,
): string | null {
  if (
    !selection ||
    !root ||
    selection.isCollapsed ||
    selection.rangeCount === 0
  ) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }

  const text = selection.toString().replace(/\s+/gu, ' ').trim();
  return text || null;
}

function PhraseSelectionBar({
  phrase,
  anchor,
  onTranslate,
}: {
  phrase: string;
  /** Прямоугольник выделения; null — панель встаёт внизу экрана. */
  anchor: DOMRect | null;
  onTranslate: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const placement = useToolbarPlacement(anchor);
  const tooLong = [...phrase].length > 4000;
  const preview =
    phrase.length > 72 ? `${phrase.slice(0, 69).trimEnd()}…` : phrase;

  const bar = (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className={[
        // Слой выше всех шторок приложения: разбор вызывается ИЗ них — из
        // шторки Вукотока, из панели урока, — и панель «перевести выделенное»
        // на z-40 уходила под ту самую шторку, в которой её и вызвали.
        'fixed z-[85] flex items-center gap-3 rounded-2xl border border-[var(--line)]',
        'bg-[var(--bg-raised)] p-2.5 shadow-[var(--shadow-lift)]',
        placement.floating ? '' : 'inset-x-3 bottom-5 mx-auto max-w-xl',
      ].join(' ')}
      style={placement.style}
      role="toolbar"
      aria-label="Действия с выделенной фразой"
    >
      <div className="min-w-0 flex-1 px-2">
        <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">
          {tooLong ? 'Фрагмент слишком длинный' : 'Выделенная фраза'}
        </div>
        <div className="truncate font-display text-sm text-[var(--text)]">
          {preview}
        </div>
      </div>
      <button
        type="button"
        disabled={tooLong}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onTranslate}
        className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        Перевести
      </button>
    </motion.div>
  );

  // WordReader находится внутри анимированной страницы с CSS transform.
  // Такой предок меняет систему координат position: fixed, и viewport-координаты
  // выделения повторно смещались на положение листа. Portal выносит панель из
  // transform-контейнера и возвращает ей настоящие координаты окна.
  return typeof document === 'undefined' ? bar : createPortal(bar, document.body);
}

function WordCard({
  word,
  kind,
  anchor,
  result,
  analysis,
  error,
  loading,
  onClose,
  onSave,
}: {
  word: string;
  kind: 'word' | 'phrase';
  /** Положение нажатого слова; null — карточка встаёт внизу экрана. */
  anchor: DOMRect | null;
  result: TranslationResult | null;
  analysis: WordAnalysis | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onSave?: (asLemma: boolean) => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Что уйдёт в словарь: начальная форма или словоформа из текста. По
  // умолчанию начальная — это словарная статья, и повторять её карточкой
  // полезнее, чем одну случайную форму.
  const [saveLemma, setSaveLemma] = useState(true);
  const placement = useCardPlacement(anchor);
  const formChoice = hasFormChoice(kind, word, analysis);
  const reflexive = kind === 'word' ? analysis?.reflexive : undefined;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const pronounce = useCallback(() => {
    audioRef.current?.pause();
    const audio = new Audio(ttsAudioUrl(word, analysis?.english ? 'en' : 'sr'));
    audioRef.current = audio;
    setSpeaking(true);
    audio.addEventListener('ended', () => setSpeaking(false), { once: true });
    audio.addEventListener('error', () => setSpeaking(false), { once: true });
    try {
      const started = audio.play();
      void started?.catch(() => setSpeaking(false));
    } catch {
      setSpeaking(false);
    }
  }, [analysis?.english, word]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const card = (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: placement.floating ? 8 : 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={
        placement.floating
          ? 'fixed z-[90] p-2'
          : 'fixed inset-x-0 bottom-0 z-[90] mx-auto max-w-2xl p-3 sm:p-5'
      }
      style={placement.style}
      role="dialog"
      aria-label={
        kind === 'phrase' ? 'Перевод выделенной фразы' : `Разбор слова ${word}`
      }
    >
      {/* Таблицы склонения выше экрана, поэтому карточка прокручивается, а
          шапка со словом остаётся на виду. */}
      <div
        className="flex flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-lift)]"
        style={{ maxHeight: placement.contentMaxHeight }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* Пара идёт в заголовок целиком: «zove» и «zove se» — разные
                  слова, и показывать одно, а переводить другое нельзя. Слабее
                  набрано то, на что не нажимали: при нажатии на частицу это
                  глагол, при нажатии на глагол — частица. */}
              <div className="font-display text-2xl font-bold text-[var(--accent)]">
                {reflexive?.onParticle && (
                  <span className="text-[var(--text-muted)]">{reflexive.verb} </span>
                )}
                {word}
                {reflexive && !reflexive.onParticle && (
                  <span className="text-[var(--text-muted)]">
                    {' '}
                    {reflexive.particle.toLocaleLowerCase('sr')}
                  </span>
                )}
              </div>
              {kind === 'word' && (
                <button
                  type="button"
                  onClick={pronounce}
                  className="rounded-full p-2 text-[var(--accent)] hover:bg-[var(--bg-sunken)]"
                  aria-label="Произнести слово"
                  title="Произнести слово"
                >
                  {speaking ? <HiStop className="size-5" /> : <HiSpeakerWave className="size-5" />}
                </button>
              )}
            </div>
            {kind === 'word' && !analysis?.english && (
              <>
                <div className="mt-0.5 text-sm text-[var(--text-muted)]">
                  {/* У частицы «se» своего ударения нет — она клитика, и
                      показывать транскрипцию нужно для глагола пары. */}
                  <Transcription
                    word={reflexive?.onParticle ? reflexive.verb : word}
                    accent={analysis?.accent}
                  />
                </div>
                <div className="mt-2"><TtsVoicePicker /></div>
              </>
            )}
            {/* Часть речи и основа — то, что нужно раньше перевода: по ним
                слово ищется в словаре и узнаётся в другой форме. */}
            {analysis?.known && (
              <div className="mt-0.5 text-sm text-[var(--text-muted)]">
                <span className="font-semibold">
                  {reflexive ? 'возвратный глагол' : analysis.posShort}
                </span>
                {reflexive?.lemma
                  ? <> · основа <b>{reflexive.lemma}</b></>
                  : analysis.lemma !== analysis.surface.toLowerCase() && (
                      <> · основа <b>{analysis.lemma}</b></>
                    )}
              </div>
            )}
            {result?.provider && (
              <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                {result.cached ? 'из кеша' : result.provider}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="shrink-0 rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
          >
            <svg viewBox="0 0 20 20" className="size-5 fill-current" aria-hidden="true">
              <path d="M6.3 5A1 1 0 004.9 6.4L8.5 10l-3.6 3.6a1 1 0 101.4 1.4L10 11.4l3.6 3.6a1 1 0 001.4-1.4L11.4 10l3.6-3.6A1 1 0 0013.6 5L10 8.6 6.4 5z" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 py-4">
          {loading && (
            <div className="flex items-center gap-3 text-[var(--text-muted)]">
              <Spinner />
              <span className="text-sm">Переводим в контексте…</span>
            </div>
          )}

          {error && <p className="text-sm text-[var(--text-muted)]">{error}</p>}

          {/* Перевода нет (ошибка или ещё грузится), но язык уже определён —
              пометку показываем всё равно, иначе непонятно, почему разбор
              английский. */}
          {!result && !loading && kind === 'word' && analysis?.english && (
            <EnglishNotice className={error ? 'mt-4' : ''} />
          )}

          {result && !loading && (
            <div className="space-y-4">
              {/* Перевод произносит сам Читавук — так это сделано в приложении
                  («WolfBubble» в читалке). Маскот, стоящий отдельной картинкой
                  в углу, занимает место и ничего не говорит; в реплике он
                  занимает то же место осмысленно. У английского слова свой
                  маскот ниже, в пояснении, — двух в карточке быть не должно. */}
              {analysis?.english ? (
                <Field
                  label={kind === 'phrase' ? 'Перевод фразы' : 'В этом предложении'}
                  emphasis
                >
                  {result.text || '—'}
                </Field>
              ) : (
                <MascotSays
                  label={kind === 'phrase' ? 'Перевод фразы' : 'В этом предложении'}
                >
                  {result.text || '—'}
                </MascotSays>
              )}

              {result.sentence && (
                <Field label="Всё предложение">{result.sentence}</Field>
              )}

              {/* Признак выравнивания показывается только когда его нет:
                  предупреждать стоит о слабом результате, а не хвалиться
                  нормальным. */}
              {kind === 'word' && !result.aligned && (
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  Слово переведено отдельно от фразы — в контексте значение может
                  отличаться.
                </p>
              )}

              {/* Пометка про английский идёт ПОСЛЕ перевода: человек нажал
                  слово ради перевода, а объяснение — уже уточнение. */}
              {kind === 'word' && analysis?.english && <EnglishNotice />}

              {reflexive && <ReflexivePanel reflexive={reflexive} />}
              {kind === 'word' && analysis && <GrammarPanel analysis={analysis} />}
              {/* Разбора нет — и об этом надо сказать словом, а не пустым
                  местом там, где обычно стоит панель грамматики. */}
              {kind === 'word' && analysis && !analysis.english && !hasGrammar(analysis) && (
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  Эту форму Читавук в словаре не нашёл: перевод есть, а разбора и
                  склонения не будет.
                </p>
              )}
              {onSave && formChoice && (
                <SaveChoice
                  surface={word}
                  // В словарь уходит именно возвратная форма: «vratiti» и
                  // «vratiti se» — разные слова, и подпись обязана показывать
                  // то, что сохранится.
                  lemma={reflexive?.lemma ?? analysis!.lemma}
                  formLabel={formLabelOf(analysis)}
                  saveLemma={saveLemma}
                  disabled={saved}
                  onChange={setSaveLemma}
                />
              )}
              {onSave && (
                <button
                  type="button"
                  disabled={saved}
                  onClick={() => {
                    setSaveError('');
                    void onSave(formChoice ? saveLemma : true)
                      .then(() => setSaved(true))
                      .catch(() =>
                        setSaveError(
                          kind === 'phrase'
                            ? 'Не удалось сохранить фразу.'
                            : 'Не удалось сохранить слово.',
                        ),
                      );
                  }}
                  className={[
                    'w-full rounded-xl px-4 py-3 font-semibold transition-colors',
                    saved
                      ? 'border border-[var(--line)] bg-[var(--bg-sunken)] text-[var(--text-muted)]'
                      : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
                  ].join(' ')}
                >
                  {saved
                    ? kind === 'phrase'
                      ? 'Фраза сохранена'
                      : 'Слово сохранено'
                    : kind === 'phrase'
                      ? 'Добавить фразу в словарь'
                      : formChoice
                        ? 'Сохранить'
                        : 'Добавить в словарь'}
                </button>
              )}
              {/* Куда именно попало сохранённое — вопрос, который возникает
                  ровно здесь, поэтому и ответ здесь же, а не в разделе помощи. */}
              {saved && (
                <p className="text-center text-sm text-[var(--text-muted)]">
                  Появится в{' '}
                  <Link
                    to="/cards"
                    className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    карточках повторения
                  </Link>{' '}
                  — сегодня же.
                </p>
              )}
              {saveError && (
                <p className="text-sm text-[var(--accent)]" role="alert">
                  {saveError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  return typeof document === 'undefined' ? card : createPortal(card, document.body);
}

function playAudio(audio: HTMLAudioElement): void {
  try {
    const started = audio.play();
    void started?.catch(() => {});
  } catch {
    // Браузер может запретить autoplay; ручная кнопка остаётся доступна.
  }
}

const CARD_WIDTH = 420;
const CARD_GAP = 10;
/** Ширина панели «перевести выделенное», когда она стоит у самой фразы. */
const TOOLBAR_WIDTH = 380;
/** Ниже этой ширины карточка встаёт листом снизу — рядом со словом ей тесно. */
const FLOATING_MIN_WIDTH = 720;

/** Экранные размеры с подпиской на изменение. */
function useViewport() {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return viewport;
}

/**
 * Прямоугольник, под которым встаёт панель перевода.
 *
 * Берутся клиентские прямоугольники диапазона, а не общий bounding rect: фраза
 * через несколько строк даёт коробку во всю ширину колонки, и панель по её
 * центру оказывается неизвестно где. Нужен последний прямоугольник — конец
 * фразы: панель показывается прямо под ней, а «под фразой» — это под её
 * последней строкой, а не под первой.
 */
function selectionRect(selection: Selection | null): DOMRect | null {
  if (!selection || selection.rangeCount === 0) return null;
  const rects = selection.getRangeAt(0).getClientRects();
  const last = rects[rects.length - 1];
  if (!last || (last.width === 0 && last.height === 0)) return null;
  return last;
}

/**
 * Где показать панель «перевести выделенное».
 *
 * Прямо под последней строкой фразы, вплотную. Панель — это ответ на действие
 * пользователя, и искать её глазами он не должен: она появляется там, где он
 * только что вёл пальцем или мышью.
 *
 * Вверх панель уходит только если снизу её было бы не видно целиком. На узком
 * экране остаётся нижней: рядом со строкой ей негде встать, а палец всё равно
 * внизу.
 */
const TOOLBAR_HEIGHT = 76;

function useToolbarPlacement(anchor: DOMRect | null) {
  const viewport = useViewport();

  if (!anchor || viewport.width < FLOATING_MIN_WIDTH) {
    return { floating: false, style: undefined as CSSProperties | undefined };
  }

  const left = Math.min(
    Math.max(CARD_GAP, anchor.left + anchor.width / 2 - TOOLBAR_WIDTH / 2),
    viewport.width - TOOLBAR_WIDTH - CARD_GAP,
  );
  const style: CSSProperties = { left, width: TOOLBAR_WIDTH };
  const below = viewport.height - anchor.bottom;
  if (below >= TOOLBAR_HEIGHT + CARD_GAP * 2) {
    style.top = anchor.bottom + CARD_GAP;
  } else {
    style.bottom = viewport.height - anchor.top + CARD_GAP;
  }
  return { floating: true, style };
}

/**
 * Где показать карточку.
 *
 * На широком экране она встаёт вплотную к нажатому слову: читатель смотрит в
 * строку, и уводить его взгляд (а на длинной странице ещё и прокрутку) в низ
 * экрана незачем. На узком места рядом нет, поэтому остаётся нижний лист.
 */
function useCardPlacement(anchor: DOMRect | null) {
  const viewport = useViewport();

  if (!anchor || viewport.width < FLOATING_MIN_WIDTH) {
    return {
      floating: false,
      style: undefined as CSSProperties | undefined,
      contentMaxHeight: '80vh',
    };
  }

  const below = viewport.height - anchor.bottom;
  // Вниз — только если снизу места действительно больше. Прежнее правило
  // раскрывало карточку вниз почти всегда (хватало 42% высоты окна), и на
  // невысоком окне она занимала весь низ экрана, уводя взгляд от строки.
  const openDown = below >= anchor.top;
  const left = Math.min(
    Math.max(CARD_GAP, anchor.left + anchor.width / 2 - CARD_WIDTH / 2),
    viewport.width - CARD_WIDTH - CARD_GAP,
  );

  const style: CSSProperties = { left, width: CARD_WIDTH };
  const room = openDown ? below : anchor.top;
  if (openDown) {
    style.top = anchor.bottom + CARD_GAP;
  } else {
    style.bottom = viewport.height - anchor.top + CARD_GAP;
  }
  return {
    floating: true,
    style,
    contentMaxHeight: `${Math.max(220, room - CARD_GAP * 2)}px`,
  };
}

/**
 * Короткое описание формы: «мн. ч.», «3 л. ед., презент».
 * Пустая строка — слово и так начальная форма.
 */
export function formLabelOf(analysis: WordAnalysis | null): string {
  if (!analysis) return '';
  if (analysis.english) return analysis.english.formLabel ?? '';
  return analysis.facts.map((fact) => fact.value).join(', ');
}

/** Есть ли из чего выбирать: словоформа отличается от начальной формы. */
export function hasFormChoice(
  kind: 'word' | 'phrase',
  word: string,
  analysis: WordAnalysis | null,
): boolean {
  if (kind !== 'word' || !analysis?.lemma) return false;
  return analysis.lemma.toLocaleLowerCase('sr') !== word.toLocaleLowerCase('sr');
}

/** Есть ли что показать в панели грамматики — иначе панели не будет вовсе. */
function hasGrammar(analysis: WordAnalysis): boolean {
  if (analysis.english) return true;
  return (
    analysis.known ||
    analysis.facts.length > 0 ||
    analysis.paradigms.length > 0 ||
    (analysis.prepositions?.length ?? 0) > 0
  );
}

/**
 * Реплика Читавука: маскот и облачко с хвостиком, как в приложении.
 *
 * Перевод — то единственное, ради чего слово нажимают, и произносит его
 * маскот: так связка «нажал — Читавук ответил» читается сразу, а картинка
 * перестаёт быть наклейкой в углу. Размер взят из приложения (там волк
 * 130 px), потому что мелкий маскот в углу читался как случайный значок.
 */
function MascotSays({
  label,
  children,
  pose = 'citavuk_gram',
}: {
  label: string;
  children: ReactNode;
  pose?: MascotPose;
}) {
  return (
    <div className="flex items-center">
      <Mascot
        pose={pose}
        alt="Читавук"
        className="w-24 shrink-0 object-contain sm:w-28"
      />
      {/* Хвостик облачка смотрит на волка. Правая сторона не обводится —
          она стоит вплотную к рамке облачка и удвоила бы линию. */}
      <svg
        viewBox="0 0 11 20"
        className="-mr-px h-5 w-[11px] shrink-0"
        aria-hidden="true"
      >
        <path
          d="M11 1 L1 10 L11 19"
          fill="var(--bg-sunken)"
          stroke="var(--line)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-[var(--line)] bg-[var(--bg-sunken)] px-4 py-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </div>
        <div className="font-display text-lg font-semibold leading-snug">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Объяснение, почему сербская читалка разбирает английское слово.
 *
 * Английский в сербских учебниках работает языком-посредником, и молча выдать
 * английский разбор там, где человек ждёт сербский, значило бы оставить его в
 * недоумении.
 */
export function EnglishNotice({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] p-4 ${className}`}
    >
      <Mascot
        pose="citavuk_english"
        alt="Читавук с чашкой зелёного чая"
        className="size-16 shrink-0 self-start object-contain"
      />
      <div className="min-w-0 space-y-2 text-sm leading-relaxed">
        <p className="font-semibold text-[var(--text)]">
          Кажется, это английское слово.
        </p>
        <p className="text-[var(--text-muted)]">
          Хоть основное предназначение для Читавука это анализ сербских слов, но без
          международного языка общения не могут обойтись даже материалы с основой на
          сербском. Да и очень много учебников сербского содержат английский как
          основной язык-посредник. Читавук постарался — и отчаянно проанализировал
          слово с чашечкой зеленого чая.
        </p>
        <p className="text-xs italic text-[var(--text-muted)]">
          (А для обучения английскому всё же лучше выбрать другой ресурс, к примеру,
          знаменитую зеленую сову.)
        </p>
      </div>
    </div>
  );
}

/**
 * Написание с ударением и транскрипция.
 *
 * Ударение показывается жирным на самой букве, а не описывается словами:
 * подпись вроде «ударение не на последнем слоге» — это рассуждение о
 * произношении, а не произношение.
 *
 * Порядок источников — от точного к приблизительному:
 *
 *  1. словарь знает эту словоформу — её ударение и показываем;
 *  2. знает только начальную форму — показываем её, но так и подписываем: в
 *     сербском ударение переезжает по парадигме («knjȉga», но «knjȋgā»), и
 *     выдать одно за другое значит научить неправильно;
 *  3. не знает ничего — остаётся правило, верное для коротких слов: ударение
 *     никогда не падает на последний слог, значит в одно- и двусложном слове
 *     ударен первый.
 */
function Transcription({ word, accent }: { word: string; accent?: WordAccent }) {
  if (accent?.written) {
    return (
      <span>
        <Accented written={accent.written} />
        {accent.ipa && <span className="ml-1.5">{accent.ipa}</span>}
      </span>
    );
  }
  if (accent?.ofLemma && accent.lemma) {
    return (
      <span>
        {serbianIpa(word)}
        <span className="ml-1.5">
          · начальная форма <Accented written={accent.lemma} />
        </span>
      </span>
    );
  }

  const { before, stressed, after } = serbianIpaParts(word);
  if (!before && !stressed) return null;
  return (
    <span>
      {before}
      {stressed && <b className="font-bold text-[var(--text)]">{stressed}</b>}
      {after}
    </span>
  );
}

/** Написание из словаря ударений: ударная буква — жирная. */
function Accented({ written }: { written: string }) {
  const { before, stressed, after } = splitAccented(written);
  return (
    <span>
      {before}
      {stressed && <b className="font-bold text-[var(--text)]">{stressed}</b>}
      {after}
    </span>
  );
}

/**
 * Возвратный глагол: что здесь делает «se» и почему оно стоит именно там.
 *
 * Место частицы — первое, обо что спотыкается читающий по-сербски: «On se zove
 * Marko» выглядит так, будто «se» относится к «on». Объяснение даётся не общей
 * справкой, а по этой самой фразе — сервер называет слово, за которым встала
 * клитика.
 */
function ReflexivePanel({ reflexive }: { reflexive: ReflexiveParticle }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Возвратный глагол
      </div>
      <div className="mt-1.5 font-display text-lg font-bold text-[var(--text)]">
        {reflexive.phrase}
        {reflexive.lemma && (
          <span className="font-sans text-sm font-normal text-[var(--text-muted)]">
            {' '}
            · начальная форма {reflexive.lemma}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{reflexive.meaning}</p>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--text-muted)]">
        {reflexive.why}
      </p>
    </div>
  );
}

/** Разбор английской формы: признаки, объяснение и оговорка про омонимы. */
function EnglishGrammarPanel({ english }: { english: EnglishAnalysis }) {
  const facts = [
    ...english.facts,
    ...(english.formLabel
      ? [{ label: 'Форма', value: english.formLabel }]
      : []),
  ];

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] p-4">
      <div className="text-sm">
        <span className="text-[var(--text-muted)]">Начальная форма: </span>
        <b className="font-display">{english.lemma}</b>
        <span className="text-[var(--text-muted)]"> · {english.posFull}</span>
      </div>

      {facts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {facts.map((fact) => (
            <span
              key={`${fact.label}-${fact.value}`}
              className="rounded-full border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-1 text-sm"
            >
              <span className="text-[var(--text-muted)]">{fact.label}: </span>
              {fact.value}
            </span>
          ))}
        </div>
      )}

      {english.why && (
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
          {english.why}
        </p>
      )}

      {/* «saw» — и прошедшее от «see», и «пила». Молчать об этом нельзя,
          иначе разбор выглядит уверенной ошибкой. */}
      {english.alsoLemma && (
        <p className="mt-2 text-xs italic text-[var(--text-muted)]">
          «{english.surface}» бывает и самостоятельным словом — здесь показан разбор
          формы.
        </p>
      )}
    </div>
  );
}

/**
 * Выбор, что уходит в словарь: словоформа из текста или начальная форма.
 *
 * Спрашиваем каждый раз, а не прячем в настройки: выбор зависит от слова.
 * Неправильный глагол полезнее запомнить формой, а незнакомое существительное —
 * словарной статьёй.
 */
function SaveChoice({
  surface,
  lemma,
  formLabel,
  saveLemma,
  disabled,
  onChange,
}: {
  surface: string;
  lemma: string;
  formLabel: string;
  saveLemma: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const options: { value: boolean; title: string; subtitle: string }[] = [
    {
      value: false,
      title: surface,
      subtitle: formLabel ? `форма — ${formLabel}` : 'форма из текста',
    },
    { value: true, title: lemma, subtitle: 'начальная форма' },
  ];

  return (
    <fieldset
      className="rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] p-4"
      disabled={disabled}
    >
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Добавить в словарь
      </legend>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            key={String(option.value)}
            className="flex cursor-pointer items-center gap-2.5 text-sm"
          >
            <input
              type="radio"
              name="citavuk-save-form"
              checked={saveLemma === option.value}
              onChange={() => onChange(option.value)}
              className="size-4 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <b className="font-display">{option.title}</b>
              <span className="text-[var(--text-muted)]"> · {option.subtitle}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Грамматический разбор: признаки формы, объяснение и таблицы склонения или
 * спряжения. Разбор считает сервер по тому же словарю, что лежит в приложении.
 */
function GrammarPanel({ analysis }: { analysis: WordAnalysis }) {
  const [open, setOpen] = useState(false);

  // У английского слова свой набор признаков: склонений и падежей у него нет,
  // и сербские таблицы здесь были бы пустой рамкой.
  if (analysis.english) return <EnglishGrammarPanel english={analysis.english} />;

  const hasContent =
    analysis.facts.length > 0 ||
    analysis.paradigms.length > 0 ||
    (analysis.prepositions?.length ?? 0) > 0;

  if (!hasGrammar(analysis)) return null;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] p-4">
      {analysis.translation && (
        <Field label="Словарное значение">{analysis.translation}</Field>
      )}

      {analysis.facts.length > 0 && (
        <div className={analysis.translation ? 'mt-3' : ''}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Разбор формы
          </div>
          <div className="flex flex-wrap gap-2">
            {analysis.facts.map((fact) => (
              <span
                key={`${fact.label}-${fact.value}`}
                className="rounded-full border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-1 text-sm"
              >
                <span className="text-[var(--text-muted)]">{fact.label}: </span>
                {fact.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* У предлога главное — какого падежа он требует. */}
      {analysis.prepositions && analysis.prepositions.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Требует падежа
          </div>
          {analysis.prepositions.map((government) => (
            <div key={government.caseKey + government.meaning} className="text-sm">
              <b>{government.caseName}</b>
              <span className="text-[var(--text-muted)]"> — {government.meaning}</span>
            </div>
          ))}
        </div>
      )}

      {hasContent && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-3 text-sm font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
        >
          {open ? 'Свернуть' : 'Почему так и как склоняется'}
        </button>
      )}

      {open && (
        <div className="mt-3 space-y-4">
          {analysis.why && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-muted)]">
              {analysis.why}
            </p>
          )}
          {analysis.paradigms.map((table) => (
            <ParadigmView key={table.title} table={table} />
          ))}
        </div>
      )}
    </div>
  );
}

function ParadigmView({ table }: { table: ParadigmTable }) {
  const approximate = table.rows.some((row) => row.generated && row.form !== '—');

  return (
    <div>
      <div className="text-sm font-semibold">{table.title}</div>
      {table.subtitle && (
        <div className="mt-0.5 text-xs text-[var(--text-muted)]">{table.subtitle}</div>
      )}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {table.rows.map((row) => (
              <tr
                key={row.label}
                className={
                  row.current
                    ? 'bg-[var(--accent)]/10 font-semibold text-[var(--accent)]'
                    : ''
                }
              >
                <td className="py-1 pr-3 align-top text-[var(--text-muted)]">
                  {row.label}
                </td>
                <td className="py-1 align-top">
                  {row.form}
                  {row.generated && row.form !== '—' && (
                    <span className="text-[var(--text-muted)]">*</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Форма, достроенная правилом, может разойтись с живым языком —
          честнее пометить, чем выдать за словарную. */}
      {approximate && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          * форма построена по правилу и может отличаться у исключений
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  emphasis = false,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className={
          emphasis
            ? 'font-display text-xl font-bold text-[var(--text)]'
            : 'text-[var(--text)]'
        }
      >
        {children}
      </div>
    </div>
  );
}
