import { motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';

/**
 * Читавук разворачивает свежий номер.
 *
 * Сложенная газета прилетает ему в лапы, раскрывается на две полосы, и
 * разворот увеличивается во весь экран — под ним уже свёрстан номер.
 * Сцена идёт при каждом выходе номера: при первом открытии раздела, по
 * кнопке «Свежий номер» и при ежечасном обновлении.
 */
export function NewsPress({ date, onDone }: { date: string; onDone: () => void }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const timer = window.setTimeout(onDone, reduce ? 0 : 2700);
    return () => window.clearTimeout(timer);
  }, [onDone, reduce]);

  if (reduce) return null;

  return (
    <motion.div
      className="vesti-press"
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 2.7, times: [0, 0.08, 0.82, 1] }}
      onClick={onDone}
    >
      <motion.img
        className="vesti-press-wolf"
        src="/img/citavuk_cita.webp"
        srcSet="/img/citavuk_cita.webp 1x, /img/citavuk_cita@2x.webp 2x"
        alt=""
        initial={{ y: 60, scale: 0.85, opacity: 0 }}
        animate={{ y: [60, 0, 0, 40], scale: [0.85, 1, 1, 0.9], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 2.4, times: [0, 0.2, 0.7, 1], ease: 'easeOut' }}
      />
      <motion.div
        className="vesti-press-paper"
        initial={{ x: '60vw', y: '-40vh', rotate: 35, scale: 0.35 }}
        animate={{
          x: ['60vw', '0vw', '0vw', '0vw'],
          y: ['-40vh', '6vh', '6vh', '0vh'],
          rotate: [35, -4, 0, 0],
          scale: [0.35, 0.55, 0.62, 3.2],
        }}
        transition={{ duration: 2.5, times: [0, 0.3, 0.72, 1], ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="vesti-press-half vesti-press-left">
          <span className="vesti-press-name">Вести</span>
          <span className="vesti-press-rule" />
          <span className="vesti-press-lines" />
        </div>
        <motion.div
          className="vesti-press-half vesti-press-right"
          initial={{ rotateY: -178 }}
          animate={{ rotateY: [-178, -178, 0] }}
          transition={{ duration: 1.5, times: [0, 0.5, 1], ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="vesti-press-date">{date}</span>
          <span className="vesti-press-photo" />
          <span className="vesti-press-lines" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
