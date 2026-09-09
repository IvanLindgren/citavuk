/**
 * Клиент сервера Citavuk.
 *
 * Тот же API, что использует мобильное приложение: аккаунты, синхронизация и
 * перевод. Схема ответов описана в server/README.md.
 */

/** Адрес API. В разработке запросы идут через прокси Vite, см. vite.config.ts. */
export const API_BASE = import.meta.env.DEV ? '' : 'https://api.citavuk.ru';

const TOKEN_KEY = 'citavuk-token';
const EPHEMERAL_TOKEN_KEY = 'citavuk-session-token';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = '',
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Запрос не дошёл до сервера: сеть недоступна или он не ответил. */
  get isOffline(): boolean {
    return this.status === 0;
  }

  /** Сессия недействительна — нужно войти заново. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/**
 * В localStorage хранится только признак сессии. Секрет — в HttpOnly cookie.
 * Старые bearer-сессии требуют повторного входа после обновления.
 */
export function getToken(): string | null {
  try {
    const value = localStorage.getItem(TOKEN_KEY);
    if (value === 'cookie') return value;
    localStorage.removeItem(TOKEN_KEY);
    return sessionStorage.getItem(EPHEMERAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token === 'cookie') {
      localStorage.setItem(TOKEN_KEY, 'cookie');
      sessionStorage.removeItem(EPHEMERAL_TOKEN_KEY);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      if (token) sessionStorage.setItem(EPHEMERAL_TOKEN_KEY, token);
      else sessionStorage.removeItem(EPHEMERAL_TOKEN_KEY);
    }
  } catch {
    // Приватный режим браузера: сессия проживёт до перезагрузки вкладки.
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Не подставлять заголовок Authorization. */
  anonymous?: boolean;
  /** Свои заголовки: например, подпись участника матча у гостя. */
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 20_000;

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, anonymous, timeoutMs = DEFAULT_TIMEOUT } = options;

  // Собственный таймаут обязателен: fetch по умолчанию ждёт бесконечно, и
  // «вечная загрузка» — худшее, что может увидеть пользователь.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) abort();
    else options.signal.addEventListener('abort', abort, { once: true });
  }

  const headers: Record<string, string> = { Accept: 'application/json', 'X-Citavuk-Client': 'web', ...options.headers };
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  const token = getToken();
  if (!anonymous) {
    if (token && token !== 'cookie') headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      credentials: token === 'cookie' || path.startsWith('/v1/auth/') ? 'include' : 'omit',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // Сюда попадают и обрыв сети, и таймаут, и блокировка CORS. Для
    // вызывающего смысл один: ответа нет.
    throw new ApiError('Нет связи с сервером.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }

  const text = await response.text();

  if (!response.ok) {
    let message = `Ошибка сервера (${response.status}).`;
    let code = '';
    try {
      const parsed = JSON.parse(text) as { message?: string; code?: string };
      if (parsed.message) message = parsed.message;
      if (parsed.code) code = parsed.code;
    } catch {
      // Тело не JSON — оставляем общее сообщение.
    }
    throw new ApiError(message, response.status, code);
  }

  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('Сервер вернул неразбираемый ответ.', response.status);
  }
}
