import { LuCheck, LuCircleAlert, LuExternalLink, LuMinus } from 'react-icons/lu';

import { EXAM_CENTERS, EXAM_LEVELS, EXAM_SECTIONS, type ExamSection } from '../exams/catalog';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';

/**
 * Раздел в подготовке. Страница честно говорит, чего ещё нет: обещание
 * «скоро будет», не отличимое от готового раздела, обходится дороже пустоты.
 */
export function Exams() {
  useSeo({
    title: 'Экзамены по сербскому языку A1–C2 — Читавук',
    description:
      'Что проверяет официальный экзамен по сербскому как иностранному на каждом уровне A1–C2 и как к нему готовиться в Читавуке.',
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:py-12">
      <header>
        <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">Готовится</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl">Экзамены по сербскому</h1>
        <p className="mt-4 max-w-2xl leading-7 text-[var(--text-muted)]">
          Сертификат по сербскому как иностранному выдают университетские центры в Сербии по шкале
          CEFR — от A1 до C2. Здесь собрано, что проверяет каждая ступень и какие разделы испытания
          можно готовить в Читавуке. Пробные тесты по уровням появятся на этой странице.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Разделы испытания</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Состав разделов у центров совпадает, различаются веса и форма заданий. Ниже — чем каждый
          раздел готовится у нас.
        </p>
        <div className="mt-5 space-y-3">
          {EXAM_SECTIONS.map((section) => (
            <SectionRow key={section.id} section={section} />
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Уровни</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {EXAM_LEVELS.map((level) => (
            <article
              key={level.level}
              className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] p-5"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-display text-2xl text-[var(--accent)]">{level.level}</span>
                <span className="text-sm font-semibold text-[var(--text-muted)]">{level.name}</span>
              </div>
              <p className="mt-3 text-sm leading-6">{level.can}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="font-semibold">Чтение</dt>
                  <dd className="text-[var(--text-muted)]">{level.reading}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Письмо</dt>
                  <dd className="text-[var(--text-muted)]">{level.writing}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Где сдают</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Сроки, стоимость и проходной балл меняются каждый набор, поэтому их здесь нет: за ними
          нужно идти на сайт центра, а не к устаревшему числу на чужой странице.
        </p>
        <div className="mt-5 space-y-3">
          {EXAM_CENTERS.map((center) => (
            <a
              key={center.id}
              href={center.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] p-5 transition-colors hover:border-[var(--accent)]"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold" lang="sr">
                  {center.name}
                </p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{center.city}</p>
                <p className="mt-2 text-sm leading-6">{center.note}</p>
              </div>
              <LuExternalLink className="mt-1 size-4 shrink-0 text-[var(--text-muted)]" />
            </a>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] p-6">
        <h2 className="font-display text-xl">Пока тестов нет — что делать сейчас</h2>
        <ul className="mt-4 space-y-2 text-sm leading-6">
          <li>
            <Link to="/roadmap" className="font-semibold text-[var(--accent)]">
              Дорожная карта
            </Link>{' '}
            — что учить на вашем уровне по чтению, грамматике, словарю и письму.
          </li>
          <li>
            <Link to="/trainer" className="font-semibold text-[var(--accent)]">
              Тренажёрка
            </Link>{' '}
            — задания по конкретной теме грамматики вне порядка курса.
          </li>
          <li>
            <Link to="/materials" className="font-semibold text-[var(--accent)]">
              Материалы
            </Link>{' '}
            — сборники и пособия сербских учреждений с тестами по документам.
          </li>
        </ul>
      </section>
    </main>
  );
}

const ENGINE_VIEW: Record<
  ExamSection['engine'],
  { icon: typeof LuCheck; label: string; tone: string }
> = {
  exercise: { icon: LuCheck, label: 'Движок заданий готов', tone: 'text-[var(--success)]' },
  quiz: { icon: LuCheck, label: 'Движок тестов готов', tone: 'text-[var(--success)]' },
  missing: { icon: LuCircleAlert, label: 'Нужен новый тип задания', tone: 'text-[var(--accent)]' },
  'out-of-scope': { icon: LuMinus, label: 'Не делаем', tone: 'text-[var(--text-muted)]' },
};

function SectionRow({ section }: { section: ExamSection }) {
  const view = ENGINE_VIEW[section.engine];
  const Icon = view.icon;
  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-semibold">{section.title}</h3>
        <span className="text-sm text-[var(--text-muted)]" lang="sr">
          {section.serbian}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6">{section.about}</p>
      <p className={`mt-3 flex items-start gap-2 text-sm ${view.tone}`}>
        <Icon className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-semibold">{view.label}.</span>{' '}
          <span className="text-[var(--text-muted)]">{section.engineNote}</span>
        </span>
      </p>
    </article>
  );
}
