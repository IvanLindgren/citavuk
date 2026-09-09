import { useEffect, useState } from 'react';
import { LuCalendarCheck, LuCheck, LuChevronLeft, LuChevronRight, LuFlame, LuSnowflake, LuTrophy } from 'react-icons/lu';
import type { Study } from '../api/personal';
import { readStudy } from '../lib/study';
import { latestStudy, studyMonth } from '../lib/studyCalendar';
import { plural } from '../lib/books';
import { Link } from '../lib/router';
import './study-stats.css';

export function StudyStats({ initial }: { initial?: Study }) {
  const [live, setLive] = useState<Study | null>(readStudy);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState('');
  useEffect(() => {
    const update = (e: Event) => setLive((e as CustomEvent<Study>).detail);
    window.addEventListener('citavuk-study', update);
    return () => window.removeEventListener('citavuk-study', update);
  }, []);
  const s = latestStudy(initial, live);
  if (!s) return null;
  const month = studyMonth(s.today, offset);
  if (!month) return null;
  const history = new Map((s.days ?? []).map(d => [d.date, d.kind]));
  if (s.todayActive) history.set(s.today, 'active');
  const activeThisMonth = month.days.filter(d => history.get(d) === 'active' && d <= s.today).length;
  const chosen = month.days.includes(selected) ? selected : month.days.includes(s.today) ? s.today : month.days[0]!;
  const status = (day: string) => day > s.today ? 'Этот день ещё впереди' : history.get(day) === 'active' ? 'Занятие засчитано' : history.get(day) === 'frozen' ? 'Серия сохранена заморозкой' : day === s.today ? 'Сегодня можно зажечь огонь' : 'Нет отметки о занятии';
  const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return <section className="study-journal" aria-label="Серия и календарь занятий">
    <div className={`study-journal-story ${s.todayActive ? 'is-lit' : ''}`}>
      <span className="study-journal-kicker">Твой ритм</span>
      <h2>Твоя серия</h2>
      <div className="study-journal-count"><strong>{s.current}</strong><span>{plural(s.current, 'день', 'дня', 'дней')}<br />подряд</span></div>
      <img src="/img/citavuk_povtor.webp" srcSet="/img/citavuk_povtor.webp 1x, /img/citavuk_povtor@2x.webp 2x" width={150} height={150} alt="" loading="lazy" />
      <p>{s.todayActive ? 'Сегодня ты уже позанимался. Огонь горит!' : s.current > 0 ? 'Ещё одно занятие продолжит твою серию.' : 'Новая серия начинается с одного занятия.'}</p>
      <Link to="/personal" className="study-journal-action">{s.todayActive ? 'Открыть колоду' : 'К уроку дня'}<LuFlame aria-hidden /></Link>
    </div>
    <div className="study-journal-content">
      <dl className="study-journal-records">
        <div><dt><LuTrophy aria-hidden />Рекорд</dt><dd>{s.longest}<span>{plural(s.longest, 'день', 'дня', 'дней')}</span></dd></div>
        <div><dt><LuCalendarCheck aria-hidden />Всего занятий</dt><dd>{s.activeDays}<span>{plural(s.activeDays, 'день', 'дня', 'дней')}</span></dd></div>
        <div className="study-freezes"><dt><LuSnowflake aria-hidden />Заморозки</dt><dd>{s.freezes}<span>из 2</span><span className="study-freeze-slots" aria-hidden>{[0, 1].map(i => <LuSnowflake key={i} className={i < s.freezes ? 'available' : ''} />)}</span></dd></div>
      </dl>
      <div className="study-month-header">
        <div><h3 aria-live="polite">{month.label}</h3><p>{activeThisMonth} {plural(activeThisMonth, 'день', 'дня', 'дней')} занятий за месяц</p></div>
        <div className="study-month-controls">
          <button type="button" disabled={offset <= -11} aria-label="Предыдущий месяц" onClick={() => { setOffset(o => o - 1); setSelected(''); }}><LuChevronLeft aria-hidden /></button>
          <button type="button" disabled={offset >= 0} aria-label="Следующий месяц" onClick={() => { setOffset(o => o + 1); setSelected(''); }}><LuChevronRight aria-hidden /></button>
        </div>
      </div>
      <div className="study-weekdays" aria-hidden>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => <span key={d}>{d}</span>)}</div>
      <div className="study-month-grid" aria-label={month.label}>
        {Array.from({ length: month.padding }, (_, i) => <span key={`pad${i}`} aria-hidden />)}
        {month.days.map(date => {
          const kind = date <= s.today ? history.get(date) : undefined;
          return <button key={date} type="button" className={`study-day ${kind ?? 'empty'} ${date === s.today ? 'today' : ''} ${date > s.today ? 'future' : ''}`} aria-pressed={chosen === date} aria-current={date === s.today ? 'date' : undefined} aria-label={`${dateLabel(date)}: ${status(date)}`} onClick={() => setSelected(date)}>
            <time dateTime={date}>{Number(date.slice(-2))}</time>
            {kind === 'active' ? <LuCheck aria-hidden /> : kind === 'frozen' ? <LuSnowflake aria-hidden /> : null}
          </button>;
        })}
      </div>
      <p className="study-day-detail" aria-live="polite"><b>{dateLabel(chosen)}</b><span>{status(chosen)}</span></p>
      <div className="study-calendar-key"><span><LuCheck aria-hidden />Занятие</span><span><LuSnowflake aria-hidden />Заморозка</span><span className="study-today-key">Сегодня</span></div>
      <details className="study-calendar-note"><summary>Как считаются дни и заморозки</summary><p>Дни считаются в часовом поясе {s.timezone}. Заморозка сохраняет серию в пропущенный день, но не добавляет день занятий. Серия растёт после выполнения заданий.</p></details>
    </div>
  </section>;
}
