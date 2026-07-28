import { motion } from 'framer-motion';

import { Mascot } from '../components/Mascot';
import { GooglePlayBadge, RuStoreBadge } from '../components/StoreBadges';
import { Card, Reveal } from '../components/ui';
import { useSeo } from '../lib/seo';

/**
 * Версия сборок. Файлы лежат под постоянными именами, поэтому ссылки не
 * меняются от выпуска к выпуску, а номер указан отдельно — иначе непонятно,
 * что именно скачаешь.
 *
 * Номер общий, но у платформы может быть свой: Android обновляется чаще, потому
 * что уходит в магазин, а настольные сборки выпускаются реже. Один номер на всех
 * означал бы, что страница обещает под Windows то, чего в файле нет.
 */
const VERSION = '1.6.2';

type Platform = {
  id: 'android' | 'windows' | 'linux' | 'ios';
  title: string;
  subtitle: string;
  description: string;
  /** Прямая ссылка. Пусто — сборки ещё нет. */
  href?: string;
  /** Своя версия, если она обогнала общую. */
  version?: string;
  size?: string;
  note?: string;
  /** Запасной способ скачать: портативная сборка вместо установщика. */
  alternate?: { href: string; label: string; size: string };
};

const PLATFORMS: Platform[] = [
  {
    id: 'android',
    title: 'Android',
    subtitle: 'Android 7 и новее · Google Play или APK',
    description:
      'Мобильная читалка (PDF, DOCX, FB2, EPUB, DjVu), карточки, грамматический курс, аудирование и материалы для поступления.',
    href: '/files/citavuk.apk',
    version: '1.6.4',
    size: '86 МБ',
    note: 'Установка из файла: разрешите её для браузера в настройках Android.',
  },
  {
    id: 'windows',
    title: 'Windows',
    subtitle: 'Windows 10 и новее · 64 бита',
    description:
      'Настольная версия для больших книг: перетащите файл в окно — и читайте. Всё то же, что в вебе, плюс работа без интернета.',
    href: '/files/citavuk-setup.exe',
    size: '58 МБ',
    note: 'Установщик без подписи, поэтому SmartScreen спросит подтверждение: «Подробнее» и «Выполнить в любом случае».',
    alternate: {
      href: '/files/citavuk-windows.zip',
      label: 'Портативная версия (zip)',
      size: '61 МБ',
    },
  },
  {
    id: 'linux',
    title: 'Linux',
    subtitle: 'x86-64 · glibc 2.35 и новее',
    description:
      'Та же настольная версия. Ставится в домашний каталог, права root не нужны.',
    href: '/files/citavuk-linux-x64.tar.gz',
    size: '59 МБ',
    note: 'Распакуйте архив и запустите ./install.sh. Нужны GTK 3, GStreamer и webkit2gtk 4.1 — на обычном рабочем столе они уже стоят.',
  },
  {
    id: 'ios',
    title: 'iPhone и iPad',
    subtitle: 'App Store',
    description:
      'Версия для устройств Apple появится после подготовки публикации.',
  },
];

export function Downloads() {
  useSeo({
    title: 'Скачать Читавук для Android, Windows и Linux',
    description:
      'Приложение Читавук для Android, Windows и Linux: чтение с переводом в контексте, карточки повторения, курс грамматики и аудирование. Книги и словарь синхронизируются с сайтом.',
  });

  return (
    <main className="paper-grain min-h-[calc(100vh-4rem)] px-5 py-10 sm:py-16">
      <section className="mx-auto max-w-6xl">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_280px]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <p className="text-sm font-bold uppercase text-[var(--accent)]">
              Приложения Читавука
            </p>
            <h1 className="mt-2 text-4xl sm:text-5xl">Читайте на любом устройстве</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)]">
              Книги, словарь, карточки и прогресс курса синхронизируются между
              приложениями и сайтом. Достаточно войти в один и тот же аккаунт.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mx-auto w-52 sm:w-60"
          >
            <Mascot
              pose="citavuk_zdravo"
              alt="Волк Читавук приветствует пользователя"
              width={480}
              priority
            />
          </motion.div>
        </div>

        <StoresSection />

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PLATFORMS.map((platform, index) => (
            <Reveal key={platform.id} delay={index * 0.08}>
              <PlatformCard platform={platform} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <div className="mt-8 flex flex-col items-start justify-between gap-4 border-y border-[var(--line)] py-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl">Узнать о выходе сборок</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Новости релизов публикуются в канале Читавука.
              </p>
            </div>
            <a
              href="https://t.me/citavuk"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-5 py-3 font-semibold transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Следить в Telegram
            </a>
          </div>
        </Reveal>
      </section>
    </main>
  );
}

