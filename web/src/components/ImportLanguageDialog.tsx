import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { Button, ErrorNote, Spinner } from './ui';
import { Mascot } from './Mascot';
import { translationQuota, type DocumentLanguage } from '../api/documents';
import { Link } from '../lib/router';

/**
 * Что делать с документом не на сербском.
 *
 * Вопрос задаётся ровно один раз и только тогда, когда он уместен: сербская
 * книга открывается сразу, без единого лишнего нажатия. Именно поэтому язык
 * определяется до вопроса, а не спрашивается у человека.
 */

export type ImportChoice = 'original' | 'translate';

const LANGUAGE_NAMES: Record<string, string> = {
  ru: 'русском',
  en: 'английском',
};

export function ImportLanguageDialog({
  detected,
  title,
  signedIn,
  onChoose,
  onCancel,
}: {
  detected: DocumentLanguage;
  title: string;
  signedIn: boolean;
  onChoose: (choice: ImportChoice) => void;
  onCancel: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [quota, setQuota] = useState<
    { available: boolean; nextAt?: string; perDay: number } | null
  >(null);
  const [quotaError, setQuotaError] = useState('');

  // Предел спрашивается у сервера, а не подразумевается: человек мог перевести
  // книгу час назад на телефоне, и предлагать ему кнопку, которая ответит
  // отказом, — впустую потраченное ожидание.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await translationQuota();
        if (!cancelled) setQuota(result);
      } catch {
        if (!cancelled) setQuotaError('Не удалось узнать, доступен ли перевод.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  // Escape закрывает диалог: это единственный способ отказаться, не выбрав
  // ничего, и без него окно ощущается ловушкой.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const language = LANGUAGE_NAMES[detected.language] ?? '';
  const canTranslate = signedIn && detected.translatable && quota?.available === true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-language-title"
      onClick={onCancel}
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] p-6 shadow-[var(--shadow-lift)] sm:p-8"
      >
        <div className="mx-auto mb-5 w-28">
          <Mascot pose="citavuk_gram" alt="" width={224} />
        </div>

        <h2 id="import-language-title" className="text-center text-2xl">
          Документ не на сербском
        </h2>
        <p className="mt-3 text-center leading-relaxed text-[var(--text-muted)]">
          «{title}» написан{language ? ` на ${language}` : ' на другом языке'}.
          Читавук разбирает сербские слова, и на этом тексте разбор будет
          бесполезен. Можно перевести документ на сербский — или оставить как
          есть, если он нужен именно таким.
        </p>

        {quotaError && (
          <div className="mt-4">
            <ErrorNote>{quotaError}</ErrorNote>
          </div>
        )}

        <div className="mt-6 grid gap-2">
          <Button
            size="lg"
            disabled={!canTranslate}
            onClick={() => onChoose('translate')}
          >
            {signedIn && quota === null && !quotaError ? (
              <>
                <Spinner />
                Проверяем предел…
              </>
            ) : (
              'Перевести на сербский'
            )}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => onChoose('original')}>
            Оставить на языке оригинала
          </Button>
        </div>

        <p className="mt-4 text-center text-sm leading-relaxed text-[var(--text-muted)]">
          {reasonTranslationUnavailable(signedIn, detected, quota)}
        </p>

        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full rounded-xl px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          Не добавлять документ
        </button>
      </motion.div>
    </div>
  );
}

/**
 * Почему кнопка перевода недоступна.
 *
 * Отключённая кнопка без объяснения — худший вид интерфейса: человек не знает,
 * это поломка, или он чего-то не сделал, или так и задумано.
 */
function reasonTranslationUnavailable(
  signedIn: boolean,
  detected: DocumentLanguage,
  quota: { available: boolean; nextAt?: string; perDay: number } | null,
): string {
  if (!signedIn) {
    return 'Перевод доступен с аккаунтом: он расходует общую квоту переводчика, и без входа её не на кого записать.';
  }
  if (!detected.translatable) {
    return 'Переводчик сейчас недоступен. Документ можно добавить как есть и перевести позже.';
  }
  if (quota === null) return '';
  if (quota.available) {
    const perDay = quota.perDay === 1 ? 'один документ' : `${quota.perDay} документа`;
    return `Перевести можно ${perDay} в сутки — перевод книги целиком расходует квоту сразу за многих.`;
  }
  return `Суточный предел уже израсходован. Следующий перевод — ${untilLabel(quota.nextAt)}.`;
}

function untilLabel(nextAt?: string): string {
  if (!nextAt) return 'позже';
  const delta = new Date(nextAt).getTime() - Date.now();
  if (!Number.isFinite(delta) || delta <= 0) return 'сейчас';
  const hours = Math.ceil(delta / 3_600_000);
  if (hours <= 1) return 'меньше чем через час';
  if (hours < 5) return `через ${hours} часа`;
  return `через ${hours} часов`;
}

/** Полоса хода перевода: книга переводится минуты, и молчать всё это время нельзя. */
export function TranslationProgressCard({
  ratio,
  note,
  onCancel,
}: {
  ratio: number;
  note: string;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] p-8 shadow-[var(--shadow-lift)]">
        <div className="mx-auto mb-5 w-24">
          <Mascot pose="citavuk_ukaz" alt="" width={192} float />
        </div>
        <h2 className="text-center text-xl">Переводим на сербский</h2>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
          <motion.div
            className="h-full rounded-full bg-[var(--accent)]"
            animate={{ width: `${Math.round(ratio * 100)}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p className="mt-2 text-center text-sm tabular-nums text-[var(--text-muted)]">
          {Math.round(ratio * 100)}%
        </p>

        {note && (
          <p className="mt-4 text-center text-sm leading-relaxed text-[var(--text-muted)]">
            {note}
          </p>
        )}
        <p className="mt-3 text-center text-xs leading-relaxed text-[var(--text-muted)]">
          Не закрывайте вкладку: перевод идёт здесь, и незаконченный не
          сохранится.
        </p>

        <button
          type="button"
          onClick={onCancel}
          className="mt-5 w-full rounded-xl px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:text-serb-red"
        >
          Прервать
        </button>
      </div>
    </div>
  );
}

/** Подсказка о том, что картинки требуют аккаунта. */
export function SkippedImagesNote({ count, signedIn }: { count: number; signedIn: boolean }) {
  if (count <= 0) return null;
  return (
    <p className="text-sm leading-relaxed text-[var(--text-muted)]">
        {signedIn ? (
          <>Картинок пропущено: {count}. Они не подошли по формату или размеру.</>
        ) : (
          <>
            Картинок в документе: {count}, но они не сохранены.{' '}
            <Link to="/login" className="font-semibold text-[var(--accent)]">
              Войдите
            </Link>{' '}
            и добавьте документ снова — адрес картинки нужно записать в книгу
            сразу, поменять его потом нельзя.
          </>
        )}
    </p>
  );
}
