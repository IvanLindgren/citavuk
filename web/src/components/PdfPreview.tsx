import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import {
  cachedPreview,
  loadPreview,
  PREVIEW_PAGES,
  type PdfPreviewResult,
} from '../lib/pdfPreview';
import { Button, ErrorNote, Spinner } from './ui';

/**
 * Крупный просмотр документа: те же первые страницы, что и в карточке, но во
 * весь экран.
 *
 * Страницы берутся из общего кеша отрисовки, поэтому открытие с карточки
 * происходит мгновенно и второй раз ничего не скачивает.
 */
export function PdfPreview({
  url,
  title,
  startPage = 0,
  onClose,
  onImport,
}: {
  url: string;
  title: string;
  startPage?: number;
  onClose: () => void;
  onImport?: () => void;
}) {
  const [preview, setPreview] = useState<PdfPreviewResult | null>(
    () => cachedPreview(url) ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const scroller = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLImageElement | null>>([]);

  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    let cancelled = false;

    loadPreview(url, controller.signal).then(
      (result) => {
        if (!cancelled) setPreview(result);
      },
      (caught: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError(
          caught instanceof Error ? caught.message : 'Не удалось показать документ.',
        );
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [preview, url]);

  // Открытие с конкретной страницы: человек нажал на четвёртую миниатюру и
  // ожидает увидеть именно её, а не начало документа.
  useEffect(() => {
    if (!preview || startPage <= 0) return;
    pageRefs.current[startPage]?.scrollIntoView({ block: 'start' });
  }, [preview, startPage]);

  // Escape закрывает окно — привычное поведение для модальных панелей.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.document.addEventListener('keydown', onKey);
    return () => window.document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Просмотр: ${title}`}
      >
        <motion.div
          initial={reduceMotion ? false : { scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={reduceMotion ? undefined : { scale: 0.97, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-lift)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-bold">{title}</h2>
              {preview && preview.total > 0 && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Первые {Math.min(PREVIEW_PAGES, preview.total)} из{' '}
                  {preview.total} {pagesWord(preview.total)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть просмотр"
              className="shrink-0 rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
            >
              <svg viewBox="0 0 20 20" className="size-5 fill-current" aria-hidden="true">
                <path d="M6.3 5A1 1 0 004.9 6.4L8.5 10l-3.6 3.6a1 1 0 101.4 1.4L10 11.4l3.6 3.6a1 1 0 001.4-1.4L11.4 10l3.6-3.6A1 1 0 0013.6 5L10 8.6 6.4 5z" />
              </svg>
            </button>
          </div>

          <div
            ref={scroller}
            className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-sunken)] p-4"
          >
            {!preview && !error && (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
                <Spinner className="size-6" />
                <span className="text-sm">Готовим просмотр…</span>
              </div>
            )}

            {error && <ErrorNote>{error}</ErrorNote>}

            <div className="space-y-4">
              {preview?.pages.map((page, index) => (
                <img
                  key={page}
                  ref={(node) => {
                    pageRefs.current[index] = node;
                  }}
                  src={page}
                  alt={`Страница ${index + 1}`}
                  className="mx-auto w-full max-w-2xl rounded-xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]"
                />
              ))}
            </div>

            {preview && preview.total > PREVIEW_PAGES && (
              <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
                Остальные страницы — в библиотеке или на сайте источника.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--line)] p-3">
            {onImport && (
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  onClose();
                  onImport();
                }}
              >
                В библиотеку
              </Button>
            )}
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Открыть оригинал
            </a>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function pagesWord(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'страниц';
  switch (count % 10) {
    case 1:
      return 'страницы';
    case 2:
    case 3:
    case 4:
      return 'страниц';
    default:
      return 'страниц';
  }
}
