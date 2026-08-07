import { useEffect, useState } from 'react';

import {
  analyzeSentence,
  type SentenceAnalysis,
  type SentenceChunk,
} from '../api/analyze';
import { Spinner } from './ui';

/**
 * Разбор фразы целиком — рядом с разбором нажатого слова.
 *
 * Разбор по слову отвечает «что это за форма». Но сербская форма сама по себе
 * почти всегда неоднозначна: «kući» — и дательный, и местный, «grada» — и
 * родительный единственного, и именительный множественного. Что именно перед
 * нами, решает соседство: предлог задаёт падеж, вспомогательный глагол с
 * причастием даёт время, частица «se» меняет значение глагола.
 *
 * Открывается по нажатию, а не сразу: это второй запрос к серверу на каждое
 * слово, а нужен он далеко не всегда — чаще человеку хватает перевода.
 */

const KIND_LABEL: Record<SentenceChunk['kind'], string> = {
  prep: 'Предлог',
  verb: 'Глагол',
  noun: 'Согласование',
};

const KIND_COLOR: Record<SentenceChunk['kind'], string> = {
  prep: 'bg-[#3b82f6]',
  verb: 'bg-[#f59e0b]',
  noun: 'bg-[#10b981]',
};

const POS_STYLE: Record<string, string> = {
  NOUN: 'border-[#2563eb]/35 bg-[#2563eb]/10 text-[#1d4ed8] dark:text-[#93c5fd]',
  PROPN: 'border-[#0891b2]/35 bg-[#0891b2]/10 text-[#0e7490] dark:text-[#67e8f9]',
  VERB: 'border-[#dc2626]/35 bg-[#dc2626]/10 text-[#b91c1c] dark:text-[#fca5a5]',
  AUX: 'border-[#ea580c]/35 bg-[#ea580c]/10 text-[#c2410c] dark:text-[#fdba74]',
  ADJ: 'border-[#16a34a]/35 bg-[#16a34a]/10 text-[#15803d] dark:text-[#86efac]',
  ADV: 'border-[#0d9488]/35 bg-[#0d9488]/10 text-[#0f766e] dark:text-[#5eead4]',
  PRON: 'border-[#9333ea]/35 bg-[#9333ea]/10 text-[#7e22ce] dark:text-[#d8b4fe]',
  DET: 'border-[#c026d3]/35 bg-[#c026d3]/10 text-[#a21caf] dark:text-[#f0abfc]',
  ADP: 'border-[#a16207]/35 bg-[#a16207]/10 text-[#854d0e] dark:text-[#fde047]',
  NUM: 'border-[#4f46e5]/35 bg-[#4f46e5]/10 text-[#4338ca] dark:text-[#a5b4fc]',
  CCONJ: 'border-[#64748b]/35 bg-[#64748b]/10 text-[#475569] dark:text-[#cbd5e1]',
  SCONJ: 'border-[#64748b]/35 bg-[#64748b]/10 text-[#475569] dark:text-[#cbd5e1]',
  PART: 'border-[#db2777]/35 bg-[#db2777]/10 text-[#be185d] dark:text-[#f9a8d4]',
  INTJ: 'border-[#e11d48]/35 bg-[#e11d48]/10 text-[#be123c] dark:text-[#fda4af]',
};

const FALLBACK_POS_STYLE =
  'border-[var(--line)] bg-[var(--bg-raised)] text-[var(--text-muted)]';

export function SentenceAnalysisPanel({
  sentence,
  defaultOpen = false,
}: {
  sentence: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [analysis, setAnalysis] = useState<SentenceAnalysis | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || analysis) return;
    const controller = new AbortController();
    analyzeSentence(sentence, controller.signal)
      .then(setAnalysis)
      .catch(() => {
        // Отменённый запрос — не ошибка: карточку просто закрыли.
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open, sentence, analysis]);

  // Фраза меняется вместе с нажатым словом; разбор от прошлой к ней не
  // относится, и оставить его было бы прямой ошибкой.
  useEffect(() => {
    setAnalysis(null);
    setFailed(false);
    setOpen(defaultOpen);
  }, [sentence, defaultOpen]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        Разобрать всю фразу
      </button>
    );
  }

  if (failed) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Разбор фразы сейчас недоступен.
      </p>
    );
  }

  if (!analysis) {
    return (
      <div className="grid place-items-center py-4">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
        Грамматический разбор
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2" aria-label="Части речи во фразе">
        {analysis.tokens.map((token) => (
          <span
            key={`${token.index}-${token.surface}`}
            className={`inline-flex min-h-14 min-w-12 flex-col justify-end rounded-lg border px-2.5 py-1.5 ${POS_STYLE[token.upos] ?? FALLBACK_POS_STYLE}`}
            title={[
              token.lemma && `Начальная форма: ${token.lemma}`,
              token.translation && `Перевод: ${token.translation}`,
            ]
              .filter(Boolean)
              .join('\n')}
          >
            <span className="text-[10px] font-bold uppercase leading-tight">
              {token.posShort || 'слово'}
            </span>
            <span className="mt-0.5 font-serif text-base font-semibold leading-tight">
              {token.surface}
            </span>
          </span>
        ))}
      </div>
      {analysis.chunks.length > 0 ? (
        <ul className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4">
          {analysis.chunks.map((chunk) => (
            <li key={`${chunk.kind}-${chunk.tokens.join('-')}`} className="flex gap-3">
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2 shrink-0 rounded-full ${KIND_COLOR[chunk.kind]}`}
              />
              <div className="min-w-0">
                <p className="font-semibold">
                  {chunk.text}
                  <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                    {KIND_LABEL[chunk.kind]}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{chunk.label}</p>
                {chunk.note && (
                  <p className="mt-0.5 text-sm text-[var(--text-muted)]">{chunk.note}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-[var(--line)] pt-3 text-sm text-[var(--text-muted)]">
          Части речи определены, но устойчивых грамматических связей в этой
          фразе Читавук не нашёл.
        </p>
      )}
      {/*
        Слова, чей разбор выбран по соседям, отмечаются отдельно: это ровно то
        место, где разбор фразы даёт больше разбора слова, и не сказать об этом
        значит скрыть самое полезное.
      */}
      {analysis.tokens.some((token) => token.chosenByContext) && (
        <p className="mt-4 border-t border-[var(--line)] pt-3 text-xs leading-relaxed text-[var(--text-muted)]">
          Форму{' '}
          {analysis.tokens
            .filter((token) => token.chosenByContext)
            .map((token) => token.surface)
            .join(', ')}{' '}
          в отрыве от фразы разобрать нельзя — она подходит сразу под несколько
          разборов. Здесь выбран тот, который требуют соседние слова.
        </p>
      )}
    </div>
  );
}
