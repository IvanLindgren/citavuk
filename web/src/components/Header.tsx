import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { Link, useRouter } from '../lib/router';
import { useAuth } from '../state/auth';
import { useTheme } from '../state/theme';

/** Основные разделы — то, ради чего заходят каждый день. */
const NAV = [
  { to: '/library', label: 'Моя библиотека' },
  { to: '/public-library', label: 'Публичная' },
  { to: '/course', label: 'Курс' },
  { to: '/trainer', label: 'Тренажёрка' },
  { to: '/cards', label: 'Словарь' },
  { to: '/listening', label: 'Слушание' },
] as const;

/** Остальное живёт в «Ещё»: семь равноправных пунктов в строку не читались. */
const MORE = [
  { to: '/dialogues', label: 'Диалоги' },
  { to: '/books', label: 'Что читать' },
  { to: '/materials', label: 'Материалы' },
  { to: '/support', label: 'Поддержать проект' },
  { to: '/downloads', label: 'Скачать' },
  { to: '/about', label: 'О разработчике' },
] as const;

const ALL_NAV = [...NAV, ...MORE];

/**
 * Видео живёт на отдельном сайте, поэтому и в меню стоит наособицу: рядом с
 * разделами Читавука оно читалось бы как ещё одна его страница, а уводит на
 * другой продукт.
 */
const VIDEO_URL = 'https://serbiansubtitles.online/';

export function Header() {
  const { path } = useRouter();
  const { account } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Шапка «прилипает» и уплотняется после прокрутки: на длинной странице это
  // подсказывает, что верх остался позади.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Смена страницы закрывает мобильное меню — иначе оно останется поверх нового
  // экрана.
  useEffect(() => setMenuOpen(false), [path]);

  return (
    <header
      className={[
        'sticky top-0 z-40 border-b transition-all duration-300',
        scrolled
          ? 'border-[var(--line)] bg-[var(--bg)]/85 backdrop-blur-md'
          : 'border-transparent bg-transparent',
      ].join(' ')}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
        <Link to="/" className="flex items-center gap-2.5 font-display text-xl font-bold">
          <img
            src="/img/citavuk_icon.webp"
            srcSet="/img/citavuk_icon.webp 1x, /img/citavuk_icon@2x.webp 2x"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-lg"
          />
          Читавук
        </Link>

        <nav className="ml-5 hidden items-center lg:flex">
          {NAV.map((item) => (
            <NavItem key={item.to} to={item.to} active={path.startsWith(item.to)}>
              {item.label}
            </NavItem>
          ))}
          <MoreMenu path={path} isAdmin={Boolean(account?.isAdmin)} />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <VideoLink />
          <span
            className="hidden h-6 w-px bg-[var(--line)] lg:block"
            aria-hidden="true"
          />
          <ThemeToggle />

          <Link
            to={account ? '/account' : '/login'}
            className="hidden max-w-[10rem] truncate whitespace-nowrap rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2 text-sm font-semibold transition-colors hover:border-[var(--accent)] sm:block"
            title={account ? account.displayName || account.email : 'Войти'}
          >
            {account ? shortName(account.displayName || account.email) : 'Войти'}
          </Link>

          <button
            type="button"
            className="rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
          >
            <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden="true">
              {menuOpen ? (
                <path d="M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z" />
              ) : (
                <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <SupportStrip />

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)] lg:hidden"
          >
            <div className="flex flex-col p-3">
              {ALL_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="rounded-xl px-4 py-3 font-semibold transition-colors hover:bg-[var(--bg-sunken)]"
                >
                  {item.label}
                </Link>
              ))}
              {account?.isAdmin && (
                <Link
                  to="/admin"
                  className="rounded-xl px-4 py-3 font-semibold transition-colors hover:bg-[var(--bg-sunken)]"
                >
                  Админка
                </Link>
              )}
              <Link
                to={account ? '/account' : '/login'}
                className="rounded-xl px-4 py-3 font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--bg-sunken)]"
              >
                {account ? 'Аккаунт' : 'Войти'}
              </Link>

              <span className="my-2 h-px bg-[var(--line)]" aria-hidden="true" />

              <a
                href={VIDEO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 rounded-xl px-4 py-3 font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)]"
              >
                Видео с субтитрами
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5 fill-current opacity-60"
                  aria-hidden="true"
                >
                  <path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h5v2H6v11h11v-4h2v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
                </svg>
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Длинное «Денис Корнилов» ломало кнопку на две строки. */
function shortName(value: string): string {
  const name = (value.split('@')[0] ?? value).trim();
  const [first, second] = name.split(/\s+/);
  if (!first) return name;
  return second ? `${first} ${second.slice(0, 1)}.` : first;
}

