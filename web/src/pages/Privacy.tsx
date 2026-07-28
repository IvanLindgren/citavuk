import { Reveal } from '../components/ui';
import { useSeo } from '../lib/seo';

/**
 * Политика конфиденциальности.
 *
 * Адрес постоянный: он указан в Google Play, в приложении и в письмах, поэтому
 * страница не должна переезжать. Исходный текст лежит в docs/privacy-policy.md —
 * правки вносятся в оба места сразу.
 */

const EFFECTIVE_DATE = '28 июля 2026 года';
const CONTACT = 'deniskornilov12@gmail.com';

export function Privacy() {
  useSeo({
    title: 'Политика конфиденциальности — Читавук',
    description:
      'Какие данные собирает Читавук, зачем они нужны, кому передаются и как удалить аккаунт вместе со всеми данными.',
  });

  return (
    <main className="paper-grain min-h-[calc(100vh-4rem)] px-5 py-10 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <Reveal>
          <p className="text-sm font-bold uppercase text-[var(--accent)]">
            Документы
          </p>
          <h1 className="mt-2 text-4xl">Политика конфиденциальности</h1>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Действует с {EFFECTIVE_DATE}. Оператор данных — Денис Корнилов,{' '}
            <a className="underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            .
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <Section title="Коротко">
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                Без аккаунта книги, слова и прогресс хранятся только на
                устройстве.
              </li>
              <li>
                Аккаунт нужен, чтобы те же данные были на телефоне, компьютере и
                сайте.
              </li>
              <li>Рекламы, трекеров и систем аналитики нет.</li>
              <li>Данные не продаются и не передаются для маркетинга.</li>
              <li>Аккаунт можно удалить со всеми данными в любой момент.</li>
            </ul>
          </Section>
        </Reveal>

        <Reveal delay={0.05}>
          <Section title="Какие данные обрабатываются">
            <h3 className="mt-4 text-lg font-bold">Без регистрации</h3>
            <p>
              Библиотека, добавленные слова, карточки, прогресс чтения и курса
              хранятся локально и на сервер не отправляются.
            </p>
            <p>
              На сервер уходит только текст, который нужно перевести или
              разобрать: отдельное слово либо предложение, в котором оно
              встретилось. Такой запрос анонимен, он не связывается с человеком
              и не сохраняется в профиле. Переводы кэшируются по содержимому
              текста, чтобы не запрашивать одно и то же повторно.
            </p>

            <h3 className="mt-5 text-lg font-bold">С аккаунтом</h3>
            <p>При регистрации сохраняются:</p>
            <ul className="ml-5 list-disc space-y-1.5">
              <li>адрес электронной почты и отображаемое имя;</li>
              <li>хеш пароля — сам пароль не хранится;</li>
              <li>
                идентификатор аккаунта провайдера при входе через Google или
                Яндекс ID;
              </li>
              <li>
                активные сессии: хеш токена, название и платформа устройства,
                время входа.
              </li>
            </ul>
            <p className="mt-3">При включённой синхронизации сохраняются:</p>
            <ul className="ml-5 list-disc space-y-1.5">
              <li>список книг и их текст — чтобы открыть книгу на другом устройстве;</li>
              <li>сохранённые слова, переводы и грамматические разборы;</li>
              <li>карточки повторения и расписание повторов;</li>
              <li>прогресс курса и «дворцы памяти».</li>
            </ul>

            <h3 className="mt-5 text-lg font-bold">Что не собирается</h3>
            <p>
              Геолокация, контакты, список установленных программ,
              рекламные идентификаторы, история просмотров вне приложения.
              Аналитики поведения и сбора отчётов о сбоях нет.
            </p>
          </Section>
        </Reveal>

        <Reveal delay={0.05}>
          <Section title="Зачем данные обрабатываются">
            <ul className="ml-5 list-disc space-y-1.5">
              <li>вход в аккаунт и защита от несанкционированного доступа;</li>
              <li>синхронизация библиотеки и прогресса между устройствами;</li>
              <li>перевод и грамматический разбор слов;</li>
              <li>подтверждение адреса почты и восстановление доступа.</li>
            </ul>
            <p className="mt-3">
              Правовое основание — исполнение договора с пользователем и
              согласие, которое даётся при создании аккаунта.
            </p>
          </Section>
        </Reveal>

        <Reveal delay={0.05}>
          <Section title="Кому передаются данные">
            <p>Только тем сервисам, без которых функция не работает:</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left">
                    <th className="py-2 pr-4 font-bold">Получатель</th>
                    <th className="py-2 pr-4 font-bold">Что передаётся</th>
                    <th className="py-2 font-bold">Зачем</th>
                  </tr>
                </thead>
                <tbody>
                  {TRANSFERS.map((row) => (
                    <tr key={row.to} className="border-b border-[var(--line)]">
                      <td className="py-2 pr-4">{row.to}</td>
                      <td className="py-2 pr-4">{row.what}</td>
                      <td className="py-2">{row.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              Тексты для перевода передаются без привязки к аккаунту. Данные не
              передаются рекламным сетям и брокерам данных и не используются для
              профилирования.
            </p>
          </Section>
        </Reveal>

        <Reveal delay={0.05}>
          <Section title="Где и сколько хранятся данные">
            <p>
              Данные хранятся на арендованном сервере в Европейском союзе
              (PostgreSQL, шифрованное соединение). Данные аккаунта хранятся,
              пока существует аккаунт; сессии удаляются по истечении срока; кэш
              переводов хранится не дольше года и не привязан к человеку.
            </p>
          </Section>
        </Reveal>

        <Reveal delay={0.05}>
          <Section title="Удаление аккаунта и данных">
            <p>
              Аккаунт удаляется целиком — вместе с книгами, словами, карточками
              и прогрессом:
            </p>
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                на сайте:{' '}
                <a className="underline" href="/account">
                  citavuk.ru/account
                </a>{' '}
                → «Удалить аккаунт»;
              </li>
              <li>
                в приложении: «Ещё» → «Аккаунт и синхронизация» → «Удалить
                аккаунт»;
              </li>
              <li>
                письмом на{' '}
                <a className="underline" href={`mailto:${CONTACT}`}>
                  {CONTACT}
                </a>{' '}
                с адреса, на который зарегистрирован аккаунт.
              </li>
            </ul>
            <p className="mt-3">
              Удаление необратимо и выполняется сразу. Резервные копии базы
              перезаписываются в течение 30 дней. Данные на самом устройстве
              остаются — их удаляет удаление приложения.
            </p>
          </Section>
        </Reveal>

        <Reveal delay={0.05}>
          <Section title="Дети">
            <p>
              Приложение не предназначено для детей младше 13 лет и не собирает
              данные о них намеренно.
            </p>
          </Section>
        </Reveal>

        <Reveal delay={0.05}>
          <Section title="Права пользователя">
            <p>
              Можно запросить копию своих данных, исправление неточностей,
              удаление данных или отозвать согласие — письмом на{' '}
              <a className="underline" href={`mailto:${CONTACT}`}>
                {CONTACT}
              </a>
              . Ответ даётся в течение 30 дней.
            </p>
          </Section>
        </Reveal>

        <Reveal delay={0.05}>
          <Section title="Безопасность">
            <p>
              Соединение с сервером идёт по HTTPS. Пароли хранятся в виде хеша,
              токены сессий — в виде SHA-256. Доступ к серверу ограничен ключами.
            </p>
          </Section>
        </Reveal>

        <Reveal delay={0.05}>
          <Section title="Изменения политики">
            <p>
              При изменении политики обновляется дата вступления в силу, а
              актуальная версия публикуется на этой странице. О существенных
              изменениях сообщается в приложении.
            </p>
          </Section>
        </Reveal>
      </article>
    </main>
  );
}

const TRANSFERS = [
  {
    to: 'DeepL SE (Германия)',
    what: 'текст для перевода',
    why: 'машинный перевод слов и фраз',
  },
  {
    to: 'Google LLC',
    what: 'текст для перевода',
    why: 'запасной переводчик, когда DeepL недоступен',
  },
  {
    to: 'Google LLC',
    what: 'данные входа Google',
    why: 'вход через аккаунт Google',
  },
  {
    to: 'Яндекс',
    what: 'данные входа Яндекс ID',
    why: 'вход через Яндекс ID',
  },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-[var(--text-muted)]">
        {children}
      </div>
    </section>
  );
}
