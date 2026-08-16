/// Все сербские надписи сада в одном месте.
///
/// Копия `web/src/garden/strings.ts`: сад один, и подписи в приложении обязаны
/// совпадать с сайтом слово в слово. Игра говорит по-сербски — в этом её
/// смысл, — но каждая надпись несёт русское пояснение: без него новичок A1 не
/// поймёт, на что нажимает.
library;

class Phrase {
  const Phrase(this.sr, this.ru);

  final String sr;
  final String ru;
}

class Garden {
  const Garden._();

  static const title = Phrase('Башта Читавука', 'Сад Читавука');
  static const coins = Phrase('цветни динари', 'цветочные динары');
  static const plant = Phrase('Посади', 'посадить');
  static const water = Phrase('Залиј', 'полить');
  static const shop = Phrase('Продавница семена', 'магазин семян');
  static const empty = Phrase('Празна леја', 'пустая грядка');
  static const board = Phrase('Најбољи баштовани', 'лучшие садоводы');
  static const neighbours = Phrase('Комшије', 'соседи');
  static const helpNeighbour = Phrase('Залиј комшији', 'полить соседу');
  static const speed = Phrase('Брзина раста', 'скорость роста');
  static const earnings = Phrase('Данашња зарада', 'заработок за сегодня');
  static const bloomed = Phrase('Процветало', 'распустилось');
  static const myName = Phrase('Име баштована', 'имя садовода');
  static const openGarden = Phrase('Отвори башту комшијама', 'показывать сад другим');
  static const save = Phrase('Сачувај', 'сохранить');
  static const practise = Phrase('Вежбај', 'позаниматься');
  static const find = Phrase('Нађи баштована', 'найти садовода');
  static const growing = Phrase('Гаји', 'выращивает');
  static const nobody = Phrase('Нема никога', 'никого не нашлось');

  static const can = Phrase('Канта за воду', 'лейка');
  static const fill = Phrase('Захвати воду', 'набрать воды');
  static const riverAwake = Phrase('Река тече', 'река проснулась');
  static const riverDry = Phrase('Река спава', 'река спит');
  static const cut = Phrase('Убери цвет', 'срезать цветок');
  static const herbarium = Phrase('Хербаријум', 'гербарий');
  static const task = Phrase('Задатак дана', 'задание дня');
  static const done = Phrase('Урађено', 'сделано');
  static const rain = Phrase('Киша', 'дождь');
  static const clear = Phrase('Сунчано', 'ясно');
  static const night = Phrase('Ноћ', 'ночь');

  static const enter = Phrase('Уђи у кућу', 'войти в дом');
  static const leave = Phrase('Изађи', 'выйти во двор');
  static const home = Phrase('Код куће', 'дома');
  static const radio = Phrase('Радио', 'радиоприёмник');
  static const radioOn = Phrase('Упали', 'включить');
  static const radioOff = Phrase('Угаси', 'выключить');
  static const furnish = Phrase('Уреди кућу', 'обставить дом');
  static const notebook = Phrase('Свеска речи', 'тетрадь со словами');
  static const buy = Phrase('Купи', 'купить');
  static const owned = Phrase('Купљено', 'куплено');
  static const fridgeOpen = Phrase('Шта има у фрижидеру', 'что в холодильнике');
  static const letters = Phrase('Ћирилица и латиница', 'кириллица и латиница');
  static const fireOn = Phrase('Ватра гори', 'огонь горит');
  static const fireOff = Phrase('Ватра се угасила', 'огонь погас');
  static const toBooks = Phrase('Отвори књиге', 'открыть материалы');
}

/// Подписи предметов двора. Ради них сад и затевался: сербское слово должно
/// попадаться там, где человек и так смотрит, а не в списке слов.
const Map<String, Phrase> worldWords = {
  'house': Phrase('кућа', 'дом'),
  'tree': Phrase('дрво', 'дерево'),
  'fir': Phrase('јела', 'ель'),
  'fountain': Phrase('фонтана', 'фонтан'),
  'campfire': Phrase('ватра', 'костёр'),
  'river': Phrase('река', 'река'),
  'bed': Phrase('леја', 'грядка'),
  'fence': Phrase('ограда', 'забор'),
  'stall': Phrase('продавница', 'магазин'),
  'duck': Phrase('патка', 'утка'),
  'flowers': Phrase('цвеће', 'цветы'),
  'bushes': Phrase('жбуње', 'кусты'),
  'pots': Phrase('саксије', 'горшки'),
  'sign': Phrase('путоказ', 'указатель'),
};

