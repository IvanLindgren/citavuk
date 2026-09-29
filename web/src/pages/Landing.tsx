import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { lazy, useEffect, useRef, useState } from 'react';
import { LuArrowRight, LuCaptions, LuFileAudio, LuUpload } from 'react-icons/lu';

import { VUKOTOK_PATH } from '../components/Header';
import { Mascot } from '../components/Mascot';
import { Ornament } from '../components/Ornament';
import { DeferredSection } from '../components/DeferredSection';
import { ButtonLink, Card, Reveal } from '../components/ui';
import { Link } from '../lib/router';
import { useAuth } from '../state/auth';
import { getSupporters, type Supporter } from '../api/donations';
import { useSeo } from '../lib/seo';

const DocumentImportBox = lazy(() => import('../components/DocumentImportBox').then(m => ({ default: m.DocumentImportBox })));
const WordReader = lazy(() => import('../components/WordReader').then(m => ({ default: m.WordReader })));

/** Отрывок для демонстрации. Обычный сербский текст, а не подобранные слова. */
const DEMO_PARAGRAPHS = [
  'Ово је велика кућа са баштом. У њој живи породица која воли књиге.',
  'Kupio je nova kola i vozi ih svaki dan do posla. Put traje pola sata.',
];

export function Landing() {
  useSeo({
    title: 'Читавук — учить сербский язык через чтение: перевод слова в контексте',
    description:
      'Учи сербский язык чтением и на слух: открой книгу, подкаст или свою аудиозапись и нажми любое слово — Читавук покажет перевод в контексте, разберёт форму и объяснит правило.',
  });

  const { account, loading } = useAuth();

  return (
    <main>
      <Hero />
      <DocumentImport />
      <AudioImportPromo />
      <Demo />
      <Features />
      <Sections />
      <SupportersStrip />
      {!loading && !account && <CallToAction />}
    </main>
  );
}

function DocumentImport() {
  return (
    <section id="import" className="scroll-mt-24 px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <DeferredSection fallback={<Card className="p-8"><h2 className="text-2xl">Добавь свою книгу</h2><p className="mt-3">Открой документ или вставь текст в <Link to="/library" className="text-[var(--accent)] underline">своей библиотеке</Link>.</p></Card>}>
            <DocumentImportBox />
          </DeferredSection>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Первый экран — то, чем Читавук является всегда. Новые разделы стоят сразу
 * под ним карточками: раньше они крутились каруселью, и до третьего слайда
 * почти никто не доживал, а заголовок страницы первые девять секунд был скрыт.
 */
function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  // Лёгкий параллакс: маскот отстаёт от прокрутки и текст «уходит» вперёд.
  const mascotY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section
      ref={ref}
      className="paper-grain relative overflow-hidden px-5 pt-16 pb-14 sm:pt-24 sm:pb-20"
    >
      <div className="glow-warm pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <motion.div style={reduceMotion ? undefined : { y: textY, opacity: fade }}>
          <HeroEyebrow label="Сербский через чтение" />

          <h1 className="text-balance text-4xl leading-[1.1] sm:text-5xl lg:text-6xl">
            Читай по-сербски.{' '}
            <span className="text-[var(--accent)]">Слово за словом.</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
            Открой книгу или новость на сербском и нажми любое слово.
            Читавук покажет перевод <em className="not-italic text-[var(--text)]">в этом
            предложении</em>, разберёт форму и объяснит правило.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink to="#import" size="lg">Открыть документ</ButtonLink>
            <ButtonLink to="/library" variant="secondary" size="lg">
              Моя библиотека
            </ButtonLink>
            <ButtonLink to="#demo" variant="ghost" size="lg">
              Посмотреть, как работает
            </ButtonLink>
          </div>
        </motion.div>

        <motion.div
          style={reduceMotion ? undefined : { y: mascotY }}
          className="relative mx-auto w-full max-w-sm lg:max-w-md"
        >
          <Mascot
            pose="citavuk_zdravo"
            alt="Волк Читавук приветственно машет лапой"
            float
            priority
          />
        </motion.div>
      </div>

      <div className="relative mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-2">
        <NewsCard
          to="/roadmap"
          image="/img/citavuk_roadmap.webp"
          title="Дорожная карта сербского"
          text="Слова, темы, тексты и задания по уровням от A1 до C1: чтение, грамматика, лексика и письмо. Прогресс считается сам."
          action="Открыть карту"
        />
        <NewsCard
          to={VUKOTOK_PATH}
          image="/img/citavuk_vukotok.webp"
          title="Вукоток — лента на сербском"
          text="Короткие статьи одна за другой. Лента запоминает, что ты дочитываешь, и подбирает похожее."
          action="Листать ленту"
        />
      </div>

      <div className="relative mx-auto mt-12 max-w-3xl text-[var(--accent)] opacity-70">
        <Ornament />
      </div>
    </section>
  );
}

