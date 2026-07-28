type SpriteState =
  | 'idle'
  | 'thinking'
  | 'hint'
  | 'incorrect'
  | 'encourage'
  | 'correct'
  | 'lessonComplete'
  | 'checkpoint'
  | 'finalCelebration';

const STATIC_FRAME = {
  src: '/course/animations/citavuk_learning.png',
  width: 451,
  height: 512,
  sheetColumns: 2,
} as const;

export function CourseSprite({
  state = 'idle',
  size = 112,
  className = '',
}: {
  state?: SpriteState;
  size?: number;
  className?: string;
}) {
  // Пока исходные кадры заметно меняют масштаб и положение персонажа, оставляем
  // первый кадр неподвижным. `state` сохраняется в API компонента, чтобы вернуть
  // анимации после подготовки аккуратного атласа без переделки экранов.
  void state;
  const displayHeight = Math.round(size * 1.18);
  const scale = displayHeight / STATIC_FRAME.height;

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${className}`}
      style={{ width: STATIC_FRAME.width * scale, height: displayHeight }}
      role="img"
      aria-label="Волк Читавук"
    >
      <img
        src={STATIC_FRAME.src}
        alt=""
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={{
          width: STATIC_FRAME.width * STATIC_FRAME.sheetColumns * scale,
          height: STATIC_FRAME.height * 2 * scale,
          transform: 'translate(0, 0)',
        }}
      />
    </div>
  );
}
