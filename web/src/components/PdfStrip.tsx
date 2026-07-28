import { useEffect, useRef, useState } from 'react';

import {
  cachedPreview,
  loadPreview,
  PREVIEW_PAGES,
  type PdfPreviewResult,
} from '../lib/pdfPreview';
import { Spinner } from './ui';

/**
 * Полоса первых страниц документа прямо в карточке каталога.
 *
 * Загружается сама, без нажатий, но только когда карточка доехала до экрана:
 * иначе открытие раздела с сотней материалов утянуло бы сотни мегабайт чужого
 * трафика и положило бы сайт источника.
 */
export function PdfStrip({
  url,
  onOpen,
}: {
  url: string;
  onOpen: (page: number) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [preview, setPreview] = useState<PdfPreviewResult | null>(
    () => cachedPreview(url) ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [near, setNear] = useState(false);

  // Наблюдатель заводится один раз и снимается сразу после срабатывания:
  // документ грузится однократно, следить за ним дальше незачем.
  useEffect(() => {
    if (preview || near) return;
    const node = box.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      // Небольшой запас, чтобы страницы успели отрисоваться до того, как
      // карточка окажется на виду.
      { rootMargin: '400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, preview]);

  useEffect(() => {
    if (!near || preview) return;
    const controller = new AbortController();
    let cancelled = false;

    loadPreview(url, controller.signal).then(
      (result) => {
        if (!cancelled) setPreview(result);
      },
      (caught: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError(
          caught instanceof Error ? caught.message : 'Превью недоступно.',
        );
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [near, preview, url]);

  if (error) {
    return (
      <div
        ref={box}
        className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-[var(--line)] px-4 text-center text-xs text-[var(--text-muted)]"
      >
        Превью недоступно — документ можно открыть на сайте источника
      </div>
    );
  }

  if (!preview) {
    return (
      <div
        ref={box}
        className="flex h-44 items-center justify-center gap-2 rounded-2xl bg-[var(--bg-sunken)] text-xs text-[var(--text-muted)]"
      >
        <Spinner className="size-4" />
        {near ? 'Готовим страницы…' : 'Превью загрузится при прокрутке'}
      </div>
    );
  }

  return (
    <div ref={box}>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
        {preview.pages.map((page, index) => (
          <button
            key={page}
            type="button"
            onClick={() => onOpen(index)}
            title={`Страница ${index + 1} — открыть крупнее`}
            className="group relative h-44 shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--line)] bg-white transition-all hover:border-[var(--accent)] hover:shadow-[var(--shadow-soft)]"
          >
            <img
              src={page}
              alt={`Страница ${index + 1}`}
              loading="lazy"
              className="h-full w-auto max-w-none"
            />
            <span className="absolute bottom-1 right-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
              {index + 1}
            </span>
          </button>
        ))}
      </div>
      {preview.total > PREVIEW_PAGES && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          Показаны {preview.pages.length} из {preview.total} страниц
        </p>
      )}
    </div>
  );
}