function NewsCard({
  to,
  image,
  title,
  text,
  action,
}: {
  to: string;
  image: string;
  title: string;
  text: string;
  action: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)]/80 p-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)] sm:p-5"
    >
      <img src={image} srcSet={`${image} 1x, ${image.replace(".webp", "@2x.webp")} 2x`} alt="" width={96} height={96} loading="lazy" className="size-20 shrink-0 object-contain sm:size-24" />
      <span className="min-w-0">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">Новое</span>
        <span className="mt-1 block font-display text-xl font-bold leading-snug">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-[var(--text-muted)]">{text}</span>
        <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] group-hover:underline">
          {action}
          <LuArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

function AudioImportPromo() {
  return (
    <section className="px-5 pb-10 sm:pb-14">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <Card className="flex flex-col gap-5 border-[var(--accent)]/25 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent)_8%,var(--bg-raised)),var(--bg-raised))] p-6 sm:flex-row sm:items-center sm:p-8">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-parchment shadow-[0_4px_0_0_color-mix(in_srgb,var(--accent)_60%,black)]">
              <LuFileAudio className="size-7" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-bold uppercase tracking-[.1em] text-[var(--accent)]">Не только книги</p>
              <h2 className="text-2xl">Загружай свои аудиозаписи</h2>
              <p className="mt-2 leading-relaxed text-[var(--text-muted)]">
                MP3, M4A, WAV и другие форматы: Читавук найдёт сербскую речь, разделит говорящих и сделает расшифровку с таймкодами. Нажми на слово — запись перемотается к нему.
              </p>
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1.5"><LuCaptions className="text-[var(--accent)]" aria-hidden="true" />Слова синхронизированы со звуком</span>
                <span className="inline-flex items-center gap-1.5"><LuFileAudio className="text-[var(--accent)]" aria-hidden="true" />Файлы остаются на вашем устройстве</span>
              </p>
            </div>
            <Link to="/audio-files" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 font-semibold text-parchment shadow-[0_4px_0_0_color-mix(in_srgb,var(--accent)_60%,black)] transition-[background-color,transform,box-shadow] duration-150 hover:bg-[var(--accent-hover)] active:translate-y-[3px] active:shadow-[0_1px_0_0_color-mix(in_srgb,var(--accent)_60%,black)]">
              <LuUpload className="size-4" aria-hidden="true" />Добавить аудио
            </Link>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

function HeroEyebrow({ label }: { label: string }) {
  return (
    <p className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg-raised)] px-3.5 py-1.5 text-sm font-medium text-[var(--text)] shadow-sm">
      <Ornament
        count={2}
        animated={false}
        className="h-3 w-8 shrink-0 text-[var(--text-muted)]"
      />
      <span>{label}</span>
      <Ornament
        count={2}
        animated={false}
        className="h-3 w-8 shrink-0 text-[var(--text-muted)]"
      />
    </p>
  );
}

