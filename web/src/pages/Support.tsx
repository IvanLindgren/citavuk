import { Card, Reveal } from '../components/ui';
import { useSeo } from '../lib/seo';

const FUND_URL = 'https://yoomoney.ru/fundraise/1JBLJQ46SFR.260730';

export function Support() {
  useSeo({
    title: 'Поддержать Читавук',
    description:
      'Поддержать бесплатное развитие Читавука: сервер, API и выпуск приложений для iOS и macOS.',
  });

  return (
    <main className="paper-grain min-h-[calc(100vh-4rem)] overflow-x-hidden px-4 py-10 sm:px-5 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <p className="text-sm font-bold uppercase text-[var(--accent)]">
            Развитие проекта
          </p>
          <h1 className="mt-2 text-4xl sm:text-5xl">Поддержать Читавук</h1>
        </Reveal>

        <Reveal delay={0.06}>
          <Card className="mt-8 overflow-hidden p-6 sm:p-9">
            <div className="grid items-center gap-7 sm:grid-cols-[1fr_auto]">
              <div>
                <p className="font-display text-2xl font-bold">Дорогие другови!</p>
                <p className="mt-4 leading-relaxed">
                  Проект Читавук является полностью бесплатным: я никогда не
                  буду внедрять платные функции, разве что небольшую косметику
                  для тех, кто пожертвует на сбор, и, может быть, если появится
                  выкладывание книг, то я сделаю эту функцию за символическую
                  плату, чтобы не приходилось модерировать выкладываемые книги.
                </p>
              </div>
              <img
                src="/img/citavuk_zdravo.webp"
                srcSet="/img/citavuk_zdravo.webp 1x, /img/citavuk_zdravo@2x.webp 2x"
                alt=""
                width={180}
                height={180}
                className="mx-auto w-36 object-contain sm:w-44"
              />
            </div>

            <p className="mt-6 leading-relaxed">
              Однако поддержание работы сервера и некоторые цели развития, такие
              как выход Читавука на iOS и macOS, плата за API и прочее, требуют
              достаточного количества денег, которых у автора проекта пока нет.
              Он, конечно, когда-то их соберёт и всё сделает, но с вашей помощью
              это будет кратно быстрее.
            </p>
            <p className="mt-4 leading-relaxed">
              Если вам небезразлична судьба проекта и вам нравится его
              функционал, то вот виджет для сбора:
            </p>

            <div className="mt-7 rounded-2xl border border-[var(--accent)]/35 bg-[var(--accent)]/8 p-5 text-center sm:p-7">
              <p className="font-display text-2xl font-bold">Сбор на развитие</p>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--text-muted)]">
                Перевод проходит на защищённой странице YooMoney. Читавук не
                получает и не хранит платёжные данные.
              </p>
              <a
                href={FUND_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--accent)] px-6 py-3 font-bold text-white transition-transform hover:-translate-y-0.5 hover:bg-[var(--accent-hover)]"
              >
                Поддержать развитие Читавука
              </a>
            </div>
          </Card>
        </Reveal>
      </div>
    </main>
  );
}
