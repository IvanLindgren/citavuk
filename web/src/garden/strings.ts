/**
 * Все сербские надписи сада в одном месте.
 *
 * Игра говорит по-сербски — в этом её смысл, — но каждая надпись несёт русское
 * пояснение: без него новичок A1 не поймёт, на что нажимает. Письмо кириллица;
 * если решим перейти на латиницу, правится только этот файл.
 */

export interface Phrase {
  sr: string;
  ru: string;
}

export const GARDEN = {
  title: { sr: 'Башта Читавука', ru: 'Сад Читавука' },
  coins: { sr: 'цветни динари', ru: 'цветочные динары' },
  plant: { sr: 'Посади', ru: 'посадить' },
  water: { sr: 'Залиј', ru: 'полить' },
  shop: { sr: 'Продавница семена', ru: 'магазин семян' },
  empty: { sr: 'Празна леја', ru: 'пустая грядка' },
  board: { sr: 'Најбољи баштовани', ru: 'лучшие садоводы' },
  neighbours: { sr: 'Комшије', ru: 'соседи' },
  helpNeighbour: { sr: 'Залиј комшији', ru: 'полить соседу' },
  speed: { sr: 'Брзина раста', ru: 'скорость роста' },
  earnings: { sr: 'Данашња зарада', ru: 'заработок за сегодня' },
  bloomed: { sr: 'Процветало', ru: 'распустилось' },
  myName: { sr: 'Име баштована', ru: 'имя садовода' },
  openGarden: { sr: 'Отвори башту комшијама', ru: 'показывать сад другим' },
  save: { sr: 'Сачувај', ru: 'сохранить' },
  practise: { sr: 'Вежбај', ru: 'позаниматься' },
  find: { sr: 'Нађи баштована', ru: 'найти садовода' },
  growing: { sr: 'Гаји', ru: 'выращивает' },
  nobody: { sr: 'Нема никога', ru: 'никого не нашлось' },
} as const;

/** Стадии роста. Последняя — распустившийся цветок. */
export const STAGES: Phrase[] = [
  { sr: 'семе', ru: 'семя' },
  { sr: 'клица', ru: 'росток' },
  { sr: 'стабљика', ru: 'стебель' },
  { sr: 'пупољак', ru: 'бутон' },
  { sr: 'цвет', ru: 'цветок' },
];

/**
 * Какая доля цветка видна на этой стадии.
 *
 * Цветок растёт обрезкой снизу вверх: у подсолнуха и ромашки стебель длинный, а
 * головка сверху, поэтому он буквально поднимается из земли, и отдельные
 * картинки на каждую стадию не нужны.
 */
export function stageHeight(stage: number, stages: number): number {
  if (stages <= 1) return 100;
  const steps = [12, 34, 62, 84, 100];
  const index = Math.min(Math.max(stage, 0), Math.min(stages, steps.length) - 1);
  return steps[index] ?? 100;
}

export function plantImage(species: string): string {
  return `/img/garden/plant_${species}.webp`;
}

/** Смещение семени в атласе `garden_seeds.webp`. */
export function seedOffset(species: string, catalog: readonly { id: string }[]): number {
  const index = catalog.findIndex((item) => item.id === species);
  return index < 0 ? 0 : index;
}

export function coinWord(count: number): string {
  const tail = Math.abs(count) % 100;
  if (tail >= 11 && tail <= 14) return 'динаров';
  switch (tail % 10) {
    case 1:
      return 'динар';
    case 2:
    case 3:
    case 4:
      return 'динара';
    default:
      return 'динаров';
  }
}
