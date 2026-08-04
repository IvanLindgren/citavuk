// СОЗДАНО АВТОМАТИЧЕСКИ — не править руками.
//
// Источник: web/src/palace/scenes.tsx
// Обновить: cd web && npx vite-node scripts/export-palace.tsx
//
// Здесь только подписи и координаты предметов. Сами комнаты лежат картинками
// в assets/palace/ и выгружаются тем же скриптом, поэтому рисунок и координаты
// не могут разойтись: они получены из одного источника за один проход.

/// Размер комнаты в её собственных координатах. Экранный размер получается
/// масштабированием, а координаты предметов остаются этими.
const double sceneWidth = 1000;
const double sceneHeight = 620;

/// Место в комнате, куда вешается слово.
class PalaceSpot {
  const PalaceSpot(this.id, this.label, this.ru, this.x, this.y);

  final String id;

  /// Подпись по-сербски: место запоминается вместе со своим названием.
  final String label;

  /// Перевод подписи — раздел всё-таки для тех, кто язык учит.
  final String ru;

  final double x;
  final double y;
}

/// Комната дворца.
class PalaceScene {
  const PalaceScene(this.id, this.title, this.subtitle, this.asset, this.spots);

  final String id;
  final String title;
  final String subtitle;
  final String asset;
  final List<PalaceSpot> spots;
}

/// Комната по идентификатору. Возвращает null, если сцены с таким именем нет:
/// дворец мог быть построен в версии, где комнат было больше.
PalaceScene? sceneById(String id) {
  for (final scene in palaceScenes) {
    if (scene.id == id) return scene;
  }
  return null;
}

const List<PalaceScene> palaceScenes = [
  PalaceScene(
    'kuhinja',
    'Кухня',
    'Кухиња',
    'assets/palace/kuhinja.svg',
    [
      PalaceSpot('prozor', 'прозор', 'окно', 165, 150),
      PalaceSpot('frizider', 'фрижидер', 'холодильник', 390, 300),
      PalaceSpot('polica', 'полица', 'полка', 640, 150),
      PalaceSpot('lampa', 'лампа', 'лампа', 860, 130),
      PalaceSpot('sto', 'сто', 'стол', 620, 440),
      PalaceSpot('stolica', 'столица', 'стул', 840, 430),
      PalaceSpot('sesir', 'шоља', 'чашка', 578, 404),
      PalaceSpot('cvet', 'цвет', 'цветок', 120, 440),
    ],
  ),
  PalaceScene(
    'dnevna',
    'Гостиная',
    'Дневна соба',
    'assets/palace/dnevna.svg',
    [
      PalaceSpot('prozor', 'прозор', 'окно', 140, 160),
      PalaceSpot('sat', 'сат', 'часы', 500, 120),
      PalaceSpot('polica', 'полица за књиге', 'книжная полка', 830, 260),
      PalaceSpot('kauc', 'кауч', 'диван', 430, 430),
      PalaceSpot('televizor', 'телевизор', 'телевизор', 250, 250),
      PalaceSpot('lampa', 'подна лампа', 'торшер', 700, 400),
      PalaceSpot('macka', 'мачка', 'кошка', 596, 528),
      PalaceSpot('slika', 'слика', 'картина', 680, 130),
    ],
  ),
  PalaceScene(
    'ulica',
    'Улица',
    'Улица',
    'assets/palace/ulica.svg',
    [
      PalaceSpot('pekara', 'пекара', 'пекарня', 170, 300),
      PalaceSpot('tramvaj', 'трамвај', 'трамвай', 690, 350),
      PalaceSpot('fenjer', 'фењер', 'фонарь', 430, 330),
      PalaceSpot('klupa', 'клупа', 'скамейка', 300, 500),
      PalaceSpot('drvo', 'дрво', 'дерево', 540, 400),
      PalaceSpot('kiosk', 'киоск', 'киоск', 900, 400),
      PalaceSpot('cesma', 'чесма', 'колонка', 120, 500),
      PalaceSpot('golub', 'голуб', 'голубь', 640, 520),
    ],
  ),
];
