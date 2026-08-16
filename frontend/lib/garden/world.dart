/// Карта Башты в мировых пикселях.
///
/// Копия `web/src/garden/world.ts`: раскладка одна на сайт и приложение, иначе
/// один и тот же сад стоял бы по-разному. У мира собственный размер в
/// пикселях, всё остальное — производное от него.
///
/// Раскладки две. Телефон держат вертикально, и растягивать на него ту же
/// карту, что на ноутбук, нечестно: получится либо мышиный масштаб, либо каша.
library;

import 'dart:ui';

/// Размер спрайта в мировых пикселях.
class Sprite {
  const Sprite(this.w, this.h);

  final double w;
  final double h;
}

const Map<String, Sprite> sprites = {
  'bushes': Sprite(86, 32),
  'campfire': Sprite(26, 27),
  'fence': Sprite(29, 32),
  'fir': Sprite(46, 91),
  'flowers': Sprite(48, 16),
  'fountain': Sprite(46, 60),
  'house': Sprite(124, 131),
  'pots': Sprite(48, 13),
  'sign': Sprite(13, 16),
  'stall': Sprite(48, 42),
  'tree': Sprite(64, 90),
  'tree_small': Sprite(48, 64),
};

class WorldItem {
  const WorldItem({
    required this.name,
    required this.sprite,
    required this.x,
    required this.y,
    this.quiet = false,
  });

  /// Ключ подписи в [worldWords]. Пусто — предмет молчит.
  final String name;
  final String sprite;

  /// Середина предмета по горизонтали.
  final double x;

  /// Земля под предметом: рисунок растёт вверх от неё.
  final double y;

  /// Предмет без подписи: забор и цветочки в траве — фон, а не слово.
  final bool quiet;

  Rect get rect {
    final size = sprites[sprite] ?? const Sprite(16, 16);
    return Rect.fromLTRB(x - size.w / 2, y - size.h, x + size.w / 2, y);
  }
}

class Layout {
  const Layout({
    required this.id,
    required this.w,
    required this.h,
    required this.river,
    required this.items,
    required this.beds,
    required this.door,
    required this.spawn,
  });

  final String id;
  final double w;
  final double h;

  /// Высота реки: выше неё земли нет.
  final double river;
  final List<WorldItem> items;
  final List<Offset> beds;

  /// Куда встаёт Читавук, чтобы войти в дом.
  final Offset door;
  final Offset spawn;
}

/// Грядка — два тайла земли.
const Sprite bedSprite = Sprite(32, 16);

const double _river = 64;

const Layout wideLayout = Layout(
  id: 'wide',
  w: 448,
  h: 240,
  river: _river,
  items: [
    WorldItem(name: 'house', sprite: 'house', x: 82, y: 200),
    WorldItem(name: 'fence', sprite: 'fence', x: 162, y: 200, quiet: true),
    WorldItem(name: 'pots', sprite: 'pots', x: 48, y: 216, quiet: true),
    WorldItem(name: 'stall', sprite: 'stall', x: 172, y: 236),
    WorldItem(name: 'campfire', sprite: 'campfire', x: 72, y: 240),
    WorldItem(name: 'sign', sprite: 'sign', x: 210, y: 214),
    WorldItem(name: 'fountain', sprite: 'fountain', x: 222, y: 132),
    WorldItem(name: 'tree', sprite: 'tree_small', x: 206, y: 190),
    WorldItem(name: 'fir', sprite: 'fir', x: 418, y: 160),
    WorldItem(name: 'tree', sprite: 'tree', x: 404, y: 238),
    WorldItem(name: 'flowers', sprite: 'flowers', x: 26, y: 238, quiet: true),
    WorldItem(name: 'flowers', sprite: 'flowers', x: 262, y: 100, quiet: true),
    WorldItem(name: 'flowers', sprite: 'flowers', x: 420, y: 196, quiet: true),
  ],
  beds: [
    Offset(268, 132), Offset(312, 132), Offset(356, 132),
    Offset(268, 166), Offset(312, 166), Offset(356, 166),
    Offset(268, 200), Offset(312, 200), Offset(356, 200),
    Offset(268, 234), Offset(312, 234), Offset(356, 234),
  ],
  door: Offset(82, 210),
  spawn: Offset(122, 214),
);

const Layout tallLayout = Layout(
  id: 'tall',
  w: 192,
  h: 384,
  river: _river,
  items: [
    WorldItem(name: 'house', sprite: 'house', x: 70, y: 200),
    WorldItem(name: 'fountain', sprite: 'fountain', x: 166, y: 140),
    WorldItem(name: 'fence', sprite: 'fence', x: 152, y: 206, quiet: true),
    WorldItem(name: 'stall', sprite: 'stall', x: 32, y: 228),
    WorldItem(name: 'campfire', sprite: 'campfire', x: 110, y: 228),
    WorldItem(name: 'sign', sprite: 'sign', x: 176, y: 214),
    WorldItem(name: 'flowers', sprite: 'flowers', x: 40, y: 108, quiet: true),
    WorldItem(name: 'flowers', sprite: 'flowers', x: 150, y: 108, quiet: true),
  ],
  beds: [
    Offset(34, 250), Offset(96, 250), Offset(158, 250),
    Offset(34, 284), Offset(96, 284), Offset(158, 284),
    Offset(34, 318), Offset(96, 318), Offset(158, 318),
    Offset(34, 352), Offset(96, 352), Offset(158, 352),
  ],
  door: Offset(70, 212),
  spawn: Offset(108, 236),
);

/// Куда встают ягодные кусты: они появляются только после покупки.
const Map<String, WorldItem> bushSpot = {
  'wide': WorldItem(name: 'bushes', sprite: 'bushes', x: 340, y: 100),
  'tall': WorldItem(name: 'bushes', sprite: 'bushes', x: 140, y: 170),
};

/// Вертикальный экран получает вертикальную карту.
///
/// Порог взят с запасом от квадрата: планшет в портрете — уже телефонная
/// карта, ноутбук — всегда широкая.
Layout pickLayout(Size size) {
  if (size.width <= 0 || size.height <= 0) return wideLayout;
  return size.width / size.height >= 1.15 ? wideLayout : tallLayout;
}

/// Во сколько раз мир крупнее своих пикселей. Масштаб идёт половинками.
double worldScale(Layout layout, Size size) {
  final fit = (size.width / layout.w) < (size.height / layout.h)
      ? size.width / layout.w
      : size.height / layout.h;
  if (!fit.isFinite || fit <= 0) return 2;
  if (fit >= 2) {
    final half = (fit * 2).floorToDouble() / 2;
    return half > 6 ? 6 : half;
  }
  final small = (fit * 100).floorToDouble() / 100;
  return small < 0.75 ? 0.75 : small;
}

Rect bedRect(Offset point) => Rect.fromLTRB(
      point.dx - bedSprite.w / 2,
      point.dy - bedSprite.h,
      point.dx + bedSprite.w / 2,
      point.dy,
    );
