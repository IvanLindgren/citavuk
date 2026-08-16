/// Планировка квартиры Читавука.
///
/// Копия `web/src/garden/room.ts`. Устроена так же, как двор: свои пиксели,
/// предмет стоит основанием в своей точке, порядок отрисовки — по этой же
/// точке. Разница в том, что двор — поле, а квартира — две комнаты: жилая с
/// полом в доску и кухня в плитке, между ними перегородка с проходом снизу.
///
/// Предметы здесь не декорация: на каждый можно нажать и получить сербское
/// слово, а часть из них ещё и что-то делает.
library;

import 'dart:ui';

const Size roomSize = Size(224, 168);

/// Стена сверху и по бокам: ходить можно только по полу между ними.
const double floorLeft = 12;
const double floorRight = 212;
const double floorTop = 66;
const double floorBottom = 162;

/// Перегородка между жилой комнатой и кухней. Проход — ниже неё.
const Rect partition = Rect.fromLTRB(144, 56, 152, 100);

const Offset roomSpawn = Offset(20, 74);

/// Что делает предмет, кроме того что называет себя по-сербски.
enum RoomAction { radio, notebook, fridge, letters, fire, books, leave }

class RoomThing {
  const RoomThing({
    required this.id,
    required this.x,
    required this.y,
    required this.w,
    required this.h,
    required this.stand,
    this.action,
    this.wall = false,
    this.on = false,
    this.flat = false,
    this.bought = false,
  });

  /// Имя спрайта, ключ слова и ключ покупки — одно и то же.
  final String id;

  /// Середина по горизонтали и пол под предметом.
  final double x;
  final double y;
  final double w;
  final double h;

  /// Куда встаёт Читавук, чтобы дотянуться.
  final Offset stand;
  final RoomAction? action;

  /// Висит на стене: пола под ним нет.
  final bool wall;

  /// Стоит на другом предмете: своей опоры на полу нет.
  final bool on;

  /// По нему ходят: ковёр и кот не мебель.
  final bool flat;

  /// Появляется только после покупки.
  final bool bought;

  Rect get rect => Rect.fromLTRB(x - w / 2, y - h, x + w / 2, y);

  /// Стулья — два одинаковых спрайта, поэтому имя картинки не всегда равно id.
  String get sprite => id.startsWith('chair') ? 'chair' : id;
}

const List<RoomThing> roomThings = [
  // Стена.
  RoomThing(id: 'door', x: 20, y: 56, w: 16, h: 32, stand: Offset(20, 74), wall: true, action: RoomAction.leave),
  RoomThing(id: 'picture', x: 72, y: 44, w: 32, h: 32, stand: Offset(72, 110), wall: true, bought: true),
  RoomThing(id: 'window', x: 108, y: 44, w: 16, h: 32, stand: Offset(104, 102), wall: true),
  RoomThing(id: 'blackboard', x: 190, y: 40, w: 32, h: 16, stand: Offset(190, 104), wall: true, action: RoomAction.letters),

  // Жилая комната.
  RoomThing(id: 'bed', x: 48, y: 96, w: 31, h: 32, stand: Offset(48, 108)),
  RoomThing(id: 'nightstand', x: 72, y: 96, w: 11, h: 14, stand: Offset(72, 110)),
  RoomThing(id: 'radio', x: 72, y: 84, w: 11, h: 16, stand: Offset(72, 110), on: true, action: RoomAction.radio),
  RoomThing(id: 'tvstand', x: 104, y: 84, w: 32, h: 14, stand: Offset(104, 102)),
  RoomThing(id: 'tv', x: 104, y: 72, w: 32, h: 16, stand: Offset(104, 102), on: true),
  RoomThing(id: 'fireplace', x: 132, y: 88, w: 14, h: 32, stand: Offset(132, 102), action: RoomAction.fire),
  RoomThing(id: 'sofa', x: 104, y: 134, w: 32, h: 16, stand: Offset(104, 146)),
  RoomThing(id: 'rug', x: 104, y: 156, w: 32, h: 16, stand: Offset(104, 146), flat: true, bought: true),
  RoomThing(id: 'shelf', x: 16, y: 140, w: 16, h: 32, stand: Offset(16, 152), action: RoomAction.books, bought: true),
  RoomThing(id: 'desk', x: 52, y: 148, w: 32, h: 14, stand: Offset(52, 160)),
  RoomThing(id: 'notebook', x: 52, y: 138, w: 16, h: 16, stand: Offset(52, 160), on: true, action: RoomAction.notebook),
  RoomThing(id: 'lamp', x: 80, y: 152, w: 9, h: 27, stand: Offset(80, 160), bought: true),
  RoomThing(id: 'cat', x: 120, y: 160, w: 7, h: 9, stand: Offset(120, 150), flat: true, bought: true),
  RoomThing(id: 'pot', x: 136, y: 156, w: 8, h: 14, stand: Offset(136, 162), bought: true),

  // Кухня.
  RoomThing(id: 'kitchen', x: 174, y: 88, w: 39, h: 32, stand: Offset(174, 104)),
  RoomThing(id: 'fridge', x: 206, y: 88, w: 16, h: 32, stand: Offset(204, 104), action: RoomAction.fridge),
  RoomThing(id: 'table', x: 176, y: 138, w: 32, h: 14, stand: Offset(176, 158)),
  RoomThing(id: 'chair-left', x: 166, y: 152, w: 9, h: 13, stand: Offset(176, 158)),
  RoomThing(id: 'chair-right', x: 188, y: 152, w: 9, h: 13, stand: Offset(176, 158)),
];

/// Через что нельзя пройти.
///
/// Мимо мебели ходят, а не сквозь неё — иначе комната остаётся картинкой.
/// Плоское (ковёр, кот) и висящее на стене в счёт не идёт, как и то, что стоит
/// на другом предмете: у приёмника своя опора — тумба.
List<Rect> blockedRects(List<String> owned) => [
      for (final thing in roomThings)
        if (!thing.wall &&
            !thing.flat &&
            !thing.on &&
            (!thing.bought || owned.contains(thing.id)))
          thing.rect,
      partition,
    ];

List<RoomThing> visibleThings(List<String> owned) => [
      for (final thing in roomThings)
        if (!thing.bought || owned.contains(thing.id)) thing,
    ];
