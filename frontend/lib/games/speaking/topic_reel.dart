import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'speaking_models.dart';

/// Доступный вариант рулетки для платформ без WebGL. Выбор темы остаётся
/// у экрана, остановка не зависит от частоты кадров.
class TopicReel extends StatefulWidget {
  const TopicReel(
      {super.key,
      required this.pool,
      required this.catalog,
      required this.spinId,
      required this.target,
      required this.onLanded});
  final List<SpeakingTopic> pool;
  final SpeakingCatalog catalog;
  final int spinId;
  final SpeakingTopic? target;
  final VoidCallback onLanded;
  @override
  State<TopicReel> createState() => _TopicReelState();
}

class _TopicReelState extends State<TopicReel>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 4200));
  double _from = 0, _to = 0, _angle = 0;
  int _spin = 0;
  List<SpeakingGenre> get _genres {
    final ids = widget.pool.map((t) => t.genre).toSet();
    return widget.catalog.genres.where((g) => ids.contains(g.id)).toList();
  }

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() => _angle = _from +
        (_to - _from) * Curves.easeOutQuart.transform(_controller.value)));
    _controller.addStatusListener((s) {
      if (s == AnimationStatus.completed) {
        HapticFeedback.mediumImpact();
        widget.onLanded();
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (widget.spinId > _spin) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _start();
      });
    }
  }

  @override
  void didUpdateWidget(covariant TopicReel old) {
    super.didUpdateWidget(old);
    if (widget.spinId > _spin) _start();
  }

  void _start() {
    if (widget.target == null || _genres.isEmpty || widget.spinId <= _spin) {
      return;
    }
    _spin = widget.spinId;
    final index =
        max(0, _genres.indexWhere((g) => g.id == widget.target!.genre));
    _from = _angle;
    final desired = -pi / 2 - (index + .5) * 2 * pi / _genres.length;
    final delta = ((desired - _from) % (2 * pi) + 2 * pi) % (2 * pi);
    _to = _from + 10 * pi + delta;
    if (MediaQuery.disableAnimationsOf(context)) {
      _angle = _to;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          setState(() {});
          widget.onLanded();
        }
      });
    } else {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
      label: 'Рулетка тем',
      child: AspectRatio(
          aspectRatio: 1.32,
          child: CustomPaint(painter: _WheelPainter(_genres, _angle))));
}

class _WheelPainter extends CustomPainter {
  _WheelPainter(this.genres, this.angle);
  final List<SpeakingGenre> genres;
  final double angle;
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2),
        radius = min(size.width, size.height) * .46;
    canvas.drawShadow(
        Path()..addOval(Rect.fromCircle(center: center, radius: radius)),
        const Color(0xFF251812),
        10,
        true);
    canvas.drawCircle(center, radius, Paint()..color = const Color(0xFF4D2F24));
    canvas.drawCircle(
        center, radius * .95, Paint()..color = const Color(0xFFCAA367));
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(angle);
    if (genres.isNotEmpty) {
      final step = 2 * pi / genres.length;
      for (var i = 0; i < genres.length; i++) {
        canvas.drawArc(
            Rect.fromCircle(center: Offset.zero, radius: radius * .88),
            i * step,
            step,
            true,
            Paint()
              ..color =
                  i.isEven ? const Color(0xFF8F2C26) : const Color(0xFF282320));
        canvas.save();
        canvas.rotate((i + .5) * step);
        final text = TextPainter(
            text: TextSpan(
                text: genres[i].ru,
                style: TextStyle(
                    color: const Color(0xFFF5DFB5),
                    fontSize: max(8, radius * .07),
                    fontWeight: FontWeight.w600)),
            textDirection: TextDirection.ltr,
            maxLines: 1)
          ..layout(maxWidth: radius * .46);
        text.paint(canvas, Offset(radius * .42, -text.height / 2));
        canvas.restore();
      }
    }
    canvas.restore();
    canvas.drawCircle(
        center, radius * .27, Paint()..color = const Color(0xFFBE9558));
    canvas.drawCircle(
        center, radius * .065, Paint()..color = const Color(0xFFE7CDA0));
    canvas.drawCircle(center + Offset(0, -radius * .8), radius * .035,
        Paint()..color = const Color(0xFFFFF3DE));
  }

  @override
  bool shouldRepaint(covariant _WheelPainter old) =>
      old.angle != angle || old.genres != genres;
}
