import { useCallback, useEffect, useRef, useState } from 'react';
import { LuSend, LuTrash2, LuX } from 'react-icons/lu';

import {
  COMMENT_MAX,
  addMicroFeedComment,
  deleteMicroFeedComment,
  getMicroFeedComments,
  type MicroFeedComment,
} from '../api/microFeed';
import { Link } from '../lib/router';
import { useAuth } from '../state/auth';
import { ErrorNote, Spinner } from './ui';

/**
 * Обсуждение карточки Вукотока — шторкой поверх ленты.
 *
 * Шторка, а не блок внутри карточки: карточка не скроллится внутри вообще, и
 * это её главное свойство — вложенный скроллер внутри snap-контейнера отбирал
 * у ленты свайп. Здесь скроллится шторка, а лента под ней стоит.
 *
 * Читать может кто угодно, писать — только вошедший. Анонимная запись, видимая
 * всем, — приглашение для спама, а модератор в проекте один и он же автор.
 */
export function FeedComments({
  itemId,
  onClose,
  onCountChange,
}: {
  itemId: string;
  onClose: () => void;
  /** Счётчик на карточке должен показывать то же число, что и обсуждение. */
  onCountChange: (delta: number) => void;
}) {
  const { account } = useAuth();
  const [items, setItems] = useState<MicroFeedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    getMicroFeedComments(itemId, controller.signal)
      .then(setItems)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить обсуждение.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [itemId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (body === '' || sending) return;
    setSending(true);
    setError('');
    try {
      const comment = await addMicroFeedComment(itemId, body);
      setItems((current) => [comment, ...current]);
      onCountChange(1);
      setDraft('');
      inputRef.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить комментарий.');
    } finally {
      setSending(false);
    }
  }, [draft, itemId, onCountChange, sending]);

  async function remove(comment: MicroFeedComment) {
    // Список правится сразу: ответ сервера ничего не добавляет к тому, что и
    // так видно, а ожидание на удалении своей же реплики выглядит зависанием.
    setItems((current) => current.filter((one) => one.id !== comment.id));
    onCountChange(-1);
    try {
      await deleteMicroFeedComment(comment.id);
    } catch (caught) {
      setItems((current) => [comment, ...current].sort(byNewest));
      onCountChange(1);
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить комментарий.');
    }
  }

  const left = COMMENT_MAX - draft.trim().length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Обсуждение карточки"
      onClick={onClose}
    >
      {/*
        На широком экране обсуждение повторяет габариты карточки: та же
        пропорция телефона, то же скругление, та же ширина. Широкое окно во весь
        экран рвало ленту пополам — под ним оставалась узкая карточка, а над ним
        лежала панель втрое шире, и вместе они не читались как один экран.
      */}
      <div
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-[#1c1814] text-white shadow-2xl sm:rounded-3xl lg:h-[calc(100dvh-13rem)] lg:max-h-none lg:w-[min(30rem,calc((100dvh-13rem)*10/16))] lg:min-w-[23rem] lg:rounded-[1.75rem] lg:border lg:border-white/10"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="min-w-0 flex-1 font-display text-xl font-bold">
            Обсуждение{items.length > 0 && <span className="ml-2 text-white/45">{items.length}</span>}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20"
          >
            <LuX />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {loading && <div className="grid place-items-center py-10"><Spinner className="size-6 text-white" /></div>}
          {!loading && items.length === 0 && (
            <p className="py-8 text-center text-white/55">
              Пока никто не написал. Напишите первым — можно и по-сербски.
            </p>
          )}
          <ul className="space-y-4">
            {items.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 font-display text-sm font-bold text-white/80"
                >
                  {initial(comment.author)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-semibold">{comment.author}</span>
                    <time dateTime={comment.createdAt} className="shrink-0 text-xs text-white/45">
                      {whenLabel(comment.createdAt)}
                    </time>
                    {comment.mine && (
                      <button
                        type="button"
                        onClick={() => void remove(comment)}
                        aria-label="Удалить свой комментарий"
                        className="ml-auto shrink-0 rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white"
                      >
                        <LuTrash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  {/* Перенос строк сохраняется, ширина строки ограничена: длинное
                      слово без пробелов иначе растягивает шторку по горизонтали. */}
                  <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-white/85">
                    {comment.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}
          {account ? (
            <form
              onSubmit={(event) => { event.preventDefault(); void send(); }}
              className="flex items-end gap-2"
            >
              <div className="min-w-0 flex-1">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, COMMENT_MAX * 2))}
                  onKeyDown={(event) => {
                    // Enter отправляет, Shift+Enter переводит строку: реплика в
                    // ленте — одна фраза, и тянуться к кнопке ради неё незачем.
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder="Što mislite?"
                  aria-label="Ваш комментарий"
                  className="w-full resize-none rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                />
                <p className={`mt-1 text-right text-xs ${left < 0 ? 'text-[#ffb4ae]' : 'text-white/35'}`}>
                  {left < 60 ? left : ''}
                </p>
              </div>
              <button
                type="submit"
                disabled={sending || draft.trim() === '' || left < 0}
                aria-label="Отправить"
                className="mb-6 grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                {sending ? <Spinner className="size-4" /> : <LuSend className="size-5" />}
              </button>
            </form>
          ) : (
            <p className="text-sm text-white/60">
              <Link to="/login" className="font-semibold text-white underline underline-offset-4">
                Войдите
              </Link>
              , чтобы написать. Читать обсуждение можно и без входа.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function byNewest(left: MicroFeedComment, right: MicroFeedComment) {
  return right.createdAt.localeCompare(left.createdAt);
}

function initial(author: string) {
  return [...author.trim()][0]?.toLocaleUpperCase('ru') ?? '?';
}

/**
 * Когда написано.
 *
 * Свежие реплики — относительным сроком: в живом обсуждении «5 мин» отвечает на
 * вопрос лучше, чем точное время. Старые — датой, потому что «43 дня назад»
 * никто не переводит в число.
 */
export function whenLabel(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн`;
  return new Date(at).toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}
