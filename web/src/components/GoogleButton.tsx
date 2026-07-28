import { useEffect, useRef, useState } from 'react';

import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from '../lib/google';
import { useTheme } from '../state/theme';

/**
 * Кнопка «Войти через Google».
 *
 * Отрисовкой занимается сама библиотека Google: правила использования марки
 * требуют её фирменного оформления, а самодельная кнопка с логотипом Google —
 * повод для отзыва доступа приложения. Настраиваем то, что разрешено: форму,
 * размер и тему.
 */
export function GoogleButton({
  onCredential,
  onError,
  text = 'signin_with',
}: {
  onCredential: (idToken: string) => void;
  onError?: (message: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const { theme } = useTheme();

  // Колбэк держим в ref: библиотека Google запоминает функцию при инициализации,
  // и пересоздавать кнопку на каждый рендер родителя нельзя.
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    let cancelled = false;

    loadGoogleIdentity()
      .then((google) => {
        if (cancelled || !container.current) return;

        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response.credential) callback.current(response.credential);
          },
          // Автовыбор аккаунта выключен: молча войти за пользователя, который
          // только открыл страницу, — не то, чего он ожидает.
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        container.current.replaceChildren();
        google.accounts.id.renderButton(container.current, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text,
          logo_alignment: 'center',
          width: 320,
          locale: 'ru',
        });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setFailed(true);
        onError?.(error.message);
      });

    return () => {
      cancelled = true;
    };
    // theme в зависимостях: кнопка Google не перекрашивается сама, её нужно
    // перерисовать при смене темы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, text]);

  // Если библиотеку заблокировали, кнопку просто не показываем: вход по паролю
  // рядом и работает.
  if (failed) return null;

  return <div ref={container} className="flex justify-center" />;
}
