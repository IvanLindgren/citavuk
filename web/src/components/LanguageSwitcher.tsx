import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuGlobe } from 'react-icons/lu';

import {
  glossLang,
  LANGUAGES,
  setLanguages,
  uiLang,
  type GlossLang,
  type Lang,
} from '../lib/i18n';

const GLOSSES: { id: GlossLang; name: string }[] = [
  { id: 'ru', name: 'Русский' },
  { id: 'en', name: 'English' },
];

/** Плавно гасит страницу перед перезагрузкой на другом языке. */
function apply(lang: Lang, gloss: GlossLang) {
  document.documentElement.style.transition = 'opacity .18s ease';
  document.documentElement.style.opacity = '0';
  window.setTimeout(() => setLanguages(lang, gloss), 180);
}

/**
 * Язык сайта и язык перевода слов. Названия языков — на них самих и не
 * переводятся: «English» ищут глазами, а не «Английский».
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const lang = uiLang();
  const gloss = glossLang();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Язык сайта"
        title="Язык сайта"
        className="lang-switch inline-flex h-9 items-center gap-1 rounded-xl px-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
      >
        <motion.span
          className="grid place-items-center"
          animate={open ? { rotate: 180 } : { rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <LuGlobe className="size-[18px]" aria-hidden="true" />
        </motion.span>
        {!compact && (
          <span className="text-xs font-bold max-[380px]:hidden" translate="no">
            {LANGUAGES.find((item) => item.id === lang)?.short}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Язык сайта"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-2 shadow-[var(--shadow-lift)]"
          >
            <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
              Язык сайта
            </p>
            {LANGUAGES.map((item, index) => (
              <motion.button
                key={item.id}
                type="button"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * index, duration: 0.2 }}
                onClick={() => {
                  setOpen(false);
                  if (item.id !== lang) apply(item.id, item.id === 'en' ? 'en' : 'ru');
                }}
                className={[
                  'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition-colors',
                  item.id === lang ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'hover:bg-[var(--bg-sunken)]',
                ].join(' ')}
              >
                <span className="grid h-6 w-8 place-items-center rounded-md bg-[var(--bg-sunken)] text-[10px] font-black" translate="no">
                  {item.short}
                </span>
                <span className="flex-1" translate="no">{item.name}</span>
                {item.id === lang && <LuCheck className="size-4" aria-hidden="true" />}
              </motion.button>
            ))}

            <div className="mx-2 my-2 h-px bg-[var(--line)]" />
            <p className="px-2 pb-1 text-[11px] font-semibold text-[var(--text-muted)]">
              Перевод слов
            </p>
            <div className="grid grid-cols-2 gap-1 p-1">
              {GLOSSES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (item.id !== gloss) apply(lang, item.id);
                  }}
                  className={[
                    'rounded-xl px-2 py-2 text-sm font-semibold transition-colors',
                    item.id === gloss
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-sunken)] hover:bg-[var(--line)]',
                  ].join(' ')}
                  translate="no"
                >
                  {item.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
