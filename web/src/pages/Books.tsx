import type { ReactNode } from 'react';

import { DocumentImportBox } from '../components/DocumentImportBox';
import { Mascot } from '../components/Mascot';
import { Card, Reveal } from '../components/ui';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';

/**
 * Где брать сербские тексты.
 *
 * Раздел отвечает на вопрос, с которым человек приходит раньше, чем с вопросом
 * «каким приложением читать»: собственно, что читать. Своей библиотеки у нас
 * нет и быть не должно, раздавать чужие книги мы права не имеем. Поэтому
 * страница указывает на источники, которые раздают их законно: общественное
 * достояние, открытые библиотеки и сайты самих газет.
 *
 * Каждая ссылка проверена запросом при подготовке страницы. Битая ссылка на
 * книгу тратит время ровно тогда, когда человек собрался читать.
 */

/** Насколько трудно читать источник новичку. */
type Level = 'start' | 'middle' | 'high';

const LEVEL_LABELS: Record<Level, string> = {
  start: 'с самого начала',
  middle: 'после первых месяцев',
  high: 'когда язык уже идёт',
};

const LEVEL_STYLES: Record<Level, string> = {
  start: 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400',
  middle: 'bg-gold/25 text-[var(--text-muted)]',
  high: 'bg-[var(--accent)]/12 text-[var(--accent)]',
};

/**
 * Значки сайтов лежат у нас, а не подтягиваются с самих сайтов.
 *
 * Показать `https://politika.rs/favicon.ico` прямо в теге img проще всего, но
 * тогда при каждом открытии страницы браузер посетителя стучится на десяток
 * чужих серверов: это и задержка, и передача им сведений о том, кто к нам
 * зашёл, и битая картинка в тот день, когда чужой сайт переедет. Значки
 * забраны один раз скриптом `scripts/fetch-source-icons.py`.
 */
function iconPath(host: string): string {
  return `/img/sources/${host}.png`;
}

interface Source {
  title: string;
  host: string;
  url: string;
  text: string;
  level: Level;
  /** Каким письмом набран сайт: для новичка это первое, обо что спотыкаешься. */
  script?: string;
}

interface Section {
  id: string;
  title: string;
  lead: string;
  sources: Source[];
}

