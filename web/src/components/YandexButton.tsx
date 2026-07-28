import { useState } from 'react';

export function YandexButton({
  onStart,
  onError,
}: {
  onStart: () => Promise<string>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const url = await onStart();
      if (!url) throw new Error('Сервер не вернул адрес авторизации.');
      window.location.assign(url);
    } catch (error) {
      setBusy(false);
      onError(
        error instanceof Error
          ? error.message
          : 'Не удалось открыть вход через Яндекс.',
      );
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={start}
      className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3 text-left transition-colors hover:border-[#fc3f1d] disabled:cursor-wait disabled:opacity-65"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#fc3f1d] font-sans text-xl font-bold text-white"
        aria-hidden="true"
      >
        Я
      </span>
      <span className="min-w-0 flex-1 font-semibold">
        {busy ? 'Открываем Яндекс…' : 'Продолжить с Яндексом'}
      </span>
    </button>
  );
}
