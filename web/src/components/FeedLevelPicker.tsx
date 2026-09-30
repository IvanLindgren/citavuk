import { MICRO_FEED_LEVELS } from '../api/microFeed';
import { validFeedLevel, type FeedLevel } from '../lib/feedLevel';
import './feed-level-picker.css';

const descriptions: Record<FeedLevel, string> = { A1: 'Начальный', A2: 'Базовый', B1: 'Средний', B2: 'Продвинутый', C1: 'Свободный' };
export function FeedLevelPicker({ value, onChange, automatic }: {
  value?: FeedLevel; onChange: (value: FeedLevel | undefined) => void; automatic?: FeedLevel;
}) {
  return <label className="feed-level-picker"><span>Уровень</span>
    <select aria-label="Уровень Вукотока" title="Меняет только ленту, не уровень аккаунта" value={value ?? ''} onKeyDown={event => event.stopPropagation()} onChange={event => onChange(validFeedLevel(event.target.value) ? event.target.value : undefined)}>
      <option value="">Авто{automatic ? ` (${automatic})` : ''}</option>
      {MICRO_FEED_LEVELS.map(level => <option key={level} value={level}>{level} — {descriptions[level]}</option>)}
    </select>
  </label>;
}
