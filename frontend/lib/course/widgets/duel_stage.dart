/// Обстановка матча: часы, занавес фазы, колода судьи, пьедестал и конфетти.
///
/// То же самое, что на сайте (`web/src/components/DuelStage.tsx`), и по той же
/// причине: ждать в матче приходится часто — пока судья читает, пока сосед
/// дописывает, — а пустой экран с надписью «идёт разбор» читается как зависшее
/// приложение. Всё, что происходит за столом, показано движением.
///
/// Оформление — обычные цвета Читавука: пергамент, Lora, красный акцент,
/// индиго у машин, золото у победителя. Тёмной арены с неоном тут не будет:
/// это уже пробовали и выбросили (см. шапку translation_duel_screen.dart).
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// Насколько горит время. Пороги те же, что на сайте.
enum Urgency { calm, warm, hot }

Urgency urgencyOf(int seconds, int total) {
  final hot = math.min(10, total * 0.25);
  final warm = math.min(30, total * 0.5);
  if (seconds > warm) return Urgency.calm;
  if (seconds > hot) return Urgency.warm;
  return Urgency.hot;
}

/// Сколько занавес висит на экране.
const Duration curtainSpan = Duration(milliseconds: 1400);

/// Часы фазы: кольцо утекает, цифры считают.
///
/// Последние полминуты кольцо желтеет, последние десять секунд — краснеет и
/// бьётся. Цифры человек не читает, пока пишет; цвет и пульс он видит боковым
/// зрением.
class DuelClock extends StatefulWidget {
  const DuelClock({super.key, required this.seconds, required this.total});

  final int seconds;
  final int total;

  @override
  State<DuelClock> createState() => _DuelClockState();
}

