import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import {
  analyzeWord,
  type ParadigmTable,
  type WordAnalysis,
} from '../api/analyze';
import { ApiError } from '../api/client';
import {
  sentenceWindow,
  translateInContext,
  translateText,
  type TranslationResult,
} from '../api/translate';
import { BIONIC_RATIO, type BionicLevel } from '../lib/readerSettings';
import { Link } from '../lib/router';
import { saveVocabularyWord } from '../lib/vocabulary';
import { tokenize, type Token } from '../lib/tokenize';
import { useSync } from '../state/sync';
import { Spinner } from './ui';

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
}: {
  paragraphs: string[];
  bookId?: string | null;
  className?: string;
  /** Выделение основы слова жирным — то же, что в приложении. */
  bionic?: BionicLevel;
  /** Оформление абзаца задаёт читалка: кегль, интерлиньяж, отступы. */
  paragraphClassName?: string;
  paragraphStyle?: CSSProperties;
}) {
  const { sync } = useSync();
  const readerRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<{
    paragraph: number;
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
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [analysis, setAnalysis] = useState<WordAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Прошлый запрос отменяется: пользователь может быстро тыкать по словам, и
  // ответ на устаревший запрос не должен перебить свежий.
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

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
    async (paragraphIndex: number, token: Token, rect: DOMRect) => {
      const text = paragraphs[paragraphIndex];
      if (!text) return;

      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;

      setActivePhrase(null);
      setSelectedPhrase(null);
      setSelected({ paragraph: paragraphIndex, token });
      setAnchor(rect);
      setResult(null);
      setAnalysis(null);
      setError(null);
      setLoading(true);

      // Разбор идёт параллельно переводу и своей ошибкой перевод не рушит:
      // словарь знает не каждое слово, а перевод нужен всегда.
      void analyzeWord(token.text, controller.signal)
        .then((parsed) => {
          if (!controller.signal.aborted) setAnalysis(parsed);
        })
        .catch(() => {});

      try {
        const window = sentenceWindow(text, token.start, token.end);
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
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Не удалось перевести слово.',
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [paragraphs],
  );

  const translatePhrase = useCallback(async (phrase: string, rect: DOMRect | null) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;

    setSelected(null);
    // Карточка перевода встаёт там же, где стояло предложение перевести, —
    // у самой фразы.
    setAnchor(rect);
    setActivePhrase(phrase);
    setResult(null);
    setAnalysis(null);
    setError(null);
    setLoading(true);

    try {
      const translation = await translateText(phrase, controller.signal);
      if (controller.signal.aborted) return;
      setResult(translation);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Не удалось перевести выделенную фразу.',
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    pending.current?.abort();
    setSelected(null);
    setSelectedPhrase(null);
    setActivePhrase(null);
    setResult(null);
    setAnalysis(null);
    setError(null);
    setLoading(false);
    window.getSelection()?.removeAllRanges();
  }, []);

  // Escape закрывает карточку — привычное поведение для всплывающих панелей.
  useEffect(() => {
    if (!selected && !activePhrase) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, activePhrase, close]);

  return (
    <div className={className}>
      <div ref={readerRef} className={paragraphClassName ? '' : 'space-y-4'}>
        {paragraphs.map((paragraph, paragraphIndex) => (
          <Paragraph
            key={paragraphIndex}
            text={paragraph}
            bionic={bionic}
            className={paragraphClassName}
            style={paragraphStyle}
            selectedStart={
              selected?.paragraph === paragraphIndex ? selected.token.start : null
            }
            onSelect={(token, rect) => selectWord(paragraphIndex, token, rect)}
          />
        ))}
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
                : `${selected!.paragraph}-${selected!.token.start}`
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
                ? async () => {
                    await saveVocabularyWord({
                      bookId,
                      word: activePhrase ?? selected!.token.text,
                      translation: result.text,
                    });
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

function Paragraph({
  text,
  selectedStart,
  onSelect,
  bionic,
  className,
  style,
}: {
  text: string;
  selectedStart: number | null;
  onSelect: (token: Token, anchor: DOMRect) => void;
  bionic: BionicLevel;
  className: string;
  style?: CSSProperties;
}) {
  // Разбор строки не зависит от состояния, но и не бесплатен — считаем один раз
  // на текст, а не на каждую отрисовку выделения.
  const [tokens] = useState(() => tokenize(text));

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
            ].join(' ')}
          >
            {bionic > 0 ? <BionicWord text={token.text} level={bionic} /> : token.text}
          </span>
        ) : (
          <span key={index}>{token.text}</span>
        ),
      )}
    </p>
  );
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

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className={[
        'fixed z-40 flex items-center gap-3 rounded-2xl border border-[var(--line)]',
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
  onSave?: () => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const placement = useCardPlacement(anchor);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: placement.floating ? 8 : 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={
        placement.floating
          ? 'fixed z-50 p-2'
          : 'fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl p-3 sm:p-5'
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
            <div className="font-display text-2xl font-bold text-[var(--accent)]">
              {word}
            </div>
            {/* Часть речи и основа — то, что нужно раньше перевода: по ним
                слово ищется в словаре и узнаётся в другой форме. */}
            {analysis?.known && (
              <div className="mt-0.5 text-sm text-[var(--text-muted)]">
                <span className="font-semibold">{analysis.posShort}</span>
                {analysis.lemma !== analysis.surface.toLowerCase() && (
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

          {result && !loading && (
            <div className="space-y-4">
              <Field
                label={kind === 'phrase' ? 'Перевод фразы' : 'В этом предложении'}
                emphasis
              >
                {result.text || '—'}
              </Field>

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

              {kind === 'word' && analysis && <GrammarPanel analysis={analysis} />}
              {onSave && (
                <button
                  type="button"
                  disabled={saved}
                  onClick={() => {
                    setSaveError('');
                    void onSave()
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
 * Прямоугольник текущего выделения.
 *
 * Берутся клиентские прямоугольники диапазона, а не его общий bounding rect:
 * фраза через несколько строк даёт коробку во всю ширину колонки, и панель,
 * поставленная по её центру, оказывается неизвестно где. Первый прямоугольник —
 * начало фразы, к нему и привязываемся.
 */
function selectionRect(selection: Selection | null): DOMRect | null {
  if (!selection || selection.rangeCount === 0) return null;
  const rects = selection.getRangeAt(0).getClientRects();
  const first = rects[0];
  if (!first || (first.width === 0 && first.height === 0)) return null;
  return first;
}

/**
 * Где показать панель «перевести выделенное».
 *
 * Над фразой, если сверху есть место: под выделением обычно продолжение текста,
 * которое человек и читает. На узком экране панель остаётся нижней — рядом со
 * строкой ей негде встать, а палец всё равно внизу.
 */
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
  // 96 пикселей — высота панели с запасом: точную высоту знать неоткуда, пока
  // она не отрисована, а промах на десяток пикселей здесь ничего не решает.
  if (anchor.top >= 96 + CARD_GAP) {
    style.bottom = viewport.height - anchor.top + CARD_GAP;
  } else {
    style.top = anchor.bottom + CARD_GAP;
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
  const openDown = below >= viewport.height * 0.42 || below >= anchor.top;
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
    contentMaxHeight: `${Math.max(220, room - CARD_GAP * 3)}px`,
  };
}

/**
 * Грамматический разбор: признаки формы, объяснение и таблицы склонения или
 * спряжения. Разбор считает сервер по тому же словарю, что лежит в приложении.
 */
function GrammarPanel({ analysis }: { analysis: WordAnalysis }) {
  const [open, setOpen] = useState(false);
  const hasContent =
    analysis.facts.length > 0 ||
    analysis.paradigms.length > 0 ||
    (analysis.prepositions?.length ?? 0) > 0;

  if (!analysis.known && !hasContent) return null;

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
