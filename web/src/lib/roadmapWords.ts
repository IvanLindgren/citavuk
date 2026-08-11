/**
 * Пример к слову: фраза, перевод и место самого слова в каждой из них.
 *
 * Слово помечено звёздочками — `Naša *mačka* spava.` Так его видно и в
 * сербской фразе, где оно стоит в падеже, и в русском переводе, где иначе его
 * не найти: русской морфологии у нас нет, а «кошка» в тексте может оказаться
 * «кошку» или «кошке».
 *
 * Раньше здесь стоял генератор заглушек («Ovo je …», «Sutra ću …»). Он ушёл:
 * в списке из трёхсот слов подряд шли триста одинаковых конструкций, и вместо
 * употребления слова читатель видел форму самой заглушки.
 */

/** Кусок фразы: обычный текст либо само слово. */
export interface ExamplePart {
  text: string;
  target: boolean;
}

const MARK = /\*([^*]+)\*/;

/**
 * Разбирает размеченную фразу на части.
 *
 * Помечается ровно одно место — так пишет сборщик (tools/build_roadmap_examples.py)
 * и так проверяет его валидатор. Если разметки нет, фраза возвращается целиком
 * без выделения: старые записи и то, что автор добавил руками, должны
 * показываться, а не пропадать.
 */
export function splitExample(phrase: string): ExamplePart[] {
  const source = phrase.trim();
  if (!source) return [];
  const match = MARK.exec(source);
  if (!match || match.index === undefined) return [{ text: source, target: false }];

  const parts: ExamplePart[] = [];
  const before = source.slice(0, match.index);
  const after = source.slice(match.index + match[0].length);
  if (before) parts.push({ text: before, target: false });
  parts.push({ text: match[1] ?? '', target: true });
  if (after) parts.push({ text: after, target: false });
  return parts;
}

/** Фраза без разметки — для мест, где выделение не показать (карточки словаря). */
export function plainExample(phrase: string): string {
  return phrase.replace(/\*/g, '').trim();
}

/** Само помеченное слово. Пусто, если разметки нет. */
export function exampleTarget(phrase: string): string {
  return MARK.exec(phrase)?.[1]?.trim() ?? '';
}
