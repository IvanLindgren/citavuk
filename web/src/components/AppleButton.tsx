import { useEffect, useState } from 'react';

import { request } from '../api/client';

/**
 * Вход через Apple. Кнопка появляется, только когда сервер настроен: до
 * этого её нет совсем, а не «не работает».
 */
export function AppleButton({
  onStart,
  onError,
}: {
  onStart: () => Promise<string>;
  onError: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    request<{ apple?: { webEnabled?: boolean } }>('/v1/auth/providers', { anonymous: true })
      .then((providers) => {
        if (alive) setEnabled(providers.apple?.webEnabled === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!enabled) return null;

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const url = await onStart();
      if (!url) throw new Error('Сервер не вернул адрес авторизации.');
      window.location.assign(url);
    } catch (error) {
      setBusy(false);
      onError(error instanceof Error ? error.message : 'Не удалось открыть вход через Apple.');
    }
  }

  // Чёрная кнопка с логотипом — оформление из правил Apple.
  return (
    <button
      type="button"
      disabled={busy}
      onClick={start}
      className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-65"
    >
      <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
        <path d="M16.36 12.66c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.82 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.24 1.89 2.64 3.23 2.59 1.3-.05 1.79-.84 3.36-.84 1.56 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.52.99-1.45 1.39-2.85 1.42-2.92-.03-.01-2.72-1.04-2.71-4.13zM13.78 5.05c.71-.87 1.2-2.07 1.06-3.27-1.03.04-2.28.69-3.02 1.55-.66.76-1.24 1.99-1.09 3.16 1.15.09 2.33-.58 3.05-1.44z" />
      </svg>
      {busy ? 'Открываем Apple…' : 'Войти с Apple'}
    </button>
  );
}