class _DuelClockState extends State<DuelClock>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 1),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final heat = urgencyOf(widget.seconds, widget.total);
    final part = (widget.seconds / math.max(1, widget.total)).clamp(0.0, 1.0);
    final colour = switch (heat) {
      Urgency.hot => SerbColors.serbRed,
      Urgency.warm => SerbColors.gold,
      Urgency.calm => Theme.of(context).colorScheme.outline,
    };
    final minutes = widget.seconds ~/ 60;
    final seconds = (widget.seconds % 60).toString().padLeft(2, '0');

    // Часы читаются вслух одной строкой: цифры внутри кольца по отдельности
    // ничего не значат.
    return Semantics(
      container: true,
      label: 'Осталось ${widget.seconds} секунд',
      child: AnimatedBuilder(
        animation: _pulse,
        builder: (context, child) {
          final scale =
              heat == Urgency.hot ? 1 + _pulse.value * 0.07 : 1.0;
          return Transform.scale(scale: scale, child: child);
        },
        child: SizedBox(
          width: 56,
          height: 56,
          child: Stack(
            alignment: Alignment.center,
            children: [
              TweenAnimationBuilder<double>(
                tween: Tween(begin: part, end: part),
                duration: const Duration(seconds: 1),
                builder: (context, value, _) => CustomPaint(
                  size: const Size(48, 48),
                  painter: _RingPainter(
                    part: value,
                    colour: colour,
                    track: Theme.of(context).colorScheme.outlineVariant,
                  ),
                ),
              ),
              Text(
                '$minutes:$seconds',
                style: TextStyle(
                  fontFamily: 'Lora',
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: colour,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.part, required this.colour, required this.track});

  final double part;
  final Color colour;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 4;
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..color = track;
    canvas.drawCircle(centre, radius, base);

    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..color = colour;
    canvas.drawArc(
      Rect.fromCircle(center: centre, radius: radius),
      -math.pi / 2,
      2 * math.pi * part,
      false,
      arc,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.part != part || old.colour != colour;
}

/// Занавес фазы: табличка проходит по экрану и уходит.
///
/// Без него смена фазы — это просто другой текст на том же месте, и человек её
/// пропускает. Полутора ударов сердца хватает, чтобы понять: раунд кончился,
/// теперь смотрим, чей перевод лучше.
class PhaseCurtain extends StatefulWidget {
  const PhaseCurtain({super.key, required this.label, required this.title});

  final String label;
  final String title;

  @override
  State<PhaseCurtain> createState() => _PhaseCurtainState();
}

class _PhaseCurtainState extends State<PhaseCurtain>
    with SingleTickerProviderStateMixin {
  late final AnimationController _run = AnimationController(
    vsync: this,
    duration: curtainSpan,
  )..forward();

  @override
  void dispose() {
    _run.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _run,
        builder: (context, child) {
          final t = _run.value;
          // Появляется быстро, висит и уходит вверх: 0–0.22 вход, 0.78–1 выход.
          final opacity = t < 0.22
              ? t / 0.22
              : t > 0.78
                  ? (1 - t) / 0.22
                  : 1.0;
          final shift = t < 0.22 ? 24 * (1 - t / 0.22) : (t > 0.78 ? -18 * ((t - 0.78) / 0.22) : 0.0);
          return Opacity(
            opacity: opacity.clamp(0.0, 1.0),
            child: Transform.translate(offset: Offset(0, shift), child: child),
          );
        },
        child: Center(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 24),
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: theme.colorScheme.outlineVariant),
              boxShadow: [
                BoxShadow(
                  color: theme.colorScheme.shadow.withValues(alpha: 0.18),
                  blurRadius: 24,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.label.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 2.4,
                    color: SerbColors.serbRed,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontFamily: 'Lora',
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Одна строка пьедестала.
class DuelStanding {
  const DuelStanding({
    required this.id,
    required this.name,
    required this.score,
    required this.place,
    this.machine = false,
  });

  final String id;
  final String name;
  final int score;
  final int place;
  final bool machine;
}

/// Пьедестал: первое место в середине и выше остальных.
///
/// Столбики растут снизу, поэтому итог читается за один взгляд — раньше, чем
/// человек успеет разобрать цифры.
class Podium extends StatelessWidget {
  const Podium({super.key, required this.rows, this.you});

  final List<DuelStanding> rows;
  final String? you;

  @override
  Widget build(BuildContext context) {
    final best = rows.fold<int>(1, (top, row) => math.max(top, row.score));
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (final row in rows)
          Expanded(
            child: _Step(row: row, best: best, mine: row.id == you),
          ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.row, required this.best, required this.mine});

  final DuelStanding row;
  final int best;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Высота растёт вместе с системным шрифтом: в столбике стоят номер места и
    // счёт, и при увеличенном шрифте они не помещались в те же 52 пикселя.
    final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
    final height = (52 + (row.score / math.max(1, best)) * 88) * scale;
    final gold = row.place == 1;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor:
                row.machine ? SerbColors.indigo : SerbColors.serbRed,
            child: row.machine
                ? const Icon(Icons.smart_toy_outlined,
                    size: 18, color: SerbColors.parchment)
                : Text(
                    _initial(row.name),
                    style: const TextStyle(
                      fontFamily: 'Lora',
                      fontWeight: FontWeight.bold,
                      color: SerbColors.parchment,
                    ),
                  ),
          ),
          const SizedBox(height: 6),
          Text(
            row.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: height),
            duration: const Duration(milliseconds: 700),
            curve: Curves.easeOutCubic,
            builder: (context, value, _) => Container(
              height: value,
              width: double.infinity,
              padding: const EdgeInsets.only(top: 8),
              decoration: BoxDecoration(
                color: gold
                    ? SerbColors.gold.withValues(alpha: 0.2)
                    : theme.colorScheme.surfaceContainerHigh,
                border: Border(
                  top: BorderSide(
                      color: gold ? SerbColors.gold : theme.colorScheme.outlineVariant),
                  left: BorderSide(
                      color: gold ? SerbColors.gold : theme.colorScheme.outlineVariant),
                  right: BorderSide(
                      color: gold ? SerbColors.gold : theme.colorScheme.outlineVariant),
                ),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('${row.place}',
                      style: const TextStyle(
                        fontFamily: 'Lora',
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      )),
                  Text('${row.score}',
                      style: theme.textTheme.bodySmall),
                  if (mine)
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Text('ТЫ',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: SerbColors.serbRed,
                          )),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _initial(String name) {
  final clean = name.trim();
  return clean.isEmpty ? '?' : clean.characters.first.toUpperCase();
}

/// Бумажное конфетти цветов приложения.
///
/// Не блёстки и не неон: обрезки пергамента, золота и красного — те же цвета,
/// которыми набран весь Читавук.
class Confetti extends StatefulWidget {
  const Confetti({super.key, this.count = 40});

  final int count;

  @override
  State<Confetti> createState() => _ConfettiState();
}

class _ConfettiState extends State<Confetti>
    with SingleTickerProviderStateMixin {
  late final AnimationController _fall = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 4),
  )..repeat();

  late final List<_Piece> _pieces = List.generate(widget.count, (index) {
    final random = math.Random(index * 7919);
    return _Piece(
      left: random.nextDouble(),
      delay: random.nextDouble() * 0.25,
      speed: 0.55 + random.nextDouble() * 0.35,
      tilt: random.nextDouble() * math.pi,
      colour: const [
        SerbColors.serbRed,
        SerbColors.gold,
        SerbColors.indigo,
        SerbColors.success,
      ][index % 4],
    );
  });

  @override
  void dispose() {
    _fall.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _fall,
        builder: (context, _) => CustomPaint(
          painter: _ConfettiPainter(_pieces, _fall.value),
          child: const SizedBox.expand(),
        ),
      ),
    );
  }
}

class _Piece {
  const _Piece({
    required this.left,
    required this.delay,
    required this.speed,
    required this.tilt,
    required this.colour,
  });

  final double left;
  final double delay;
  final double speed;
  final double tilt;
  final Color colour;
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.pieces, this.time);

  final List<_Piece> pieces;
  final double time;

  @override
  void paint(Canvas canvas, Size size) {
    for (final piece in pieces) {
      final progress = ((time + piece.delay) * piece.speed) % 1;
      final y = progress * (size.height + 40) - 20;
      final x = piece.left * size.width + math.sin(progress * 6) * 12;
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(piece.tilt + progress * 6);
      canvas.drawRect(
        const Rect.fromLTWH(-3, -5, 6, 10),
        Paint()..color = piece.colour,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) => old.time != time;
}

/// Рубашки переводов, которые тасует судья.
///
/// Пока Gemma читает, на экране должно что-то происходить: пустая панель с
/// надписью «идёт разбор» читается как зависшее приложение.
class ShuffleDeck extends StatefulWidget {
  const ShuffleDeck({super.key, required this.count});

  final int count;

  @override
  State<ShuffleDeck> createState() => _ShuffleDeckState();
}

class _ShuffleDeckState extends State<ShuffleDeck>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shuffle = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  )..repeat();

  @override
  void dispose() {
    _shuffle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cards = widget.count.clamp(2, 6);
    final theme = Theme.of(context);
    return SizedBox(
      height: 64,
      child: AnimatedBuilder(
        animation: _shuffle,
        builder: (context, _) => Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(cards, (index) {
            final phase = (_shuffle.value + index * 0.12) % 1;
            final lift = math.sin(phase * 2 * math.pi) * 10;
            final tilt = math.sin(phase * 2 * math.pi) *
                (index.isEven ? -0.12 : 0.12);
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Transform.translate(
                offset: Offset(0, -lift),
                child: Transform.rotate(
                  angle: tilt,
                  child: Container(
                    width: 40,
                    height: 56,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHigh,
                      border: Border.all(color: theme.colorScheme.outlineVariant),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

/// Ожидание с тремя точками: ждать в матче приходится часто.
class DuelWaiting extends StatefulWidget {
  const DuelWaiting({
    super.key,
    required this.title,
    required this.text,
    this.child,
  });

  final String title;
  final String text;
  final Widget? child;

  @override
  State<DuelWaiting> createState() => _DuelWaitingState();
}

class _DuelWaitingState extends State<DuelWaiting>
    with SingleTickerProviderStateMixin {
  late final AnimationController _dots = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 1),
  )..repeat();

  @override
  void dispose() {
    _dots.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.child != null) widget.child!,
          const SizedBox(height: 12),
          AnimatedBuilder(
            animation: _dots,
            builder: (context, _) => Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(3, (index) {
                final phase = (_dots.value + index * 0.16) % 1;
                final lift = math.sin(phase * 2 * math.pi) * 4;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: Transform.translate(
                    offset: Offset(0, -lift),
                    child: Opacity(
                      opacity: 0.25 + (math.sin(phase * math.pi)).abs() * 0.75,
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: SerbColors.serbRed,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            widget.title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'Lora',
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            widget.text,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
        ],
      ),
    );
  }
}
