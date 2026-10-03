import { useState, type FormEvent } from 'react';
import { LuCircleCheck, LuCircleHelp } from 'react-icons/lu';

import { ApiError } from '../api/client';
import { sendTranslationFeedback, type FeedbackScope, type TranslationResult } from '../api/translate';
import type { WordAnalysis } from '../api/analyze';
import { Link } from '../lib/router';
import { useAuth } from '../state/auth';

/**
 * Насколько можно верить переводу. Три случая, и молчим, когда всё обычно:
 * хвалить нормальный перевод незачем, предупреждать стоит о слабом.
 */
export function TranslationConfidence({
  result,
  analysis,
}: {
  result: TranslationResult | null;
  analysis: WordAnalysis | null;
}) {
  if (!result) return null;
  if (result.verified) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--success,#2f7d4f)]">
        <LuCircleCheck aria-hidden="true" className="size-3.5" />
        Перевод проверен человеком
      </p>
    );
  }
  // Слова нет в словаре — значит, перевод догадка: так «polulopta» однажды
  // превратилась в «тяжесть». Английскому слову сербский словарь не судья.
  if (analysis && !analysis.known && !analysis.english) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--warning,#a2611a)]">
        <LuCircleHelp aria-hidden="true" className="size-3.5" />
        Этого слова нет в словаре — перевод может быть неточным
      </p>
    );
  }
  if (result.provider === 'google') {
    return <p className="mt-1 text-xs text-[var(--text-muted)]">Перевод примерный</p>;
  }
  return null;
}

/** Где именно нажали: то же предложение и те же границы, что ушли в перевод. */
export interface FeedbackSpan {
  sentence: string;
  start: number;
  end: number;
}

/** «Неверный перевод?» — раскрывается в короткую форму прямо в карточке слова. */
export function TranslationFeedback({ span, result }: { span: FeedbackSpan; result: TranslationResult }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-[var(--text-muted)] underline decoration-dotted underline-offset-4 hover:text-[var(--accent)]"
      >
        Неверный перевод?
      </button>
    );
  }
  return <FeedbackForm span={span} result={result} onCancel={() => setOpen(false)} />;
}

/**
 * Сама форма. Аккаунт спрашивается только здесь: читалка встречается и вне
 * AuthProvider (демо на главной, тесты), а до нажатия форма ей не нужна.
 */
function FeedbackForm({ span, result, onCancel }: { span: FeedbackSpan; result: TranslationResult; onCancel: () => void }) {
  const { account } = useAuth();
  const [suggestion, setSuggestion] = useState('');
  const [comment, setComment] = useState('');
  const [scope, setScope] = useState<FeedbackScope>('sentence');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { applied: boolean }>(null);

  if (done) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        {done.applied
          ? 'Готово: теперь все увидят твой перевод.'
          : 'Спасибо! Посмотрю и исправлю, если ты прав.'}
      </p>
    );
  }

  if (!account) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        <Link to="/login" className="font-semibold text-[var(--accent)] underline">Войди</Link>, чтобы
        предложить исправление.
      </p>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!suggestion.trim() && !comment.trim()) {
      setError('Напиши, как правильно, или что не так с переводом.');
      return;
    }
    setSending(true);
    setError('');
    try {
      setDone(await sendTranslationFeedback({
        ...span,
        shown: result.text,
        provider: result.provider,
        suggestion: suggestion.trim(),
        comment: comment.trim(),
        scope,
      }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось отправить. Попробуй ещё раз.');
    } finally {
      setSending(false);
    }
  };

  const word = span.sentence.slice(span.start, span.end);
  const input = 'w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none';
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] p-4">
      <label className="block text-sm">
        <span className="font-semibold">Как правильно перевести «{word}»</span>
        <input
          autoFocus
          maxLength={200}
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          className={`mt-1.5 ${input}`}
        />
      </label>
      <fieldset className="space-y-1.5 text-sm">
        <legend className="sr-only">Где исправить</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="feedback-scope" checked={scope === 'sentence'} onChange={() => setScope('sentence')} />
          Только в этом предложении
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="feedback-scope" checked={scope === 'form'} onChange={() => setScope('form')} />
          Слово «{word}» везде
        </label>
      </fieldset>
      <label className="block text-sm">
        <span className="text-[var(--text-muted)]">Комментарий, если хочешь</span>
        <textarea maxLength={1000} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className={`mt-1.5 ${input}`} />
      </label>
      {error && <p className="text-sm text-[var(--danger,#b3261e)]">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={sending} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-parchment disabled:opacity-60">
          {sending ? 'Отправляю…' : 'Отправить'}
        </button>
        <button type="button" onClick={onCancel} className="px-2 text-sm font-semibold text-[var(--text-muted)]">
          Отмена
        </button>
      </div>
    </form>
  );
}
