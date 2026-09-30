import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { LuBookOpen, LuCaptions, LuClock3, LuExternalLink, LuFileAudio, LuHeadphones, LuMic, LuPlay, LuRadio, LuSearch, LuUpload } from 'react-icons/lu';

import { getAudioLessons } from '../api/listening';
import { Button, ErrorNote, Spinner } from '../components/ui';
import type { AudioLesson } from '../listening/types';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import './listening.css';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; lessons: AudioLesson[] };
const shelves = ['Все', 'Учебные', 'История', 'Культура', 'Аудиокниги', 'Радио'];

export function Listening() {
  useSeo({
    title: 'Сербский на слух: подкасты, радио и аудиокниги — Читавук',
    description: 'Живая сербская речь по уровням: учебные подкасты, история, культура, радио, аудиокниги и свои аудиозаписи с расшифровкой.',
  });
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [shelf, setShelf] = useState('Все');
  const load = () => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void getAudioLessons(controller.signal).then(lessons => setState({ kind: 'ready', lessons })).catch(error => {
      if (!controller.signal.aborted) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Не удалось загрузить записи.' });
    });
    return () => controller.abort();
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const needle = query.trim().toLocaleLowerCase('sr');
    return state.lessons.filter(item => {
      const category = item.category || (item.kind === 'audiobook' ? 'Аудиокниги' : item.kind === 'radio' ? 'Радио' : 'Учебные');
      const inShelf = shelf === 'Все' || category === shelf || (shelf === 'Радио' && item.kind === 'radio');
      const haystack = `${item.title} ${item.subtitle} ${item.source_title ?? ''} ${category}`.toLocaleLowerCase('sr');
      return inShelf && (!needle || haystack.includes(needle));
    });
  }, [query, shelf, state]);
  const playable = filtered.filter(item => item.audio_url);
  const audiobooks = playable.filter(item => item.kind === 'audiobook');
  const programs = playable.filter(item => item.kind !== 'audiobook');
  const libraries = filtered.filter(item => !item.audio_url && item.external_url);

  return <main className="listening-page">
    <section className="listening-hero">
      <div className="listening-hero-ornament listening-hero-ornament-top" aria-hidden="true" />
      <div className="listening-hero-copy">
        <h1>Слушай аудиокниги и подкасты.</h1>
        <p>Учебные диалоги для старта, настоящие подкасты для привычки к темпу, радио и аудиокниги для погружения.</p>
        <div className="listening-hero-facts"><span><LuCaptions />Расшифровки</span><span><LuHeadphones />Живая речь</span><span><LuFileAudio />Свои записи</span></div>
      </div>
      <img src="/course/art/citavuk-listening-v2.webp" width="600" height="600" alt="Читавук слушает сербскую речь" />
      <div className="listening-hero-ornament listening-hero-ornament-bottom" aria-hidden="true" />
    </section>

    <section className="listening-own-audio" aria-labelledby="listening-own-audio-title">
      <div className="listening-own-audio-art" aria-hidden="true">
        <LuFileAudio />
        <span><LuUpload /></span>
      </div>
      <div className="listening-own-audio-copy">
        <h2 id="listening-own-audio-title">Добавляй свои аудиозаписи</h2>
        <p>Загрузи MP3, M4A, WAV, OGG, FLAC или WebM. Читавук проверит сербскую речь, разделит говорящих и сделает расшифровку с таймкодами. Нажми на слово, чтобы перейти к нужному месту в записи.</p>
        <div className="listening-own-audio-meta"><span><LuCaptions />Слова синхронизированы со звуком</span><span><LuFileAudio />Хранится на этом устройстве</span></div>
      </div>
      <Link to="/audio-files" className="listening-own-audio-action"><LuUpload />Добавить запись</Link>
    </section>

    <section className="listening-catalog">
      <header className="listening-toolbar">
        <div><h2>Аудиотека</h2></div>
        <label><LuSearch /><span className="sr-only">Поиск по аудиотеке</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Название, тема или подкаст" /></label>
      </header>
      <nav className="listening-shelves" aria-label="Разделы аудиотеки">
        {shelves.map(item => <button type="button" key={item} aria-pressed={shelf === item} onClick={() => setShelf(item)}>{item}</button>)}
      </nav>

      {state.kind === 'loading' && <div className="listening-state"><Spinner className="size-6" /><p>Собираем свежие выпуски</p></div>}
      {state.kind === 'error' && <div className="listening-state"><ErrorNote>{state.message}</ErrorNote><Button onClick={load}>Повторить</Button></div>}
      {state.kind === 'ready' && programs.length > 0 && <section className="listening-section">
        <div className="listening-section-title"><LuMic /><div><h2>Подкасты и передачи</h2><p>Можно слушать прямо в Читавуке</p></div></div>
        <div className="listening-grid">{programs.map((lesson, index) => <LessonPreview key={lesson.id} lesson={lesson} index={index} />)}</div>
      </section>}
      {state.kind === 'ready' && audiobooks.length > 0 && <section className="listening-section">
        <div className="listening-section-title"><LuBookOpen /><div><h2>Аудиокниги</h2><p>Бесплатный фрагмент внутри Читавука, полная книга у правообладателя</p></div></div>
        <div className="listening-grid">{audiobooks.map((lesson, index) => <LessonPreview key={lesson.id} lesson={lesson} index={index} />)}</div>
      </section>}
      {state.kind === 'ready' && libraries.length > 0 && <section className="listening-section">
        <div className="listening-section-title"><LuBookOpen /><div><h2>Аудиокниги и радиоархивы</h2><p>Легальные каталоги открываются у правообладателя</p></div></div>
        <div className="listening-library-grid">{libraries.map((lesson, index) => <LessonPreview key={lesson.id} lesson={lesson} index={index} />)}</div>
      </section>}
      {state.kind === 'ready' && filtered.length === 0 && <div className="listening-state"><LuRadio /><h2>На этой полке пока пусто</h2><p>Попробуй другую тему или измени запрос.</p></div>}
    </section>
  </main>;
}

