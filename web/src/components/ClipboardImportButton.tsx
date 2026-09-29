import { useEffect, useState } from 'react';
import { LuClipboardPaste } from 'react-icons/lu';

import {
  payloadFromPasteEvent,
  readClipboardPayload,
  type ClipboardPayload,
} from '../lib/clipboard';
import { Button, Spinner } from './ui';

export function ClipboardImportButton({
  disabled = false,
  onPayload,
  onError,
  listenForPaste = true,
  label = 'Вставить из буфера',
}: {
  disabled?: boolean;
  onPayload: (payload: ClipboardPayload) => void;
  onError?: (error: unknown) => void;
  listenForPaste?: boolean;
  label?: string;
}) {
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!listenForPaste) return;
    const onPaste = (event: ClipboardEvent) => {
      if (disabled) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      const payload = payloadFromPasteEvent(event);
      if (!payload) return;
      event.preventDefault();
      onPayload(payload);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [disabled, listenForPaste, onPayload]);

  const read = async () => {
    if (disabled || reading) return;
    setReading(true);
    try {
      const payload = await readClipboardPayload();
      if (!payload) throw new Error('В буфере нет текста или поддерживаемого файла.');
      onPayload(payload);
    } catch (error) {
      onError?.(error);
    } finally {
      setReading(false);
    }
  };

  return (
    <Button type="button" variant="secondary" disabled={disabled || reading} onClick={() => void read()}>
      {reading ? <Spinner className="size-4" /> : <LuClipboardPaste />}
      {reading ? 'Читаем буфер' : label}
    </Button>
  );
}
