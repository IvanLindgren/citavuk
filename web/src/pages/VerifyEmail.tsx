import { useEffect, useState } from 'react';

import { ApiError, request } from '../api/client';
import { Link } from '../lib/router';
import { Card, Spinner } from '../components/ui';

type State = 'checking' | 'verified' | 'error';

export function VerifyEmail() {
  const [state, setState] = useState<State>('checking');
  const [message, setMessage] = useState('Проверяем ссылку…');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    if (!token) {
      setState('error');
      setMessage('В ссылке нет токена подтверждения.');
      return;
    }

    let cancelled = false;
    request('/v1/auth/verify-email', {
      method: 'POST',
      body: { token },
      anonymous: true,
    })
      .then(() => {
        if (cancelled) return;
        setState('verified');
        setMessage('Почта подтверждена. Теперь можно войти в аккаунт.');
        window.history.replaceState(null, '', '/verify-email');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState('error');
        setMessage(
          error instanceof ApiError
            ? error.message
            : 'Не удалось подтвердить почту.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="paper-grain flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-12">
      <Card className="w-full max-w-md p-8 text-center sm:p-10">
        {state === 'checking' ? (
          <Spinner className="mx-auto size-8" />
        ) : (
          <div
            className={`mx-auto flex size-14 items-center justify-center rounded-full text-2xl font-bold ${
              state === 'verified'
                ? 'bg-[var(--success-soft)] text-[var(--success)]'
                : 'bg-[var(--error-soft)] text-[var(--error)]'
            }`}
          >
            {state === 'verified' ? '✓' : '!'}
          </div>
        )}
        <h1 className="mt-5 text-3xl">
          {state === 'verified'
            ? 'Адрес подтверждён'
            : state === 'error'
              ? 'Ссылка не сработала'
              : 'Подтверждение почты'}
        </h1>
        <p className="mt-4 leading-relaxed text-[var(--text-muted)]">{message}</p>
        {state !== 'checking' && (
          <Link
            to="/login"
            className="mt-7 inline-flex rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-white"
          >
            Перейти ко входу
          </Link>
        )}
      </Card>
    </main>
  );
}
