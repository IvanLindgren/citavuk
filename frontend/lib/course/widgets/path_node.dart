/// Большая круглая кнопка-уровень на тропе курса.
///
/// Объёмный круг с тёмной «подошвой» снизу (как [CourseButton], но круглый),
/// кольцом лучшего результата вокруг и подписью под кнопкой. Текущий уровень
/// несёт парящий пузырь «НАЧАТЬ». Состояние передаётся иконкой, цветом и
/// подписью одновременно — не только цветом (§20).
library;

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../widgets/animated_widgets.dart';
import '../models/progress.dart';

class PathNode extends StatelessWidget {
  const PathNode({
    super.key,
    required this.status,
    required this.caption,
    required this.onTap,
    required this.semanticLabel,
    this.isCheckpoint = false,
    this.bestScore = 0,
    this.bubbleText,
  });

  final LessonStatus status;

  /// Название урока под кнопкой.
  final String caption;
  final VoidCallback onTap;
  final String semanticLabel;
  final bool isCheckpoint;

  /// Лучший результат 0..1 — золотое кольцо вокруг узла.
  final double bestScore;

  /// Текст парящего пузыря над текущим узлом («НАЧАТЬ», «ПРОДОЛЖИТЬ»).
  final String? bubbleText;

  /// Диаметр верхнего круга.
  static const double _size = 84;

  /// Высота «подошвы».
  static const double _depth = 7;

  IconData get _icon {
    if (status == LessonStatus.locked) return Icons.lock_rounded;
    if (isCheckpoint) return Icons.emoji_events_rounded;
    return switch (status) {
      LessonStatus.available => Icons.play_arrow_rounded,
      LessonStatus.inProgress => Icons.hourglass_bottom_rounded,
      LessonStatus.completed => Icons.check_rounded,
      LessonStatus.mastered => Icons.workspace_premium_rounded,
      LessonStatus.needsReview => Icons.refresh_rounded,
      LessonStatus.locked => Icons.lock_rounded,
    };
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locked = status == LessonStatus.locked;

    // Пройденный урок — зелёный, а не золотой: золото на пергаменте читалось
    // как предупреждение. Золото осталось за «освоено» с кубком.
    final base = switch (status) {
      LessonStatus.locked =>
        Color.lerp(scheme.surfaceContainerHighest, scheme.onSurface, 0.10)!,
      LessonStatus.mastered => SerbColors.gold,
      LessonStatus.completed => scheme.success,
      LessonStatus.needsReview => scheme.secondary,
      _ => scheme.primary,
    };
    final sole = Color.lerp(base, Colors.black, locked ? 0.14 : 0.34)!;
    final iconColor = locked
        ? scheme.onSurface.withValues(alpha: 0.38)
        : (status == LessonStatus.mastered
            ? const Color(0xFF3E2F0C)
            : Colors.white);

    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    final node = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (bubbleText != null) ...[
          reduceMotion
              ? _StartBubble(text: bubbleText!)
              : FloatingBob(
                  amplitude: 4,
                  child: _StartBubble(text: bubbleText!),
                ),
          const SizedBox(height: 6),
        ],
        SizedBox(
          width: _size + 16,
          height: _size + _depth + 8,
          child: Stack(
            alignment: Alignment.topCenter,
            // Кольцо результата обводит круг снаружи и на пару пикселей выходит
            // за пределы Stack — без этого его срезало сверху.
            clipBehavior: Clip.none,
            children: [
              // Подошва — создаёт объём.
              Positioned(
                top: _depth,
                child: Container(
                  width: _size,
                  height: _size,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: sole,
                    boxShadow: locked
                        ? null
                        : [
                            BoxShadow(
                              color: sole.withValues(alpha: 0.35),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                  ),
                ),
              ),
              Container(
                width: _size,
                height: _size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  // Свет сверху, тень снизу — круг перестаёт быть плоской
                  // заливкой.
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color.lerp(base, Colors.white, locked ? 0.10 : 0.22)!,
                      base,
                      Color.lerp(base, Colors.black, locked ? 0.04 : 0.10)!,
                    ],
                    stops: const [0, 0.55, 1],
                  ),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: locked ? 0.10 : 0.28),
                    width: 1.5,
                  ),
                ),
                child: Icon(_icon, size: 40, color: iconColor),
              ),
              // Кольцо лучшего результата поверх круга.
              if (bestScore > 0 && !locked)
                Positioned(
                  top: -5,
                  child: SizedBox(
                    width: _size + 10,
                    height: _size + 10,
                    child: CustomPaint(
                      painter: _ProgressRingPainter(
                        value: bestScore.clamp(0, 1),
                        color: SerbColors.gold,
                        background: sole.withValues(alpha: 0.20),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: 148,
          child: Text(
            caption,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13.5,
              height: 1.25,
              fontWeight: FontWeight.w700,
              color: scheme.onSurface.withValues(alpha: locked ? 0.45 : 0.85),
            ),
          ),
        ),
      ],
    );

    return Semantics(
      button: true,
      enabled: true,
      label: semanticLabel,
      child: PressableScale(
        scale: 0.93,
        onTap: onTap,
        child: node,
      ),
    );
  }
}

/// Парящий пузырь «НАЧАТЬ» с хвостиком вниз.
class _StartBubble extends StatelessWidget {
  const _StartBubble({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: scheme.primary.withValues(alpha: 0.4)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Text(
            text,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.0,
              color: scheme.primary,
            ),
          ),
        ),
        // Хвостик — повёрнутый квадрат, наполовину скрытый пузырём.
        Transform.translate(
          offset: const Offset(0, -5),
          child: Transform.rotate(
            angle: 0.785398, // 45°
            child: Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                color: scheme.surface,
                border: Border(
                  right:
                      BorderSide(color: scheme.primary.withValues(alpha: 0.4)),
                  bottom:
                      BorderSide(color: scheme.primary.withValues(alpha: 0.4)),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Кольцо лучшего результата вокруг узла.
class _ProgressRingPainter extends CustomPainter {
  _ProgressRingPainter({
    required this.value,
    required this.color,
    required this.background,
  });

  final double value;
  final Color color;
  final Color background;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 2.5;
    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..color = background;
    canvas.drawCircle(center, radius, bg);

    final fg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round
      ..color = color;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -1.5707963, // сверху
      6.2831853 * value,
      false,
      fg,
    );
  }

  @override
  bool shouldRepaint(_ProgressRingPainter old) =>
      old.value != value || old.color != color;
}
