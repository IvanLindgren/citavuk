import { useEffect, useRef, useState } from 'react';
import { LuPlay } from 'react-icons/lu';

import { videoThumbUrl } from '../api/news';

/**
 * Ролик YouTube, который грузится только по нажатию.
 *
 * До нажатия на странице лишь обложка, полученная через наш сервер: плеер
 * YouTube тянет мегабайты скриптов и сообщает Google о каждом посетителе,
 * даже если ролик так и не запустят.
 */
export function LiteYouTube({
  id,
  title,
  className = '',
  onPlay,
  watchedAfter = 45,
  onWatched,
}: {
  id: string;
  title: string;
  className?: string;
  onPlay?: () => void;
  /** Через сколько секунд после запуска ролик считается просмотренным. */
  watchedAfter?: number;
  onWatched?: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const watched = useRef(onWatched);
  watched.current = onWatched;

  useEffect(() => {
    if (!playing || !watched.current) return;
    const timer = window.setTimeout(() => watched.current?.(), watchedAfter * 1000);
    return () => window.clearTimeout(timer);
  }, [playing, watchedAfter]);

  useEffect(() => setPlaying(false), [id]);

  return (
    <div className={`lite-yt ${className}`}>
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&hl=sr&cc_load_policy=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setPlaying(true);
            onPlay?.();
          }}
          aria-label={`Смотреть: ${title}`}
        >
          <img src={videoThumbUrl(id)} alt="" loading="lazy" decoding="async" />
          <span className="lite-yt-play" aria-hidden="true">
            <LuPlay />
          </span>
        </button>
      )}
    </div>
  );
}