/**
 * Магазины приложений.
 *
 * Стоит выше карточек с файлами: установка из магазина обновляется сама и не
 * требует разрешать установку из неизвестных источников, поэтому APK ниже —
 * это запасной путь, а не основной.
 */
function StoresSection() {
  return (
    <Reveal>
      <Card className="mt-8 p-5 sm:p-6">
        <h2 className="text-xl">Установить из магазина</h2>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
          <div>
            <GooglePlayBadge />
            <p className="mt-2 max-w-xs text-sm text-[var(--text-muted)]">
              Свежая версия, обновляется само.
            </p>
          </div>
          <div>
            <RuStoreBadge />
            <p className="mt-2 max-w-xs text-sm text-[var(--text-muted)]">
              Сейчас скачивать не рекомендуем: там пока лежит старая версия
              приложения. Обновим — уберём эту оговорку.
            </p>
          </div>
        </div>
      </Card>
    </Reveal>
  );
}

function PlatformCard({ platform }: { platform: Platform }) {
  const ready = Boolean(platform.href);

  return (
    <Card className="flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <PlatformIcon platform={platform.id} />
        <span
          className={
            ready
              ? 'rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold text-[var(--accent)]'
              : 'rounded-full bg-[var(--bg-sunken)] px-3 py-1 text-xs font-bold text-[var(--text-muted)]'
          }
        >
          {ready ? `Версия ${platform.version ?? VERSION}` : 'Скоро'}
        </span>
      </div>
      <h2 className="mt-5 text-2xl">{platform.title}</h2>
      <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">
        {platform.subtitle}
      </p>
      <p className="mt-4 flex-1 leading-relaxed text-[var(--text-muted)]">
        {platform.description}
      </p>

      {platform.note && (
        <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
          {platform.note}
        </p>
      )}

      {platform.href ? (
        <>
          <a
            href={platform.href}
            // Файл именно скачивается, а не открывается браузером: без этого
            // .exe в части браузеров уходит в предпросмотр и путает.
            download
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 font-semibold text-parchment transition-colors hover:bg-[var(--accent-hover)]"
          >
            <DownloadIcon />
            Скачать · {platform.size}
          </a>
          {platform.alternate && (
            <a
              href={platform.alternate.href}
              download
              className="mt-2 text-center text-xs font-semibold text-[var(--text-muted)] underline-offset-2 transition-colors hover:text-[var(--accent)] hover:underline"
            >
              {platform.alternate.label} · {platform.alternate.size}
            </a>
          )}
        </>
      ) : (
        <span className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] px-5 py-3 font-semibold text-[var(--text-muted)]">
          Запланировано
        </span>
      )}
    </Card>
  );
}

function PlatformIcon({ platform }: { platform: Platform['id'] }) {
  const paths = {
    android: (
      <>
        <path d="M7 8h10a2 2 0 012 2v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7a2 2 0 012-2z" />
        <path d="M8 8a4 4 0 018 0M8 3l1.5 2M16 3l-1.5 2M8 19v2M16 19v2" />
      </>
    ),
    windows: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="1" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
    linux: (
      <>
        <path d="M12 3c2.2 0 3.4 1.8 3.4 4.2 0 1.6.5 2.6 1.4 4 1 1.5 1.7 2.7 1.7 4.1 0 2.6-2.5 4.2-6.5 4.2S5.5 17.9 5.5 15.3c0-1.4.7-2.6 1.7-4.1.9-1.4 1.4-2.4 1.4-4C8.6 4.8 9.8 3 12 3z" />
        <path d="M10.3 7.4h.01M13.7 7.4h.01" />
      </>
    ),
    ios: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M10 5h4M11 19h2" />
      </>
    ),
  };
  return (
    <span className="flex size-12 items-center justify-center rounded-xl bg-[var(--bg-sunken)] text-[var(--accent)]">
      <svg
        viewBox="0 0 24 24"
        className="size-7 fill-none stroke-current stroke-[1.8]"
        aria-hidden="true"
      >
        {paths[platform]}
      </svg>
    </span>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 fill-current" aria-hidden="true">
      <path d="M9 2h2v9.2l3.1-3.1 1.4 1.4-5.5 5.5-5.5-5.5 1.4-1.4L9 11.2zM3 16h14v2H3z" />
    </svg>
  );
}
