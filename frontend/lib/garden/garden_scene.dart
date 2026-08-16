/// Двор Башты: трава, река, дом, грядки и ходячий Читавук.
///
/// Сцена та же, что на сайте (`web/src/components/GardenScene.tsx`), и держится
/// на той же раскладке в мировых пикселях. Читавук идёт к грядке сам: нажатие —
/// это «сходи туда и сделай», а не мгновенное действие на расстоянии.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../models/garden.dart';
import 'pixel.dart';
import 'strings.dart';
import 'walk.dart';
import 'world.dart';

/// Вход в дом: столько мировых пикселей занимает проём в нижнем краю дома.
const Sprite _door = Sprite(28, 38);

/// Ближе этого расстояния предмет подписывается.
const double _labelReach = 46;

class GardenScene extends StatefulWidget {
  const GardenScene({
    super.key,
    required this.slots,
    required this.plants,
    required this.catalog,
    required this.fetchedAt,
    this.watering,
    this.decorations = const [],
    this.weather = 'clear',
    this.river = false,
    this.onBed,
    this.onRiver,
    this.onHouse,
  });

  final int slots;
  final List<GardenPlant> plants;
  final List<GardenSpecies> catalog;

  /// Когда пришёл ответ сервера: от него отсчитывается живой рост.
  final DateTime fetchedAt;

  /// Грядка, которую сейчас поливают: к ней идёт садовник.
  final int? watering;
  final List<String> decorations;
  final String weather;

  /// Река течёт: в неё можно зайти за водой.
  final bool river;
  final void Function(int slot, GardenPlant? plant)? onBed;
  final VoidCallback? onRiver;
  final VoidCallback? onHouse;

  @override
  State<GardenScene> createState() => _GardenSceneState();
}