function Demo() {
  return (
    <section id="demo" className="scroll-mt-20 px-5 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <Reveal className="mb-8 text-center">
          <h2 className="text-3xl sm:text-4xl">Нажми на любое слово</h2>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="paper-grain p-6 sm:p-10">
            <DeferredSection fallback={<div>{DEMO_PARAGRAPHS.map(text => <p className="mb-4 text-lg" key={text}>{text}</p>)}</div>}>
              <WordReader paragraphs={DEMO_PARAGRAPHS} />
            </DeferredSection>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    title: 'Перевод в контексте',
    text: 'Слово переводится внутри своей фразы, поэтому многозначные слова получают верное значение, а не первое из словаря.',
    icon: (
      <path d="M4 5h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z" />
    ),
  },
  {
    title: 'Разбор формы',
    text: 'Падеж, число, род и время с объяснением по-русски. Видно, где форма словарная, а где построена по правилу.',
    icon: <path d="M12 2l9 5v10l-9 5-9-5V7zm0 2.3L5 8v8l7 3.9 7-3.9V8z" />,
  },
  {
    title: 'Работает без сети',
    text: 'Встроенный словарь на 9 тысяч слов покрывает три четверти обычного текста. В самолёте и в метро тоже.',
    icon: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 2a7 7 0 016.9 5.8l-2.2.6A5 5 0 007 12H5a7 7 0 017-7z" />,
  },
  {
    title: 'Карточки повторения',
    text: 'Сохранённые слова становятся карточками с интервальным повторением. Прогресс синхронизируется между устройствами.',
    icon: <path d="M4 4h11l5 5v11H4zm2 2v12h12v-8h-5V6z" />,
  },
  {
    title: 'Свои аудиозаписи',
    text: 'Загружай запись на сербском: Читавук проверит речь, разделит говорящих и свяжет слова расшифровки с точным местом в дорожке.',
    icon: <path d="M7 4h8l4 4v12H7a3 3 0 01-3-3V7a3 3 0 013-3zm7 2H7a1 1 0 00-1 1v10a1 1 0 001 1h10V9h-3V6zm-1 7a3 3 0 016 0v3h-2v-3a1 1 0 00-2 0v3h-2v-3z" />,
  },
];

