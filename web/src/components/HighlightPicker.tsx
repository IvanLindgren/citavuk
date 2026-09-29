import { LuUnderline } from 'react-icons/lu';

import { QUOTE_COLORS, type QuoteColor } from '../lib/readerQuotes';

/** Кружки цветов маркера — те же оттенки, что и выделение в тексте. */
export const QUOTE_SWATCH: Record<string, string> = {
  yellow: 'bg-[rgb(250_204_21/0.42)]',
  green: 'bg-[rgb(74_222_128/0.36)]',
  blue: 'bg-[rgb(96_165_250/0.36)]',
  purple: 'bg-[rgb(192_132_252/0.36)]',
  red: 'bg-[rgb(248_113_113/0.38)]',
};

const DOT: Record<string, string> = {
  yellow: 'bg-[#facc15]',
  green: 'bg-[#4ade80]',
  blue: 'bg-[#60a5fa]',
  purple: 'bg-[#c084fc]',
  red: 'bg-[#f87171]',
};

/**
 * Выбор выделения: подчеркнуть или отметить одним из пяти цветов. Нажатие
 * не снимает выделение текста в браузере (preventDefault на pointerdown),
 * иначе фрагмент терялся бы до того, как его отметили.
 */
export function HighlightPicker({
  current,
  onPick,
  disabled = false,
}: {
  current?: QuoteColor | null;
  onPick: (color: QuoteColor) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Цвет выделения">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={current === ''}
        title="Подчеркнуть"
        aria-label="Подчеркнуть"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onPick('')}
        className={[
          'grid size-8 place-items-center rounded-full border text-[var(--accent)] transition-transform hover:scale-110 disabled:opacity-45',
          current === '' ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--line)]',
        ].join(' ')}
      >
        <LuUnderline className="size-4" aria-hidden="true" />
      </button>
      {QUOTE_COLORS.map((color) => (
        <button
          key={color.key}
          type="button"
          disabled={disabled}
          aria-pressed={current === color.key}
          title={color.label}
          aria-label={`Выделить: ${color.label.toLowerCase()}`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onPick(color.key)}
          className={[
            'size-7 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-45',
            DOT[color.key],
            current === color.key ? 'border-[var(--text)] ring-2 ring-[var(--bg-raised)]' : 'border-white/70',
          ].join(' ')}
        />
      ))}
    </div>
  );
}
