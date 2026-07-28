import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * Подсказка поверх страницы, пока пользователь тянет файл.
 *
 * Показывается на весь экран, потому что и зона броска — весь экран. Без такой
 * подсказки человек целится в маленькую карточку, промахивается, и браузер
 * открывает файл вместо импорта.
 */
export function DropOverlay({
  visible,
  title = 'Отпустите файл',
  hint = 'TXT, PDF, DOCX, FB2, EPUB или DjVu',
}: {
  visible: boolean;
  title?: string;
  hint?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          // Слой не должен перехватывать события: если он окажется целью
          // перетаскивания, событие drop уйдёт ему, а не окну.
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-[var(--bg)]/85 backdrop-blur-sm"
          aria-hidden="true"
        >
          <motion.div
            initial={reduceMotion ? false : { scale: 0.94, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mx-5 flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-[var(--accent)] bg-[var(--bg-raised)] px-10 py-12 text-center shadow-[var(--shadow-lift)]"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-12 fill-[var(--accent)]"
              aria-hidden="true"
            >
              <path d="M12 2a1 1 0 011 1v10.6l3.3-3.3a1 1 0 011.4 1.4l-5 5a1 1 0 01-1.4 0l-5-5a1 1 0 111.4-1.4l3.3 3.3V3a1 1 0 011-1zM4 18a1 1 0 011 1v1h14v-1a1 1 0 112 0v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1a1 1 0 011-1z" />
            </svg>
            <div>
              <p className="font-display text-2xl font-bold">{title}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{hint}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
