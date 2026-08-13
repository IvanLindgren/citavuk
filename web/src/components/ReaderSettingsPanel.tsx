import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';

import {
  BIONIC_LABELS,
  FONT_LABELS,
  FONT_STACKS,
  FULL_WIDTH,
  THEME_LABELS,
  paletteFor,
  type BionicLevel,
  type ReaderFont,
  type ReaderFlow,
  type ReaderSettings,
  type ReaderTheme,
} from '../lib/readerSettings';

/**
 * Панель настроек чтения.
 *
 * Выезжает сбоку и не перекрывает текст на широком экране: смысл настройки
 * кегля в том, чтобы сразу видеть результат на своей странице, а не на
 * абстрактном образце.
 */
export function ReaderSettingsPanel({
  open,
  settings,
  onChange,
  onReset,
  onClose,
  odysseyRewardUnlocked = false,
  campaignRewardUrl = '',
}: {
  open: boolean;
  settings: ReaderSettings;
  onChange: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
  onReset: () => void;
  onClose: () => void;
  odysseyRewardUnlocked?: boolean;
  campaignRewardUrl?: string;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Подложка только на узком экране: на широком панель помещается
              рядом с текстом, и затемнять страницу незачем. */}
          <motion.button
            type="button"
            aria-label="Закрыть настройки"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          />

          <motion.aside
            initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-lift)]"
            role="dialog"
            aria-label="Настройки чтения"
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-xl">Как читать</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
              >
                <svg viewBox="0 0 20 20" className="size-5 fill-current" aria-hidden="true">
                  <path d="M6.3 5A1 1 0 004.9 6.4L8.5 10l-3.6 3.6a1 1 0 101.4 1.4L10 11.4l3.6 3.6a1 1 0 001.4-1.4L11.4 10l3.6-3.6A1 1 0 0013.6 5L10 8.6 6.4 5z" />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <Group title="Режим чтения">
                <Chips<ReaderFlow>
                  value={settings.flow}
                  options={[
                    { id: 'pages', label: 'Страницы' },
                    { id: 'scroll', label: 'Прокрутка' },
                  ]}
                  onSelect={(value) => onChange('flow', value)}
                />
              </Group>

              <Group title="Страница">
                <Chips<ReaderTheme>
                  value={settings.theme}
                  options={(
                    ['auto', 'paper', 'sepia', 'gray', 'night', 'odyssey', 'campaign100'] as const
                  ).map((id) => ({
                    id,
                    label: (id === 'odyssey' && !odysseyRewardUnlocked) ||
                      (id === 'campaign100' && !campaignRewardUrl)
                        ? `${THEME_LABELS[id]} · закрыто`
                        : THEME_LABELS[id],
                    swatch: paletteFor(id)?.background,
                    swatchImage: id === 'campaign100' && campaignRewardUrl
                      ? `url(${JSON.stringify(campaignRewardUrl)})`
                      : paletteFor(id)?.backgroundImage,
                    disabled: (id === 'odyssey' && !odysseyRewardUnlocked) ||
                      (id === 'campaign100' && !campaignRewardUrl),
                    title: id === 'campaign100'
                      ? 'Награда за участие в акции «Первые 100 читателей»'
                      : id === 'odyssey'
                        ? 'Награда за завершение события «Одиссея»'
                        : undefined,
                  }))}
                  onSelect={(value) => onChange('theme', value)}
                />
              </Group>

              <Group title="Шрифт">
                <Chips<ReaderFont>
                  value={settings.font}
                  options={(['lora', 'serif', 'sans'] as const).map((id) => ({
                    id,
                    label: FONT_LABELS[id],
                    font: FONT_STACKS[id],
                  }))}
                  onSelect={(value) => onChange('font', value)}
                />
              </Group>

              <Slider
                label="Размер"
                value={settings.fontSize}
                min={14}
                max={32}
                step={1}
                format={(v) => `${v} px`}
                onChange={(value) => onChange('fontSize', value)}
              />
              <Slider
                label="Межстрочный интервал"
                value={settings.lineHeight}
                min={1.2}
                max={2.4}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(value) => onChange('lineHeight', value)}
              />
              <Slider
                label="Разрядка"
                value={settings.letterSpacing}
                min={-0.5}
                max={2}
                step={0.1}
                format={(v) => `${v.toFixed(1)} px`}
                onChange={(value) => onChange('letterSpacing', value)}
              />
              <Slider
                label="Отступ между абзацами"
                value={settings.paragraphSpacing}
                min={0}
                max={48}
                step={2}
                format={(v) => `${v} px`}
                onChange={(value) => onChange('paragraphSpacing', value)}
              />
              <Slider
                label="Красная строка"
                value={settings.firstLineIndent}
                min={0}
                max={64}
                step={4}
                format={(v) => (v === 0 ? 'нет' : `${v} px`)}
                onChange={(value) => onChange('firstLineIndent', value)}
              />
              <Slider
                label="Ширина колонки"
                value={settings.maxWidth}
                min={480}
                max={FULL_WIDTH}
                step={20}
                format={(v) =>
                  v >= FULL_WIDTH ? 'во всю ширину' : `${v} px`
                }
                onChange={(value) => onChange('maxWidth', value)}
              />

              <Group title="Выделение основы слова">
                <Chips<BionicLevel>
                  value={settings.bionic}
                  options={([0, 1, 2, 3] as const).map((id) => ({
                    id,
                    label: BIONIC_LABELS[id],
                  }))}
                  onSelect={(value) => onChange('bionic', value)}
                />
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                  Начало слова набирается жирным. На чужом языке это помогает
                  узнавать корень, не вчитываясь в длинное окончание.
                </p>
              </Group>

              <Group title="Ударения">
                <Toggle
                  label="Ставить знаки ударения"
                  checked={settings.stress}
                  onChange={(value) => onChange('stress', value)}
                />
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                  Над ударной буквой появляется знак прямо в тексте. Там, где
                  ударение неизвестно, читалка ничего не добавляет.
                </p>
              </Group>

              <Toggle
                label="Выключка по ширине"
                checked={settings.justify}
                onChange={(value) => onChange('justify', value)}
              />
              <Toggle
                label="Звук перелистывания"
                checked={settings.sound}
                onChange={(value) => onChange('sound', value)}
              />
              <Toggle
                label="Анимация страницы"
                checked={settings.animate}
                onChange={(value) => onChange('animate', value)}
              />
            </div>

            <div className="border-t border-[var(--line)] px-5 py-4">
              <button
                type="button"
                onClick={onReset}
                className="text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
              >
                Вернуть как было
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function Chips<T extends string | number>({
  value,
  options,
  onSelect,
}: {
  value: T;
  options: Array<{
    id: T;
    label: string;
    swatch?: string;
    swatchImage?: string;
    font?: string;
    disabled?: boolean;
    title?: string;
  }>;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={String(option.id)}
          type="button"
          onClick={() => onSelect(option.id)}
          disabled={option.disabled}
          title={option.disabled ? option.title : undefined}
          style={option.font ? { fontFamily: option.font } : undefined}
          className={[
            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
            value === option.id
              ? 'bg-[var(--accent)] text-parchment'
              : 'bg-[var(--bg-sunken)] text-[var(--text-muted)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-55',
          ].join(' ')}
        >
          {option.swatch && (
            <span
              className="size-3.5 rounded-full border border-[var(--line)]"
              style={{
                background: option.swatch,
                backgroundImage: option.swatchImage,
                backgroundSize: option.swatchImage ? '26px 21px' : undefined,
              }}
              aria-hidden="true"
            />
          )}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </span>
        <span className="text-sm tabular-nums text-[var(--text)]">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm font-semibold">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 accent-[var(--accent)]"
      />
    </label>
  );
}
