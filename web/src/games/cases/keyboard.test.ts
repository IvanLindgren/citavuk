import { describe, expect, it } from 'vitest';

import { inputFromKeyboard, pawForKey, textFromInput } from './keyboard';

const press = (key: string, code: string) => inputFromKeyboard({ key, code, ctrlKey: false, metaKey: false, altKey: false });

describe('клавиатура машинки', () => {
  it('русская раскладка печатает латиницу по месту клавиши', () => {
    expect(press('к', 'KeyR')).toEqual({ kind: 'text', text: 'r' });
    expect(press('х', 'BracketLeft')).toEqual({ kind: 'text', text: 'š' });
    expect(press('ж', 'Semicolon')).toEqual({ kind: 'text', text: 'č' });
  });

  it('сербская раскладка отдаёт буквы как есть', () => {
    expect(press('č', 'Semicolon')).toEqual({ kind: 'text', text: 'č' });
    expect(press('ћ', 'Quote')).toEqual({ kind: 'text', text: 'ć' });
    expect(press('љ', 'KeyQ')).toEqual({ kind: 'text', text: 'lj' });
  });

  it('служебные клавиши и сочетания', () => {
    expect(press('Backspace', 'Backspace')).toEqual({ kind: 'backspace' });
    expect(press('Enter', 'Enter')).toEqual({ kind: 'enter' });
    expect(press(' ', 'Space')).toEqual({ kind: 'text', text: ' ' });
    expect(inputFromKeyboard({ key: 'c', code: 'KeyC', ctrlKey: true, metaKey: false, altKey: false })).toBeNull();
    expect(press('Shift', 'ShiftLeft')).toBeNull();
  });

  it('экранная клавиатура: кириллица переводится, лишнее отбрасывается', () => {
    expect(textFromInput('Љубав!')).toBe('ljubav');
    expect(textFromInput('kuće')).toBe('kuće');
  });

  it('лапа выбирается по половине ряда', () => {
    expect(pawForKey('q')).toBe('left');
    expect(pawForKey('t')).toBe('left');
    expect(pawForKey('z')).toBe('right');
    expect(pawForKey('đ')).toBe('right');
    expect(pawForKey('b')).toBe('left');
    expect(pawForKey('n')).toBe('right');
  });
});
