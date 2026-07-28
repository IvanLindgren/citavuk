import { describe, expect, it } from 'vitest';

import { insertAtCursor } from './SerbianKeyboard';

describe('insertAtCursor', () => {
  it('inserts a Serbian character at the caret', () => {
    expect(insertAtCursor('zena', 'ž', 0, 1)).toEqual({
      value: 'žena',
      cursor: 1,
    });
  });

  it('replaces a selected range and keeps Unicode offsets', () => {
    expect(insertAtCursor('djak', 'ђ', 0, 2)).toEqual({
      value: 'ђak',
      cursor: 1,
    });
  });

  it('appends when the control does not expose a selection', () => {
    expect(insertAtCursor('ku', 'ћ', null, null)).toEqual({
      value: 'kuћ',
      cursor: 3,
    });
  });
});
