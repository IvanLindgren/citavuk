import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { VUKOTOK_PATH } from '../components/Header';
import { Mascot } from '../components/Mascot';
import { Ornament } from '../components/Ornament';
import { DocumentImportBox } from '../components/DocumentImportBox';
import { Button, Card, Reveal } from '../components/ui';
import { WordReader } from '../components/WordReader';
import { Link } from '../lib/router';
import { useAuth } from '../state/auth';
import { useSeo } from '../lib/seo';

/** Отрывок для демонстрации. Обычный сербский текст, а не подобранные слова. */
const DEMO_PARAGRAPHS = [
  'Ово је велика кућа са баштом. У њој живи породица која воли књиге.',
  'Kupio je nova kola i vozi ih svaki dan do posla. Put traje pola sata.',
];

export function Landing() {
  useSeo({
    title: 'Читавук — учить сербский язык через чтение: перевод слова в контексте',
    description:
      'Учите сербский язык чтением: откройте книгу или новость на сербском и нажмите любое слово — Читавук покажет перевод в этом предложении, разберёт падеж и время, объяснит правило. Бесплатно: сербские тексты, курс грамматики, карточки повторения и лента Вукоток.',
  });

  const { account, loading } = useAuth();

  return (
    <main>
      <Hero />
      <DocumentImport />
      <Demo />
      <Features />
      <Sections />
      {!loading && !account && <CallToAction />}
    </main>
  );
}

