import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { lazy, Suspense, type ReactNode } from "react";

import { AppPrompt } from "./components/AppPrompt";
import { DailyWindow } from "./components/DailyWindow";
import { LevelPrompt } from "./components/LevelPrompt";
import { CommunityAnnouncement } from "./components/CommunityAnnouncement";
import { ServerAnnouncements } from "./components/ServerAnnouncements";
import { EventBanner } from "./components/EventBanner";
import { Footer } from "./components/Footer";
import { Header, isVukotok } from "./components/Header";
import { PageErrorBoundary } from "./components/PageErrorBoundary";
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
import { AnnouncementProvider } from "./state/announcements";
import { SyncProvider } from "./state/sync";
import { ThemeProvider } from "./state/theme";
import { DuelSearchProvider } from "./state/duelSearch";
import { DuelSearchNotice } from "./components/DuelSearchNotice";

// Разделы, до которых пользователь доходит не всегда, грузятся отдельно:
// главная страница не должна тащить с собой код читалки и курса.
const Login = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login })),
);
const Library = lazy(() =>
  import("./pages/Library").then((m) => ({ default: m.Library })),
);
const PublicLibrary = lazy(() =>
  import("./pages/PublicLibrary").then((m) => ({ default: m.PublicLibrary })),
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
const CourseDialogue = lazy(() =>
  import("./pages/CourseDialogue").then((m) => ({ default: m.CourseDialogue })),
);
const Dialogues = lazy(() =>
  import("./pages/Dialogues").then((m) => ({ default: m.Dialogues })),
);
const Trainer = lazy(() =>
  import("./pages/Trainer").then((m) => ({ default: m.Trainer })),
);
const Exams = lazy(() =>
  import("./pages/Exams").then((m) => ({ default: m.Exams })),
);
const TranslationDuel = lazy(() =>
  import("./pages/TranslationDuel").then((m) => ({ default: m.TranslationDuel })),
);
const SharedBook = lazy(() =>
  import("./pages/SharedBook").then((m) => ({ default: m.SharedBook })),
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
const AdminLessons = lazy(() =>
  import("./pages/AdminLessons").then((m) => ({ default: m.AdminLessons })),
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
const Support = lazy(() =>
  import("./pages/Support").then((m) => ({ default: m.Support })),
);
const Privacy = lazy(() =>
  import("./pages/Privacy").then((m) => ({ default: m.Privacy })),
);
const YandexCallback = lazy(() =>
  import("./pages/YandexCallback").then((m) => ({ default: m.YandexCallback })),
);
const Events = lazy(() =>
  import("./pages/Events").then((m) => ({ default: m.Events })),
);
const OdysseyGate = lazy(() =>
  import("./pages/OdysseyGate").then((m) => ({ default: m.OdysseyGate })),
);
const Teachers = lazy(() =>
  import("./pages/Teachers").then((m) => ({ default: m.Teachers })),
);
const LessonEditor = lazy(() =>
  import("./pages/LessonEditor").then((m) => ({ default: m.LessonEditor })),
);
const Roadmap = lazy(() =>
  import("./pages/Roadmap").then((m) => ({ default: m.Roadmap })),
);
const Lessons = lazy(() =>
  import("./pages/Lessons").then((m) => ({ default: m.Lessons })),
);
const LessonView = lazy(() =>
  import("./pages/LessonView").then((m) => ({ default: m.LessonView })),
);
const MicroFeed = lazy(() =>
  import("./pages/MicroFeed").then((m) => ({ default: m.MicroFeed })),
);
const Garden = lazy(() =>
  import("./pages/Garden").then((m) => ({ default: m.Garden })),
);
const PublicGarden = lazy(() =>
  import("./pages/PublicGarden").then((m) => ({ default: m.PublicGarden })),
);
const Travel = lazy(() =>
  import("./pages/Travel").then((m) => ({ default: m.Travel })),
);

const ROUTES: RouteDefinition[] = [
  { pattern: "/", element: <Landing /> },
  { pattern: "/login", element: <Login /> },
  { pattern: "/library", element: <Library /> },
  { pattern: "/public-library", element: <PublicLibrary /> },
  { pattern: "/reader/:id", element: <Reader /> },
  { pattern: "/cards", element: <Cards /> },
  { pattern: "/palace", element: <Palace /> },
  { pattern: "/account", element: <Account /> },
  { pattern: "/listening", element: <Listening /> },
  { pattern: "/listening/:id", element: <ListeningPlayer /> },
  { pattern: "/events", element: <Events /> },
  { pattern: "/events/odyssey", element: <OdysseyGate /> },
  { pattern: "/course", element: <Course /> },
  { pattern: "/roadmap", element: <Roadmap /> },
  { pattern: "/lessons", element: <Lessons /> },
  { pattern: "/lessons/:slug", element: <LessonView /> },
  { pattern: "/vukotok", element: <MicroFeed /> },
  // Прежний адрес раздела: он разослан в чате и стоит в закладках.
  { pattern: "/micro-feed", element: <MicroFeed /> },
  { pattern: "/lesson/link/:token", element: <LessonView unlisted /> },
  { pattern: "/teachers", element: <Teachers /> },
  { pattern: "/teachers/lessons/new", element: <LessonEditor /> },
  { pattern: "/teachers/lessons/:id", element: <LessonEditor /> },
  { pattern: "/course/lesson/:id", element: <CourseLesson /> },
  { pattern: "/dialogues", element: <Dialogues /> },
  { pattern: "/dialogues/:id", element: <CourseDialogue /> },
  // Старые сохранённые ссылки продолжают открываться после переноса раздела.
  { pattern: "/course/dialogue/:id", element: <CourseDialogue /> },
  { pattern: "/trainer", element: <Trainer /> },
  { pattern: "/basta", element: <Garden /> },
  { pattern: "/basta/:nickname", element: <PublicGarden /> },
  { pattern: "/putovanje", element: <Travel /> },
  { pattern: "/exams", element: <Exams /> },
  { pattern: "/trainer/translation-duel", element: <TranslationDuel /> },
  { pattern: "/trainer/translation-duel/:code", element: <TranslationDuel /> },
  { pattern: "/tests/:id", element: <TestRun /> },
  { pattern: "/shared/:token", element: <SharedBook /> },
  { pattern: "/books", element: <Books /> },
  { pattern: "/materials", element: <Materials /> },
  { pattern: "/materials/:subject", element: <Materials /> },
  { pattern: "/downloads", element: <Downloads /> },
  { pattern: "/verify-email", element: <VerifyEmail /> },
  { pattern: "/privacy", element: <Privacy /> },
  { pattern: "/about", element: <About /> },
  { pattern: "/support", element: <Support /> },
  { pattern: "/auth/yandex", element: <YandexCallback /> },
  { pattern: "/admin/lessons", element: <AdminLessons /> },
  { pattern: "/admin", element: <Admin /> },
  // Перехватывающий маршрут обязан быть последним.
  { pattern: "/*", element: <NotFound /> },
];

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AnnouncementProvider>
          <SyncProvider>
            <DuelSearchProvider>
              <RouterProvider>
                <AppFrame />
              </RouterProvider>
            </DuelSearchProvider>
          </SyncProvider>
        </AnnouncementProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppFrame() {
  const { path } = useRouter();
  const vukotok = isVukotok(path);
  const pathname = path.split('?')[0] ?? path;
  const garden = pathname === '/basta' || pathname.startsWith('/basta/');
  // Карта Путешествия занимает экран целиком: шапка и подвал отъедали бы у неё
  // высоту, а под картой всё равно нет ничего, к чему стоило бы прокручивать.
  const travel = pathname === '/putovanje';
  const fullscreen = garden || travel;
  const immersive = vukotok || fullscreen;

  return (
    <div className="flex min-h-dvh flex-col">
      <DuelSearchNotice />
      {!immersive && <EventBanner />}
      {/*
        На телефоне Вукоток занимает экран целиком: полоса навигации над лентой
        оставляла её «страницей сайта с видео», а не тем, чем раздел является.
        Уйти из ленты можно значком волка в её собственной шапке.
      */}
      {!fullscreen && (
        <div className={vukotok ? 'hidden lg:block' : undefined}>
          <Header />
        </div>
      )}
      {!immersive && <ServerAnnouncements />}
      {!immersive && <CommunityAnnouncement />}
      <div className="flex-1">
        <PageErrorBoundary key={path.split("?")[0]}>
          <PageTransition>
            <Suspense fallback={<PageLoader />}>
              <Routes routes={ROUTES} />
            </Suspense>
          </PageTransition>
        </PageErrorBoundary>
      </div>
      {!immersive && <Footer />}
      {!immersive && <AppPrompt />}
      {/*
        Вопрос об уровне встаёт поверх любой страницы и ровно один раз за
        аккаунт. Не в Вукотоке и не в настройках, потому что уровень нужен всем
        разделам сразу: и подбору ленты, и предупреждению о тяжёлой книге.
      */}
      {!fullscreen && <LevelPrompt />}
      {/*
        Слова дня приходят раз в сутки и только к тому, у кого уровень уже
        назван: пока его нет, поверх страницы стоит вопрос об уровне.
      */}
      {!fullscreen && <DailyWindow />}
    </div>
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