/// Вещи в квартире. Ради них дом и открывается.
const Map<String, Phrase> houseWords = {
  'door': Phrase('врата', 'дверь'),
  'window': Phrase('прозор', 'окно'),
  'picture': Phrase('слика', 'картина'),
  'blackboard': Phrase('табла', 'доска'),
  'bed': Phrase('кревет', 'кровать'),
  'nightstand': Phrase('ноћни сточић', 'тумбочка'),
  'radio': Phrase('радио', 'радиоприёмник'),
  'tvstand': Phrase('комода', 'комод'),
  'tv': Phrase('телевизор', 'телевизор'),
  'fireplace': Phrase('камин', 'камин'),
  'sofa': Phrase('кауч', 'диван'),
  'rug': Phrase('тепих', 'ковёр'),
  'shelf': Phrase('полица', 'полка'),
  'desk': Phrase('радни сто', 'письменный стол'),
  'notebook': Phrase('свеска', 'тетрадь'),
  'lamp': Phrase('лампа', 'лампа'),
  'cat': Phrase('мачка', 'кошка'),
  'pot': Phrase('саксија', 'горшок с цветком'),
  'kitchen': Phrase('кухиња', 'кухня'),
  'fridge': Phrase('фрижидер', 'холодильник'),
  'table': Phrase('сто', 'стол'),
  'chair-left': Phrase('столица', 'стул'),
  'chair-right': Phrase('столица', 'стул'),
};

/// Что лежит в холодильнике: первая сербская еда, которую видишь в магазине.
const List<Phrase> fridgeWords = [
  Phrase('млеко', 'молоко'),
  Phrase('сир', 'сыр'),
  Phrase('јаја', 'яйца'),
  Phrase('хлеб', 'хлеб'),
  Phrase('јогурт', 'йогурт'),
  Phrase('кајмак', 'каймак'),
  Phrase('паприка', 'перец'),
  Phrase('сок', 'сок'),
];

/// Сербский алфавит на доске: кириллица и латиница буква в букву.
const List<List<String>> alphabet = [
  ['А а', 'A a'], ['Б б', 'B b'], ['В в', 'V v'], ['Г г', 'G g'], ['Д д', 'D d'],
  ['Ђ ђ', 'Đ đ'], ['Е е', 'E e'], ['Ж ж', 'Ž ž'], ['З з', 'Z z'], ['И и', 'I i'],
  ['Ј ј', 'J j'], ['К к', 'K k'], ['Л л', 'L l'], ['Љ љ', 'Lj lj'], ['М м', 'M m'],
  ['Н н', 'N n'], ['Њ њ', 'Nj nj'], ['О о', 'O o'], ['П п', 'P p'], ['Р р', 'R r'],
  ['С с', 'S s'], ['Т т', 'T t'], ['Ћ ћ', 'Ć ć'], ['У у', 'U u'], ['Ф ф', 'F f'],
  ['Х х', 'H h'], ['Ц ц', 'C c'], ['Ч ч', 'Č č'], ['Џ џ', 'Dž dž'], ['Ш ш', 'Š š'],
];

/// Стадии роста. Последняя — распустившийся цветок.
const List<Phrase> growthStages = [
  Phrase('семе', 'семя'),
  Phrase('клица', 'росток'),
  Phrase('стабљика', 'стебель'),
  Phrase('пупољак', 'бутон'),
  Phrase('цвет', 'цветок'),
];

/// Задание дня по-сербски. Цель подставляется числом.
Phrase taskPhrase(String kind, int target) => switch (kind) {
      'water' => Phrase('Залиј леје: $target', 'полей грядки: $target'),
      'plant' => Phrase('Посади цвет: $target', 'посади цветок: $target'),
      'cut' => Phrase('Убери цвет: $target', 'срежь цветок: $target'),
      'help' => Phrase('Залиј комшији: $target', 'полей соседу: $target'),
      _ => Garden.task,
    };

/// «динар», «динара», «динаров» — как в русском, по последней цифре.
String coinWord(int count) {
  final tail = count.abs() % 100;
  if (tail >= 11 && tail <= 14) return 'динаров';
  return switch (tail % 10) {
    1 => 'динар',
    2 || 3 || 4 => 'динара',
    _ => 'динаров',
  };
}
