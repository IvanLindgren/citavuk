import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { lazy, Suspense, type ReactNode } from "react";

import { AppPrompt } from "./components/AppPrompt";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Spinner } from "./components/ui";
import {
  Link,
  RouterProvider,
  Routes,
  useRouter,
  type RouteDefinition,
} from "./lib/router";
import { Landing } from "./pages/Landing";
import { AuthProvider } from "./state/auth";
import { SyncProvider } from "./state/sync";
import { ThemeProvider } from "./state/theme";

// Разделы, до которых пользователь доходит не всегда, грузятся отдельно:
// главная страница не должна тащить с собой код читалки и курса.
const Login = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login })),
);
const Library = lazy(() =>
  import("./pages/Library").then((m) => ({ default: m.Library })),
);
const Reader = lazy(() =>
  import("./pages/Reader").then((m) => ({ default: m.Reader })),
);
const Account = lazy(() =>
  import("./pages/Account").then((m) => ({ default: m.Account })),
);
const Course = lazy(() =>
  import("./pages/Course").then((m) => ({ default: m.Course })),
);
const CourseLesson = lazy(() =>
  import("./pages/CourseLesson").then((m) => ({ default: m.CourseLesson })),
);
const Trainer = lazy(() =>
  import("./pages/Trainer").then((m) => ({ default: m.Trainer })),
);
const TestRun = lazy(() =>
  import("./pages/TestRun").then((m) => ({ default: m.TestRun })),
);
const Listening = lazy(() =>
  import("./pages/Listening").then((m) => ({ default: m.Listening })),
);
const ListeningPlayer = lazy(() =>
  import("./pages/ListeningPlayer").then((m) => ({ default: m.ListeningPlayer })),
);
const Admin = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.Admin })),
);
const Books = lazy(() =>
  import("./pages/Books").then((m) => ({ default: m.Books })),
);
const Materials = lazy(() =>
  import("./pages/Materials").then((m) => ({ default: m.Materials })),
);
const Cards = lazy(() =>
  import("./pages/Cards").then((m) => ({ default: m.Cards })),
);
const Palace = lazy(() =>
  import("./pages/Palace").then((m) => ({ default: m.Palace })),
);
const Downloads = lazy(() =>
  import("./pages/Downloads").then((m) => ({ default: m.Downloads })),
);
const VerifyEmail = lazy(() =>
  import("./pages/VerifyEmail").then((m) => ({ default: m.VerifyEmail })),
);
const About = lazy(() =>
  import("./pages/About").then((m) => ({ default: m.About })),
);
const Privacy = lazy(() =>
  import("./pages/Privacy").then((m) => ({ default: m.Privacy })),
);
const YandexCallback = lazy(() =>
  import("./pages/YandexCallback").then((m) => ({ default: m.YandexCallback })),
);

const ROUTES: RouteDefinition[] = [
  { pattern: "/", element: <Landing /> },
  { pattern: "/login", element: <Login /> },
  { pattern: "/library", element: <Library /> },
  { pattern: "/reader/:id", element: <Reader /> },
  { pattern: "/cards", element: <Cards /> },
  { pattern: "/palace", element: <Palace /> },
  { pattern: "/account", element: <Account /> },
  { pattern: "/listening", element: <Listening /> },
  { pattern: "/listening/:id", element: <ListeningPlayer /> },
  { pattern: "/course", element: <Course /> },
  { pattern: "/course/lesson/:id", element: <CourseLesson /> },
  { pattern: "/trainer", element: <Trainer /> },
  { pattern: "/tests/:id", element: <TestRun /> },
  { pattern: "/books", element: <Books /> },
  { pattern: "/materials", element: <Materials /> },
  { pattern: "/materials/:subject", element: <Materials /> },
  { pattern: "/downloads", element: <Downloads /> },
  { pattern: "/verify-email", element: <VerifyEmail /> },
  { pattern: "/privacy", element: <Privacy /> },
  { pattern: "/about", element: <About /> },
  { pattern: "/auth/yandex", element: <YandexCallback /> },
  { pattern: "/admin", element: <Admin /> },
  // Перехватывающий маршрут обязан быть последним.
  { pattern: "/*", element: <NotFound /> },
];

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SyncProvider>
          <RouterProvider>
            <div className="flex min-h-dvh flex-col">
              <Header />
              <div className="flex-1">
                <PageTransition>
                  <Suspense fallback={<PageLoader />}>
                    <Routes routes={ROUTES} />
                  </Suspense>
                </PageTransition>
              </div>
              <Footer />
            <AppPrompt />
            </div>
          </RouterProvider>
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * Переход между страницами.
 *
 * Ключ по пути заставляет AnimatePresence считать содержимое новым и проиграть
 * уход старой страницы. Смещение намеренно небольшое: на переходах, которые
 * происходят по десять раз за сессию, размашистая анимация быстро надоедает и
 * начинает восприниматься как задержка.
 */
function PageTransition({ children }: { children: ReactNode }) {
  const { path } = useRouter();
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <>{children}</>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={path.split("?")[0]}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-[var(--text-muted)]">
      <Spinner className="size-6" />
    </div>
  );
}

function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
      <img
        src="/img/citavuk_rule.webp"
        srcSet="/img/citavuk_rule.webp 1x, /img/citavuk_rule@2x.webp 2x"
        alt=""
        width={180}
        className="mb-6 w-40"
      />
      <h1 className="text-3xl">Такой страницы нет</h1>
      <p className="mt-3 text-[var(--text-muted)]">
        Возможно, ссылка устарела или в адресе опечатка.
      </p>
      <Link
        to="/"
        className="mt-7 rounded-2xl bg-[var(--accent)] px-6 py-3 font-semibold text-parchment transition-colors hover:bg-[var(--accent-hover)]"
      >
        На главную
      </Link>
    </main>
  );
}

