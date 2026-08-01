import { describe, expect, it } from 'vitest';

import type { WordAnalysis } from '../api/analyze';
import {
  bionicSplit,
  formLabelOf,
  hasFormChoice,
  readerSelectionText,
  shouldOpenWord,
} from './WordReader';

function selection(text: string, collapsed: boolean): Selection {
  return {
    isCollapsed: collapsed,
    toString: () => text,
  } as Selection;
}

describe('shouldOpenWord', () => {
  it('opens a word after an ordinary click', () => {
    expect(shouldOpenWord(selection('', true))).toBe(true);
    expect(shouldOpenWord(null)).toBe(true);
  });

  it('does not replace a dragged text selection with a translation card', () => {
    expect(shouldOpenWord(selection('cela izabrana fraza', false))).toBe(false);
  });
});

describe('readerSelectionText', () => {
  it('collects one continuous phrase across token spans', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<p><span>Сваког</span> <span>јутра</span> <span>он</span> би читао.</p>';
    document.body.append(root);

    const words = root.querySelectorAll('span');
    const range = document.createRange();
    range.setStart(words.item(0).firstChild!, 0);
    range.setEnd(words.item(2).firstChild!, 2);

    const current = window.getSelection()!;
    current.removeAllRanges();
    current.addRange(range);

    expect(readerSelectionText(current, root)).toBe('Сваког јутра он');

    current.removeAllRanges();
    root.remove();
  });

  it('ignores a selection that leaves the reader', () => {
    const root = document.createElement('div');
    const paragraph = document.createElement('p');
    const outside = document.createElement('div');
    paragraph.textContent = 'Текст у књизи';
    outside.textContent = 'Внешняя кнопка';
    root.append(paragraph);
    document.body.append(root, outside);

    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 0);
    range.setEnd(outside.firstChild!, outside.textContent.length);

    const current = window.getSelection()!;
    current.removeAllRanges();
    current.addRange(range);

    expect(readerSelectionText(current, root)).toBeNull();

    current.removeAllRanges();
    root.remove();
    outside.remove();
  });
});

describe('выделение основы слова', () => {
  it('на выключенном уровне слово не делится', () => {
    expect(bionicSplit('кућа', 0)).toEqual(['кућа', '']);
  });

  it('делит слово в заданной пропорции', () => {
    expect(bionicSplit('написано', 2)).toEqual(['напи', 'сано']);
    expect(bionicSplit('написано', 1)).toEqual(['нап', 'исано']);
  });

  it('оставляет хотя бы одну букву в каждой части', () => {
    // Иначе короткие слова целиком уходили бы в жирный и перестали выделяться.
    expect(bionicSplit('и', 3)).toEqual(['и', '']);
    expect(bionicSplit('на', 3)).toEqual(['н', 'а']);
  });

  it('не разрывает суррогатную пару', () => {
    const [head, tail] = bionicSplit('аб\u{1F600}вг', 2);
    expect(head + tail).toBe('аб\u{1F600}вг');
    expect([...head].length + [...tail].length).toBe(5);
  });
});

describe('formLabelOf', () => {
  const base = {
    surface: 'svira',
    lemma: 'svirati',
    upos: 'VERB',
    posFull: 'глагол',
    posShort: 'глаг.',
    feats: {},
    known: true,
    facts: [],
    summary: '',
    why: '',
    paradigms: [],
  } satisfies WordAnalysis;

  it('склеивает сербские признаки формы', () => {
    expect(
      formLabelOf({
        ...base,
        facts: [
          { label: 'Лицо', value: '3-е' },
          { label: 'Число', value: 'единственное' },
        ],
      }),
    ).toBe('3-е, единственное');
  });

  it('у английского слова берёт готовую подпись формы', () => {
    expect(
      formLabelOf({
        ...base,
        english: {
          surface: 'books',
          lemma: 'book',
          upos: 'NOUN',
          posFull: 'существительное',
          posShort: 'сущ.',
          formKind: 'regular',
          facts: [],
          formLabel: 'мн. ч.',
        },
      }),
    ).toBe('мн. ч.');
  });

  it('без разбора возвращает пустую строку', () => {
    expect(formLabelOf(null)).toBe('');
  });
});

describe('hasFormChoice', () => {
  const analysis = {
    surface: 'svira',
    lemma: 'svirati',
    upos: 'VERB',
    posFull: 'глагол',
    posShort: 'глаг.',
    feats: {},
    known: true,
    facts: [],
    summary: '',
    why: '',
    paradigms: [],
  } satisfies WordAnalysis;

  it('предлагает выбор, когда форма отличается от начальной', () => {
    expect(hasFormChoice('word', 'svira', analysis)).toBe(true);
  });

  it('не предлагает выбор, когда слово и есть начальная форма', () => {
    expect(hasFormChoice('word', 'svirati', analysis)).toBe(false);
    // Регистр не создаёт мнимого выбора.
    expect(hasFormChoice('word', 'Svirati', analysis)).toBe(false);
  });

  it('у фразы начальной формы нет', () => {
    expect(hasFormChoice('phrase', 'svira neku lepu muziku', analysis)).toBe(false);
  });

  it('без разбора выбора нет', () => {
    expect(hasFormChoice('word', 'svira', null)).toBe(false);
  });
});
