import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';

import {
  addComment,
  getComments,
  hideComment,
  type BookComment,
} from '../api/share';
import { Button, Card, ErrorNote, Spinner } from '../components/ui';
import { Link } from '../lib/router';
import { useAuth } from '../state/auth';

/**
 * Обсуждение страницы книги — только по-сербски.
 *
 * Правило проверяет сервер, а не эта форма: проверка в браузере обходится одним
 * запросом мимо неё. Здесь только предупреждение заранее и показ ответа сервера,
 * если он отказал, — в отказе написано, что именно исправить.
 *
 * Разговор привязан к странице, а не к книге: обсуждение начала третьей главы
 * посреди общей ленты никому не найти. Номер страницы — индекс её первого
 * абзаца, единственная величина, одинаковая в браузере и в приложении.
 */
export function Discussion({
  token,
  paragraph,
}: {
  token: string;
  paragraph: number;
}) {
  const { account } = useAuth();
  const [items, setItems] = useState<BookComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setItems(await getComments(token, paragraph, signal));
      } catch {
        if (!signal?.aborted) setItems([]);
      }
    },
    [token, paragraph],
  );

  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setError('');
    setSending(true);
    try {
      const comment = await addComment(token, paragraph, body);
      setItems((previous) => [...(previous ?? []), comment]);
      setDraft('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Не удалось отправить сообщение.',
      );
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    try {
      await hideComment(id);
      setItems((previous) => (previous ?? []).filter((item) => item.id !== id));
    } catch {
      setError('Не удалось убрать сообщение.');
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Обсуждение страницы</h2>
        <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
          само по-сербски
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Пишите только на сербском — с ошибками можно, в этом и смысл. Сообщения
        видят все, кто открыл книгу по этой ссылке.
      </p>

      <div className="mt-4 space-y-3">
        {items === null ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Spinner /> Загружаем…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Здесь пока тихо. Напишите первым — хоть одну фразу.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl bg-[var(--bg-sunken)] p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{item.author}</span>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    {new Date(item.createdAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm" lang="sr">
                  {item.body}
                </p>
                {item.mine && (
                  <button
                    type="button"
                    onClick={() => void remove(item.id)}
                    className="mt-1 text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
                  >
                    Убрать
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {account ? (
        <div className="mt-4">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Napišite nešto o ovoj strani…"
            rows={3}
            lang="sr"
            maxLength={1000}
            className="w-full resize-y rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          />
          {error && (
            <div className="mt-2">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          <Button
            className="mt-3 w-full sm:w-auto"
            disabled={sending || draft.trim().length === 0}
            onClick={() => void send()}
          >
            {sending ? <Spinner /> : 'Отправить'}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Чтобы писать в обсуждение,{' '}
          <Link to="/login" className="font-semibold text-[var(--accent)]">
            войдите в аккаунт
          </Link>
          : под сообщением стоит имя.
        </p>
      )}
    </Card>
  );
}