function Features() {
  return (
    <section className="bg-[var(--bg-sunken)] px-5 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-12 text-center">
          <h2 className="text-3xl sm:text-4xl">Что умеет Читавук</h2>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 0.08}>
              <Card className="group h-full p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
                  <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden="true">
                    {feature.icon}
                  </svg>
                </div>
                <h3 className="mb-2 text-xl">{feature.title}</h3>
                <p className="leading-relaxed text-[var(--text-muted)]">{feature.text}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const SECTIONS = [
  {
    to: '/books',
    pose: 'citavuk_zdravo',
    title: 'Чтение',
    text: 'Где законно взять тексты на сербском: книги в общественном достоянии, газеты, открытые библиотеки. Любую ссылку можно сразу открыть в читалке.',
    alt: 'Волк Читавук с книгой',
  },
  {
    to: '/listening',
    pose: 'sluhao_slusa',
    title: 'Слушание',
    text: 'Подкасты, аудиокниги и свои записи с расшифровкой. Слова подсвечиваются по мере звучания, а сложные на слух разбираются отдельно.',
    alt: 'Орёл Слухао слушает',
  },
  {
    to: '/course',
    pose: 'citavuk_gram',
    title: 'Курс грамматики',
    text: 'Уровни от письменности до падежей и времён. Сначала коротко правило, потом упражнения.',
    alt: 'Волк Читавук объясняет грамматику',
  },
  {
    to: '/cards',
    pose: 'citavuk_povtor',
    title: 'Повторение',
    text: 'Слова из книг и уроков превращаются в карточки. Читавук напоминает о них ровно тогда, когда они начинают забываться.',
    alt: 'Волк Читавук повторяет слова',
  },
] as const;

function Sections() {
  return (
    <section className="px-5 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-12 text-center">
          <h2 className="text-3xl sm:text-4xl">Четыре способа заниматься</h2>
        </Reveal>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((section, index) => (
            <Reveal key={section.to} delay={index * 0.1}>
              <Link to={section.to} className="block h-full">
                {/*
                  Карточка — колонка, «Открыть» прижато книзу (`mt-auto`).
                  Тексты у разделов разной длины, и без этого ссылка вставала у
                  каждой карточки на своей высоте: ряд читался как сбитая вёрстка.
                */}
                <Card className="group flex h-full flex-col p-6 text-center transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]">
                  <div className="mx-auto mb-5 w-40 transition-transform duration-500 group-hover:scale-105">
                    <Mascot pose={section.pose} alt={section.alt} width={320} />
                  </div>
                  <h3 className="mb-2 text-2xl">{section.title}</h3>
                  <p className="leading-relaxed text-[var(--text-muted)]">{section.text}</p>
                  {/*
                    Кнопка, а не ссылка со стрелкой: во всех остальных местах
                    сайта действие выглядит именно так, и текстовая строчка
                    внизу карточки читалась как подпись, а не как «нажми сюда».
                    Настоящий <button> здесь нельзя — карточка целиком лежит
                    внутри <a>, и кнопка внутри ссылки невалидна.
                  */}
                  <span className="mt-auto pt-5">
                    <span className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-6 py-3 font-semibold text-parchment shadow-[0_4px_0_0_color-mix(in_srgb,var(--accent)_60%,black)] transition-colors duration-150 group-hover:bg-[var(--accent-hover)]">
                      Открыть
                      <svg
                        viewBox="0 0 20 20"
                        className="size-4 fill-current transition-transform duration-300 group-hover:translate-x-1"
                        aria-hidden="true"
                      >
                        <path d="M11 4l6 6-6 6-1.4-1.4 3.6-3.6H3v-2h10.2L9.6 5.4z" />
                      </svg>
                    </span>
                  </span>
                </Card>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Имена поддержавших на главной: их видит каждый, кто сюда заходит. */
function SupportersStrip() {
  const [supporters, setSupporters] = useState<Supporter[]>([]);

  useEffect(() => {
    let cancelled = false;
    getSupporters()
      .then((list) => !cancelled && setSupporters(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (supporters.length === 0) return null;

  return (
    <section className="px-5 pb-16">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal>
          <p className="text-sm font-bold uppercase text-[var(--accent)]">Хвала!</p>
          <h2 className="mt-1 text-2xl sm:text-3xl">Читавук бесплатный благодаря им</h2>
          <ul className="mt-6 flex flex-wrap justify-center gap-2">
            {supporters.slice(0, 10).map((supporter) => (
              <li
                key={supporter.name + supporter.since}
                className="rounded-full border border-gold/50 bg-[var(--bg-raised)] px-4 py-1.5 font-semibold"
              >
                {supporter.name}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm">
            <Link to="/supporters" className="font-semibold text-[var(--accent)] underline underline-offset-2">
              Все друзья Читавука
            </Link>
            <span className="mx-2 text-[var(--text-muted)]">·</span>
            <Link to="/support" className="font-semibold text-[var(--accent)] underline underline-offset-2">
              Поддержать
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section className="px-5 pb-24">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <Card className="paper-grain relative overflow-hidden px-6 py-14 text-center sm:px-12">
            <div className="glow-warm pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="relative">
              <div className="mx-auto mb-6 w-28">
                <Mascot pose="citavuk_ukaz" alt="Волк Читавук указывает вперёд" width={224} />
              </div>
              <h2 className="text-3xl sm:text-4xl">Заведи аккаунт</h2>
              <p className="mx-auto mt-4 max-w-lg leading-relaxed text-[var(--text-muted)]">
                Книги, сохранённые слова и карточки повторения будут одинаковыми
                на телефоне, компьютере и в браузере.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <ButtonLink to="/login?mode=register" size="lg">Создать аккаунт</ButtonLink>
                <ButtonLink to="/login" variant="secondary" size="lg">
                  Войти
                </ButtonLink>
              </div>
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
