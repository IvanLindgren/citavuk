import { useState } from 'react';

const LATIN_SPECIAL = ['č', 'ć', 'š', 'ž', 'đ'] as const;
const CYRILLIC_SPECIAL = ['ј', 'љ', 'њ', 'ћ', 'ђ', 'џ'] as const;

export function insertAtCursor(
  value: string,
  character: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): { value: string; cursor: number } {
  const start = Math.max(0, Math.min(selectionStart ?? value.length, value.length));
  const end = Math.max(start, Math.min(selectionEnd ?? start, value.length));
  return {
    value: `${value.slice(0, start)}${character}${value.slice(end)}`,
    cursor: start + character.length,
  };
}

export function SerbianKeyboard({
  onInsert,
  disabled = false,
}: {
  onInsert: (character: string) => void;
  disabled?: boolean;
}) {
  const [uppercase, setUppercase] = useState(false);
  const renderCharacter = (character: string) =>
    uppercase ? character.toLocaleUpperCase('sr') : character;

  return (
    <div
      className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] p-3"
      role="group"
      aria-label="Сербские буквы"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase text-[var(--text-muted)]">
          Сербские буквы
        </span>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={uppercase}
          aria-label="Заглавные буквы"
          title="Заглавные буквы"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setUppercase((value) => !value)}
          className={[
            'flex size-9 items-center justify-center rounded-lg border font-bold transition-colors',
            uppercase
              ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
              : 'border-[var(--line)] bg-[var(--bg-raised)]',
          ].join(' ')}
        >
          ⇧
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {[...LATIN_SPECIAL, ...CYRILLIC_SPECIAL].map((character) => {
          const rendered = renderCharacter(character);
          return (
            <button
              key={character}
              type="button"
              disabled={disabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onInsert(rendered)}
              className="flex size-11 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] font-display text-xl font-bold shadow-[0_2px_0_0_var(--line)] transition-colors hover:border-[var(--accent)] disabled:opacity-45"
              aria-label={`Вставить ${rendered}`}
            >
              {rendered}
            </button>
          );
        })}
      </div>
    </div>
  );
}