function MoreMenu({ path, isAdmin }: { path: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const items = isAdmin ? [...MORE, { to: '/admin', label: 'Админка' }] : MORE;
  const active = items.some((item) => path.startsWith(item.to));

  useEffect(() => setOpen(false), [path]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={[
          'flex items-center gap-1 whitespace-nowrap rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors',
          active
            ? 'text-[var(--accent)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text)]',
        ].join(' ')}
      >
        Ещё
        <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden="true">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 top-full z-50 min-w-44 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-2 shadow-lg"
          >
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={[
                  'block rounded-xl px-3 py-2 text-sm font-semibold transition-colors hover:bg-[var(--bg-sunken)]',
                  path.startsWith(item.to)
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]',
                ].join(' ')}
              >
                {item.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SupportStrip() {
  const { path } = useRouter();
  if (path.startsWith('/support')) return null;

  return (
    <div className="border-t border-[var(--line)]/60 bg-[var(--bg-raised)]/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-2">
        <span className="min-w-0 text-xs font-semibold text-[var(--text-muted)] sm:text-sm">
          Читавук остаётся бесплатным
        </span>
        <Link
          to="/support"
          className="shrink-0 rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[var(--accent-hover)] sm:text-sm"
        >
          Поддержать развитие
        </Link>
      </div>
    </div>
  );
}

function NavItem({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={[
        'relative whitespace-nowrap rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors',
        active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {children}
      {active && (
        // layoutId переносит подчёркивание между пунктами плавно, а не
        // перерисовывает его на новом месте.
        <motion.span
          layoutId="nav-underline"
          className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-[var(--accent)]"
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </Link>
  );
}

/**
 * Ссылка на отдельный сайт с видео и субтитрами.
 *
 * Это внешний переход, поэтому обычная ссылка, а не Link роутера, плюс явная
 * иконка: человек должен понимать, что уходит с Читавука, до нажатия.
 */
function VideoLink() {
  return (
    <a
      href={VIDEO_URL}
      target="_blank"
      rel="noreferrer noopener"
      className="hidden items-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-3.5 py-2 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] lg:inline-flex"
      title="Сербские фильмы и сериалы с субтитрами — отдельный сайт"
    >
      <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
        <path d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm6 3.5v7l6-3.5z" />
      </svg>
      Видео
      <svg viewBox="0 0 24 24" className="size-3 fill-current opacity-60" aria-hidden="true">
        <path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h5v2H6v11h11v-4h2v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
      </svg>
    </a>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
      aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
    >
      <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
        {theme === 'dark' ? (
          <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5h0a1 1 0 011 1v2a1 1 0 11-2 0V3a1 1 0 011-1zm0 17a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zM3 11h2a1 1 0 110 2H3a1 1 0 110-2zm16 0h2a1 1 0 110 2h-2a1 1 0 110-2zM5.6 4.2l1.4 1.4A1 1 0 015.6 7L4.2 5.6a1 1 0 011.4-1.4zm11.4 12.8l1.4 1.4a1 1 0 01-1.4 1.4L15.6 18a1 1 0 011.4-1zm1.4-12.8a1 1 0 010 1.4L17 7a1 1 0 01-1.4-1.4l1.4-1.4a1 1 0 011.4 0zM7 17l-1.4 1.4a1 1 0 01-1.4-1.4L5.6 15.6A1 1 0 017 17z" />
        ) : (
          <path d="M21.6 13.3A9 9 0 1110.7 2.4a1 1 0 011.2 1.3 7 7 0 008.4 8.4 1 1 0 011.3 1.2z" />
        )}
      </svg>
    </button>
  );
}
