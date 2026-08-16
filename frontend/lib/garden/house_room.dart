/// Квартира Читавука.
///
/// Дом на карте был нарисованной коробкой: мимо него ходили, а внутрь не
/// заходили. Внутри две комнаты и мебель, мимо которой ходят, а не сквозь неё.
/// Каждая вещь называет себя по-сербски, когда Читавук до неё дошёл, — ради
/// этого дом и открывали.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../models/garden.dart';
import '../services/user_db.dart';
import '../widgets/radio_sheet.dart';
import 'pixel.dart';
import 'room.dart';
import 'strings.dart';
import 'walk.dart';

class HouseRoom extends StatefulWidget {
  const HouseRoom({
    super.key,
    required this.decorations,
    required this.catalog,
    required this.coins,
    this.busy = false,
    this.onBuy,
    this.onBooks,
    required this.onClose,
  });

  final List<String> decorations;
  final List<GardenDecoration> catalog;
  final int coins;
  final bool busy;
  final void Function(String decoration)? onBuy;
  final VoidCallback? onBooks;
  final VoidCallback onClose;

  @override
  State<HouseRoom> createState() => _HouseRoomState();
}

class _HouseRoomState extends State<HouseRoom>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  late Walker _walker;
  final FocusNode _focus = FocusNode();

  double _scale = 3;
  Duration _last = Duration.zero;
  bool _fire = false;

  /// Слово вещи, до которой дошли: висит, пока не пошли к следующей.
  RoomThing? _word;

  @override
  void initState() {
    super.initState();
    _walker = Walker(_area, roomSpawn);
    _ticker = createTicker(_onTick)..start();
  }

  @override
  void didUpdateWidget(covariant HouseRoom old) {
    super.didUpdateWidget(old);
    if (old.decorations.length != widget.decorations.length) {
      _walker.enter(_area, _walker.point);
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    _focus.dispose();
    super.dispose();
  }

  WalkArea get _area => WalkArea(
        minX: floorLeft,
        maxX: floorRight,
        minY: floorTop,
        maxY: floorBottom,
        speed: 66,
        blocked: blockedRects(widget.decorations),
      );

  void _onTick(Duration now) {
    final elapsed = now - _last;
    _last = now;
    if (_walker.advance(elapsed)) setState(() {});
  }

  void _touch(RoomThing thing) {
    setState(() => _word = null);
    _walker.moveTo(thing.stand, action: () {
      if (!mounted) return;
      setState(() => _word = thing);
      switch (thing.action) {
        case RoomAction.radio:
          showRadioSheet(context);
        case RoomAction.notebook:
          _openNotebook();
        case RoomAction.fridge:
          _openFridge();
        case RoomAction.letters:
          _openAlphabet();
        case RoomAction.fire:
          setState(() => _fire = !_fire);
        case RoomAction.books:
          widget.onBooks?.call();
        case RoomAction.leave:
          widget.onClose();
        case null:
          break;
      }
    });
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
    final things = visibleThings(widget.decorations);
    final forSale = widget.catalog.where((item) => item.inHouse).toList();

    return Scaffold(
      backgroundColor: _fire ? const Color(0xFF2A1B12) : const Color(0xFF1A1512),
      body: SafeArea(
        child: Column(
          children: [
            _Header(
              coins: widget.coins,
              onClose: widget.onClose,
              onShop: forSale.isEmpty || widget.onBuy == null
                  ? null
                  : () => _openShop(forSale),
            ),
            Expanded(
              child: KeyboardListener(
                focusNode: _focus,
                autofocus: true,
                onKeyEvent: _onKey,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    _scale = _roomScale(constraints.biggest);
                    final width = roomSize.width * _scale;
                    final height = roomSize.height * _scale;
                    return Center(
                      child: SizedBox(
                        width: width,
                        height: height,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTapDown: (details) {
                            _focus.requestFocus();
                            setState(() => _word = null);
                            _walker.moveTo(details.localPosition / _scale);
                          },
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: _room(things, width, height),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  double _roomScale(Size size) {
    final fit = math.min(
      size.width / roomSize.width,
      size.height / roomSize.height,
    );
    if (!fit.isFinite || fit <= 0) return 3;
    if (fit >= 2) return math.min(6, (fit * 2).floorToDouble() / 2);
    return math.max(0.75, (fit * 100).floorToDouble() / 100);
  }

  List<Widget> _room(List<RoomThing> things, double width, double height) {
    final scale = _scale;
    final children = <Widget>[
      Positioned.fill(
        child: PixelImage(
          '$gardenArt/house/room.webp',
          width: width,
          height: height,
        ),
      ),
    ];

    final depth = <({double order, Widget widget})>[];
    for (final thing in things) {
      depth.add((
        // Висящее на стене всегда позади: иначе картина закрывает Читавука.
        order: thing.wall ? 0 : (thing.flat ? 1 : thing.y),
        widget: Positioned(
          left: (thing.x - thing.w / 2) * scale,
          top: (thing.y - thing.h) * scale,
          width: thing.w * scale,
          height: thing.h * scale,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => _touch(thing),
            child: PixelImage(
              '$gardenArt/house/${thing.sprite}.webp',
              width: thing.w * scale,
              height: thing.h * scale,
            ),
          ),
        ),
      ));
    }

    depth.add((
      order: _walker.point.dy,
      widget: Positioned(
        left: (_walker.point.dx - 15) * scale,
        top: (_walker.point.dy - 40) * scale,
        child: IgnorePointer(
          child: SpriteFrame(
            asset: '$gardenArt/world/gardener_walk.webp',
            frame: _walker.moving
                ? (DateTime.now().millisecondsSinceEpoch ~/ 110)
                : 0,
            frames: 4,
            width: 30 * scale,
            height: 40 * scale,
            flip: _walker.facing < 0,
          ),
        ),
      ),
    ));

    depth.sort((a, b) => a.order.compareTo(b.order));
    children.addAll(depth.map((item) => item.widget));

    // Огонь в камине красит комнату целиком: тёплый свет виден и на стенах.
    if (_fire) {
      children.add(Positioned.fill(
        child: IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0.18, 0),
                radius: 0.9,
                colors: [
                  const Color(0xFFFFB347).withValues(alpha: 0.22),
                  const Color(0x00000000),
                ],
              ),
            ),
          ),
        ),
      ));
    }

    final word = _word;
    if (word != null) {
      final phrase = houseWords[word.id];
      if (phrase != null) {
        children.add(Positioned(
          left: 0,
          width: width,
          top: math.max(0, (word.y - word.h) * scale - 38),
          child: IgnorePointer(
            child: Align(
              alignment: Alignment((word.x / roomSize.width) * 2 - 1, 0),
              child: GardenLabel(serbian: phrase.sr, russian: phrase.ru),
            ),
          ),
        ));
      }
    }

    return children;
  }

  void _openFridge() {
    _sheet(
      title: Garden.fridgeOpen,
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final item in fridgeWords)
            _WordChip(serbian: item.sr, russian: item.ru),
        ],
      ),
    );
  }

  void _openAlphabet() {
    _sheet(
      title: Garden.letters,
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final pair in alphabet)
            _WordChip(serbian: pair[0], russian: pair[1]),
        ],
      ),
    );
  }

  /// Тетрадь на столе: слова здесь не заводятся, они приходят из читалки и
  /// карточек. Смысл в том, чтобы в доме было видно, ради чего растёт сад.
  void _openNotebook() {
    _sheet(
      title: Garden.notebook,
      child: FutureBuilder<List<Map<String, dynamic>>>(
        future: UserDb.instance.getAllVocabulary(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          final rows = snapshot.data!;
          if (rows.isEmpty) {
            return const Text(
              'В тетради пока пусто. Нажми на слово в книге — оно попадёт сюда.',
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Слов в тетради: ${rows.length}',
                  style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 12),
              for (final row in rows.take(12))
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          (row['word'] ?? '') as String,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          (row['translation'] ?? '') as String,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  void _openShop(List<GardenDecoration> forSale) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            Text('${Garden.furnish.sr} — ${Garden.furnish.ru}',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            for (final item in forSale)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(item.serbian),
                subtitle: Text(item.russian),
                trailing: widget.decorations.contains(item.id)
                    ? Text(Garden.owned.sr)
                    : FilledButton(
                        onPressed: widget.coins < item.price || widget.busy
                            ? null
                            : () {
                                Navigator.pop(context);
                                widget.onBuy?.call(item.id);
                              },
                        child: Text('${item.price}'),
                      ),
              ),
          ],
        ),
      ),
    );
  }

  void _sheet({required Phrase title, required Widget child}) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(title.sr, style: Theme.of(context).textTheme.titleLarge),
              Text(title.ru, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 16),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.coins, required this.onClose, this.onShop});

  final int coins;
  final VoidCallback onClose;
  final VoidCallback? onShop;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(Garden.home.sr,
                  style: const TextStyle(
                    fontFamily: 'Lora',
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                    color: Color(0xFFF3E4C0),
                  )),
              const Text('дома',
                  style: TextStyle(fontSize: 11, color: Color(0xFFB49B79))),
            ],
          ),
          const Spacer(),
          if (onShop != null)
            IconButton(
              onPressed: onShop,
              icon: const Icon(Icons.chair_alt, color: Color(0xFFF3E4C0)),
              tooltip: '${Garden.furnish.sr} — ${Garden.furnish.ru}',
            ),
          Row(
            children: [
              const Icon(Icons.local_florist, size: 18, color: Color(0xFFE0B44A)),
              const SizedBox(width: 4),
              Text('$coins',
                  style: const TextStyle(
                    color: Color(0xFFF3E4C0),
                    fontWeight: FontWeight.bold,
                  )),
            ],
          ),
          IconButton(
            onPressed: onClose,
            icon: const Icon(Icons.close, color: Color(0xFFF3E4C0)),
            tooltip: '${Garden.leave.sr} — ${Garden.leave.ru}',
          ),
        ],
      ),
    );
  }
}

class _WordChip extends StatelessWidget {
  const _WordChip({required this.serbian, required this.russian});

  final String serbian;
  final String russian;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(serbian, style: const TextStyle(fontWeight: FontWeight.w600)),
          Text(russian, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
