import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowLeft, LuExternalLink, LuNewspaper, LuPlay, LuRefreshCw, LuX } from 'react-icons/lu';

import {
  getNewsArticle,
  getNewsIssue,
  getVideoPicks,
  newsImageUrl,
  type NewsArticle,
  type NewsBlock,
  type NewsIssue,
  type NewsPage,
  type NewsStory,
  type VideoPick,
} from '../api/news';
import { LiteYouTube } from '../components/LiteYouTube';
import { NewsPress } from '../components/NewsPress';
import { WordReader } from '../components/WordReader';
import { ErrorNote, Spinner } from '../components/ui';
import { markChecklist } from '../lib/checklist';
import { useFocusTrap, useScrollLock } from '../lib/overlay';
import { useSeo } from '../lib/seo';
import './news.css';

/**
 * «Вести» — сербская газета Читавука.
 *
 * Свежие заметки сербских изданий свёрстаны как бумажный номер: шапка,
 * передовица на полосе, колонки с линейками. Номер выходит раз в час; по
 * кнопке его можно перепечатать раньше. Каждое слово в заметке нажимается —
 * перевод, начальная форма и разбор, как в читалке.
 */

const SECTIONS_KEY = 'citavuk-vesti-sections';

function readSections(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function saveSections(codes: string[]): void {
  try {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(codes));
  } catch {
    // Выбор полос просто не запомнится.
  }
}

function longDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function clock(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function ago(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  const hours = Math.round((Date.now() - date.getTime()) / 3_600_000);
  if (Number.isNaN(hours)) return '';
  if (hours < 1) return 'только что';
  if (hours < 24) return `${hours} ч назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** Номер выпуска — порядковый час в году: у каждого часового номера свой. */
function issueNumber(value: string): number {
  const date = new Date(value);
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date.getTime() - start.getTime()) / 3_600_000) + 1;
}

export function News() {
  useSeo({
    title: 'Вести — сербские новости с переводом каждого слова — Читавук',
    description: 'Свежие новости на сербском, свёрстанные как газета. Нажми на любое слово — перевод, начальная форма и разбор.',
    noindex: true,
  });
  const [issue, setIssue] = useState<NewsIssue | null>(null);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [pressing, setPressing] = useState<string | null>(null);
  const [sections, setSections] = useState<string[]>(readSections);
  const [open, setOpen] = useState<NewsStory | null>(null);
  const [videos, setVideos] = useState<VideoPick[]>([]);
  const issueRef = useRef<NewsIssue | null>(null);
  issueRef.current = issue;

  const print = useCallback(async (fresh: boolean) => {
    setPrinting(true);
    setError('');
    try {
      const next = await getNewsIssue(fresh);
      const isNew = next.printedAt !== issueRef.current?.printedAt;
      setIssue(next);
      if (isNew) setPressing(longDate(next.printedAt));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Газета сейчас не печатается.');
    } finally {
      setPrinting(false);
    }
  }, []);

  useEffect(() => {
    void print(false);
    const controller = new AbortController();
    getVideoPicks(['vesti', 'kultura', 'putovanja'], controller.signal)
      .then((result) => setVideos(result.videos.filter((video) => !video.short).slice(0, 4)))
      .catch(() => setVideos([]));
    return () => controller.abort();
  }, [print]);

  // Номер выходит раз в час: открытая вкладка сама получает следующий.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = issueRef.current;
      if (current && Date.now() >= new Date(current.nextIssue).getTime() && !document.hidden) void print(false);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [print]);

  const shown = useMemo(() => {
    if (!issue) return [];
    return sections.length ? issue.sections.filter((page) => sections.includes(page.code)) : issue.sections;
  }, [issue, sections]);

  const toggle = (code: string) => {
    const next = sections.includes(code) ? sections.filter((item) => item !== code) : [...sections, code];
    setSections(next);
    saveSections(next);
  };

  return (
    <main className="vesti">
      <AnimatePresence>{pressing && <NewsPress key={pressing + (issue?.printedAt ?? '')} date={pressing} onDone={() => setPressing(null)} />}</AnimatePresence>

      <header className="vesti-masthead">
        <div className="vesti-rule-double" aria-hidden="true" />
        <div className="vesti-ears">
          <span>Сербский каждый день</span>
          <span>Нажми на слово — перевод</span>
        </div>
        <h1 className="vesti-name">
          <span>Вести</span>
          <small>Читавука</small>
        </h1>
        <div className="vesti-dateline">
          <span>{issue ? `Номер ${issueNumber(issue.printedAt)}` : 'Номер печатается'}</span>
          <span className="vesti-date">{issue ? longDate(issue.printedAt) : '…'}</span>
          <span>{issue ? `Свежий в ${clock(issue.printedAt)}, следующий в ${clock(issue.nextIssue)}` : ''}</span>
        </div>
        <div className="vesti-rule-thin" aria-hidden="true" />
      </header>

      <div className="vesti-toolbar">
        {issue && (
          <nav className="vesti-topics" aria-label="Полосы газеты">
            <button type="button" data-active={sections.length === 0} onClick={() => { setSections([]); saveSections([]); }}>
              Весь номер
            </button>
            {issue.sections.map((page) => (
              <button key={page.code} type="button" data-active={sections.includes(page.code)} onClick={() => toggle(page.code)}>
                {page.title}
              </button>
            ))}
          </nav>
        )}
        <button type="button" className="vesti-refresh" onClick={() => void print(true)} disabled={printing}>
          <LuRefreshCw className={printing ? 'vesti-spin' : ''} /> Свежий номер
        </button>
      </div>

      {error && !issue && <ErrorNote>{error}</ErrorNote>}
      {!issue && !error && (
        <div className="vesti-loading">
          <Spinner /> <span>Свежий номер печатается…</span>
        </div>
      )}

      {shown.map((page, index) => (
        <Sheet key={page.code} page={page} index={index} onOpen={setOpen} />
      ))}

      {videos.length > 0 && (
        <section className="vesti-sheet vesti-tv">
          <SheetHead title="Видео дана" />
          <div className="vesti-tv-grid">
            {videos.map((video) => (
              <figure key={video.id} className="vesti-tv-item">
                <LiteYouTube id={video.id} title={video.title} />
                <figcaption>
                  <strong>{video.title}</strong>
                  <span>{video.channel}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {issue && (
        <footer className="vesti-colophon">
          Заметки: {issue.sources.join(', ')}. Права на тексты и снимки — у изданий; полный текст всегда по ссылке на оригинал.
        </footer>
      )}

      <AnimatePresence>{open && <ArticleSheet story={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </main>
  );
}

function SheetHead({ title }: { title: string }) {
  return (
    <div className="vesti-sheet-head">
      <h2>{title}</h2>
      <span aria-hidden="true" />
    </div>
  );
}

function Byline({ story }: { story: NewsStory }) {
  return (
    <p className="vesti-byline">
      {[story.source, ago(story.published)].filter(Boolean).join(', ')}
      {story.video && (
        <span className="vesti-badge">
          <LuPlay /> видео
        </span>
      )}
    </p>
  );
}

function Sheet({ page, index, onOpen }: { page: NewsPage; index: number; onOpen: (story: NewsStory) => void }) {
  const [lead, ...rest] = page.stories;
  if (!lead) return null;
  return (
    <motion.section
      className="vesti-sheet"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 * index, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <SheetHead title={page.title} />
      <article className={`vesti-lead ${lead.image ? 'vesti-lead-pic' : ''}`}>
        {lead.image && (
          <button type="button" className="vesti-photo" onClick={() => onOpen(lead)} aria-label={`Открыть: ${lead.title}`}>
            <img src={newsImageUrl(lead.image)} alt="" loading={index < 2 ? 'eager' : 'lazy'} decoding="async" />
          </button>
        )}
        <div>
          <h3 className="vesti-lead-title" lang="sr">
            <button type="button" onClick={() => onOpen(lead)}>{lead.title}</button>
          </h3>
          <Byline story={lead} />
          {lead.summary && (
            <div className="vesti-lead-text" lang="sr">
              <WordReader paragraphs={[lead.summary]} calm paragraphClassName="reader-selectable vesti-copy" />
            </div>
          )}
          <button type="button" className="vesti-more" onClick={() => onOpen(lead)}>Читать целиком</button>
        </div>
      </article>
      {rest.length > 0 && (
        <div className="vesti-columns">
          {rest.map((story) => (
            <article key={story.id} className="vesti-story">
              {story.image && (
                <button type="button" className="vesti-photo vesti-photo-small" onClick={() => onOpen(story)} aria-label={`Открыть: ${story.title}`}>
                  <img src={newsImageUrl(story.image)} alt="" loading="lazy" decoding="async" />
                </button>
              )}
              <h3 className="vesti-story-title" lang="sr">
                <button type="button" onClick={() => onOpen(story)}>{story.title}</button>
              </h3>
              <Byline story={story} />
              {story.summary && (
                <div className="vesti-story-text" lang="sr">
                  <WordReader paragraphs={[story.summary]} calm paragraphClassName="reader-selectable vesti-copy" />
                </div>
              )}
              <button type="button" className="vesti-more" onClick={() => onOpen(story)}>Читать целиком</button>
            </article>
          ))}
        </div>
      )}
    </motion.section>
  );
}

/** Соседние абзацы идут в один WordReader: так перевод предложения видит
 * текст вокруг, а выделение фразы не рвётся на границе абзаца. */
function groupBlocks(blocks: NewsBlock[]): Array<{ kind: 'text'; paragraphs: string[] } | NewsBlock> {
  const out: Array<{ kind: 'text'; paragraphs: string[] } | NewsBlock> = [];
  for (const block of blocks) {
    if (block.kind === 'p' && block.text) {
      const last = out[out.length - 1];
      if (last && last.kind === 'text') last.paragraphs.push(block.text);
      else out.push({ kind: 'text', paragraphs: [block.text] });
    } else {
      out.push(block);
    }
  }
  return out;
}

function ArticleSheet({ story, onClose }: { story: NewsStory; onClose: () => void }) {
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [error, setError] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useFocusTrap(true, panel);

  useEffect(() => {
    const controller = new AbortController();
    getNewsArticle(story.link, controller.signal)
      .then((result) => {
        setArticle(result);
        markChecklist('read');
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Заметка не открылась.');
      });
    return () => controller.abort();
  }, [story.link]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const blocks = useMemo(() => groupBlocks(article?.blocks ?? []), [article]);
  const firstText = blocks.findIndex((block) => block.kind === 'text');
  const hasVideoBlock = article?.blocks.some((block) => block.kind === 'youtube' || block.kind === 'video');
  const leadImage = article?.image ?? story.image;

  return (
    <motion.div
      className="vesti-article-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={story.title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={panel}
        className="vesti-article"
        initial={{ y: 40, rotateX: 8, opacity: 0 }}
        animate={{ y: 0, rotateX: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="vesti-article-bar">
          <button type="button" onClick={onClose} className="vesti-article-back">
            <LuArrowLeft /> К номеру
          </button>
          <span><LuNewspaper /> {story.source}</span>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="vesti-article-close">
            <LuX />
          </button>
        </div>
        <article className="vesti-article-body">
          <p className="vesti-kicker">{[story.source, ago(article?.published ?? story.published)].filter(Boolean).join(', ')}</p>
          <h2 lang="sr">{article?.title || story.title}</h2>
          {leadImage && (
            <figure className="vesti-article-figure">
              <img src={newsImageUrl(leadImage)} alt="" decoding="async" />
            </figure>
          )}
          {!hasVideoBlock && story.video?.youtube && <LiteYouTube id={story.video.youtube} title={story.title} className="vesti-article-video" />}
          {!article && !error && (
            <div className="vesti-loading">
              <Spinner /> <span>Набираем заметку…</span>
            </div>
          )}
          {error && (
            <>
              <ErrorNote>{error}</ErrorNote>
              {story.summary && <WordReader paragraphs={[story.summary]} calm paragraphClassName="reader-selectable vesti-copy vesti-article-copy" />}
            </>
          )}
          {blocks.map((block, index) => {
            if (block.kind === 'text') {
              return <WordReader key={index} paragraphs={block.paragraphs} calm className={index === firstText ? 'vesti-article-text vesti-article-first' : 'vesti-article-text'} paragraphClassName="reader-selectable vesti-copy vesti-article-copy" />;
            }
            if (block.kind === 'h') return <h3 key={index} lang="sr">{block.text}</h3>;
            if (block.kind === 'img' && block.image) {
              return (
                <figure key={index} className="vesti-article-figure">
                  <img src={newsImageUrl(block.image)} alt={block.text ?? ''} loading="lazy" decoding="async" />
                  {block.text && <figcaption lang="sr">{block.text}</figcaption>}
                </figure>
              );
            }
            if (block.kind === 'youtube' && block.youtube) {
              return <LiteYouTube key={index} id={block.youtube} title={article?.title ?? story.title} className="vesti-article-video" />;
            }
            if (block.kind === 'video' && block.file) {
              return <video key={index} className="vesti-article-video" src={block.file} controls preload="none" playsInline />;
            }
            return null;
          })}
          <a className="vesti-original" href={story.link} target="_blank" rel="noopener noreferrer">
            Оригинал на сайте {story.source || 'издания'} <LuExternalLink />
          </a>
        </article>
      </motion.div>
    </motion.div>
  );
}
