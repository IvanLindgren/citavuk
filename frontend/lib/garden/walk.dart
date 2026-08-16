/// Ходьба Читавука по саду и по комнате.
///
/// Копия `web/src/garden/walk.ts`: снаружи он ходит по земле между рекой и
/// нижним краем карты, внутри — по полу между стеной и порогом. Разница только
/// в границах, поэтому счёт живёт здесь, а не в сцене.
library;

import 'dart:math' as math;
import 'dart:ui';

class WalkArea {
  const WalkArea({
    required this.minX,
    required this.maxX,
    required this.minY,
    required this.maxY,
    required this.speed,
    this.blocked = const [],
  });

  final double minX;
  final double maxX;
  final double minY;
  final double maxY;

  /// Пикселей мира в секунду.
  final double speed;

  /// Мебель и стены: сквозь них не ходят. Во дворе пусто.
  final List<Rect> blocked;
}

enum WalkKey { left, right, up, down }

/// Куда идёт Читавук и что сделает, когда дойдёт.
class _Destination {
  const _Destination(this.point, this.action);

  final Offset point;
  final VoidCallback? action;
}

class Walker {
  Walker(this._area, Offset spawn) : _point = spawn;

  WalkArea _area;
  Offset _point;
  _Destination? _destination;
  final Set<WalkKey> _pressed = {};
  bool _moving = false;
  int _facing = 1;

  Offset get point => _point;
  bool get moving => _moving;

  /// 1 — смотрит вправо, -1 — влево.
  int get facing => _facing;

  /// Смена области — это другое место: старые координаты в нём ничего не значат.
  void enter(WalkArea area, Offset spawn) {
    _area = area;
    _destination = null;
    _pressed.clear();
    _point = _clamp(spawn);
    _moving = false;
  }

  void moveTo(Offset target, {VoidCallback? action}) {
    _destination = _Destination(_clamp(target), action);
  }

  void press(WalkKey key) {
    _destination = null;
    _pressed.add(key);
  }

  void release(WalkKey key) => _pressed.remove(key);

  void releaseAll() => _pressed.clear();

  /// Один кадр. Возвращает true, если картинку надо перерисовать.
  bool advance(Duration elapsed) {
    final seconds = math.min(40, elapsed.inMilliseconds) / 1000;
    final before = _point;
    final wasMoving = _moving;
    final wasFacing = _facing;

    var dx = (_pressed.contains(WalkKey.right) ? 1.0 : 0.0) -
        (_pressed.contains(WalkKey.left) ? 1.0 : 0.0);
    var dy = (_pressed.contains(WalkKey.down) ? 1.0 : 0.0) -
        (_pressed.contains(WalkKey.up) ? 1.0 : 0.0);
    var active = dx != 0 || dy != 0;

    if (active) {
      final length = math.sqrt(dx * dx + dy * dy);
      dx /= length;
      dy /= length;
      _point = _step(
        _point,
        dx * _area.speed * seconds,
        dy * _area.speed * seconds,
      );
    } else {
      final target = _destination;
      if (target != null) {
        final gap = target.point - _point;
        final distance = gap.distance;
        if (distance < 2) {
          _point = target.point;
          _destination = null;
          target.action?.call();
        } else {
          active = true;
          final length = math.min(distance, _area.speed * 1.15 * seconds);
          dx = gap.dx / distance;
          dy = gap.dy / distance;
          final moved = _step(_point, dx * length, dy * length, gap);
          // Упёрся в мебель и не сдвинулся — значит, дошёл как мог.
          if (moved == _point) _destination = null;
          _point = moved;
        }
      }
    }

    if (dx != 0) _facing = dx < 0 ? -1 : 1;
    _moving = active;
    return _point != before || _moving != wasMoving || _facing != wasFacing;
  }

  /// Шаг с обходом мебели.
  ///
  /// Если прямой путь занят, пробуем те же движения по одной оси: так Читавук
  /// скользит вдоль дивана, а не встаёт перед ним намертво. Дальше цели по
  /// своей оси при этом не уходит, иначе начинает топтаться.
  Offset _step(Offset from, double dx, double dy, [Offset? gap]) {
    final length = math.sqrt(dx * dx + dy * dy);
    final gapX = gap?.dx.abs() ?? double.infinity;
    final gapY = gap?.dy.abs() ?? double.infinity;
    final tries = <Offset>[
      Offset(from.dx + dx, from.dy + dy),
      Offset(from.dx + _sign(dx) * math.min(length, gapX), from.dy),
      Offset(from.dx, from.dy + _sign(dy) * math.min(length, gapY)),
    ];
    for (final candidate in tries) {
      final point = _clamp(candidate);
      // Шаг в ноль — не шаг: иначе идущий в стену дёргается на месте вечно.
      if (point == from) continue;
      if (!_occupied(point)) return point;
    }
    return from;
  }

  bool _occupied(Offset point) => _area.blocked.any((rect) =>
      point.dx > rect.left &&
      point.dx < rect.right &&
      point.dy > rect.top &&
      point.dy < rect.bottom);

  Offset _clamp(Offset point) => Offset(
        point.dx.clamp(_area.minX, _area.maxX),
        point.dy.clamp(_area.minY, _area.maxY),
      );

  static double _sign(double value) => value == 0 ? 0 : (value < 0 ? -1 : 1);
}

/// Клавиша движения: стрелки и WASD, как на сайте.
WalkKey? walkKeyOf(String label) => switch (label.toLowerCase()) {
      'a' || 'arrow left' => WalkKey.left,
      'd' || 'arrow right' => WalkKey.right,
      'w' || 'arrow up' => WalkKey.up,
      's' || 'arrow down' => WalkKey.down,
      _ => null,
    };
