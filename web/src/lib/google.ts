/**
 * Вход через Google на веб-странице.
 *
 * Используется Google Identity Services: библиотека сама показывает окно выбора
 * аккаунта и возвращает подписанный ID token. Токен уходит на наш сервер, тот
 * проверяет подпись, издателя, получателя и подтверждённость почты — см.
 * server/internal/auth/google.go.
 *
 * Обмен кода на токен здесь не выполняется, поэтому client secret веб-странице
 * не нужен и в неё не попадает. Сам client_id секретом не является: это
 * публичный идентификатор приложения, он и так виден в каждом запросе к Google.
 */

/** client_id веб-приложения из Google Cloud Console. */
export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';

interface CredentialResponse {
  credential?: string;
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }): void;
      renderButton(
        parent: HTMLElement,
        options: {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'large' | 'medium' | 'small';
          text?: 'signin_with' | 'signup_with' | 'continue_with';
          shape?: 'rectangular' | 'pill' | 'circle' | 'square';
          logo_alignment?: 'left' | 'center';
          width?: number;
          locale?: string;
        },
      ): void;
      disableAutoSelect(): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let loader: Promise<GoogleIdentity> | null = null;

/**
 * Загружает библиотеку Google один раз на страницу.
 *
 * Повторные вызовы возвращают тот же промис: инициализировать библиотеку дважды
 * нельзя, а компонент кнопки может смонтироваться несколько раз.
 */
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(
      new Error('Вход через Google пока не настроен для этого адреса сайта.'),
    );
  }
  if (loader) return loader;

  loader = new Promise<GoogleIdentity>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google);
      return;
    }

    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) resolve(window.google);
      else reject(new Error('Библиотека Google загрузилась не полностью.'));
    };
    script.onerror = () => {
      // Скрипт могут заблокировать расширение или сеть. Это не повод ломать
      // страницу: вход по паролю продолжает работать.
      loader = null;
      reject(new Error('Не удалось загрузить вход через Google.'));
    };
    document.head.appendChild(script);
  });

  return loader;
}

/** Забывает выбранный аккаунт, чтобы после выхода не входило автоматически. */
export function forgetGoogleAccount(): void {
  try {
    window.google?.accounts.id.disableAutoSelect();
  } catch {
    // Библиотека не загружалась — забывать нечего.
  }
}
