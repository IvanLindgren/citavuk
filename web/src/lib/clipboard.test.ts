import { describe, expect, it } from 'vitest';

import {
  isAudioClipboardFile,
  isDocumentClipboardFile,
  payloadFromPasteEvent,
} from './clipboard';

function pasteEvent(file?: File, text = ''): ClipboardEvent {
  const data = {
    files: file ? [file] : [],
    getData: (type: string) => (type === 'text/plain' ? text : ''),
  } as unknown as DataTransfer;
  return { clipboardData: data } as ClipboardEvent;
}

describe('clipboard import', () => {
  it('prefers an audio file over a text representation', () => {
    const file = new File(['ID3'], 'serbian.mp3', { type: 'audio/mpeg' });
    const payload = payloadFromPasteEvent(pasteEvent(file, 'serbian.mp3'));
    expect(payload).toEqual({ kind: 'file', file });
    expect(isAudioClipboardFile(file)).toBe(true);
  });

  it('turns pasted text into a text payload outside editable fields', () => {
    expect(payloadFromPasteEvent(pasteEvent(undefined, 'Dobar dan.')))
      .toEqual({ kind: 'text', text: 'Dobar dan.' });
  });

  it('recognises document formats', () => {
    expect(isDocumentClipboardFile(new File(['%PDF'], 'lesson.pdf', {
      type: 'application/pdf',
    }))).toBe(true);
    expect(isDocumentClipboardFile(new File(['x'], 'voice.bin', {
      type: 'application/octet-stream',
    }))).toBe(false);
  });
});
