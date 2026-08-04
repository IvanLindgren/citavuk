import { useCallback, useEffect, useState } from 'react';

/**
 * Настройки чтения.
 *
 * Повторяют `ReaderSettings` приложения (frontend/lib/models/reader_settings.dart)
 * с точностью до имён полей: сайт и приложение — один продукт, и человек,
 * привыкший читать с отступом первой строки и выключкой по ширине, не должен
 * терять это, открыв книгу в браузере.
 *
 * Хранятся в localStorage, а не в IndexedDB: это несколько чисел, они нужны
 * синхронно при первой отрисовке страницы, и ждать открытия базы ради них
 * значило бы показать книгу сначала не тем шрифтом, а потом тем.
 *
 * Между устройствами настройки не переносятся намеренно: комфортный кегль на
 * телефоне и на большом мониторе — разный, и «синхронизация» здесь означала бы
 * порчу одного экрана ради другого.
 */

const STORAGE_KEY = 'citavuk-reader-settings';

export type ReaderFont = 'lora' | 'serif' | 'sans';
export type ReaderTheme = 'auto' | 'paper' | 'sepia' | 'gray' | 'night' | 'odyssey' | 'campaign100';

/** Уровень «бионического» выделения: доля слова от начала, набранная жирным. */
export type BionicLevel = 0 | 1 | 2 | 3;

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  font: ReaderFont;
  paragraphSpacing: number;
  firstLineIndent: number;
  justify: boolean;
  /** Ширина колонки в пикселях. FULL_WIDTH означает «во всю страницу». */
  maxWidth: number;
  theme: ReaderTheme;
  bionic: BionicLevel;
  /** Звук перелистывания. */
  sound: boolean;
  /** Анимация перелистывания. */
  animate: boolean;
}

export const FULL_WIDTH = 1100;

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 19,
  lineHeight: 1.7,
  letterSpacing: 0.2,
  font: 'lora',
  paragraphSpacing: 16,
  firstLineIndent: 24,
  justify: true,
  maxWidth: 700,
  theme: 'auto',
  bionic: 0,
  sound: true,
  animate: true,
};

export const FONT_STACKS: Record<ReaderFont, string> = {
  lora: "'Lora', Georgia, serif",
  serif: "Georgia, 'Times New Roman', serif",
  sans: "'Noto Sans', system-ui, sans-serif",
};

export const FONT_LABELS: Record<ReaderFont, string> = {
  lora: 'Lora',
  serif: 'С засечками',
  sans: 'Без засечек',
};

/** Доля слова от начала, набираемая жирным. */
export const BIONIC_RATIO: Record<BionicLevel, number> = {
  0: 0,
  1: 0.33,
  2: 0.5,
  3: 0.66,
};

export const BIONIC_LABELS: Record<BionicLevel, string> = {
  0: 'Выкл',
  1: 'Слабое',
  2: 'Среднее',
  3: 'Сильное',
};

/**
 * Цвета страницы.
 *
 * `auto` следует общей теме сайта, остальные фиксируют фон независимо от неё:
 * читать длинный текст многим удобнее на кремовом, даже когда весь остальной
 * интерфейс тёмный.
 */
export interface ReaderPalette {
  background: string;
  text: string;
  muted: string;
  border: string;
  backgroundImage?: string;
  backgroundSize?: string;
}

export const THEME_LABELS: Record<ReaderTheme, string> = {
  auto: 'Как на сайте',
  paper: 'Бумага',
  sepia: 'Сепия',
  gray: 'Серая',
  night: 'Ночь',
  odyssey: 'Спартанские шлемы',
  campaign100: 'Первые 100 читателей',
};

const PALETTES: Record<Exclude<ReaderTheme, 'auto'>, ReaderPalette> = {
  paper: {
    background: '#fbf6ea',
    text: '#2b2118',
    muted: '#5a4a3a',
    border: 'rgb(43 33 24 / 0.12)',
  },
  sepia: {
    background: '#f0e3c8',
    text: '#3b2b17',
    muted: '#6b543a',
    border: 'rgb(59 43 23 / 0.16)',
  },
  gray: {
    background: '#e7e5e1',
    text: '#26262a',
    muted: '#585860',
    border: 'rgb(38 38 42 / 0.14)',
  },
  night: {
    background: '#181410',
    text: '#e6dcc6',
    muted: '#9d8f79',
    border: 'rgb(230 220 198 / 0.14)',
  },
  odyssey: {
    background: '#efe3cf',
    text: '#2b2118',
    muted: '#66513f',
    border: 'rgb(67 42 30 / 0.18)',
    backgroundImage: "url('/events/odyssey/spartan-helmets.webp')",
    backgroundSize: '320px 258px',
  },
  campaign100: {
    background: '#f3e9d2',
    text: '#241a14',
    muted: '#66513f',
    border: 'rgb(67 42 30 / 0.18)',
  },
};

/** Палитра страницы. Для `auto` возвращает null — берутся токены темы сайта. */
export function paletteFor(theme: ReaderTheme): ReaderPalette | null {
  return theme === 'auto' ? null : PALETTES[theme];
}

/**
 * Приводит прочитанное к допустимым значениям.
 *
 * Настройки лежат в localStorage, куда может попасть что угодно: старая версия
 * с другим набором полей, ручная правка, мусор после сбоя. Читалка обязана
 * открыться в любом случае — испорченное поле заменяется значением по
 * умолчанию, а не роняет страницу.
 */
export function sanitize(raw: unknown): ReaderSettings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;

  const num = (key: keyof ReaderSettings, min: number, max: number): number => {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return DEFAULT_SETTINGS[key] as number;
    }
    return Math.min(max, Math.max(min, value));
  };

  const pick = <T extends string>(
    key: keyof ReaderSettings,
    allowed: readonly T[],
  ): T => (allowed.includes(input[key] as T) ? (input[key] as T) : (DEFAULT_SETTINGS[key] as T));

  const flag = (key: keyof ReaderSettings): boolean =>
    typeof input[key] === 'boolean' ? (input[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean);

  const bionic = input.bionic;
  return {
    fontSize: num('fontSize', 14, 32),
    lineHeight: num('lineHeight', 1.2, 2.4),
    letterSpacing: num('letterSpacing', -0.5, 2),
    font: pick('font', ['lora', 'serif', 'sans'] as const),
    paragraphSpacing: num('paragraphSpacing', 0, 48),
    firstLineIndent: num('firstLineIndent', 0, 64),
    justify: flag('justify'),
    maxWidth: num('maxWidth', 480, FULL_WIDTH),
    theme: pick('theme', ['auto', 'paper', 'sepia', 'gray', 'night', 'odyssey', 'campaign100'] as const),
    bionic: (bionic === 1 || bionic === 2 || bionic === 3 ? bionic : 0) as BionicLevel,
    sound: flag('sound'),
    animate: flag('animate'),
  };
}

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    // Приватный режим, испорченный JSON — читалка всё равно должна открыться.
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Настройки останутся рабочими до конца сессии.
  }
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = useCallback(<K extends keyof ReaderSettings>(
    key: K,
    value: ReaderSettings[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return { settings, update, reset };
}
