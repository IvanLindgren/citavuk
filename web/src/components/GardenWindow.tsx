import type { ReactNode } from 'react';
import { LuX } from 'react-icons/lu';

/**
 * Окно сада: табличка на деревянной раме.
 *
 * Живёт отдельным файлом, потому что окон стало несколько и они открываются из
 * разных мест — со двора и из комнаты.
 */
export function GardenWindow({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <section
        className="garden-game-window max-h-[86dvh] w-full max-w-3xl overflow-y-auto p-4 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b-2 border-[#b7844e] pb-3">
          <h2 className="font-display text-xl font-bold sm:text-2xl">{title}</h2>
          <button
            type="button"
            className="ml-auto grid size-10 place-items-center border-2 border-[#8c5b37] bg-[#f5dfaa]"
            onClick={onClose}
            aria-label="Закрыть"
            title="Закрыть"
          >
            <LuX />
          </button>
        </header>
        <div className="pt-4">{children}</div>
      </section>
    </div>
  );
}
