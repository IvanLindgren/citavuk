import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/garden/walk.dart';
import 'package:srbski_read/garden/world.dart';

void main() {
  const area = WalkArea(minX: 0, maxX: 100, minY: 0, maxY: 100, speed: 100);

  test('идущий не выходит за край двора', () {
    final walker = Walker(area, const Offset(50, 50))..press(WalkKey.right);
    for (var step = 0; step < 30; step++) {
      walker.advance(const Duration(milliseconds: 40));
    }
    expect(walker.point.dx, lessThanOrEqualTo(100));
    expect(walker.facing, 1);
  });

  test('мимо мебели ходят, а не сквозь неё', () {
    const room = WalkArea(
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 100,
      speed: 100,
      blocked: [Rect.fromLTRB(40, 0, 60, 100)],
    );
    final walker = Walker(room, const Offset(20, 50))..press(WalkKey.right);
    for (var step = 0; step < 40; step++) {
      walker.advance(const Duration(milliseconds: 40));
    }
    // Стена во всю высоту: пройти сквозь неё нельзя ни прямо, ни в обход.
    expect(walker.point.dx, lessThanOrEqualTo(40));
  });

  test('дойдя до цели, Читавук делает то, зачем шёл', () {
    var done = false;
    final walker = Walker(area, const Offset(10, 10))
      ..moveTo(const Offset(12, 10), action: () => done = true);
    // Первый кадр доводит до места, второй — замечает, что дошли.
    walker.advance(const Duration(milliseconds: 40));
    walker.advance(const Duration(milliseconds: 40));
    expect(done, isTrue);
    expect(walker.moving, isFalse);
  });

  test('вертикальному экрану достаётся вертикальная карта', () {
    expect(pickLayout(const Size(1200, 700)).id, 'wide');
    expect(pickLayout(const Size(390, 844)).id, 'tall');
  });

  test('масштаб мира идёт половинками и не мельчит', () {
    final scale = worldScale(wideLayout, const Size(1400, 900));
    expect(scale, greaterThanOrEqualTo(2));
    expect(scale * 2, scale * 2 == (scale * 2).roundToDouble() ? scale * 2 : -1);
    // На маленьком экране карта важнее целого пикселя.
    expect(worldScale(tallLayout, const Size(320, 500)), greaterThan(0.7));
  });

  test('грядок в раскладке хватает на все двенадцать', () {
    expect(wideLayout.beds.length, 12);
    expect(tallLayout.beds.length, 12);
  });
}
