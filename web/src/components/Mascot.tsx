import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/** Позы маскотов, доступные в вебе. Файлы готовит scripts/prepare-assets.py. */
export type MascotPose =
  | 'citavuk_zdravo'
  | 'citavuk_gram'
  | 'citavuk_rule'
  | 'citavuk_povtor'
  | 'citavuk_ukaz'
  | 'citavuk_english'
  | 'citavuk_vukotok'
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
/** Что Читавук отвечает на поглаживание. Берётся по кругу, а не случайно. */
const PET_REPLIES = [
  'Ой, спасибо! Я так тебя люблю! ❤️',
  'Мур... то есть — ав! 🐺',
  'Ещё разок, и я замурлычу.',
  'Хвалю за перерыв. Читать дальше?',
];

export function Mascot({
  pose,
  alt,
  className = '',
  width,
  float = false,
  priority = false,
  pet = true,
}: {
  pose: MascotPose;
  alt: string;
  className?: string;
  width?: number;
  /** Медленное покачивание — маскот выглядит живым, а не наклейкой. */
  float?: boolean;
  /** Изображение видно сразу при загрузке страницы и не должно быть ленивым. */
  priority?: boolean;
  /**
   * Читавука можно погладить: он отвечает и на секунду меняет позу.
   *
   * В приложении так было с самого начала (`wolf_mascot.dart`), а на сайте
   * маскот был картинкой. Это единственное место, где продукт про грамматику
   * позволяет себе просто порадовать, и терять его на вебе незачем.
   */
  pet?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [petting, setPetting] = useState(false);
  const replyIndex = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  const shown = petting ? 'citavuk_zdravo' : pose;
  const image = (
    <img
      src={`/img/${shown}.webp`}
      srcSet={`/img/${shown}.webp 1x, /img/${shown}@2x.webp 2x`}
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

  // Слухао — орёл, и «погладить» к нему не относится. Позу «zdravo» он бы всё
  // равно не показал: она Читавукова.
  const pettable = pet && pose.startsWith('citavuk');

  const body = !float || reduceMotion
    ? (float ? <div className={pettable ? '' : className}>{image}</div> : image)
    : (
      <motion.div
        className={pettable ? '' : className}
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {image}
      </motion.div>
    );

  if (!pettable) return body;

  function onPet() {
    if (petting) return;
    replyIndex.current = (replyIndex.current + 1) % PET_REPLIES.length;
    setPetting(true);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPetting(false), 2600);
  }

  return (
    <span className={`relative inline-block ${float ? className : ''}`}>
      <button
        type="button"
        onClick={onPet}
        aria-label="Погладить Читавука"
        title="Погладить"
        className={`block cursor-pointer border-0 bg-transparent p-0 ${float ? 'w-full' : className}`}
      >
        <motion.span
          className="block"
          animate={petting && !reduceMotion ? { scale: [1, 1.06, 1], rotate: [0, -3, 3, 0] } : {}}
          transition={{ duration: .6 }}
        >
          {body}
        </motion.span>
      </button>
      <AnimatePresence>
        {petting && (
          <motion.span
            role="status"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute -top-2 left-1/2 z-10 w-max max-w-[14rem] -translate-x-1/2 -translate-y-full rounded-2xl bg-[var(--bg-raised)] px-3 py-2 text-center font-sans text-xs font-semibold leading-snug text-[var(--text)] shadow-[var(--shadow-lift)] ring-1 ring-[var(--line)]"
          >
            {PET_REPLIES[replyIndex.current]}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
