import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LuBookOpen,
  LuBoxes,
  LuDownload,
  LuDumbbell,
  LuGraduationCap,
  LuHeadphones,
  LuHeartHandshake,
  LuInfo,
  LuLanguages,
  LuLibrary,
  LuMenu,
  LuNotebookTabs,
  LuSettings,
  LuSparkles,
  LuPresentation,
  LuRows3,
  LuShieldCheck,
  LuVideo,
  LuX,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';

import { Link, useRouter } from '../lib/router';
import { NotificationBell } from './ServerAnnouncements';
import { odysseyAvailable } from '../events/odyssey';
import { useAuth } from '../state/auth';
import { useTheme } from '../state/theme';

/**
 * Видео живёт на отдельном сайте. В списке разделов оно помечено внешним,
 * потому что уводит на другой продукт, и человек должен понимать это до
 * нажатия, а не после.
 */
const VIDEO_URL = 'https://serbiansubtitles.online/';

/**
 * Где раздел показывается в шапке на широком экране.
 *
 * - `nav` — верхний ряд: то, ради чего заходят каждый день;
 * - `pill` — выделенная кнопка справа: витрина раздела, который надо заметить;
 * - без пометки — панель «Ещё».
 *
 * На узком экране разница не важна: там показываются все разделы одинаково,
 * сгруппированные по смыслу.
 */
type Place = 'nav' | 'pill';

interface Section {
  to: string;
  label: string;
  /** Короткая подпись для тесных мест: в панели колонка узкая. */
  short?: string;
  icon: IconType;
  place?: Place;
  /** Временное событие — его надо заметить среди прочего. */
  featured?: boolean;
  /** Ведёт на другой сайт: обычная ссылка, а не переход роутера. */
  external?: boolean;
}

/**
 * Разделы сайта — ОДИН список на все размеры экрана.
 *
 * Раньше их было два: плоский `MORE` для десктопного «Ещё» и сгруппированный
 * `MOBILE_GROUPS` для телефона. Они закономерно разъехались — в десктопном не
 * оказалось ни «Уроков преподавателей», ни «Для учителей», — и заметить это
 * было неоткуда. Теперь список один, а `place` решает, где раздел показать.
 *
 * Группы те же, что на телефоне. Длинный вертикальный список из десяти
 * равноправных пунктов не читается ни на каком экране: глазу не за что
 * зацепиться, и нужный раздел приходится искать перебором.
 */
const GROUPS: { title: string; items: Section[] }[] = [
  {
    title: 'Читать',
    items: [
      { to: '/library', label: 'Моя библиотека', icon: LuLibrary, place: 'nav' },
      {
        to: '/micro-feed',
        label: 'Микро-лента',
        short: 'Лента',
        icon: LuRows3,
        place: 'pill',
        featured: true,
      },
      {
        to: '/public-library',
        label: 'Публичная библиотека',
        short: 'Публичная',
        icon: LuBookOpen,
      },
      { to: '/events', label: 'События', icon: LuSparkles, featured: true },
      { to: '/books', label: 'Что читать', icon: LuNotebookTabs },
    ],
  },
  {
    title: 'Учиться',
    items: [
      { to: '/course', label: 'Курс', icon: LuGraduationCap, place: 'nav' },
      { to: '/trainer', label: 'Тренажёрка', icon: LuDumbbell, place: 'nav' },
      { to: '/cards', label: 'Словарь', icon: LuLanguages, place: 'nav' },
      { to: '/listening', label: 'Слушание', icon: LuHeadphones, place: 'nav' },
      {
        to: '/lessons',
        label: 'Уроки преподавателей',
        short: 'Уроки',
        icon: LuGraduationCap,
        place: 'pill',
      },
      { to: '/dialogues', label: 'Диалоги', icon: LuBoxes },
      { to: '/materials', label: 'Материалы', icon: LuNotebookTabs },
      { to: '/teachers', label: 'Для учителей', icon: LuPresentation },
    ],
  },
  {
    title: 'Читавук',
    items: [
      { to: '/support', label: 'Поддержать проект', short: 'Поддержать', icon: LuHeartHandshake },
      { to: '/downloads', label: 'Скачать', icon: LuDownload },
      { to: '/about', label: 'О разработчике', icon: LuInfo },
      {
        to: VIDEO_URL,
        label: 'Видео с субтитрами',
        // В колонке панели полное название переносится на две строки и ломает
        // ряд; на телефоне места хватает, и там остаётся длинное.
        short: 'Видео',
        icon: LuVideo,
        external: true,
      },
    ],
  },
];

