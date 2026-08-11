import { Link } from '../lib/router';
import { VUKOTOK_PATH } from './Header';
import { Ornament } from './Ornament';
import { WolfGlyph } from './WolfGlyph';

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

/**
 * Колонки повторяют группы из шапки: «Читать», «Учиться», «Читавук».
 *
 * Прежде разделы для занятий лежали одним списком из девяти пунктов рядом с
 * колонкой из трёх. Колонка-башня и колонка-огрызок читались как недоделанная
 * вёрстка, а найти нужное в списке из девяти равноправных строк можно было
 * только перебором.
 */
const COLUMNS = [
  {
    title: 'Читать',
    links: [
      { to: VUKOTOK_PATH, label: 'Вукоток' },
      { to: '/library', label: 'Моя библиотека' },
      { to: '/public-library', label: 'Публичная библиотека' },
      { to: '/books', label: 'Что читать на сербском' },
    ],
  },
  {
    title: 'Учиться',
    links: [
      { to: '/roadmap', label: 'Дорожная карта' },
      { to: '/course', label: 'Курс грамматики' },
      { to: '/trainer', label: 'Тренажёрка' },
      { to: '/basta', label: 'Сад Читавука' },
      { to: '/exams', label: 'Экзамены' },
      { to: '/cards', label: 'Карточки' },
      { to: '/palace', label: 'Дворец памяти' },
      { to: '/listening', label: 'Слушание' },
      { to: '/dialogues', label: 'Игровые диалоги' },
      { to: '/lessons', label: 'Уроки преподавателей' },
    ],
  },
  {
    title: 'Материалы',
    links: [
      { to: '/materials', label: 'Для поступления' },
      { to: '/materials?level=gimnazija', label: 'Приём в гимназию' },
      { to: '/materials?level=fakultet', label: 'Вступительные на факультет' },
      { to: '/teachers', label: 'Для учителей' },
    ],
  },
  {
    title: 'Читавук',
    links: [
      { to: '/downloads', label: 'Скачать приложение' },
      { to: '/support', label: 'Поддержать проект' },
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

      <div className="relative mx-auto max-w-6xl px-5 pt-12 pb-8">
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-[1.25fr_repeat(4,1fr)]">
          <div>
            <Link
              to="/"
              className="group inline-flex items-center gap-2.5 font-display text-xl font-bold"
            >
              <img
                src="/img/citavuk_icon.webp"
                srcSet="/img/citavuk_icon.webp 1x, /img/citavuk_icon@2x.webp 2x"
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-lg transition-transform duration-300 group-hover:-rotate-6"
              />
              Читавук
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
              Сербский через чтение. Открываете текст, нажимаете слово и видите
              перевод в этом предложении, разбор формы и объяснение по-русски.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
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

            {/* Витрина Вукотока и в подвале: раздел новый, и человеку, который
                доскроллил до конца, о нём стоит сказать ещё раз. */}
            <Link
              to={VUKOTOK_PATH}
              className="group mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-sm font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20"
            >
              <WolfGlyph className="size-4 transition-transform duration-300 group-hover:-rotate-12" />
              Открыть Вукоток
            </Link>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-[var(--text)]">
                {column.title}
                {/* Короткая черта под заголовком: четыре одинаковых столбца
                    текста иначе сливаются в сплошную стену. */}
                <span className="mt-1.5 block h-0.5 w-6 rounded-full bg-[var(--accent)]/45" aria-hidden="true" />
              </h2>
              <ul className="space-y-1.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <FooterLink to={link.to}>{link.label}</FooterLink>
                  </li>
                ))}
                {'external' in column &&
                  column.external.map((link) => (
                    <li key={link.href}>
                      <FooterLink href={link.href}>{link.label}</FooterLink>
                    </li>
                  ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t border-[var(--line)] pt-5 text-xs leading-relaxed text-[var(--text-muted)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-xl">
              Разработчик — Денис Корнилов. Вопросы по сайту:{' '}
              <a
                className="underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
                href="https://t.me/ivanlindgren"
                target="_blank"
                rel="noreferrer noopener"
              >
                @ivanlindgren
              </a>{' '}
              или{' '}
              <a
                className="underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
                href="https://vk.com/denkorni"
                target="_blank"
                rel="noreferrer noopener"
              >
                vk.com/denkorni
              </a>
              . Материалы для поступления взяты со страниц сербских учреждений и
              факультетов, ссылками на первоисточник.
            </p>
            <span className="shrink-0 sm:text-right">© {new Date().getFullYear()} Читавук</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * Ссылка подвала.
 *
 * При наведении показывает точку слева и отъезжает на волосок вправо. Два
 * десятка одинаковых строк подряд иначе не дают понять, на какой из них
 * курсор: смены одного цвета для этого мало.
 */
function FooterLink({
  to,
  href,
  children,
}: {
  to?: string;
  href?: string;
  children: string;
}) {
  const className =
    'group inline-flex items-center gap-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]';
  const content = (
    <>
      <span
        className="size-1 shrink-0 rounded-full bg-[var(--accent)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden="true"
      />
      <span className="transition-transform duration-200 group-hover:translate-x-0.5">
        {children}
      </span>
      {href && (
        <svg viewBox="0 0 24 24" className="size-3 shrink-0 fill-current opacity-60" aria-hidden="true">
          <path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h5v2H6v11h11v-4h2v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
        </svg>
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
        {content}
      </a>
    );
  }
  return <Link to={to ?? '/'} className={className}>{content}</Link>;
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
      className="flex size-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--text-muted)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-[var(--shadow-soft)]"
    >
      <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
        <path d={path} />
      </svg>
    </a>
  );
}
