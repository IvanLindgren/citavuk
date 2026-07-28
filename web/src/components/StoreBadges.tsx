import { useState } from 'react';

/**
 * Ссылки на магазины приложений.
 *
 * Значок Google Play — их официальный файл: правила использования марки
 * требуют именно его, со своими пропорциями и полями вокруг. Он лежит в
 * public/img и не грузится с чужого домена: чужая картинка в шапке — это и
 * лишний запрос на каждой странице, и чужой счётчик посещений.
 *
 * Со значком RuStore иначе: официальный файл они отдают только через свою
 * консоль разработчика, программно его не забрать. Компонент сначала пробует
 * `/img/rustore-badge.svg` — если файл положить, он появится сам, — а пока его
 * нет, рисуется своя кнопка того же размера. Логотип RuStore в ней не
 * используется: чужую марку лучше не рисовать по памяти.
 */

export const PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.srbskiread.srbski_read';
export const RUSTORE_URL =
  'https://www.rustore.ru/catalog/app/com.srbskiread.srbski_read';

/** Высота значков. Официальный бейдж Google — 646×250, отсюда и ширина. */
const BADGE_HEIGHT = 48;
const PLAY_WIDTH = Math.round((646 / 250) * BADGE_HEIGHT);

export function GooglePlayBadge({ height = BADGE_HEIGHT }: { height?: number }) {
  return (
    <a
      href={PLAY_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Скачать Читавук в Google Play"
      className="inline-block transition-transform hover:-translate-y-0.5"
    >
      <img
        src="/img/google-play-badge.png"
        alt="Доступно в Google Play"
        width={Math.round((646 / 250) * height)}
        height={height}
        style={{ height, width: 'auto' }}
        className="max-w-full"
      />
    </a>
  );
}

export function RuStoreBadge({ height = BADGE_HEIGHT }: { height?: number }) {
  // Официального файла может не быть — тогда браузер сообщит об ошибке
  // загрузки, и вместо картинки встанет своя кнопка.
  const [official, setOfficial] = useState(true);

  return (
    <a
      href={RUSTORE_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Читавук в RuStore"
      className="inline-block transition-transform hover:-translate-y-0.5"
    >
      {official ? (
        <img
          src="/img/rustore-badge.svg"
          alt="Доступно в RuStore"
          style={{ height, width: 'auto' }}
          className="max-w-full"
          onError={() => setOfficial(false)}
        />
      ) : (
        <span
          className="inline-flex items-center gap-2 rounded-lg bg-[#0a0a0a] px-4 text-white"
          style={{ height, minWidth: PLAY_WIDTH }}
        >
          <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2.6 21 6v12l-9 3.4L3 18V6zm0 2.13L5.6 7.1 12 9.47l6.4-2.37zM5 8.9v7.72l6 2.27v-7.72zm8 10 6-2.27V8.9l-6 2.27z"
            />
          </svg>
          <span className="leading-tight">
            <span className="block text-[10px] uppercase opacity-80">Доступно в</span>
            <span className="block text-sm font-semibold">RuStore</span>
          </span>
        </span>
      )}
    </a>
  );
}
