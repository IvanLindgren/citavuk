import { useState } from 'react';

import { Card, Reveal } from '../components/ui';
import { useSeo } from '../lib/seo';

/**
 * О разработчике и об открытом коде.
 *
 * Фото лежит в public/img; если его нет, вместо него показывается маскот —
 * страница не должна разваливаться из-за отсутствующего файла.
 */

const PHOTO = '/img/denis.webp';
const REPO = 'https://github.com/IvanLindgren/citavuk';
const FUND_URL = 'https://yoomoney.ru/fundraise/1JBLJQ46SFR.260730';

const CONTACTS = [
  { label: 'Телеграм', value: '@ivanlindgren', href: 'https://t.me/ivanlindgren' },
  { label: 'ВКонтакте', value: 'vk.com/denkorni', href: 'https://vk.com/denkorni' },
  {
    label: 'Почта',
    value: 'denis.kornilov12@yandex.ru',
    href: 'mailto:denis.kornilov12@yandex.ru',
  },
];

export function About() {
  useSeo({
    title: 'О разработчике — Читавук',
    description:
      'Кто делает Читавук и зачем: независимый разработчик Денис Корнилов о проекте для изучающих сербский язык. Исходный код открыт.',
  });

  return (
    <main className="paper-grain relative min-h-[calc(100dvh-4rem)] px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <p className="text-sm font-bold uppercase text-[var(--accent)]">
            О проекте
          </p>
          <h1 className="mt-2 text-4xl">О разработчике</h1>
        </Reveal>

        <Reveal delay={0.06}>
          <Card className="mt-8 flex flex-col gap-6 p-6 sm:flex-row sm:p-8">
            <Photo />
            <div className="space-y-4 leading-relaxed">
              <p>
                Привет! Я независимый разработчик всего, что могло бы быть
                капельку полезно людям.
              </p>
              <p>
                Сам я человек, которому будет скоро необходимо переехать в
                Сербию. Поэтому я как человек, любящий читать, хотел поискать
                что-то на сербском для изучения языка… и не нашёл никаких
                удобных приложений. Так и появился мой проект — Читавук,
                созданный для всех, кто хочет изучить сербский, но не знает, где
                брать материалы и ресурсы.
              </p>
              <p>
                Я буду стараться выпускать обновления как можно чаще, если в
                этом возникнет необходимость.
              </p>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="mt-5 p-6 sm:p-8">
            <h2 className="text-2xl">Напишите мне</h2>
            <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
              Если вы обнаружили какие-то проблемы или у вас есть идеи по
              развитию сайта — напишите мне:
            </p>
            <ul className="mt-4 space-y-2">
              {CONTACTS.map((contact) => (
                <li key={contact.label} className="flex flex-wrap gap-x-2">
                  <span className="text-[var(--text-muted)]">
                    {contact.label}:
                  </span>
                  <a
                    className="font-semibold underline"
                    href={contact.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {contact.value}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-5 font-display text-lg">
              Сретно научите српски са Читавуком!
            </p>
          </Card>
        </Reveal>

        <Reveal delay={0.12}>
          <Card className="mt-5 border-[var(--accent)]/35 p-6 sm:p-8">
            <h2 className="text-2xl">Читавук остаётся бесплатным</h2>
            <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
              Сервер, API и выпуск приложений требуют регулярных расходов.
              Поддержка пользователей ускорит выход Читавука на iOS и macOS и
              поможет развивать бесплатные функции.
            </p>
            <a
              className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
              href={FUND_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              Поддержать развитие Читавука
            </a>
          </Card>
        </Reveal>

        <Reveal delay={0.14}>
          <Card className="mt-5 p-6 sm:p-8">
            <h2 className="text-2xl">Открытый код</h2>
            <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
              Я выступаю за распространение принципов открытого ПО, поэтому
              исходный код клиентской части приложений, серверной части сайта и
              приложений, утилит для поиска материалов и вычленения текста из
              книг доступен в репозитории Читавука.
            </p>
            <a
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 font-semibold transition-colors hover:bg-[var(--bg-sunken)]"
              href={REPO}
              target="_blank"
              rel="noreferrer"
            >
              <span aria-hidden="true">↗</span>
              github.com/IvanLindgren/citavuk
            </a>
            <p className="mt-4 text-sm text-[var(--text-muted)]">
              Структура репозитория и порядок сборки описаны в README — форк
              собирается без доступа к моим ключам и серверам.
            </p>
          </Card>
        </Reveal>
      </div>
    </main>
  );
}

function Photo() {
  const [failed, setFailed] = useState(false);

  return (
    <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-48">
      <img
        src={failed ? '/img/citavuk_zdravo.webp' : PHOTO}
        srcSet={failed ? undefined : `${PHOTO} 1x, /img/denis@2x.webp 2x`}
        alt="Денис Корнилов, разработчик Читавука"
        width={384}
        height={512}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full rounded-2xl border border-[var(--line)]"
      />
      <p className="mt-2 text-center text-sm text-[var(--text-muted)]">
        Денис Корнилов
      </p>
    </div>
  );
}
