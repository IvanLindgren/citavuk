import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { LuChevronDown, LuChevronLeft, LuChevronUp, LuHeart, LuRefreshCw, LuSlidersHorizontal, LuVideo } from 'react-icons/lu';
import { getLikedMicroFeed, getMicroFeed, type MicroFeedItem, type MicroFeedPreferences } from '../api/microFeed';
import { FeedComments } from '../components/FeedComments';
import { FeedModeNav } from '../components/FeedModeNav';
import { FeedVideoCard } from '../components/FeedVideoCard';
import { MicroFeedOnboarding } from '../components/MicroFeedOnboarding';
import { Spinner } from '../components/ui';
import { useScrollLock } from '../lib/overlay';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import { videoSwipe } from '../lib/videoWatch';
import { useAuth } from '../state/auth';
import './video-feed.css';

export function VideoFeed() {
  const { account } = useAuth();
  useSeo({ title: 'Вукоток: короткие видео на сербском', description: 'Слушай живую сербскую речь, листай короткие видео и обсуждай их в Читавуке.' });
  return <VideoSession key={account?.id ?? 'guest'} />;
}

function VideoSession() {
  const [items, setItems] = useState<MicroFeedItem[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [exhausted, setExhausted] = useState(false);
  const [liked, setLiked] = useState(false);
  const [muted, setMuted] = useState(true);
  const [discussing, setDiscussing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [preferences, setPreferences] = useState<MicroFeedPreferences | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const navigateAt = useRef(0);
  const dirty = useRef(false);
  const signals = useRef<Promise<void>>(Promise.resolve());
  const flush = useRef<(() => Promise<void>) | null>(null);
  const registerFlush = useCallback((fn: (() => Promise<void>) | null) => { flush.current = fn; }, []);
  const data = useRef({ items, index, liked, discussing, settings, exhausted });
  data.current = { items, index, liked, discussing, settings, exhausted };
  useScrollLock(true);

  const load = useCallback(async (reset = false, saved = data.current.liked, refresh = false) => {
    if (pending.current && !reset && !refresh) return;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    pending.current = true; setBusy(true); setError('');
    try {
      await signals.current;
      if (controller.signal.aborted) return;
      // Обновляем только ещё не открытые рекомендации. Назад можно вернуться,
      // а реакция никогда не перезапускает текущий ролик.
      const base = reset ? [] : dirty.current ? data.current.items.slice(0, data.current.index + 1) : data.current.items;
      const response = saved ? { items: await getLikedMicroFeed(controller.signal, 'video') } : await getMicroFeed(base.map(v => v.id), controller.signal, 'video');
      if (controller.signal.aborted) return;
      if ('preferences' in response && response.preferences) setPreferences(response.preferences);
      // Во время запроса человек мог поставить лайк или перейти вперёд.
      const keep = reset ? [] : data.current.items.slice(0, Math.max(base.length, data.current.index + 1));
      const ids = new Set(keep.map(v => v.id));
      const fresh = response.items.filter(v => v.videoId && !ids.has(v.id) && (ids.add(v.id), true));
      const next = [...keep, ...fresh];
      data.current.items = next; setItems(next);
      if (reset) { data.current.index = 0; setIndex(0); }
      setExhausted(saved || fresh.length === 0);
      dirty.current = false;
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Видео не загрузились. Попробуй ещё раз.');
    } finally {
      if (abort.current === controller) { pending.current = false; setBusy(false); }
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' }); void load(true);
    return () => abort.current?.abort();
  }, [load]);

  const move = useCallback((direction: -1 | 1) => {
    const current = data.current;
    if (performance.now() < navigateAt.current || current.discussing || current.settings) return;
    if (direction === -1 && current.index === 0) return;
    if (direction === 1 && current.index + 1 >= current.items.length) {
      if (!current.exhausted) void load();
      return;
    }
    navigateAt.current = performance.now() + 300;
    // Свайп не ждёт сети. Следующая загрузка ждёт ack просмотра, чтобы подбор
    // уже знал о досмотре; экран при этом меняется немедленно.
    const recorded = flush.current?.() ?? Promise.resolve();
    signals.current = Promise.all([signals.current, recorded]).then(() => {}).catch(() => {
      setError('Просмотр не сохранился. Видео можно продолжать смотреть.');
    });
    const nextIndex = current.index + direction;
    data.current.index = nextIndex;
    setIndex(nextIndex);
  }, [load]);

  useEffect(() => {
    if (!liked && !exhausted && items.length > 0 && index >= items.length - 3) void load();
  }, [index, items.length, exhausted, liked, load]);

  const pointer = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);
  const pointerDown = (e: PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (!e.isPrimary || e.button !== 0 || (e.target as Element).closest('[data-no-swipe],a,input,textarea,select')) return;
    if ((e.target as Element).closest('button:not(.feed-video-gesture)')) return;
    pointer.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    // Захват на исходной кнопке сохраняет её обычный click (пауза).
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const pointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = pointer.current; pointer.current = null;
    if (!start || start.id !== e.pointerId) return;
    const direction = videoSwipe(e.clientX - start.x, e.clientY - start.y);
    if (direction) { suppressClick.current = true; move(direction); }
  };

  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    let total = 0, last = 0, lockedUntil = 0;
    const wheel = (e: WheelEvent) => {
      if (data.current.discussing || data.current.settings || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = performance.now();
      if (now < lockedUntil) return;
      if (now - last > 180 || Math.sign(total) !== Math.sign(e.deltaY)) total = 0;
      last = now; total += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? root.clientHeight : 1);
      if (Math.abs(total) >= 70) { move(total > 0 ? 1 : -1); total = 0; lockedUntil = now + 550; }
    };
    const key = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || (e.target as Element)?.closest('input,textarea,select,[role=dialog]')) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); move(1); }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); move(-1); }
    };
    root.addEventListener('wheel', wheel, { passive: false }); window.addEventListener('keydown', key);
    return () => { root.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key); };
  }, [move]);

  function switchCollection(saved: boolean) {
    signals.current = (flush.current?.() ?? Promise.resolve()).catch(() => {});
    setLiked(saved); setItems([]); setIndex(0); setExhausted(false);
    data.current = { ...data.current, liked: saved, items: [], index: 0, exhausted: false };
    dirty.current = false; void load(true, saved);
  }
  const item = items[index];
  const update = (value: MicroFeedItem) => {
    const next = data.current.items.map(v => v.id === value.id ? value : v);
    data.current.items = next; setItems(next);
  };

  return <main className="video-feed">
    <header className="video-feed-header">
      <Link to="/library" aria-label="Выйти из Вукотока" className="video-feed-back"><LuChevronLeft /></Link>
      <span className="video-feed-brand">Вукоток</span>
      <FeedModeNav mode="video" />
      <div className="video-feed-tools">
        <button type="button" aria-label={liked ? 'Вернуться к рекомендациям' : 'Понравившиеся видео'} aria-pressed={liked} onClick={() => switchCollection(!liked)}><LuHeart fill={liked ? 'currentColor' : 'none'} /></button>
        <button type="button" aria-label="Настроить интересы" disabled={!preferences} onClick={() => setSettings(true)}><LuSlidersHorizontal /></button>
      </div>
    </header>
    <div className="video-feed-layout">
      <aside className="video-feed-intro">
        <span className="video-feed-kicker">Слушай. Замечай. Понимай.</span>
        <h2>Сербский<br />в движении.</h2>
        <p>Короткие истории и живая речь. Каждый новый ролик ближе к тому, что тебе интересно.</p>
        <div className="video-feed-guide"><LuHeart /><p>Лайки и досмотры помогают подобрать похожее. «Не моё» уменьшает такие рекомендации.</p></div>
        <button type="button" disabled={!preferences} onClick={() => setSettings(true)}><LuSlidersHorizontal />Выбрать темы</button>
        <p className="video-feed-note">Реакции и обсуждения здесь относятся к Читавуку, а не к YouTube.</p>
      </aside>
      <div ref={stage} className="video-feed-stage" onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { pointer.current = null; }}
        onClickCapture={e => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; } }}>
        <div className="video-feed-context"><span>{liked ? 'Понравившиеся' : 'Для тебя'}</span><span>{item ? `${index + 1} / ${items.length}` : 'Короткие видео'}</span></div>
        {item ? <FeedVideoCard key={item.id} item={item} paused={discussing || settings} muted={muted} onMuted={setMuted} onChange={update}
          registerFlush={registerFlush} onDiscuss={() => setDiscussing(true)} onSignal={() => { dirty.current = true; if (!liked) void load(false, false, true); }} />
          : <div className="video-feed-empty">{busy ? <><Spinner /><h2>Находим видео для тебя</h2></> : <><LuVideo /><h2>{liked ? 'Твои находки будут здесь' : 'Ты посмотрел доступные ролики'}</h2><p>{liked ? 'Нажми на сердце под роликом, чтобы вернуться к нему позже.' : 'Можно вернуться к предыдущим видео или почитать текстовую ленту.'}</p></>}</div>}
        <nav className="video-feed-paging" aria-label="Перелистывание видео" data-no-swipe>
          <button type="button" aria-label="Предыдущее видео" disabled={index === 0} onClick={() => move(-1)}><LuChevronUp /></button>
          <span aria-live="polite">{busy ? 'Подбираем ещё…' : exhausted && index === items.length - 1 ? 'Пока это последний ролик' : 'Листай вверх к следующему'}</span>
          <button type="button" aria-label="Следующее видео" disabled={!item || (exhausted && index === items.length - 1)} onClick={() => move(1)}><LuChevronDown /></button>
        </nav>
        {error && <div className="feed-video-error" role="alert">{error}<button type="button" onClick={() => void load(items.length === 0)}><LuRefreshCw />Повторить</button></div>}
      </div>
    </div>
    {discussing && item && <FeedComments key={item.id} itemId={item.id} onClose={() => { setDiscussing(false); if (dirty.current && !liked) void load(false, false, true); }} onCountChange={delta => {
      const current = data.current.items.find(v => v.id === item.id);
      if (current) update({ ...current, commentsCount: Math.max(0, current.commentsCount + delta) }); dirty.current = true;
    }} />}
    {settings && preferences && <MicroFeedOnboarding preferences={preferences} onClose={() => setSettings(false)} onDone={saved => { setPreferences(saved); setSettings(false); dirty.current = true; if (!liked) void load(false, false, true); }} />}
  </main>;
}
