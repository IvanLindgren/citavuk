import { useEffect, useRef, useState } from 'react';
import { LuExternalLink, LuHeart, LuMessageCircle, LuPause, LuPlay, LuSettings2, LuThumbsDown, LuVolumeX, LuVolume2 } from 'react-icons/lu';
import { recordMicroFeedInteraction, type MicroFeedItem, type MicroFeedReaction } from '../api/microFeed';
import { activeStorageName } from '../lib/db';
import { VideoWatch } from '../lib/videoWatch';
import { useAuth } from '../state/auth';

export function FeedVideoCard({ item, paused, muted, onMuted, onChange, onDiscuss, onSignal, registerFlush }: {
  item: MicroFeedItem; paused: boolean; muted: boolean;
  onMuted: (muted: boolean) => void;
  onChange: (item: MicroFeedItem) => void;
  onDiscuss: () => void;
  onSignal: () => void;
  registerFlush: (flush: (() => Promise<void>) | null) => void;
}) {
  const { account } = useAuth();
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState(-1);
  const [error, setError] = useState('');
  const [playbackError, setPlaybackError] = useState(false);
  const [nativeControls, setNativeControls] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);
  const reacting = useRef(false);
  const live = useRef({ paused, muted });
  live.current = { paused, muted };
  const watch = useRef(new VideoWatch());
  const duration = useRef(item.videoDuration ?? 0);
  const send = (action: string, value?: boolean) => frame.current?.contentWindow?.postMessage({ type: 'citavuk-control', action, value }, location.origin);

  useEffect(() => {
    const tracker = new VideoWatch(); watch.current = tracker;
    const owner = activeStorageName();
    let ready = false;
    const flush = async () => {
      const events = tracker.finish(performance.now(), duration.current);
      if (owner !== activeStorageName()) return;
      for (const e of events) await recordMicroFeedInteraction(item.id, e.event, e.dwellMs);
    };
    registerFlush(flush);
    const message = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow || e.data?.type !== 'citavuk-video' || e.data.id !== item.videoId) return;
      if (e.data.ready && !ready) {
        ready = true; send('mute', live.current.muted);
        if (live.current.paused || document.hidden) send('pause');
      }
      if (typeof e.data.duration === 'number' && Number.isFinite(e.data.duration) && e.data.duration > 0) duration.current = e.data.duration;
      if (typeof e.data.state !== 'number') return;
      const next = e.data.state; setState(next);
      if (next === 1) setPlaybackError(false);
      if (next === 1 && !document.hidden && !live.current.paused) tracker.playing(performance.now());
      else tracker.pause(performance.now());
      if (next === 1 && (document.hidden || live.current.paused)) send('pause');
      if (next === -2) { tracker.fail(performance.now()); setPlaybackError(true); }
    };
    const visibility = () => {
      if (document.hidden) { tracker.pause(performance.now()); send('pause'); }
    };
    window.addEventListener('message', message);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      registerFlush(null); tracker.pause(performance.now()); void flush().catch(() => {});
      window.removeEventListener('message', message);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [item.id, item.videoId, registerFlush]);

  useEffect(() => { if (paused) { watch.current.pause(performance.now()); send('pause'); } }, [paused]);
  useEffect(() => { send('mute', muted); }, [muted]);
  useEffect(() => {
    // Если пользователь перешёл к нативным кнопкам плеера, не перекрываем
    // раскрытые субтитры/настройки невидимым обработчиком паузы.
    const focusPlayer = () => {
      if (document.activeElement === frame.current) setNativeControls(true);
    };
    window.addEventListener('blur', focusPlayer);
    return () => window.removeEventListener('blur', focusPlayer);
  }, []);

  async function react(value: 1 | -1) {
    if (reacting.current) return;
    reacting.current = true; setReactionBusy(true); setError('');
    const owner = activeStorageName();
    const next: MicroFeedReaction = item.reaction === value ? 0 : value;
    try {
      await recordMicroFeedInteraction(item.id, next === 0 ? 'reaction_cleared' : next === 1 ? 'like' : 'dislike');
      if (owner !== activeStorageName()) return;
      onChange({ ...item, reaction: next, likesCount: Math.max(0, item.likesCount + (account ? Number(next === 1) - Number(item.reaction === 1) : 0)) });
      onSignal();
    } catch { if (owner === activeStorageName()) setError('Реакция не сохранилась. Попробуй ещё раз.'); }
    finally { reacting.current = false; setReactionBusy(false); }
  }

  return <article className="feed-video-card" data-video-id={item.id}>
    <div className="feed-video-screen">
      <iframe ref={frame} src={`/video-player.html?v=${encodeURIComponent(item.videoId ?? '')}&feed=1`}
        title={item.titleLatin} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      {/* Шапка и нижние кнопки YouTube доступны. В паузе/после конца нативный
          плеер доступен целиком, включая ссылки и рекомендации YouTube. */}
      {!nativeControls && state === 1 && <button type="button" className="feed-video-gesture" aria-label="Приостановить видео" onClick={() => send('pause')} />}
    </div>
    <div className="feed-video-controls" data-no-swipe>
      <button type="button" aria-label={state === 1 ? 'Пауза' : 'Воспроизвести'} onClick={() => send(state === 1 ? 'pause' : 'play')} disabled={paused}>{state === 1 ? <LuPause /> : <LuPlay />}</button>
      <button type="button" aria-label={muted ? 'Включить звук' : 'Выключить звук'} aria-pressed={!muted} onClick={() => onMuted(!muted)}>{muted ? <LuVolumeX /> : <LuVolume2 />}</button>
      <span>{playbackError ? 'YouTube не воспроизводит ролик' : state === -1 ? 'Загружаем видео…' : state === 5 ? 'Нажми воспроизвести' : `Сербская речь, ${Math.floor((item.videoDuration ?? 0) / 60)}:${String((item.videoDuration ?? 0) % 60).padStart(2, '0')}`}</span>
      <button type="button" aria-label="Управление YouTube" title="Все кнопки YouTube, без перехвата жестов" aria-pressed={nativeControls} onClick={() => setNativeControls(!nativeControls)}><LuSettings2 /></button>
    </div>
    <div className="feed-video-caption">
      <div className="feed-video-byline"><span>{item.sourceTitle}</span><span>{item.cefr}</span><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">YouTube <LuExternalLink /></a></div>
      <h1>{item.titleLatin}</h1>
    </div>
    <div className="feed-video-actions" data-no-swipe aria-label="Реакции в Читавуке">
      <button type="button" aria-label="Нравится" aria-pressed={item.reaction === 1} disabled={reactionBusy} onClick={() => void react(1)}><LuHeart fill={item.reaction === 1 ? 'currentColor' : 'none'} /><span>Нравится{item.likesCount > 0 ? ` ${item.likesCount}` : ''}</span></button>
      <button type="button" onClick={onDiscuss} aria-label="Комментарии"><LuMessageCircle /><span>Обсудить{item.commentsCount > 0 ? ` ${item.commentsCount}` : ''}</span></button>
      <button type="button" aria-label="Меньше такого" aria-pressed={item.reaction === -1} disabled={reactionBusy} onClick={() => void react(-1)}><LuThumbsDown /><span>Не моё</span></button>
    </div>
    {error && <p className="feed-video-error" role="alert">{error}</p>}
    {playbackError && <p className="feed-video-error" role="status">Этот ролик не воспроизводится. Открой его на YouTube или листай дальше.</p>}
  </article>;
}
