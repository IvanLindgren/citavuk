import { LuBookOpen, LuVideo } from 'react-icons/lu';
import { Link } from '../lib/router';
import './feed-mode-nav.css';

/** Два вида одной ленты, а не отдельный эксперимент рядом с Вукотоком. */
export function FeedModeNav({ mode }: { mode: 'text' | 'video' }) {
  return <nav className="feed-mode-nav" aria-label="Режим Вукотока">
    <Link to="/vukotok" aria-current={mode === 'text' ? 'page' : undefined}><LuBookOpen />Тексты</Link>
    <Link to="/vukotok/video" aria-current={mode === 'video' ? 'page' : undefined}><LuVideo />Видео</Link>
  </nav>;
}
