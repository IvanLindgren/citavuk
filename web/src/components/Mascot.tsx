import { motion, useReducedMotion } from 'framer-motion';

/** Позы маскотов, доступные в вебе. Файлы готовит scripts/prepare-assets.py. */
export type MascotPose =
  | 'citavuk_zdravo'
  | 'citavuk_gram'
  | 'citavuk_rule'
  | 'citavuk_povtor'
  | 'citavuk_ukaz'
  | 'citavuk_english'
  | 'sluhao_zdravo'
  | 'sluhao_slusa'
  | 'sluhao_savet';

/**
 * Маскот приложения: волк Читавук или черногорский орёл Слухао.
 *
 * Картинка отдаётся в двух плотностях — на экранах Retina однократный размер
 * выглядит мыльным, а грузить двойной всем подряд значит удвоить трафик без
 * пользы. Выбор делает сам браузер по `srcset`.
 */
export function Mascot({
  pose,
  alt,
  className = '',
  width,
  float = false,
  priority = false,
}: {
  pose: MascotPose;
  alt: string;
  className?: string;
  width?: number;
  /** Медленное покачивание — маскот выглядит живым, а не наклейкой. */
  float?: boolean;
  /** Изображение видно сразу при загрузке страницы и не должно быть ленивым. */
  priority?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  const image = (
    <img
      src={`/img/${pose}.webp`}
      srcSet={`/img/${pose}.webp 1x, /img/${pose}@2x.webp 2x`}
      alt={alt}
      width={width}
      className={float ? 'h-auto w-full' : className}
      loading={priority ? 'eager' : 'lazy'}
      // fetchpriority подсказывает браузеру начать загрузку героя раньше
      // остальных картинок — это заметно ускоряет первый показ.
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      draggable={false}
    />
  );

  if (!float || reduceMotion) {
    return float ? <div className={className}>{image}</div> : image;
  }

  return (
    <motion.div
      className={className}
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      {image}
    </motion.div>
  );
}
