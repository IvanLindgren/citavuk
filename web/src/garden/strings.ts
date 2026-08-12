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

  can: { sr: 'Канта за воду', ru: 'лейка' },
  fill: { sr: 'Захвати воду', ru: 'набрать воды' },
  riverAwake: { sr: 'Река тече', ru: 'река проснулась' },
  riverDry: { sr: 'Река спава', ru: 'река спит' },
  cut: { sr: 'Убери цвет', ru: 'срезать цветок' },
  herbarium: { sr: 'Хербаријум', ru: 'гербарий' },
  task: { sr: 'Задатак дана', ru: 'задание дня' },
  done: { sr: 'Урађено', ru: 'сделано' },
  rain: { sr: 'Киша', ru: 'дождь' },
  clear: { sr: 'Сунчано', ru: 'ясно' },
  night: { sr: 'Ноћ', ru: 'ночь' },

  enter: { sr: 'Уђи у кућу', ru: 'войти в дом' },
  leave: { sr: 'Изађи', ru: 'выйти во двор' },
  home: { sr: 'Код куће', ru: 'дома' },
  radio: { sr: 'Радио', ru: 'радиоприёмник' },
  radioOn: { sr: 'Упали', ru: 'включить' },
  radioOff: { sr: 'Угаси', ru: 'выключить' },
  tuning: { sr: 'Тражи станицу', ru: 'ищет станцию' },
  noSignal: { sr: 'Не хвата', ru: 'станция не отвечает' },
  furnish: { sr: 'Уреди кућу', ru: 'обставить дом' },
  notebook: { sr: 'Свеска речи', ru: 'тетрадь со словами' },
  buy: { sr: 'Купи', ru: 'купить' },
  owned: { sr: 'Купљено', ru: 'куплено' },
  fridgeOpen: { sr: 'Шта има у фрижидеру', ru: 'что в холодильнике' },
  letters: { sr: 'Ћирилица и латиница', ru: 'кириллица и латиница' },
  fireOn: { sr: 'Ватра гори', ru: 'огонь горит' },
  fireOff: { sr: 'Ватра се угасила', ru: 'огонь погас' },
  toBooks: { sr: 'Отвори књиге', ru: 'открыть материалы' },
} as const;

/**
 * Вещи в квартире. Ради них дом и открывается: сербское слово попадается там,
 * где человек и так нажимает, — как подписи предметов во дворе.
 */
export const HOUSE: Record<string, Phrase> = {
  door: { sr: 'врата', ru: 'дверь' },
  window: { sr: 'прозор', ru: 'окно' },
  picture: { sr: 'слика', ru: 'картина' },
  blackboard: { sr: 'табла', ru: 'доска' },
  bed: { sr: 'кревет', ru: 'кровать' },
  nightstand: { sr: 'ноћни сточић', ru: 'тумбочка' },
  radio: { sr: 'радио', ru: 'радиоприёмник' },
  tvstand: { sr: 'комода', ru: 'комод' },
  tv: { sr: 'телевизор', ru: 'телевизор' },
  fireplace: { sr: 'камин', ru: 'камин' },
  sofa: { sr: 'кауч', ru: 'диван' },
  rug: { sr: 'тепих', ru: 'ковёр' },
  shelf: { sr: 'полица', ru: 'полка' },
  desk: { sr: 'радни сто', ru: 'письменный стол' },
  notebook: { sr: 'свеска', ru: 'тетрадь' },
  lamp: { sr: 'лампа', ru: 'лампа' },
  cat: { sr: 'мачка', ru: 'кошка' },
  pot: { sr: 'саксија', ru: 'горшок с цветком' },
  kitchen: { sr: 'кухиња', ru: 'кухня' },
  fridge: { sr: 'фрижидер', ru: 'холодильник' },
  table: { sr: 'сто', ru: 'стол' },
  'chair-left': { sr: 'столица', ru: 'стул' },
  'chair-right': { sr: 'столица', ru: 'стул' },
};