function LessonPreview({ lesson, index }: { lesson: AudioLesson; index: number }) {
  const reduceMotion = useReducedMotion();
  const minutes = lesson.duration ? Math.max(1, Math.round(lesson.duration / 60)) : null;
  const external = Boolean(lesson.external_url && !lesson.audio_url);
  const content = <>
    <div className={`listening-cover listening-cover-${lesson.kind ?? 'podcast'}`} aria-hidden="true">{lesson.kind === 'audiobook' ? <LuBookOpen /> : lesson.kind === 'radio' ? <LuRadio /> : <LuMic />}</div>
    <div className="listening-card-copy">
      <div className="listening-card-tags">{lesson.cefr && <span>{lesson.cefr}</span>}<span>{lesson.category || 'Подкаст'}</span></div>
      <h3>{lesson.title}</h3>
      <p>{lesson.subtitle || 'Сербская речь для внимательного слушания'}</p>
      <div className="listening-card-meta">{minutes && <span><LuClock3 />{minutes} мин</span>}{lesson.transcript_url && <span><LuCaptions />Есть расшифровка</span>}<span>{external ? 'Открыть источник' : 'Слушать'}{external ? <LuExternalLink /> : <LuPlay />}</span></div>
    </div>
  </>;
  return <motion.article initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * .035 }} className="listening-card">
    {external ? <a href={lesson.external_url} target="_blank" rel="noopener noreferrer">{content}</a> : <Link to={`/listening/${encodeURIComponent(lesson.id)}`}>{content}</Link>}
    {!external && lesson.external_url && <a className="listening-card-source" href={lesson.external_url} target="_blank" rel="noopener noreferrer">Полная книга на Slušaj.rs <LuExternalLink /></a>}
  </motion.article>;
}
