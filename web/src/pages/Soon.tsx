import { Mascot, type MascotPose } from '../components/Mascot';
import { Ornament } from '../components/Ornament';
import { Button, Card, Reveal } from '../components/ui';
import { Link } from '../lib/router';

/**
 * Заглушка для разделов, которые в вебе ещё не сделаны.
 *
 * Показывать честную заглушку правильнее, чем полупустой раздел: пользователь
 * сразу понимает, где эта функция уже работает, и не решает, что она сломана.
 */
const SECTIONS: Record<
  string,
  { title: string; pose: MascotPose; alt: string; text: string; points: string[] }
> = {
  listening: {
    title: 'Слушание',
    pose: 'sluhao_slusa',
    alt: 'Орёл Слухао слушает',
    text: 'Подкасты и уроки с транскриптом: слова подсвечиваются по мере звучания.',
    points: [
      'Курируемые аудиоуроки и сербские подкасты',
      'Транскрипт, синхронный со звуком',
      'Слова, сложные на слух, помечены отдельно',
      'Нажатие на слово открывает разбор',
    ],
  },
  course: {
    title: 'Курс грамматики',
    pose: 'citavuk_gram',
    alt: 'Волк Читавук объясняет грамматику',
    text: 'Уровни от письменности до падежей и времён: сначала короткая теория, потом упражнения.',
    points: [
      'Тропа уровней: письменность, род и число, падежи',
      'Теория коротко, с примерами из книг',
      'Упражнения с разбором ошибки, а не просто «неверно»',
      'Интервальное повторение пройденного',
    ],
  },
};

export function Soon({ section }: { section: keyof typeof SECTIONS | string }) {
  const info = SECTIONS[section] ?? SECTIONS.listening!;

  return (
    <main className="px-5 py-14">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <div className="mx-auto mb-8 w-52">
            <Mascot pose={info.pose} alt={info.alt} width={416} float priority />
          </div>
          <h1 className="text-4xl">{info.title}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
            {info.text}
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mx-auto my-10 max-w-md text-[var(--accent)] opacity-60">
          <Ornament count={7} />
        </Reveal>

        <Reveal delay={0.15}>
          <Card className="p-7 text-left sm:p-9">
            <h2 className="text-xl">Что будет в этом разделе</h2>
            <ul className="mt-4 space-y-3">
              {info.points.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                    aria-hidden="true"
                  />
                  <span className="leading-relaxed text-[var(--text-muted)]">{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-2xl bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-muted)]">
              Раздел уже работает в приложении — в вебе он появится следующим.
            </p>
          </Card>
        </Reveal>

        <Reveal delay={0.2}>
          <Link to="/library">
            <Button className="mt-8" size="lg">
              Пока почитать
            </Button>
          </Link>
        </Reveal>
      </div>
    </main>
  );
}
