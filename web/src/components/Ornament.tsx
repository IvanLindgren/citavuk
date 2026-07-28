import { motion, useReducedMotion } from 'framer-motion';

/**
 * Орнамент-разделитель в стиле сербской вышивки крестиком: ряд ромбов с
 * квадратом внутри.
 *
 * Повторяет `OrnamentDivider` из приложения, но рисуется как SVG и умеет
 * «вышиваться» при появлении в поле зрения — контур обводится линией, ромбы
 * проступают по очереди.
 */
export function Ornament({
  className = '',
  count = 9,
  animated = true,
}: {
  className?: string;
  count?: number;
  animated?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const play = animated && !reduceMotion;

  const size = 26;
  const radius = size * 0.42;
  const step = radius * 2.4;
  const width = step * count;
  const centerY = size / 2;

  const diamonds = Array.from({ length: count }, (_, index) => {
    const cx = step / 2 + index * step;
    return {
      key: index,
      path: `M ${cx} ${centerY - radius} L ${cx + radius} ${centerY} L ${cx} ${centerY + radius} L ${cx - radius} ${centerY} Z`,
      cx,
    };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${size}`}
      width="100%"
      height={size}
      className={className}
      // Орнамент — украшение. Экранному диктору он не нужен и только мешает.
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {diamonds.map(({ key, path, cx }) => (
        <g key={key}>
          <motion.path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            initial={play ? { pathLength: 0, opacity: 0 } : false}
            whileInView={play ? { pathLength: 1, opacity: 1 } : undefined}
            viewport={{ once: true, margin: '-40px' }}
            transition={{
              duration: 0.5,
              // Ромбы проступают волной от левого края — так разделитель
              // читается как вышивка, а не как появившаяся целиком картинка.
              delay: key * 0.045,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
          <motion.rect
            x={cx - radius * 0.17}
            y={centerY - radius * 0.17}
            width={radius * 0.34}
            height={radius * 0.34}
            className="fill-indigo-deep dark:fill-gold"
            initial={play ? { scale: 0, opacity: 0 } : false}
            whileInView={play ? { scale: 1, opacity: 1 } : undefined}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.3, delay: key * 0.045 + 0.2 }}
            style={{ transformOrigin: `${cx}px ${centerY}px` }}
          />
        </g>
      ))}
    </svg>
  );
}