class _GardenSceneState extends State<GardenScene>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  late Walker _walker;
  final FocusNode _focus = FocusNode();

  Layout _layout = wideLayout;
  double _scale = 3;
  Duration _last = Duration.zero;

  /// Кадр анимации: шаг, полив, утка и рябь считаются от него.
  double _clock = 0;

  /// Когда сцену перерисовывали в последний раз.
  ///
  /// Пиксельный двор рисуется тридцатью кадрами в секунду, а не шестьюдесятью:
  /// покачивание цветов и рябь на реке от лишних кадров не выигрывают ничего, а
  /// перестройка всей сцены каждый кадр греет телефон на ровном месте. Ходьба
  /// при этом остаётся плавной — шаг считается по настоящему времени.
  Duration _drawn = Duration.zero;
  static const _frame = Duration(milliseconds: 33);

  @override
  void initState() {
    super.initState();
    _walker = Walker(_areaOf(_layout), _layout.spawn);
    _ticker = createTicker(_onTick)..start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onTick(Duration now) {
    final elapsed = now - _last;
    _last = now;
    _walker.advance(elapsed);
    // Часы идут всегда: от них считаются шаг, рябь, утка и покачивание цветов.
    _clock += elapsed.inMilliseconds / 1000;
    if (now - _drawn < _frame) return;
    _drawn = now;
    setState(() {});
  }

  WalkArea _areaOf(Layout layout) => WalkArea(
        minX: 14,
        maxX: layout.w - 14,
        minY: layout.river + 4,
        maxY: layout.h - 6,
        // Шаг в мировых пикселях: карту любого размера Читавук проходит
        // примерно за одно и то же время.
        speed: layout.w / 6,
      );

  void _fit(Size size) {
    final layout = pickLayout(size);
    final scale = worldScale(layout, size);
    if (layout.id != _layout.id) {
      _layout = layout;
      _walker.enter(_areaOf(layout), layout.spawn);
    }
    _layout = layout;
    _scale = scale;
  }

  Offset _bedPoint(int slot) {
    if (slot < _layout.beds.length) return _layout.beds[slot];
    final columns = math.max(1, ((_layout.w - 32) / 44).floor());
    final row = slot ~/ columns;
    final column = slot % columns;
    return Offset(
      24 + column * 44,
      math.min(_layout.h - 8, _layout.river + 60 + row * 34),
    );
  }

  List<WorldItem> get _items => [
        ..._layout.items,
        if (widget.decorations.contains('berry-bushes'))
          bushSpot[_layout.id] ?? bushSpot['wide']!,
      ];

  WorldItem? get _nearby {
    WorldItem? best;
    var closest = _labelReach;
    for (final item in _items) {
      if (item.quiet) continue;
      final distance = (Offset(item.x, item.y) - _walker.point).distance;
      if (distance < closest) {
        closest = distance;
        best = item;
      }
    }
    return best;
  }

  void _goToBed(int slot, GardenPlant? plant) {
    final onBed = widget.onBed;
    if (onBed == null) return;
    final point = _bedPoint(slot);
    _walker.moveTo(
      Offset(point.dx, point.dy + 10),
      action: () => onBed(slot, plant),
    );
  }

  void _onKey(KeyEvent event) {
    final key = walkKeyOf(event.logicalKey.keyLabel);
    if (key == null) return;
    if (event is KeyDownEvent) {
      _walker.press(key);
    } else if (event is KeyUpEvent) {
      _walker.release(key);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Пояс с кнопками висит поверх сцены, поэтому мир считает своей только
        // ту высоту, которую пояс не закрывает: иначе нижний ряд грядок
        // оказывается под кнопками.
        _fit(Size(
          constraints.maxWidth,
          math.max(240, constraints.maxHeight - 84),
        ));
        final scale = _scale;
        final layout = _layout;
        final width = layout.w * scale;
        final height = layout.h * scale;

        return KeyboardListener(
          focusNode: _focus,
          autofocus: true,
          onKeyEvent: _onKey,
          child: Semantics(
            label: 'Двор Башты. Нажми на место, куда должен подойти Читавук.',
            child: DecoratedBox(
              decoration: tiled('$gardenArt/world/tile_grass.webp', scale),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Center(
                    child: SizedBox(
                      width: width,
                      height: height,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTapDown: (details) {
                          _focus.requestFocus();
                          _walker.moveTo(details.localPosition / scale);
                        },
                        // Двор перерисовывается каждый кадр, а плашки поверх
                        // него — нет: своя граница не даёт им перекрашиваться
                        // вместе с рябью на реке.
                        child: RepaintBoundary(
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: _stage(layout, scale),
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (_night)
                    const IgnorePointer(
                      child: ColoredBox(color: Color(0x4D1B1C3A)),
                    ),
                  if (widget.weather == 'rain')
                    IgnorePointer(child: _Rain(clock: _clock)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  /// Ночь считается по часам самого человека: смысл в том, чтобы сад темнел
  /// тогда же, когда темнеет за окном.
  bool get _night {
    final hour = DateTime.now().hour;
    return hour >= 21 || hour < 6;
  }

  List<Widget> _stage(Layout layout, double scale) {
    final children = <Widget>[
      _river(layout, scale),
    ];

    // Всё, что стоит на земле, укладывается по глубине: чем ниже основание,
    // тем ближе предмет к зрителю. Без этого Читавук ходит поверх дома.
    final ground = <({double depth, Widget widget})>[];

    for (final item in _items) {
      final size = sprites[item.sprite] ?? const Sprite(16, 16);
      ground.add((
        depth: item.y,
        widget: Positioned(
          left: (item.x - size.w / 2) * scale,
          top: (item.y - size.h) * scale,
          child: IgnorePointer(
            child: PixelImage(
              '$gardenArt/world/${item.sprite}.webp',
              width: size.w * scale,
              height: size.h * scale,
            ),
          ),
        ),
      ));
    }

    final house = _items.where((item) => item.sprite == 'house').firstOrNull;
    if (house != null && widget.onHouse != null) {
      ground.add((
        depth: house.y + 0.5,
        widget: Positioned(
          left: (house.x - _door.w / 2) * scale,
          top: (house.y - _door.h) * scale,
          width: _door.w * scale,
          height: _door.h * scale,
          child: Tooltip(
            message: '${Garden.enter.sr} — ${Garden.enter.ru}',
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => _walker.moveTo(layout.door, action: widget.onHouse),
              child: const SizedBox.expand(),
            ),
          ),
        ),
      ));
    }

    for (var slot = 0; slot < widget.slots; slot++) {
      final point = _bedPoint(slot);
      final plant = widget.plants.where((item) => item.slot == slot).firstOrNull;
      final species = plant == null ? null : _speciesOf(plant.species);
      final growth = plant == null
          ? null
          : projectedGrowth(plant, DateTime.now().difference(widget.fetchedAt));
      ground.add((
        depth: point.dy,
        widget: Positioned(
          left: (point.dx - bedSprite.w / 2) * scale,
          top: (point.dy - bedSprite.h) * scale,
          child: _Bed(
            slot: slot,
            scale: scale,
            growth: species == null ? null : growth,
            species: species,
            watering: widget.watering == slot,
            clock: _clock,
            onTap: widget.onBed == null ? null : () => _goToBed(slot, plant),
          ),
        ),
      ));
    }

    ground.add((
      depth: layout.h + 1,
      widget: Positioned(
        left: (_walker.point.dx - 15) * scale,
        top: (_walker.point.dy - 40) * scale,
        child: IgnorePointer(child: _player(scale)),
      ),
    ));

    ground.sort((a, b) => a.depth.compareTo(b.depth));
    children.addAll(ground.map((item) => item.widget));

    final nearby = _nearby;
    if (nearby != null) {
      final phrase = worldWords[nearby.name];
      final size = sprites[nearby.sprite] ?? const Sprite(16, 16);
      if (phrase != null) {
        children.add(Positioned(
          left: 0,
          top: (nearby.y - math.min(size.h, 72)) * scale - 34,
          width: layout.w * scale,
          child: IgnorePointer(
            child: Align(
              alignment: Alignment(
                (nearby.x / layout.w) * 2 - 1,
                0,
              ),
              child: GardenLabel(serbian: phrase.sr, russian: phrase.ru),
            ),
          ),
        ));
      }
    }

    if (_walker.point.dy <= layout.river + 12) {
      final river = worldWords['river']!;
      children.add(Positioned(
        left: 0,
        top: layout.river * scale - 34,
        width: layout.w * scale,
        child: IgnorePointer(
          child: Center(
            child: GardenLabel(serbian: river.sr, russian: river.ru),
          ),
        ),
      ));
    }

    return children;
  }

  GardenSpecies? _speciesOf(String id) {
    for (final species in widget.catalog) {
      if (species.id == id) return species;
    }
    return null;
  }

  /// Читавук с лейкой: лист из восьми кадров 30×40, ходьба — из четырёх.
  Widget _player(double scale) {
    final watering = widget.watering != null;
    final walking = _walker.moving;
    if (watering) {
      return SpriteFrame(
        asset: '$gardenArt/world/gardener.webp',
        frame: (_clock / 0.1375).floor(),
        frames: 8,
        width: 30 * scale,
        height: 40 * scale,
        flip: _walker.facing < 0,
      );
    }
    if (walking) {
      return SpriteFrame(
        asset: '$gardenArt/world/gardener_walk.webp',
        frame: (_clock / 0.11).floor(),
        frames: 4,
        width: 30 * scale,
        height: 40 * scale,
        flip: _walker.facing < 0,
      );
    }
    return SpriteFrame(
      asset: '$gardenArt/world/gardener.webp',
      frame: 0,
      frames: 8,
      width: 30 * scale,
      height: 40 * scale,
      flip: _walker.facing < 0,
    );
  }

  /// Река. Лента повторяется по горизонтали; пока сегодня не было занятий,
  /// она глухая и утки на ней нет.
  Widget _river(Layout layout, double scale) {
    final height = layout.river * scale;
    final tile = 16 * scale;
    final count = (layout.w * scale / tile).ceil();
    final duckAt = (_clock % 26) / 26;
    return Positioned(
      left: 0,
      top: 0,
      width: layout.w * scale,
      height: height,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onRiver == null
            ? null
            : () => _walker.moveTo(
                  Offset(_walker.point.dx, layout.river + 4),
                  action: widget.onRiver,
                ),
        child: ColorFiltered(
          colorFilter: widget.river
              ? const ColorFilter.mode(Color(0x00000000), BlendMode.dst)
              : const ColorFilter.mode(Color(0x552A2A2A), BlendMode.srcATop),
          child: Stack(
            clipBehavior: Clip.hardEdge,
            children: [
              Row(
                children: List.generate(
                  count,
                  (index) => PixelImage(
                    '$gardenArt/world/river.webp',
                    width: tile,
                    height: height,
                  ),
                ),
              ),
              if (widget.river)
                Positioned(
                  left: (layout.w * scale + 40) * duckAt - 20,
                  bottom: 26 * scale,
                  child: PixelImage(
                    '$gardenArt/world/duck.webp',
                    width: 22 * scale,
                    height: 18 * scale,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Грядка: два тайла земли, растение стоит на них и покачивается.
class _Bed extends StatelessWidget {
  const _Bed({
    required this.slot,
    required this.scale,
    required this.growth,
    required this.species,
    required this.watering,
    required this.clock,
    required this.onTap,
  });

  final int slot;
  final double scale;
  final double? growth;
  final GardenSpecies? species;
  final bool watering;
  final double clock;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final grown = growth;
    final species = this.species;
    final planted = grown != null && species != null;
    final sway = swayFor(slot);
    final tilt = planted
        ? math.sin((clock / sway.seconds + sway.phase) * 2 * math.pi) *
            sway.tilt *
            math.pi /
            180
        : 0.0;

    return GestureDetector(
      onTap: onTap,
      child: Semantics(
        button: onTap != null,
        label: planted
            ? '${species.serbian}, ${growthStages[stageOf(grown)].sr}'
            : '${Garden.empty.sr} ${slot + 1}',
        child: SizedBox(
          width: bedSprite.w * scale,
          height: bedSprite.h * scale,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.bottomCenter,
            children: [
              Container(
                decoration: tiled('$gardenArt/world/tile_soil.webp', scale)
                    .copyWith(
                  border: Border.all(color: const Color(0x8C4C2A1E), width: 2),
                ),
              ),
              if (planted)
                Positioned(
                  bottom: 6 * scale,
                  child: Transform.rotate(
                    angle: tilt,
                    alignment: Alignment.bottomCenter,
                    child: PixelImage(
                      '$gardenArt/world/plant_${species.id}_${stageOf(grown)}.webp',
                      width: 24 * scale,
                      height: 32 * scale,
                    ),
                  ),
                ),
              if (planted && isBlooming(grown)) _Bee(scale: scale, clock: clock),
              if (watering) _Drops(scale: scale, clock: clock),
            ],
          ),
        ),
      ),
    );
  }
}

/// Пчела кружит над распустившимся цветком: цветение видно издалека.
class _Bee extends StatelessWidget {
  const _Bee({required this.scale, required this.clock});

  final double scale;
  final double clock;

  @override
  Widget build(BuildContext context) {
    final phase = (clock % 5.5) / 5.5 * 2 * math.pi;
    return Positioned(
      bottom: 26 * scale + math.sin(phase) * 9,
      left: bedSprite.w * scale / 2 + math.cos(phase) * 14,
      child: Container(
        width: 3 * scale,
        height: 3 * scale,
        decoration: BoxDecoration(
          color: const Color(0xFFFFD93B),
          border: Border.all(color: const Color(0xFF3E3546)),
        ),
      ),
    );
  }
}

/// Капли над грядкой, пока идёт полив.
class _Drops extends StatelessWidget {
  const _Drops({required this.scale, required this.clock});

  final double scale;
  final double clock;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      bottom: 14 * scale,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(3, (index) {
          final phase = ((clock * 1.6 + index * 0.18) % 1);
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Transform.translate(
              offset: Offset(0, phase * 10 * scale),
              child: Opacity(
                opacity: 1 - phase,
                child: Container(
                  width: 3 * scale,
                  height: 3 * scale,
                  decoration: const BoxDecoration(
                    color: Color(0xFF7DD3FC),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

/// Дождь: в дождь поливать не нужно, и это должно быть видно, а не написано.
class _Rain extends StatelessWidget {
  const _Rain({required this.clock});

  final double clock;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _RainPainter(clock), child: const SizedBox.expand());
  }
}

class _RainPainter extends CustomPainter {
  _RainPainter(this.clock);

  final double clock;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0x66A9C7E8)
      ..strokeWidth = 1.4;
    // Капли идут по постоянной сетке со сдвигом во времени: случайные капли на
    // каждом кадре превращаются в мельтешение.
    for (var i = 0; i < 90; i++) {
      final x = (i * 97 % size.width.round()).toDouble();
      final drop = ((clock * 320 + i * 53) % (size.height + 40)) - 20;
      canvas.drawLine(Offset(x, drop), Offset(x - 3, drop + 12), paint);
    }
  }

  @override
  bool shouldRepaint(_RainPainter old) => old.clock != clock;
}
