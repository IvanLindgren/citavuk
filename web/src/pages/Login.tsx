import { motion } from 'framer-motion';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiError } from '../api/client';
import { GoogleButton } from '../components/GoogleButton';
import { Mascot } from '../components/Mascot';
import { Button, Card, ErrorNote, Spinner } from '../components/ui';
import { YandexButton } from '../components/YandexButton';
import { useRouter } from '../lib/router';
import { useAuth } from '../state/auth';
import { useSeo } from '../lib/seo';

export function Login() {
  useSeo({
    title: 'Вход и регистрация — Читавук',
    noindex: true,
  });

  const { navigate, path } = useRouter();
  const {
    account,
    login,
    register,
    loginWithGoogle,
    startYandex,
    resendVerification,
    busy,
  } = useAuth();

  // Режим задаётся адресом: ссылка «создать аккаунт» с главной должна открывать
  // сразу форму регистрации, а не вход.
  const [isRegister, setIsRegister] = useState(() =>
    path.includes('mode=register'),
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  // Уже вошедшему здесь делать нечего.
  useEffect(() => {
    if (account) navigate('/library', { replace: true });
  }, [account, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (isRegister && [...password].length < 8) {
      setError('Пароль должен быть не короче 8 символов.');
      return;
    }

    try {
      if (isRegister) {
        const result = await register(email, password, displayName);
        if (result.verificationRequired) {
          setVerificationEmail(result.email);
          return;
        }
      } else {
        await login(email, password);
      }
      navigate('/library', { replace: true });
    } catch (caught) {
      if (
        !isRegister &&
        caught instanceof ApiError &&
        caught.code === 'email_unverified'
      ) {
        setVerificationEmail(email.trim());
        return;
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Не удалось войти. Попробуйте позже.',
      );
    }
  }

  async function resend() {
    if (!verificationEmail) return;
    setError(null);
    setResent(false);
    try {
      await resendVerification(verificationEmail);
      setResent(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Не удалось повторно отправить письмо.',
      );
    }
  }

  if (verificationEmail) {
    return (
      <main className="paper-grain flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-12">
        <Card className="w-full max-w-md p-8 text-center sm:p-10">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-[var(--accent-soft)] text-2xl">
            ✉
          </div>
          <h1 className="text-3xl">Проверьте почту</h1>
          <p className="mt-4 leading-relaxed text-[var(--text-muted)]">
            Мы отправили ссылку подтверждения на{' '}
            <strong className="text-[var(--text)]">{verificationEmail}</strong>.
            После перехода по ней вернитесь и войдите.
          </p>
          {resent && (
            <p className="mt-4 text-sm font-semibold text-[var(--success)]">
              Новое письмо отправлено.
            </p>
          )}
          {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
          <Button
            type="button"
            onClick={resend}
            disabled={busy}
            className="mt-7 w-full"
          >
            {busy ? <Spinner /> : 'Отправить письмо ещё раз'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setVerificationEmail(null);
              setIsRegister(false);
              setResent(false);
              setError(null);
            }}
            className="mt-4 text-sm font-semibold text-[var(--accent)]"
          >
            Вернуться ко входу
          </button>
        </Card>
      </main>
    );
  }

  return (
    <main className="paper-grain relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-12">
      <div className="glow-warm pointer-events-none absolute inset-0" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="mx-auto mb-6 w-32">
          <Mascot
            pose={isRegister ? 'citavuk_zdravo' : 'citavuk_ukaz'}
            alt=""
            width={256}
            float
            priority
          />
        </div>

        <Card className="p-7 sm:p-9">
          <h1 className="text-center text-3xl">
            {isRegister ? 'Создать аккаунт' : 'Вход'}
          </h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-[var(--text-muted)]">
            Книги, словарь и карточки будут одинаковыми на всех устройствах.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {isRegister && (
              <Field
                label="Как вас зовут"
                hint="Необязательно"
                value={displayName}
                onChange={setDisplayName}
                autoComplete="name"
              />
            )}

            <Field
              label="Почта"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />

            <div>
              <Field
                label="Пароль"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    className="px-3 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {showPassword ? 'Скрыть' : 'Показать'}
                  </button>
                }
              />
              {isRegister && (
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                  Не короче 8 символов.
                </p>
              )}
            </div>

            {error && <ErrorNote>{error}</ErrorNote>}

            <Button type="submit" disabled={busy} className="w-full" size="lg">
              {busy ? <Spinner /> : isRegister ? 'Создать аккаунт' : 'Войти'}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <span className="h-px flex-1 bg-[var(--line)]" />
            или
            <span className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <GoogleButton
            text={isRegister ? 'signup_with' : 'signin_with'}
            onCredential={async (idToken) => {
              setError(null);
              try {
                await loginWithGoogle(idToken);
                navigate('/library', { replace: true });
              } catch (caught) {
                setError(
                  caught instanceof ApiError
                    ? caught.message
                    : 'Не удалось войти через Google.',
                );
              }
            }}
            onError={setError}
          />
          <YandexButton
            onStart={startYandex}
            onError={(message) => setError(message)}
          />

          <button
            type="button"
            onClick={() => {
              setIsRegister((value) => !value);
              setError(null);
            }}
            className="mt-5 w-full text-center text-sm font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
          >
            {isRegister ? 'У меня уже есть аккаунт' : 'Создать новый аккаунт'}
          </button>
        </Card>
      </motion.div>
    </main>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  type = 'text',
  trailing,
  ...rest
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  trailing?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2 text-sm font-semibold">
        {label}
        {hint && <span className="text-xs font-normal text-[var(--text-muted)]">{hint}</span>}
      </span>
      <span className="flex items-center rounded-2xl border border-[var(--line)] bg-[var(--bg)] transition-colors focus-within:border-[var(--accent)]">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent px-4 py-3 outline-none"
          {...rest}
        />
        {trailing}
      </span>
    </label>
  );
}
