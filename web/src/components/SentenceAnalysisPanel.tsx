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

export function SentenceAnalysisPanel({ sentence }: { sentence: string }) {
  const [open, setOpen] = useState(false);
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
    setOpen(false);
  }, [sentence]);

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

  if (analysis.chunks.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        В этой фразе связывать нечего: ни предлогов с падежами, ни составных форм
        глагола Читавук не нашёл.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
        Из чего собрана фраза
      </p>
      <ul className="mt-3 grid gap-3">
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
