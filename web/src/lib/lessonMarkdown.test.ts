import {
  markdownToTheory,
  parseLessonMarkdown,
  tableMarkdown,
  theoryToMarkdown,
} from './lessonMarkdown';

describe('lesson Markdown', () => {
  it('parses GFM blocks and inline formatting without exposing markup', () => {
    const blocks = parseLessonMarkdown([
      '# Pozdrav',
      '',
      'Ovo je **važno** i {size=24}veliko{/size}.',
      '',
      '| Srpski | Ruski |',
      '| --- | --- |',
      '| kuća | дом |',
    ].join('\n'));

    expect(blocks[0]).toMatchObject({ type: 'heading', depth: 1 });
    expect(blocks[1]).toMatchObject({
      type: 'paragraph',
      content: { text: 'Ovo je važno i veliko.' },
    });
    if (blocks[1]?.type !== 'paragraph') throw new Error('paragraph expected');
    expect(blocks[1].content.marks.map((mark) => mark.kind)).toEqual(['strong', 'size']);
    expect(blocks[2]).toMatchObject({ type: 'table', header: [{ text: 'Srpski' }, { text: 'Ruski' }] });
  });

  it('keeps legacy theory blocks available for older clients', () => {
    const theory = markdownToTheory('## Glagoli\n\n- raditi\n- učiti\n\n@[video](https://youtu.be/abcdefghi)');
    expect(theory.map((block) => block.type)).toEqual(['heading', 'list', 'video']);
    expect(theory[1]).toMatchObject({ type: 'list', items: ['raditi', 'učiti'] });
  });

  it('round-trips existing tables through readable Markdown', () => {
    const rows = [['Сербский', 'Русский'], ['dobar', 'хороший']];
    const source = tableMarkdown(rows);
    const restored = theoryToMarkdown([{ id: 'table', type: 'table', rows }]);
    expect(restored).toBe(source);
    expect(markdownToTheory(source)[0]).toMatchObject({ type: 'table', rows });
  });
});
