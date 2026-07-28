import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'citavuk-theme';

interface ThemeValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Начальное значение читается из того же места, что и скрипт в index.html.
 *
 * Скрипт выставляет класс до первой отрисовки, чтобы не мигнуть светлым фоном;
 * здесь мы лишь подхватываем уже принятое им решение — иначе React переключил
 * бы тему обратно.
 */
function initialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Приватный режим: выбор темы не переживёт перезагрузку.
    }
  }, [theme]);

  // Пока пользователь не выбрал тему явно, следуем за системной настройкой.
  useEffect(() => {
    let chosen = false;
    try {
      chosen = localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      // Нет доступа к хранилищу — считаем, что выбора не было.
    }
    if (chosen) return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) =>
      setTheme(event.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(
    () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
    [],
  );

  const value = useMemo<ThemeValue>(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme вызван вне ThemeProvider');
  return value;
}
