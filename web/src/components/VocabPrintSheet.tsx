import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './ui';
import {
  CARDS_PER_PAGE,
  CARD_COLUMNS,
  CARD_ROWS,
  cardPages,
  type ExportRow,
} from '../lib/vocabExport';

/**
 * Печатные карточки словаря.
 *
 * Открывается поверх страницы и печатается средствами браузера: «Сохранить как
 * PDF» есть в диалоге печати на всех трёх системах, а своя генерация PDF стоила
 * бы полутора мегабайт библиотеки ради того, что уже встроено.
 *
 * Лист заполняется целиком, включая пустые места неполного листа: сетка обязана
 * остаться той же, иначе последний лист разрежется по другим линиям.
 */
export function VocabPrintSheet({
  rows,
  title,
  onClose,
}: {
  rows: ExportRow[];
  title: string;
  onClose: () => void;
}) {
  const pages = cardPages(rows);

  // Escape закрывает: слой во весь экран без выхода по клавиатуре — ловушка.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Слой живёт прямо в body, а не внутри #root. Печать прячет всё, кроме него,
  // а из #root его было бы не отделить: он лежал бы внутри того же поддерева,
  // что и шапка сайта с объявлениями.
  return createPortal(
    <div className="vocab-print-layer fixed inset-0 z-[95] overflow-auto bg-[var(--bg)] print:static print:overflow-visible">
      <style>{PRINT_CSS}</style>

      <div className="mx-auto max-w-[900px] px-5 py-6 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Карточки на печать</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {rows.length} шт. · {pages.length}{' '}
              {pages.length === 1 ? 'лист' : 'листа'} · {CARDS_PER_PAGE} на лист
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Закрыть
            </Button>
            <Button onClick={() => window.print()}>Печать или PDF</Button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-4 text-sm leading-relaxed text-[var(--text-muted)]">
          Печатайте <b>двусторонне, переворот по длинному краю</b> — обороты уже
          разложены зеркально, и перевод встанет на своё слово. Односторонняя
          печать тоже годится: тогда листы с переводами идут отдельно. Чтобы
          получить PDF, в диалоге печати выберите «Сохранить как PDF».
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-5 pb-10 print:max-w-none print:p-0">
        {pages.map((page, index) => (
          <div key={index}>
            <Sheet
              cards={page.front}
              side="front"
              caption={`${title} · лист ${index + 1}, лицо`}
            />
            <Sheet
              cards={page.back}
              side="back"
              caption={`${title} · лист ${index + 1}, оборот`}
            />
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function Sheet({
  cards,
  side,
  caption,
}: {
  cards: (ExportRow | null)[];
  side: 'front' | 'back';
  caption: string;
}) {
  return (
    <>
      <div className="mt-6 text-xs text-[var(--text-muted)] print:hidden">
        {caption}
      </div>
      <div className="vocab-sheet">
        {cards.map((card, index) => (
          <div key={index} className="vocab-card">
            {card && side === 'front' && (
              <>
                <div className="vocab-card-word" lang="sr">
                  {card.word}
                </div>
                {card.tags.length > 0 && (
                  <div className="vocab-card-tags">
                    {card.tags.map((tag) => `#${tag}`).join(' ')}
                  </div>
                )}
              </>
            )}
            {card && side === 'back' && (
              <>
                <div className="vocab-card-translation">{card.translation}</div>
                {card.context && (
                  <div className="vocab-card-context" lang="sr">
                    {card.context}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Разметка листа.
 *
 * Отдельным блоком, а не классами Tailwind: миллиметры, `@page` и
 * `page-break-after` — печатные величины, которых в утилитах нет, а размер
 * карточки обязан совпадать с сеткой до десятой доли, иначе линии реза поедут
 * от листа к листу.
 */
const PRINT_CSS = `
.vocab-sheet {
  display: grid;
  grid-template-columns: repeat(${CARD_COLUMNS}, 1fr);
  grid-template-rows: repeat(${CARD_ROWS}, 1fr);
  width: 190mm;
  height: 277mm;
  margin: 0 auto;
  background: #fff;
  color: #2b2118;
}
.vocab-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2mm;
  padding: 4mm;
  text-align: center;
  overflow: hidden;
  /* Пунктир по всем сторонам: соседние карточки делят одну линию реза, и
     сплошная рамка удвоила бы её толщину на каждом стыке. */
  border: 0.2mm dashed #b9ae99;
  margin: -0.1mm;
}
.vocab-card-word { font-size: 13pt; font-weight: 700; line-height: 1.25; }
.vocab-card-translation { font-size: 12pt; line-height: 1.3; }
.vocab-card-tags { font-size: 7pt; color: #8a7f6c; }
.vocab-card-context { font-size: 7.5pt; color: #6b6152; line-height: 1.3; }

@media screen {
  .vocab-sheet {
    box-shadow: 0 1px 12px rgba(0, 0, 0, 0.14);
    transform-origin: top center;
  }
}

@media print {
  @page { size: A4; margin: 10mm; }
  body { background: #fff; }
  /* Печатается только слой карточек: шапка сайта, объявления и кнопки на
     бумаге не нужны и съели бы первый лист. */
  body > *:not(.vocab-print-layer) { display: none !important; }
  .vocab-sheet { page-break-after: always; break-after: page; }
  .vocab-sheet:last-child { page-break-after: auto; break-after: auto; }
}
`;