/** Что лежит в холодильнике: первая сербская еда, которую видишь в магазине. */
export const FRIDGE: Phrase[] = [
  { sr: 'млеко', ru: 'молоко' },
  { sr: 'сир', ru: 'сыр' },
  { sr: 'јаја', ru: 'яйца' },
  { sr: 'хлеб', ru: 'хлеб' },
  { sr: 'јогурт', ru: 'йогурт' },
  { sr: 'кајмак', ru: 'каймак' },
  { sr: 'паприка', ru: 'перец' },
  { sr: 'сок', ru: 'сок' },
];

/**
 * Сербский алфавит на доске: кириллица и латиница буква в букву.
 *
 * В Сербии пишут и так, и так, и вывеска на улице может быть любой. Таблица
 * висит в комнате, потому что это первое, обо что спотыкается новичок.
 */
export const ALPHABET: [string, string][] = [
  ['А а', 'A a'], ['Б б', 'B b'], ['В в', 'V v'], ['Г г', 'G g'], ['Д д', 'D d'],
  ['Ђ ђ', 'Đ đ'], ['Е е', 'E e'], ['Ж ж', 'Ž ž'], ['З з', 'Z z'], ['И и', 'I i'],
  ['Ј ј', 'J j'], ['К к', 'K k'], ['Л л', 'L l'], ['Љ љ', 'Lj lj'], ['М м', 'M m'],
  ['Н н', 'N n'], ['Њ њ', 'Nj nj'], ['О о', 'O o'], ['П п', 'P p'], ['Р р', 'R r'],
  ['С с', 'S s'], ['Т т', 'T t'], ['Ћ ћ', 'Ć ć'], ['У у', 'U u'], ['Ф ф', 'F f'],
  ['Х х', 'H h'], ['Ц ц', 'C c'], ['Ч ч', 'Č č'], ['Џ џ', 'Dž dž'], ['Ш ш', 'Š š'],
];

/**
 * Подписи предметов мира. Ради них сад и затевался: сербское слово должно
 * попадаться там, где человек и так смотрит, а не в списке слов.
 */
export const WORLD: Record<string, Phrase> = {
  house: { sr: 'кућа', ru: 'дом' },
  tree: { sr: 'дрво', ru: 'дерево' },
  fir: { sr: 'јела', ru: 'ель' },
  fountain: { sr: 'фонтана', ru: 'фонтан' },
  campfire: { sr: 'ватра', ru: 'костёр' },
  river: { sr: 'река', ru: 'река' },
  bed: { sr: 'леја', ru: 'грядка' },
  fence: { sr: 'ограда', ru: 'забор' },
  stall: { sr: 'продавница', ru: 'магазин' },
  duck: { sr: 'патка', ru: 'утка' },
  flowers: { sr: 'цвеће', ru: 'цветы' },
  bushes: { sr: 'жбуње', ru: 'кусты' },
  pots: { sr: 'саксије', ru: 'горшки' },
  sign: { sr: 'путоказ', ru: 'указатель' },
};

/** Задание дня по-сербски. Цель подставляется числом. */
export function taskPhrase(kind: string, target: number): Phrase {
  switch (kind) {
    case 'water':
      return { sr: `Залиј леје: ${target}`, ru: `полей грядки: ${target}` };
    case 'plant':
      return { sr: `Посади цвет: ${target}`, ru: `посади цветок: ${target}` };
    case 'cut':
      return { sr: `Убери цвет: ${target}`, ru: `срежь цветок: ${target}` };
    case 'help':
      return { sr: `Залиј комшији: ${target}`, ru: `полей соседу: ${target}` };
    default:
      return { sr: 'Задатак дана', ru: 'задание дня' };
  }
}

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

export function plantImage(species: string, stage?: number): string {
  if (stage !== undefined) {
    return `/img/garden/world/plant_${species}_${Math.min(4, Math.max(0, stage))}.webp`;
  }
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
