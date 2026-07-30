import { Link } from '../lib/router';
import { Ornament } from './Ornament';

/**
 * Подвал сайта.
 *
 * Раньше здесь была одна строка с двумя ссылками, и низ страницы обрывался,
 * будто вёрстка не дописана. Теперь это полноценная карта сайта: с любой
 * страницы видно все разделы, а не только те, что поместились в шапку.
 *
 * Внешние ссылки помечены стрелкой и открываются в новой вкладке: видео живёт
 * на отдельном сайте, и уход с Читавука не должен быть неожиданностью.
 */

const VIDEO_URL = 'https://serbiansubtitles.online/';
const TELEGRAM_URL = 'https://t.me/citavuk';

const COLUMNS = [
  {
    title: 'Заниматься',
    links: [
      { to: '/books', label: 'Что читать на сербском' },
      { to: '/library', label: 'Моя библиотека' },
      { to: '/public-library', label: 'Публичная библиотека' },
      { to: '/cards', label: 'Карточки' },
      { to: '/palace', label: 'Дворец памяти' },
      { to: '/listening', label: 'Слушание' },
      { to: '/course', label: 'Курс грамматики' },
      { to: '/trainer', label: 'Тренажёрка по грамматике' },
    ],
  },
  {
    title: 'Материалы',
    links: [
      { to: '/materials', label: 'Для поступления' },
      { to: '/materials?level=gimnazija', label: 'Приём в гимназию' },
      { to: '/materials?level=fakultet', label: 'Вступительные на факультет' },
    ],
  },
  {
    title: 'Приложение',
    links: [
      { to: '/downloads', label: 'Скачать' },
      { to: '/account', label: 'Аккаунт' },
      { to: '/about', label: 'О разработчике' },
      { to: '/privacy', label: 'Политика конфиденциальности' },
    ],
    external: [
      { href: VIDEO_URL, label: 'Видео с субтитрами' },
      { href: TELEGRAM_URL, label: 'Телеграм-канал' },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="paper-grain relative mt-8 overflow-hidden border-t border-[var(--line)] bg-[var(--bg-sunken)]">
      {/* Орнамент во всю ширину вместо обычной линии: тот же приём, что на
          обложках сербских изданий, — вышивка отделяет текст от края. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 text-[var(--accent)] opacity-25"
        aria-hidden="true"
      >
        <Ornament count={28} animated={false} />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pt-14 pb-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 font-display text-xl font-bold"
            >
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
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
              Сербский через чтение. Открываете текст, нажимаете слово и видите
              перевод в этом предложении, разбор формы и объяснение по-русски.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <IconLink
                href={TELEGRAM_URL}
                label="Телеграм-канал Читавука"
                path="M21.9 4.3L2.9 11.6c-1 .4-1 1.8 0 2.2l4.6 1.5 1.8 5.5c.3.9 1.4 1.1 2 .4l2.5-2.7 4.6 3.4c.8.6 1.9.2 2.1-.8l3.3-15.3c.2-1-.9-1.9-1.9-1.5zM8.6 14.9l9.4-5.8-7.8 6.9-.5 3.3z"
              />
              <IconLink
                href={VIDEO_URL}
                label="Сербские фильмы с субтитрами"
                path="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm6 3.5v7l6-3.5z"
              />
            </div>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-[var(--text)]">
                {column.title}
              </h2>
              <ul className="space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                {'external' in column &&
                  column.external.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                      >
                        {link.label}
                        <svg
                          viewBox="0 0 24 24"
                          className="size-3 fill-current opacity-60"
                          aria-hidden="true"
                        >
                          <path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h5v2H6v11h11v-4h2v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
                        </svg>
                      </a>
                    </li>
                  ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t border-[var(--line)] pt-6 text-sm text-[var(--text-muted)]">
          <p className="text-center sm:text-left">
            Разработчиком приложения является Денис Корнилов. При возникших
            вопросах при использовании сайта вы можете написать ему в телеграм:{' '}
            <a
              className="underline transition-colors hover:text-[var(--accent)]"
              href="https://t.me/ivanlindgren"
              target="_blank"
              rel="noreferrer noopener"
            >
              @ivanlindgren
            </a>{' '}
            или вконтакте (
            <a
              className="underline transition-colors hover:text-[var(--accent)]"
              href="https://vk.com/denkorni"
              target="_blank"
              rel="noreferrer noopener"
            >
              vk.com/denkorni
            </a>
            ).
          </p>

          <div className="mt-4 flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-between">
            <span>© {new Date().getFullYear()} Читавук</span>
            <span className="text-center sm:text-right">
              Материалы для поступления взяты со страниц сербских учреждений и
              факультетов, ссылками на первоисточник.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function IconLink({
  href,
  label,
  path,
}: {
  href: string;
  label: string;
  path: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
        <path d={path} />
      </svg>
    </a>
  );
}
