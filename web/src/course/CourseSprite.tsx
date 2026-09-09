import { BoneMascot } from './BoneMascot';

type SpriteState = 'idle' | 'thinking' | 'hint' | 'incorrect' | 'encourage' | 'correct' | 'lessonComplete' | 'checkpoint' | 'finalCelebration';

export function CourseSprite({ state = 'idle', size = 112, className = '' }: { state?: SpriteState; size?: number; className?: string }) {
  return <BoneMascot state={state} size={size} className={className} />;
}