function DocumentImport() {
  return (
    <section id="import" className="scroll-mt-24 px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <DocumentImportBox />
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Слайды первого экрана.
 *
 * Первый — то, чем Читавук является всегда. Остальные — новости: раздел,
 * который иначе заметят только те, кто дочитал главную до конца. Слайд, а не
 * ещё один блок ниже, именно поэтому: новость должна попасть на первый экран,
 * не отняв его у главного.
 */
const HERO_SLIDES = ['roadmap', 'reading', 'vukotok'] as const;

/** Как называется слайд для тех, кто листает с клавиатуры или скринридером. */
const SLIDE_LABELS: Record<(typeof HERO_SLIDES)[number], string> = {
  roadmap: 'Новость про дорожную карту',
  reading: 'Читавук',
  vukotok: 'Новость про Вукоток',
};

/** Сколько новость держится на экране, прежде чем сменится. */
const HERO_INTERVAL = 9000;

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const [slide, setSlide] = useState(0);
  // Взявшись за точки, человек листает сам. Возвращать автолистание после
  // этого значило бы уводить страницу из-под того, кто её только что выбрал.
  const [manual, setManual] = useState(false);
  const [paused, setPaused] = useState(false);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  // Лёгкий параллакс: маскот отстаёт от прокрутки и текст «уходит» вперёд.
  const mascotY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  useEffect(() => {
    if (manual || paused || reduceMotion) return;
    const timer = window.setInterval(
      () => setSlide((current) => (current + 1) % HERO_SLIDES.length),
      HERO_INTERVAL,
    );
    return () => window.clearInterval(timer);
  }, [manual, paused, reduceMotion]);

  return (
    <section
      ref={ref}
      className="paper-grain relative overflow-hidden px-5 pt-16 pb-20 sm:pt-24 sm:pb-28"
      aria-roledescription="карусель"
      aria-label="Читавук и новости"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="glow-warm pointer-events-none absolute inset-0" aria-hidden="true" />

      {/*
        Слайды лежат в одной ячейке сетки, а не сменяют друг друга в потоке:
        высота секции остаётся наибольшей из двух, и страница не прыгает под
        курсором в момент смены.
      */}
      <div className="relative mx-auto grid max-w-6xl">
        {HERO_SLIDES.map((id, index) => {
          const active = index === slide;
          return (
            <motion.div
              key={id}
              className="grid items-center gap-10 [grid-area:1/1] lg:grid-cols-[1.1fr_0.9fr] lg:gap-16"
              animate={active
                ? { opacity: 1, visibility: 'visible' }
                : { opacity: 0, transitionEnd: { visibility: 'hidden' } }}
              transition={{ duration: reduceMotion ? 0 : 0.5 }}
              aria-hidden={!active}
            >
              <motion.div style={reduceMotion ? undefined : { y: textY, opacity: fade }}>
                {id === 'roadmap' ? <RoadmapSlide /> : id === 'reading' ? <ReadingSlide /> : <VukotokSlide />}
              </motion.div>

              <motion.div
                style={reduceMotion ? undefined : { y: mascotY }}
                className="relative mx-auto w-full max-w-sm lg:max-w-md"
              >
                {id === 'roadmap' ? (
                  <Mascot
                    pose="citavuk_roadmap"
                    alt="Волк Читавук с картой сербского языка"
                    float
                    priority
                  />
                ) : id === 'reading' ? (
                  <Mascot
                    pose="citavuk_zdravo"
                    alt="Волк Читавук приветственно машет лапой"
                    float
                  />
                ) : (
                  <Mascot
                    pose="citavuk_vukotok"
                    alt="Волк Читавук читает ленту с телефона"
                    float
                  />
                )}
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      <div className="relative mx-auto mt-10 flex max-w-6xl justify-center gap-2 lg:justify-start">
        {HERO_SLIDES.map((id, index) => (
          <button
            key={id}
            type="button"
            onClick={() => { setSlide(index); setManual(true); }}
            aria-label={SLIDE_LABELS[id]}
            aria-current={index === slide ? 'true' : undefined}
            className={[
              'h-2 rounded-full transition-all duration-300',
              index === slide
                ? 'w-8 bg-[var(--accent)]'
                : 'w-2 bg-[var(--line)] hover:bg-[var(--text-muted)]',
            ].join(' ')}
          />
        ))}
      </div>

      <div className="relative mx-auto mt-10 max-w-3xl text-[var(--accent)] opacity-70">
        <Ornament />
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

function ReadingSlide() {
  return (
    <>
      <HeroEyebrow label="Сербский через чтение" />

      <h1 className="text-balance text-4xl leading-[1.1] sm:text-5xl lg:text-6xl">
        Читайте по-сербски.{' '}
        <span className="text-[var(--accent)]">Слово за словом.</span>
      </h1>

      <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
        Откройте книгу или новость на сербском и нажмите любое слово.
        Читавук покажет перевод <em className="not-italic text-[var(--text)]">в этом
        предложении</em>, разберёт форму и объяснит правило.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a href="#import">
          <Button size="lg">Открыть документ</Button>
        </a>
        <Link to="/library">
          <Button variant="secondary" size="lg">
            Моя библиотека
          </Button>
        </Link>
        <a href="#demo">
          <Button variant="ghost" size="lg">
            Посмотреть, как работает
          </Button>
        </a>
      </div>
    </>
  );
}

function RoadmapSlide() {
  return (
    <>
      <HeroEyebrow label="Новое в Читавуке" />

      <h2 className="text-balance text-4xl leading-[1.1] sm:text-5xl lg:text-6xl">
        <span className="text-[var(--accent)]">Дорожная карта</span> сербского
        языка.
      </h2>

      <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
        Что делать после пары грамматических упражнений и быстрых онлайн-курсов?
        Слова, темы, тексты и задания разложены по уровням CEFR и по четырём
        категориям: Reading, Grammar, Vocabulary, Writing.
      </p>

      <p className="mt-3 text-sm text-[var(--text-muted)]">
        Прогресс считается сам, а обсудить карту можно прямо на странице.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link to="/roadmap">
          <Button size="lg">Открыть карту</Button>
        </Link>
        <Link to="/cards">
          <Button variant="ghost" size="lg">
            Мой словарь
          </Button>
        </Link>
      </div>
    </>
  );
}

function VukotokSlide() {
  return (
    <>
      <HeroEyebrow label="Новое в Читавуке" />

      <h2 className="text-balance text-4xl leading-[1.1] sm:text-5xl lg:text-6xl">
        <span className="text-[var(--accent)]">Вукоток</span> — лента,
        которую хочется листать.
      </h2>

      <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
        Читайте небольшие статьи на сербском, как будто вы в тиктоке, но вместо
        видео — текст. Лента подстраивается под то, что вы дочитываете
        до конца.
      </p>

      <p className="mt-3 text-sm text-[var(--text-muted)]">Проект экспериментальный.</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link to={VUKOTOK_PATH}>
          <Button size="lg">Открыть Вукоток</Button>
        </Link>
        <Link to="/books">
          <Button variant="ghost" size="lg">
            Что ещё читать
          </Button>
        </Link>
      </div>
    </>
  );
}

function Demo() {
  return (
    <section id="demo" className="scroll-mt-20 px-5 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <Reveal className="mb-8 text-center">
          <h2 className="text-3xl sm:text-4xl">Нажмите на любое слово</h2>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="paper-grain p-6 sm:p-10">
            <WordReader paragraphs={DEMO_PARAGRAPHS} />
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
    to: VUKOTOK_PATH,
    pose: 'citavuk_vukotok',
    title: 'Вукоток',
    text: 'Небольшие статьи на сербском лентой: листаете, читаете то, что зацепило, а лента подстраивается под вас. Проект экспериментальный.',
    alt: 'Волк Читавук читает ленту с телефона',
  },
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
    text: 'Подкасты и уроки с транскриптом. Слова подсвечиваются по мере звучания, а сложные на слух разбираются отдельно.',
    alt: 'Орёл Слухао слушает',
  },
  {
    to: '/course',
    pose: 'citavuk_gram',
    title: 'Курс грамматики',
    text: 'Уровни от письменности до падежей и времён. Сначала коротко правило, потом упражнения.',
    alt: 'Волк Читавук объясняет грамматику',
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
              <h2 className="text-3xl sm:text-4xl">Заведите аккаунт</h2>
              <p className="mx-auto mt-4 max-w-lg leading-relaxed text-[var(--text-muted)]">
                Книги, сохранённые слова и карточки повторения будут одинаковыми
                на телефоне, компьютере и в браузере.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/login?mode=register">
                  <Button size="lg">Создать аккаунт</Button>
                </Link>
                <Link to="/login">
                  <Button variant="secondary" size="lg">
                    Войти
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
