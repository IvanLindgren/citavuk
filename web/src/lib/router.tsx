import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

/**
 * Маленький роутер поверх History API.
 *
 * Полноценная библиотека здесь не окупается: маршрутов меньше десятка, вложенных
 * нет, а из возможностей нужны только переход, параметр в пути и текущий адрес.
 * Взамен получаем нулевой вес, полный контроль над анимацией переходов и
 * отсутствие зависимости, за обновлениями которой пришлось бы следить.
 */

export type RouteParams = Readonly<Record<string, string>>;

interface RouterValue {
  /** Текущий путь без домена, например `/reader/42`. */
  path: string;
  /** Переход с записью в историю. */
  navigate: (to: string, options?: { replace?: boolean }) => void;
  /** Назад по истории браузера. */
  back: () => void;
}

const RouterContext = createContext<RouterValue | null>(null);
const ParamsContext = createContext<RouteParams>({});

function currentPath(): string {
  return window.location.pathname + window.location.search;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    // Кнопки «назад» и «вперёд» меняют адрес мимо navigate — состояние нужно
    // подхватывать из события, иначе интерфейс останется на прежнем экране.
    const onPopState = () => setPath(currentPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    if (to === currentPath()) return;
    if (options?.replace) {
      window.history.replaceState(null, '', to);
    } else {
      window.history.pushState(null, '', to);
    }
    setPath(to);
    // Новый экран должен открываться сверху. Браузер сам этого не делает:
    // для него это та же страница.
    window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => window.history.back(), []);

  const value = useMemo<RouterValue>(
    () => ({ path, navigate, back }),
    [path, navigate, back],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error('useRouter вызван вне RouterProvider');
  return value;
}

/** Параметры текущего маршрута: для `/reader/:id` — `{ id: '42' }`. */
export function useParams(): RouteParams {
  return useContext(ParamsContext);
}

/**
 * Параметры строки запроса: для `/materials?level=fakultet` — `{ level:
 * 'fakultet' }`.
 *
 * Читается из `path`, а не из `window.location`: путь в состоянии роутера
 * меняется при переходе, а `location` компонент перерисовать не заставит.
 */
export function useQuery(): RouteParams {
  const { path } = useRouter();
  return useMemo(() => {
    const search = path.slice(path.indexOf('?') + 1);
    if (!path.includes('?') || search === '') return {};
    return Object.fromEntries(new URLSearchParams(search));
  }, [path]);
}

export interface RouteDefinition {
  /** Шаблон пути: `/reader/:id`. Параметры начинаются с двоеточия. */
  pattern: string;
  element: ReactNode;
}

/**
 * Сопоставляет путь с шаблоном и достаёт параметры.
 *
 * Экспортируется ради тестов: разбор путей — то место, где ошибка приводит к
 * пустому экрану вместо внятной ошибки, и проверять его нужно напрямую.
 */
export function matchPath(pattern: string, path: string): RouteParams | null {
  const cleanPath = path.split('?')[0] ?? '';
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = cleanPath.split('/').filter(Boolean);

  // Хвостовой шаблон `*` ловит всё, что не подошло раньше.
  const isCatchAll = patternParts.at(-1) === '*';
  if (!isCatchAll && patternParts.length !== pathParts.length) return null;
  if (isCatchAll && pathParts.length < patternParts.length - 1) return null;

  const params: Record<string, string> = {};
  for (const [index, part] of patternParts.entries()) {
    if (part === '*') return params;
    const actual = pathParts[index];
    if (actual === undefined) return null;
    if (part.startsWith(':')) {
      // Значение может содержать пробелы и кириллицу — раскодируем.
      params[part.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (part !== actual) return null;
  }
  return params;
}

/**
 * Выбирает первый подходящий маршрут. Порядок в массиве важен: перехватывающий
 * `*` должен идти последним.
 */
export function Routes({ routes }: { routes: RouteDefinition[] }) {
  const { path } = useRouter();

  const matched = useMemo(() => {
    for (const route of routes) {
      const params = matchPath(route.pattern, path);
      if (params) return { route, params };
    }
    return null;
  }, [routes, path]);

  if (!matched) return null;
  return (
    <ParamsContext.Provider value={matched.params}>
      {matched.route.element}
    </ParamsContext.Provider>
  );
}

type LinkProps = {
  to: string;
  children: ReactNode;
  onClick?: () => void;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>;

/**
 * Ссылка, не перезагружающая страницу.
 *
 * Остаётся настоящим `<a href>`: так работают «открыть в новой вкладке»,
 * копирование адреса и чтение экранными дикторами — всё, что теряется, если
 * подменить ссылку на `div` с обработчиком клика.
 */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter();

  return (
    <a
      href={to}
      onClick={(event) => {
        // Модификаторы и не левая кнопка означают «открыть в новой вкладке» —
        // перехватывать такой клик значит ломать ожидаемое поведение браузера.
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        onClick?.();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
