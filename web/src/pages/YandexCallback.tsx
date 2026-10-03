import { useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client';
import { Card, Spinner } from '../components/ui';
import { Link, useRouter } from '../lib/router';
import { useAuth } from '../state/auth';

export function YandexCallback() {
  const { completeYandex } = useAuth();
  return <OAuthCallback name="Яндекс" path="/auth/yandex" complete={completeYandex} />;
}

export function AppleCallback() {
  const { completeApple } = useAuth();
  return <OAuthCallback name="Apple" path="/auth/apple" complete={completeApple} />;
}

/**
 * Возврат после входа через браузер: сервер прислал одноразовый код, по нему
 * выдаётся сессия. Одинаково для Яндекса и Apple.
 */
function OAuthCallback({
  name,
  path,
  complete,
}: {
  name: string;
  path: string;
  complete: (code: string) => Promise<void>;
}) {
  const { navigate } = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const providerError = params.get('error');
    const code = params.get('code') ?? '';
    if (providerError || !code) {
      setError(providerError || `${name} не вернул код входа.`);
      return;
    }

    complete(code)
      .then(() => {
        window.history.replaceState(null, '', path);
        navigate('/library', { replace: true });
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof ApiError
            ? caught.message
            : `Не удалось завершить вход через ${name}.`,
        );
      });
  }, [complete, name, navigate, path]);

  return (
    <main className="paper-grain relative flex min-h-[calc(100dvh-4rem)] items-center justify-center px-5 py-12">
      <Card className="w-full max-w-md p-8 text-center">
        {error ? (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--error-soft)] text-2xl font-bold text-[var(--error)]">
              !
            </div>
            <h1 className="mt-5 text-3xl">Не удалось войти</h1>
            <p className="mt-4 text-[var(--text-muted)]">{error}</p>
            <Link
              to="/login"
              className="mt-7 inline-flex rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-parchment"
            >
              Вернуться ко входу
            </Link>
          </>
        ) : (
          <>
            <Spinner className="mx-auto size-8" />
            <h1 className="mt-5 text-3xl">Входим через {name}</h1>
          </>
        )}
      </Card>
    </main>
  );
}