const SECTIONS: Section[] = [
  {
    id: 'novosti',
    title: 'Новости: с них проще всего начать',
    lead: 'Заметка на пятьсот слов о том, что сегодня происходит в Белграде, читается легче романа. Язык современный, тема знакома по русским новостям, и даже если половина слов непонятна, о чём речь, вы уже догадываетесь. Скопируйте адрес статьи и вставьте в поле выше: Читавук достанет текст без рекламы и меню.',
    sources: [
      {
        title: 'Политика',
        host: 'politika.rs',
        url: 'https://www.politika.rs/',
        level: 'middle',
        script: 'кириллица',
        text: 'Старейшая газета на Балканах, выходит с 1904 года. Язык выдержанный, книжный, поэтому она хорошо готовит к чтению настоящей прозы. Новичку будет тяжеловато, а через пару месяцев в самый раз.',
      },
      {
        title: 'РТС',
        host: 'rts.rs',
        url: 'https://www.rts.rs/',
        level: 'start',
        script: 'кириллица',
        text: 'Общественное телевидение Сербии. Новостные заметки короткие и написаны просто, а у многих рядом лежит видео: сначала прочитали, потом послушали то же самое. Для первых недель это лучший вариант на кириллице.',
      },
      {
        title: 'N1',
        host: 'n1info.rs',
        url: 'https://n1info.rs/',
        level: 'start',
        script: 'латиница',
        text: 'Региональный новостной канал. Заметки в три абзаца, лексика самая обиходная. Если латиница даётся легче кириллицы, начинайте отсюда.',
      },
      {
        title: 'Блиц',
        host: 'blic.rs',
        url: 'https://www.blic.rs/',
        level: 'start',
        script: 'латиница',
        text: 'Массовая газета. Пишет бытовым языком, которого нет ни в одном учебнике: как торгуются на рынке, как жалуются на соседей, как рассказывают про отпуск.',
      },
      {
        title: 'Данас',
        host: 'danas.rs',
        url: 'https://www.danas.rs/',
        level: 'middle',
        script: 'латиница',
        text: 'Ежедневная газета с большими интервью и авторскими колонками. Фразы длиннее, чем в новостной ленте, зато видно, как в сербском строится рассуждение, а не только сообщение.',
      },
      {
        title: 'Време',
        host: 'vreme.com',
        url: 'https://www.vreme.com/',
        level: 'high',
        text: 'Еженедельник с длинными разборами. Читать трудно, словарь богатый, предложения ветвистые. Хорошая проверка того, что язык действительно пошёл.',
      },
    ],
  },
  {
    id: 'klasika',
    title: 'Книги, которые можно читать законно',
    lead: 'У этих произведений срок авторских прав истёк, поэтому они выложены целиком и бесплатно. Здесь сербская классика и народные сказки, записанные Вуком Караджичем, тем самым, чья реформа сделала сербское письмо таким, каким мы его знаем.',
    sources: [
      {
        title: 'Викизворник',
        host: 'sr.wikisource.org',
        url: 'https://sr.wikisource.org/',
        level: 'middle',
        text: 'Сербский раздел Викитеки. Классика, народные песни, сказки, старые переводы. Текст открывается обычной страницей, так что его легко скопировать целиком и открыть в читалке. Со сказок начинать проще всего: они короткие и написаны разговорно.',
      },
      {
        title: 'Пројекат Растко',
        host: 'rastko.rs',
        url: 'https://www.rastko.rs/',
        level: 'high',
        text: 'Большая электронная библиотека сербской культуры: литература, история, этнография. Отдельный раздел отведён устному творчеству. Тексты по большей части старые, язык местами архаичный, поэтому браться за них стоит не сразу.',
      },
      {
        title: 'Дигитална Народна библиотека Србије',
        host: 'digitalna.nb.rs',
        url: 'https://digitalna.nb.rs/',
        level: 'high',
        text: 'Оцифрованные фонды Национальной библиотеки: старые издания, рукописи, подшивки газет. Многое лежит постранично в виде PDF, часть страниц отсканирована без текстового слоя, и тогда Читавук распознаёт их сам.',
      },
      {
        title: 'Project Gutenberg',
        host: 'gutenberg.org',
        url: 'https://www.gutenberg.org/browse/languages/sr',
        level: 'middle',
        text: 'Сербский раздел международного проекта. Книг немного, зато они выложены чистым текстом без вёрстки и картинок, и это самый удобный вид для импорта.',
      },
    ],
  },
  {
    id: 'spravochnoe',
    title: 'Справочное чтение о том, что вы уже знаете',
    lead: 'Статья о знакомом предмете входит мягче всего: содержание вы знаете заранее, и остаётся один только язык. Возьмите на сербском то, что уже читали по-русски, хоть про свой родной город.',
    sources: [
      {
        title: 'Википедија на српском',
        host: 'sr.wikipedia.org',
        url: 'https://sr.wikipedia.org/',
        level: 'start',
        script: 'обе азбуки',
        text: 'Больше семисот тысяч статей, и письмо переключается прямо в шапке сайта. Если пока привыкли только к латинице, поставьте её и читайте, а к кириллице вернётесь позже.',
      },
      {
        title: 'Викикњиге',
        host: 'sr.wikibooks.org',
        url: 'https://sr.wikibooks.org/',
        level: 'start',
        text: 'Открытые учебники и пособия на сербском. Тексты короткие, размеченные заголовками и списками, а значит их удобно читать по частям.',
      },
      {
        title: 'Радио Слободна Европа',
        host: 'slobodnaevropa.org',
        url: 'https://www.slobodnaevropa.org/',
        level: 'middle',
        text: 'Одну и ту же новость здесь публикуют сразу на нескольких балканских языках. Удобно сравнивать, чем сербская формулировка отличается от хорватской или боснийской.',
      },
    ],
  },
];

