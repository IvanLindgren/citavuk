import { useEffect, useState } from 'react';
import { LuX } from 'react-icons/lu';

import { estimateTextLevel, tooHardFor, type TextLevel } from '../api/level';
import { useAuth } from '../state/auth';

/**
 * Предупреждение о книге не по зубам.
 *
 * Оценка идёт по редкости слов: сколько текста укладывается в словарь ступени.
 * Мера грубая и знает об этом — поэтому предупреждение срабатывает только при
 * разрыве в две ступени. На ступень выше своего уровня читать как раз и
 * полезно, и отговаривать от этого значит мешать единственному способу вырасти.
 *
 * И это именно предупреждение, а не запрет: книга открывается в любом случае,
 * закрыть полоску можно одним нажатием, и второй раз по той же книге она не
 * появится.
 */

const SEEN_KEY = 'citavuk-book-level-seen';

function alreadySeen(bookId: string): boolean {
  try {
    return (localStorage.getItem(SEEN_KEY) ?? '').split(',').includes(bookId);
  } catch {
    return false;
  }
}

function remember(bookId: string): void {
  try {
    const seen = (localStorage.getItem(SEEN_KEY) ?? '').split(',').filter(Boolean);
    if (seen.includes(bookId)) return;
    // Список подрезается: он нужен только чтобы не показывать одно и то же
    // дважды, а расти без предела ему незачем.
    localStorage.setItem(SEEN_KEY, [...seen, bookId].slice(-200).join(','));
  } catch {
    // Приватный режим: предупреждение появится ещё раз. Не беда.
  }
}

export function BookLevelNotice({
  bookId,
  paragraphs,
}: {
  bookId: string;
  paragraphs: string[];
}) {
  const { account } = useAuth();
  const [level, setLevel] = useState<TextLevel | null>(null);
  const [closed, setClosed] = useState(false);
  const reader = account?.serbianLevel ?? '';

  useEffect(() => {
    // Спрашивать сервер не о чем, пока неизвестен уровень читателя: сравнивать
    // будет не с чем, а книга и так уже открыта.
    if (!reader || paragraphs.length === 0 || alreadySeen(bookId)) return;
    const controller = new AbortController();
    estimateTextLevel(paragraphs, controller.signal)
      .then(setLevel)
      .catch(() => {
        // Оценка — украшение поверх чтения, и молчание тут уместнее ошибки.
      });
    return () => controller.abort();
  }, [bookId, paragraphs, reader]);

  if (closed || !level?.level || !tooHardFor(level.level, reader)) return null;

  return (
    <div className="mb-6 flex items-start gap-4 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-4">
      {/* Обычная картинка, а не Mascot: у задумчивой позы нет варианта @2x. */}
      <img src="/img/citavuk_zadumch.png" alt="" className="h-16 w-auto shrink-0 object-contain" />
      <div className="min-w-0 flex-1 text-sm">
        <p>
          Читавук думает, что книга сейчас будет для вас тяжеловата! Она рассчитана
          на уровень <b>{level.level}</b>, а ваш уровень — <b>{reader}</b>. Это просто
          предупреждение, вы можете читать книгу в любом случае.
        </p>
        {level.hardWords.length > 0 && (
          <p className="mt-2 text-[var(--text-muted)]">
            Например, здесь встречаются: {level.hardWords.slice(0, 6).join(', ')}.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          remember(bookId);
          setClosed(true);
        }}
        aria-label="Закрыть предупреждение"
        className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
      >
        <LuX className="size-4" />
      </button>
    </div>
  );
}
