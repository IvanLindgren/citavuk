import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiError, getToken, request, setToken } from '../api/client';
import { forgetGoogleAccount } from '../lib/google';

export interface Account {
  id: string;
  email: string;
  displayName: string;
  syncRev: number;
  hasPassword: boolean;
  isAdmin: boolean;
  emailVerified: boolean;
  /**
   * Уровень сербского: A1…C1 либо пусто, если ещё не спрашивали.
   *
   * Едет вместе с аккаунтом, а не отдельным запросом: по нему решается,
   * показывать ли вопрос об уровне, ещё до первого экрана. Пустая строка и A1 —
   * разные вещи, иначе у новичка не осталось бы права ответить.
   */
  serbianLevel: string;
}

interface AuthResponse {
  token: string;
  expiresAt: string;
  user: Account;
}

export interface RegistrationResult {
  verificationRequired: boolean;
  email: string;
}

interface AuthValue {
  account: Account | null;
  /** Сессия ещё восстанавливается — интерфейс не должен мигать формой входа. */
  loading: boolean;
  busy: boolean;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<RegistrationResult>;
  login: (email: string, password: string) => Promise<void>;
  /** Вход по ID token, полученному от Google Identity Services. */
  loginWithGoogle: (idToken: string) => Promise<void>;
  startYandex: () => Promise<string>;
  completeYandex: (code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  /**
   * Запомнить уровень сербского на аккаунте.
   *
   * Живёт здесь, а не в отдельном хранилище, потому что уровень — часть
   * аккаунта: ответив однажды, человек вправе не отвечать больше нигде.
   */
  saveSerbianLevel: (level: string, source: 'declared' | 'test') => Promise<void>;
  logout: () => Promise<void>;
  /** Удаление аккаунта со всеми данными на сервере. */
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Устройство запоминается, чтобы в списке сессий было видно, откуда вход. */
function deviceInfo() {
  return {
    id: deviceId(),
    name: 'Браузер',
    platform: 'web',
  };
}

const DEVICE_KEY = 'citavuk-device';

function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return 'web';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Токен есть — проверяем его у сервера. Если он протух, лучше узнать это
  // сразу, чем на первом же действии пользователя.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    request<Account>('/v1/auth/me')
      .then((user) => {
        if (!cancelled) setAccount(user);
      })
      .catch((error: unknown) => {
        // Недействительную сессию убираем, а обрыв сети — нет: токен может
        // быть в порядке, просто сейчас нет интернета.
        if (error instanceof ApiError && error.isUnauthorized) setToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setBusy(true);
      try {
        const response = await request<AuthResponse>(path, {
          method: 'POST',
          body: { ...body, device: deviceInfo() },
          anonymous: true,
        });
        setToken(response.token);
        setAccount(response.user);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({
      account,
      loading,
      busy,
      register: async (email, password, displayName) => {
        setBusy(true);
        try {
          return await request<RegistrationResult>('/v1/auth/register', {
            method: 'POST',
            body: { email, password, displayName, device: deviceInfo() },
            anonymous: true,
          });
        } finally {
          setBusy(false);
        }
      },
      login: (email, password) => authenticate('/v1/auth/login', { email, password }),
      loginWithGoogle: (idToken) => authenticate('/v1/auth/google', { idToken }),
      startYandex: async () => {
        const response = await request<{ authorizationUrl: string }>(
          '/v1/auth/yandex/start',
          {
            method: 'POST',
            body: { returnTarget: 'web', device: deviceInfo() },
            anonymous: true,
          },
        );
        return response.authorizationUrl;
      },
      completeYandex: (code) =>
        authenticate('/v1/auth/yandex/complete', { code }),
      resendVerification: async (email) => {
        await request('/v1/auth/resend-verification', {
          method: 'POST',
          body: { email },
          anonymous: true,
        });
      },
      saveSerbianLevel: async (level, source) => {
        const saved = await request<{ level: string }>('/v1/profile/level', {
          method: 'PUT',
          body: { level, source },
        });
        setAccount((current) =>
          current ? { ...current, serbianLevel: saved.level } : current,
        );
      },
      deleteAccount: async (password: string) => {
        await request('/v1/auth/account/delete', {
          method: 'POST',
          body: { password, confirm: 'УДАЛИТЬ' },
        });
        setToken(null);
        setAccount(null);
        forgetGoogleAccount();
      },
      logout: async () => {
        try {
          await request('/v1/auth/logout', { method: 'POST' });
        } catch {
          // Сети нет — выходим локально. Пользователь нажал «выйти» и обязан
          // выйти; серверная сессия доживёт до своего срока.
        }
        setToken(null);
        setAccount(null);
        // Иначе Google при следующем заходе молча подставит тот же аккаунт,
        // и «выйти» окажется бессмысленным.
        forgetGoogleAccount();
      },
    }),
    [account, loading, busy, authenticate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth вызван вне AuthProvider');
  return value;
}