/**
 * Разделы администратора.
 *
 * Держатся отдельно от общих намеренно: в прежнем плоском списке «Админка»
 * стояла впритык к «Поддержать проект», и служебный инструмент выглядел как
 * ещё один раздел для читателя.
 */
const ADMIN: Section[] = [
  { to: '/admin/lessons', label: 'Модерация уроков', short: 'Модерация', icon: LuShieldCheck },
  { to: '/admin', label: 'Админка', icon: LuSettings },
];

const NAV = GROUPS.flatMap((group) =>
  group.items.filter((item) => item.place === 'nav'),
);

/** Разделы для панели «Ещё»: всё, что не вынесено в шапку отдельно. */
const MORE_GROUPS = GROUPS.map((group) => ({
  title: group.title,
  items: group.items.filter((item) => !item.place),
})).filter((group) => group.items.length > 0);

export function Header() {
  const { path } = useRouter();
  const { account } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(64);
  const headerRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header
      ref={headerRef}
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

        <nav className="ml-5 hidden items-center xl:flex">
          {NAV.map((item) => (
            <NavItem key={item.to} to={item.to} active={path.startsWith(item.to)}>
              {item.label}
            </NavItem>
          ))}
          <MoreMenu path={path} isAdmin={Boolean(account?.isAdmin)} />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/micro-feed"
            aria-current={path.startsWith('/micro-feed') ? 'page' : undefined}
            title="Микро-лента · эксперимент"
            className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--accent)]/35 bg-[var(--accent)] px-2.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            <LuRows3 className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline xl:hidden">Лента</span>
            <span className="hidden xl:inline">Микро-лента</span>
          </Link>
          <Link
            to="/lessons"
            aria-current={path.startsWith('/lessons') ? 'page' : undefined}
            className="hidden items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15 lg:inline-flex"
          >
            <LuGraduationCap className="size-4" aria-hidden="true" />
            <span className="2xl:hidden">Уроки</span>
            <span className="hidden 2xl:inline">Уроки преподавателей</span>
          </Link>
          {/* «Для учителей» и «Видео» уехали в панель «Ещё»: вместе с яркой
              кнопкой уроков они не помещались, и правый край обрезался. */}
          <ThemeToggle />
          <NotificationBell />

          <Link
            to={account ? '/account' : '/login'}
            className="hidden max-w-[10rem] truncate whitespace-nowrap rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2 text-sm font-semibold transition-colors hover:border-[var(--accent)] sm:block"
            title={account ? account.displayName || account.email : 'Войти'}
          >
            {account ? shortName(account.displayName || account.email) : 'Войти'}
          </Link>

          <button
            type="button"
            className="rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] xl:hidden"
            onClick={() => {
              if (!menuOpen) {
                setMenuTop(headerRef.current?.getBoundingClientRect().bottom ?? 64);
              }
              setMenuOpen((open) => !open);
            }}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
          >
            {menuOpen
              ? <LuX className="size-6" aria-hidden="true" />
              : <LuMenu className="size-6" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <SupportStrip />

      {typeof document !== 'undefined' && createPortal(<AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-0 z-50 bg-black/35 xl:hidden"
            style={{ top: menuTop }}
            onClick={() => setMenuOpen(false)}
          >
            <motion.nav
              initial={{ y: -18 }}
              animate={{ y: 0 }}
              exit={{ y: -18 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="max-h-full overflow-y-auto border-t border-[var(--line)] bg-[var(--bg-raised)] px-4 pb-6 pt-4 shadow-[var(--shadow-lift)]"
              onClick={(event) => event.stopPropagation()}
              aria-label="Разделы Читавука"
            >
              <div className="mx-auto max-w-xl space-y-4">
                {/* Список разделов общий с панелью «Ещё» — см. GROUPS. */}
                {GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="mb-1.5 px-1 text-xs font-bold uppercase text-[var(--text-muted)]">
                      {group.title}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {group.items.map((item) => (
                        <SectionTile
                          key={item.to}
                          item={item}
                          active={!item.external && path.startsWith(item.to)}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--line)] pt-4">
                  {account?.isAdmin &&
                    ADMIN.map((item) => (
                      <SectionTile
                        key={item.to}
                        item={item}
                        active={path.startsWith(item.to)}
                      />
                    ))}
                  <Link
                    to={account ? '/account' : '/login'}
                    className="rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"
                  >
                    {account ? 'Аккаунт' : 'Войти'}
                  </Link>
                </div>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
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

/**
 * Плитка раздела: значок и подпись.
 *
 * Одна и та же и в панели «Ещё», и в меню на телефоне — иначе один и тот же
 * раздел выглядел бы на двух экранах по-разному, а список у них теперь общий.
 */
function SectionTile({
  item,
  active,
  compact = false,
}: {
  item: Section;
  active: boolean;
  compact?: boolean;
}) {
  const Icon = item.icon;
  const label = compact ? item.short ?? item.label : item.label;

  const className = [
    'flex items-center gap-2 rounded-xl text-sm font-semibold transition-colors',
    compact ? 'whitespace-nowrap px-2.5 py-1.5' : 'min-h-12 gap-2.5 px-3 py-2.5',
    active
      ? 'bg-[var(--accent)] text-white'
      : compact
        ? 'text-[var(--text-muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]'
        : 'bg-[var(--bg-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]',
    // Временное событие обведено рамкой: среди полутора десятков разделов
    // одного цвета текста мало, чтобы его заметили, пока оно идёт.
    item.featured && !active ? 'border border-[#b68a4e] text-[var(--accent)]' : '',
  ].join(' ');

  const content = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 leading-tight">{label}</span>
      {item.external && (
        <span className="ml-auto shrink-0 text-xs opacity-60" aria-hidden="true">
          ↗
        </span>
      )}
    </>
  );

  // Внешняя ссылка — обычный <a>: роутер увёл бы её внутрь приложения и
  // показал бы пустую страницу вместо чужого сайта.
  if (item.external) {
    return (
      <a href={item.to} target="_blank" rel="noreferrer noopener" className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link to={item.to} aria-current={active ? 'page' : undefined} className={className}>
      {content}
    </Link>
  );
}

function MoreMenu({ path, isAdmin }: { path: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const active = MORE_GROUPS.some((group) =>
    group.items.some((item) => !item.external && path.startsWith(item.to)),
  );

  useEffect(() => setOpen(false), [path]);

  // Escape закрывает панель: она перекрывает страницу, и без клавиши её
  // приходится закрывать мышью, уводя курсор.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

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
        <svg
          viewBox="0 0 24 24"
          className={[
            'size-3.5 fill-current transition-transform duration-200',
            open ? 'rotate-180' : '',
          ].join(' ')}
          aria-hidden="true"
        >
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
            // Ширина по содержимому, а не «побольше»: в широкой панели колонки
            // расходятся так далеко, что перестают читаться как один список.
            // Ограничение по окну оставлено на случай узкого экрана.
            className="absolute left-0 top-full z-50 max-w-[calc(100vw-3rem)] rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-2.5 shadow-[var(--shadow-lift)]"
          >
            <nav aria-label="Остальные разделы">
              <div className="flex gap-1">
                {MORE_GROUPS.map((group) => (
                  <div key={group.title} className="min-w-0">
                    <p className="mb-1 px-2.5 text-[0.68rem] font-bold uppercase tracking-wide text-[var(--text-muted)]/70">
                      {group.title}
                    </p>
                    <div className="space-y-px">
                      {group.items.map((item) => (
                        <SectionTile
                          key={item.to}
                          item={item}
                          compact
                          active={!item.external && path.startsWith(item.to)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {isAdmin && (
                // Ряд, а не сетка: двух пунктов в трёхколоночной сетке не
                // хватало, и треть ширины оставалась пустой.
                <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--line)] pt-2">
                  {ADMIN.map((item) => (
                    <SectionTile
                      key={item.to}
                      item={item}
                      compact
                      active={path.startsWith(item.to)}
                    />
                  ))}
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SupportStrip() {
  const { path } = useRouter();
  if (odysseyAvailable() || path.startsWith('/support') || path.startsWith('/micro-feed')) return null;

  return (
    <div className="border-t border-[var(--line)]/60 bg-[var(--bg-raised)]/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2">
        <p className="min-w-0 flex-1 text-xs font-semibold leading-relaxed text-[var(--text-muted)] sm:text-sm">
          Читавук продолжает быть бесплатным. Скорее вступай в Telegram-чат
          обсуждения Читавука, а то волк укусит за бочок!{' '}
          <a
            href="https://t.me/citavukchat"
            target="_blank"
            rel="noreferrer noopener"
            className="whitespace-nowrap text-[var(--accent)] underline underline-offset-2"
          >
            t.me/citavukchat
          </a>
        </p>
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
