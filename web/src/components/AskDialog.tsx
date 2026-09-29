import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap, useScrollLock } from '../lib/overlay';
import { Button } from './ui';

/**
 * Замена `window.prompt` и `window.confirm` в оформлении сайта.
 *
 * Вызов асинхронный и возвращает ответ, поэтому место вызова меняется на одно
 * `await`. Хост один на приложение и стоит в `App`.
 */

interface TextRequest {
  kind: 'text';
  title: string;
  initial: string;
  confirmLabel: string;
  resolve: (value: string | null) => void;
}

interface ConfirmRequest {
  kind: 'confirm';
  title: string;
  text: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (value: boolean) => void;
}

type Request = TextRequest | ConfirmRequest;

let current: Request | null = null;
const listeners = new Set<() => void>();

function show(next: Request) {
  // Второй вопрос поверх первого не нужен: первый считается отменённым.
  if (current?.kind === 'text') current.resolve(null);
  if (current?.kind === 'confirm') current.resolve(false);
  current = next;
  listeners.forEach((listener) => listener());
}

function close() {
  current = null;
  listeners.forEach((listener) => listener());
}

export function askText(
  title: string,
  options: { initial?: string; confirmLabel?: string } = {},
): Promise<string | null> {
  return new Promise((resolve) =>
    show({
      kind: 'text',
      title,
      initial: options.initial ?? '',
      confirmLabel: options.confirmLabel ?? 'Готово',
      resolve,
    }),
  );
}

export function askConfirm(
  title: string,
  options: { text?: string; confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) =>
    show({
      kind: 'confirm',
      title,
      text: options.text ?? '',
      confirmLabel: options.confirmLabel ?? 'Да',
      danger: options.danger ?? false,
      resolve,
    }),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function AskDialogHost() {
  const request = useSyncExternalStore(subscribe, () => current, () => null);

  return createPortal(
    <AnimatePresence>
      {request && <AskDialog key={request.title} request={request} />}
    </AnimatePresence>,
    document.body,
  );
}

function AskDialog({ request }: { request: Request }) {
  const panelRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(request.kind === 'text' ? request.initial : '');
  useScrollLock(true);
  useFocusTrap(true, panelRef);

  const cancel = () => {
    if (request.kind === 'text') request.resolve(null);
    else request.resolve(false);
    close();
  };

  const submit = () => {
    if (request.kind === 'text') {
      if (!value.trim()) return;
      request.resolve(value.trim());
    } else {
      request.resolve(true);
    }
    close();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <motion.div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <motion.form
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-dialog-title"
        className="w-full max-w-sm rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] p-6 shadow-[var(--shadow-lift)]"
        initial={{ y: 12, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 id="ask-dialog-title" className="text-xl leading-snug">
          {request.title}
        </h2>
        {request.kind === 'confirm' && request.text && (
          <p className="mt-2 leading-relaxed text-[var(--text-muted)]">{request.text}</p>
        )}
        {request.kind === 'text' && (
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={80}
            className="mt-4 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 outline-none transition-colors focus:border-[var(--accent)]"
          />
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={cancel}>
            Отмена
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={request.kind === 'text' && !value.trim()}
            className={request.kind === 'confirm' && request.danger ? '!bg-[var(--error)]' : ''}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </motion.form>
    </motion.div>
  );
}
