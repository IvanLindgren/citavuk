/**
 * Файлы, которые нужны сцене автомата. На сайте это обычные адреса; для
 * приложения `build-slot-embed.mjs` находит их в собранном скрипте и кладёт в
 * страницу data-URL-ами — у WebView нет origin сайта.
 */
import type { WolfPart } from './slotWolf';

export interface SlotFontSource {
  family: string;
  url: string;
  unicodeRange?: string;
  weight?: string;
}

export interface SlotAssets {
  /** Детали Читавука-фокусника (SVG), см. slotWolf.ts. Пустая строка — детали нет. */
  wolf: Record<WolfPart, string>;
  fonts: SlotFontSource[];
}

export const PIXEL_FAMILY = 'Citavuk Pixel';
export const DISPLAY_FAMILY = 'Citavuk Display';
export const WORDMARK_FAMILY = 'Citavuk Lora';

export const SLOT_ASSETS: SlotAssets = {
  // Адреса записаны целиком: сборщик встраиваемой страницы ищет их в коде как строки.
  wolf: {
    head: '/img/citavuk-magician/head.svg',
    torso: '/img/citavuk-magician/torso.svg',
    tail: '/img/citavuk-magician/tail.svg',
    sleeve: '/img/citavuk-magician/sleeve.svg',
    paw: '/img/citavuk-magician/paw.svg',
    hat: '/img/citavuk-magician/hat.svg',
  },
  fonts: [
    // Ruslan Display (OFL): вывеска, темы на барабане и реплики Читавука.
    { family: DISPLAY_FAMILY, url: '/fonts/RuslanDisplay-cyrillic.woff2', unicodeRange: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
    {
      family: DISPLAY_FAMILY,
      url: '/fonts/RuslanDisplay-latin.woff2',
      unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
    // Press Start 2P (OFL): светодиодная бегущая строка — у неё клетка 8 × 8, как у матрицы.
    { family: PIXEL_FAMILY, url: '/fonts/PressStart2P-cyrillic.woff2', unicodeRange: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
    {
      family: PIXEL_FAMILY,
      url: '/fonts/PressStart2P-latin.woff2',
      unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
    // Надпись «Читавук» — тем же Lora, что логотип в шапке сайта.
    { family: WORDMARK_FAMILY, url: '/fonts/Lora-Bold.woff2', weight: '700' },
  ],
};