export function Books() {
  useSeo({
    title: 'Что читать на сербском: книги, новости и тексты бесплатно',
    description:
      'Где законно взять тексты на сербском языке: книги в общественном достоянии, сербские газеты, Викизворник и Пројекат Растко. С подсказкой, какой источник брать на каком уровне. Любую ссылку можно открыть в читалке Читавука с переводом каждого слова в контексте.',
  });

  return (
    <main className="px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <Reveal className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <h1 className="text-3xl sm:text-4xl">Что читать на сербском</h1>
              <p className="mt-4 text-lg leading-relaxed text-[var(--text-muted)]">
                Быстрее всего язык осваивается на текстах, которые и без того
                интересно читать. Загвоздка обычно не в желании, а в том, что
                непонятно, откуда их брать: учебник кончается на третьем месяце,
                а настоящая книга кажется неподъёмной.
              </p>
              <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
                Ниже собраны источники, которые раздают сербские тексты законно и
                бесплатно. У каждого стоит пометка, на каком уровне за него
                браться, чтобы не начинать с самого трудного и не бросить на
                второй странице. Все ссылки проверены.
              </p>
            </div>
            <div className="hidden w-32 shrink-0 sm:block">
              <Mascot pose="citavuk_zdravo" alt="" width={256} float />
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.05} className="mb-4">
          <DocumentImportBox />
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mb-12 text-sm leading-relaxed text-[var(--text-muted)]">
            Вставьте сюда ссылку на статью или перетащите файл: PDF, DOCX, FB2, EPUB, DjVu, TXT.
            Текст откроется в читалке, где по нажатию на любое слово видно
            перевод <em className="not-italic text-[var(--text)]">в этом
            предложении</em>, разбор формы и объяснение по-русски. Незнакомые
            слова сохраняются в{' '}
            <Link
              to="/cards"
              className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              карточки повторения
            </Link>
            .
          </p>
        </Reveal>

        {SECTIONS.map((section, index) => (
          <section key={section.id} id={section.id} className="mb-14 scroll-mt-24">
            <Reveal delay={index * 0.04}>
              <h2 className="text-2xl sm:text-3xl">{section.title}</h2>
              <p className="mt-3 max-w-3xl leading-relaxed text-[var(--text-muted)]">
                {section.lead}
              </p>
            </Reveal>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {section.sources.map((source) => (
                <Reveal key={source.url}>
                  <SourceCard source={source} />
                </Reveal>
              ))}
            </div>
          </section>
        ))}

        <Reveal>
          <Card className="paper-grain p-6 sm:p-8">
            <h2 className="text-2xl">С какого уровня можно начинать</h2>
            <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
              Раньше, чем принято думать. Читать, заглядывая за каждым вторым
              словом, это нормальный способ осваивать язык, а не признак того,
              что вы взялись за непосильное. Сербский к тому же близок русскому:
              многие корни узнаются сразу, и настоящую трудность создают не
              слова, а окончания. Падежей семь, глагольных времён больше, чем в
              русском, и часть из них не имеет прямой пары.
            </p>
            <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
              Поэтому Читавук показывает не только перевод, но и разбор формы:
              какой падеж, какое число, от какого слова образовано. Через
              несколько десятков страниц формы начинают узнаваться без подсказки,
              и это тот самый момент, ради которого всё затевалось.
            </p>

            <h3 className="mt-8 text-lg">Как выбрать источник по силам</h3>
            <dl className="mt-4 space-y-4">
              <LevelRow level="start" title="Первые недели">
                Берите то, что помечено «с самого начала»: короткие новости РТС и
                N1, статьи Википедии о знакомых вещах. Абзац в три предложения
                можно разобрать целиком, и от этого не опускаются руки. Ставьте
                себе не «прочитать статью», а «прочитать один абзац».
              </LevelRow>
              <LevelRow level="middle" title="После первых месяцев">
                Когда абзац читается без остановки на каждом слове, переходите к
                «Политике», «Данасу» и сказкам с Викизворника. Здесь появляются
                длинные предложения с придаточными, и как раз на них падежи
                перестают быть таблицей из учебника.
              </LevelRow>
              <LevelRow level="high" title="Когда язык уже идёт">
                «Време», Пројекат Растко, оцифрованные книги. Тексты с
                авторским стилем, устаревшими оборотами и длинными периодами. На
                этом уровне словарь пополняется уже не бытовыми словами, а
                оттенками.
              </LevelRow>
            </dl>

            <p className="mt-6 leading-relaxed text-[var(--text-muted)]">
              Если готовитесь поступать в сербскую школу или университет,
              возьмите{' '}
              <Link
                to="/materials"
                className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
              >
                материалы для поступления
              </Link>
              : настоящие экзаменационные тесты и пособия с сайтов сербских
              учреждений. А правила по порядку разобраны в{' '}
              <Link
                to="/course"
                className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
              >
                курсе грамматики
              </Link>
              .
            </p>
          </Card>
        </Reveal>

        <Reveal>
          <p className="mt-8 text-xs leading-relaxed text-[var(--text-muted)]">
            Читавук не хранит и не раздаёт чужие книги. Все ссылки ведут на сайты
            правообладателей и открытых библиотек, а текст загружается к вам
            только по вашему нажатию.
          </p>
        </Reveal>
      </div>
    </main>
  );
}

function SourceCard({ source }: { source: Source }) {
  return (
    <Card className="flex h-full flex-col p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-start gap-3">
        {/* Подложка белая в обеих темах: значки сайтов нарисованы в расчёте на
            светлый фон, и половина из них на тёмном просто исчезает. */}
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
          <img
            src={iconPath(source.host)}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            className="size-7 object-contain"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-snug">{source.title}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${LEVEL_STYLES[source.level]}`}
            >
              {LEVEL_LABELS[source.level]}
            </span>
            {source.script && (
              <span className="rounded-full bg-[var(--bg-sunken)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
                {source.script}
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
        {source.text}
      </p>

      <a
        href={source.url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
      >
        {source.host}
        <svg
          viewBox="0 0 24 24"
          className="size-3 fill-current opacity-60"
          aria-hidden="true"
        >
          <path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h5v2H6v11h11v-4h2v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
        </svg>
      </a>
    </Card>
  );
}

function LevelRow({
  level,
  title,
  children,
}: {
  level: Level;
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${LEVEL_STYLES[level]}`}
        >
          {LEVEL_LABELS[level]}
        </span>
        <span className="font-semibold">{title}</span>
      </dt>
      <dd className="mt-1.5 leading-relaxed text-[var(--text-muted)]">
        {children}
      </dd>
    </div>
  );
}
