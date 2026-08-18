import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './ui';
import {
  CARDS_PER_PAGE,
  CARD_COLUMNS,
  CARD_ROWS,
  cardPages,
  printableRows,
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
  // Фразы отбираются здесь, а не у вызывающего: «что печатаем» — свойство
  // бумаги, а не того экрана, с которого печать позвали.
  const cards = printableRows(rows);
  const skipped = rows.length - cards.length;
  const pages = cardPages(cards);

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
              {cards.length} шт. · {pages.length} {sheetWord(pages.length)} ·{' '}
              {CARDS_PER_PAGE} на лист
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
          {skipped > 0 && (
            <>
              {' '}
              Фраз в этой выборке {skipped} — на карточки они не пошли: лицевая
              сторона выдала бы ответ раньше, чем её перевернут. Фразы
              собираются из слов в повторении и целиком уходят в таблицу.
            </>
          )}
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
                <div
                  className={`vocab-card-word${card.word.length > 14 ? ' is-long' : ''}`}
                  lang="sr"
                >
                  {card.word}
                </div>
                <Ornament />
                {card.tags.length > 0 && (
                  <div className="vocab-card-tags">
                    {/* Меток на карточке не больше двух: третья строка
                        подписей отъедает место у самого слова. */}
                    {card.tags.slice(0, 2).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
              </>
            )}
            {card && side === 'back' && (
              <>
                <div
                  className={`vocab-card-translation${
                    card.translation.length > 26 ? ' is-long' : ''
                  }`}
                >
                  {card.translation}
                </div>
                {card.context && (
                  <>
                    <Ornament />
                    <div className="vocab-card-context" lang="sr">
                      {card.context}
                    </div>
                  </>
                )}
                <div className="vocab-card-mark">читавук</div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** «1 лист», «2 листа», «5 листов» — на пятом листе «листа» режет глаз. */
function sheetWord(count: number): string {
  const tens = count % 100;
  if (tens >= 11 && tens <= 14) return 'листов';
  const ones = count % 10;
  if (ones === 1) return 'лист';
  if (ones >= 2 && ones <= 4) return 'листа';
  return 'листов';
}

/** Черта с ромбом посередине — та же, что делит разделы на сайте. */
function Ornament() {
  return (
    <div className="vocab-card-rule" aria-hidden="true">
      <span />
    </div>
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
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5mm 4mm 6mm;
  text-align: center;
  overflow: hidden;
  /* Пунктир по всем сторонам: соседние карточки делят одну линию реза, и
     сплошная рамка удвоила бы её толщину на каждом стыке. */
  border: 0.2mm dashed #cdc2ab;
  margin: -0.1mm;
}

/* Заливки в печати по умолчанию не выводятся — «фоновая графика» в диалоге
   выключена, и полагаться на неё нельзя. Поэтому всё, что рисует линии и
   ромб, сделано рамками: рамки печатаются всегда. */
.vocab-card-rule {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.4mm;
  width: 58%;
  margin: 2.4mm 0;
}
.vocab-card-rule::before,
.vocab-card-rule::after {
  content: '';
  flex: 1;
  border-top: 0.15mm solid #d3c9b4;
}
.vocab-card-rule span {
  width: 1.1mm;
  height: 1.1mm;
  border: 0.32mm solid #bfb298;
  transform: rotate(45deg);
}

.vocab-card-word {
  font-family: var(--font-display, Georgia, serif);
  font-size: 15pt;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
/* Длинное слово тем же кеглем разъезжается на четыре строки и вылезает за
   линию реза. Ступенька одна: подбирать размер точнее нечем — ширину буквы в
   миллиметрах CSS не знает. */
.vocab-card-word.is-long { font-size: 11.5pt; }

/* Метки идут сразу под чертой, а не прижаты к низу: слово, черта и подпись
   читаются одним столбиком, а прижатая к краю подпись оставляла бы посреди
   карточки пустое поле в треть высоты. */
.vocab-card-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.2mm;
}
.vocab-card-tags span {
  padding: 0.5mm 1.6mm;
  border: 0.15mm solid #ded5c3;
  border-radius: 1.2mm;
  font-size: 6pt;
  line-height: 1.5;
  color: #8a7f6c;
}

.vocab-card-translation {
  font-family: var(--font-display, Georgia, serif);
  font-size: 12.5pt;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.vocab-card-translation.is-long { font-size: 9.5pt; }

.vocab-card-context {
  max-height: 14mm;
  overflow: hidden;
  font-size: 7pt;
  font-style: italic;
  line-height: 1.35;
  color: #6b6152;
}
/* Сербские кавычки: пример — сербская фраза, и русские «ёлочки» на ней
   смотрелись бы чужой пунктуацией. */
.vocab-card-context::before { content: '„'; }
.vocab-card-context::after { content: '“'; }

.vocab-card-mark {
  position: absolute;
  bottom: 2.5mm;
  font-size: 5pt;
  letter-spacing: 0.6mm;
  text-transform: uppercase;
  color: #d8cfbd;
}

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
