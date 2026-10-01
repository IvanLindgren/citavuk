import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'speaking_models.dart';

/// Нативный автомат тем для Linux и устройств, где страница со сценой не
/// поднялась: вывеска с лампами, окно с лентой тем и рычаг. Читавука здесь нет —
/// это запасной путь, основной рисует WebView (`SlotStage`). Тему выбирает
/// экран, остановка не зависит от частоты кадров.
class SlotMachineView extends StatefulWidget {
  const SlotMachineView(
      {super.key,
      required this.pool,
      required this.spinId,
      required this.target,
      required this.title,
      required this.onLanded,
      required this.onPull});
  final List<SpeakingTopic> pool;
  final int spinId;
  final SpeakingTopic? target;
  final String title;
  final VoidCallback onLanded;
  final VoidCallback onPull;
  @override
  State<SlotMachineView> createState() => _SlotMachineViewState();
}

class _SlotMachineViewState extends State<SlotMachineView>
    with SingleTickerProviderStateMixin {
  static const _length = 24;
  late final AnimationController _controller = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 4200));
  final _random = Random();
  List<String> _strip = const ['Потяни рычаг!'];
  double _to = 0, _pos = 0;
  int _spin = 0;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(
        () => _pos = _to * Curves.easeOutQuart.transform(_controller.value)));
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
  void didUpdateWidget(covariant SlotMachineView old) {
    super.didUpdateWidget(old);
    if (widget.spinId > _spin) _start();
  }

  void _start() {
    final target = widget.target;
    if (target == null || widget.spinId <= _spin) return;
    _spin = widget.spinId;
    final others = [
      for (final t in widget.pool)
        if (t.id != target.id) t.ru
    ]..shuffle(_random);
    // Лента начинается с того, что сейчас в окне, и кончается выпавшей темой.
    final current = _strip[min(max(_pos.round(), 0), _strip.length - 1)];
    _strip = [
      current,
      for (var i = 0; i < _length - 2; i++)
        others.isEmpty ? target.ru : others[i % others.length],
      target.ru,
    ];
    _to = (_strip.length - 1).toDouble();
    if (MediaQuery.disableAnimationsOf(context)) {
      _pos = _to;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          setState(() {});
          widget.onLanded();
        }
      });
    } else {
      _pos = 0;
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final busy = _controller.isAnimating;
    final value = _controller.value;
    // Рычаг: в первые доли секунды уходит вниз и пружинит обратно.
    final lever = busy && value < 0.12 ? sin(pi * value / 0.12) : 0.0;
    return Semantics(
        label: 'Игровой автомат тем',
        child: LayoutBuilder(
            builder: (context, constraints) => AspectRatio(
                aspectRatio: 1.15,
                child: Stack(children: [
                  Positioned.fill(
                      child: CustomPaint(
                          painter: _SlotPainter(
                              strip: _strip,
                              pos: _pos,
                              title: widget.title,
                              lever: lever,
                              glow: !busy && _spin > 0))),
                  // Тап по рычагу — то же, что кнопка «Выбрать тему».
                  Positioned(
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: constraints.maxWidth * 0.16,
                      child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: busy ? null : widget.onPull)),
                ]))));
  }
}

class _SlotPainter extends CustomPainter {
  _SlotPainter(
      {required this.strip,
      required this.pos,
      required this.title,
      required this.lever,
      required this.glow});
  final List<String> strip;
  final double pos;
  final String title;
  final double lever;
  final bool glow;

  static const _gold = Color(0xFFC9A24B);
  static const _goldLight = Color(0xFFF0D58A);
  static const _red = Color(0xFF9E2B25);
  static const _ink = Color(0xFF2B2118);

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final body = RRect.fromRectAndRadius(
        Rect.fromLTWH(w * 0.02, h * 0.2, w * 0.8, h * 0.76),
        Radius.circular(w * 0.05));
    canvas.drawShadow(Path()..addRRect(body), const Color(0xFF251812), 10, true);
    canvas.drawRRect(body, Paint()..color = _gold);
    canvas.drawRRect(
        body.deflate(w * 0.012),
        Paint()
          ..shader = const LinearGradient(colors: [
            Color(0xFFBB3C33),
            Color(0xFF8C2620),
            Color(0xFF5C1511)
          ]).createShader(body.outerRect));

    // Вывеска с лампами.
    final sign = RRect.fromRectAndRadius(
        Rect.fromLTWH(w * 0.17, h * 0.03, w * 0.5, h * 0.17),
        Radius.circular(w * 0.03));
    canvas.drawRRect(sign.inflate(w * 0.008), Paint()..color = _gold);
    canvas.drawRRect(sign, Paint()..color = const Color(0xFF1F0605));
    const bulbs = 9;
    for (var i = 0; i < bulbs; i++) {
      final x = sign.left + sign.width * (i + 0.5) / bulbs;
      for (final y in [sign.top + h * 0.018, sign.bottom - h * 0.018]) {
        canvas.drawCircle(Offset(x, y), w * 0.008,
            Paint()..color = (i + (glow ? 1 : 0)).isEven ? _goldLight : _gold);
      }
    }
    final titlePainter = TextPainter(
        text: TextSpan(
            text: title.toUpperCase(),
            style: TextStyle(
                color: _goldLight,
                fontSize: h * 0.075,
                fontWeight: FontWeight.w900,
                letterSpacing: 2)),
        textDirection: TextDirection.ltr,
        maxLines: 1)
      ..layout(maxWidth: sign.width);
    titlePainter.paint(
        canvas,
        Offset(sign.left + (sign.width - titlePainter.width) / 2,
            sign.top + (sign.height - titlePainter.height) / 2));

    // Окно с лентой тем.
    final window = RRect.fromRectAndRadius(
        Rect.fromLTWH(w * 0.07, h * 0.27, w * 0.7, h * 0.56),
        Radius.circular(w * 0.03));
    canvas.drawRRect(window.inflate(w * 0.012),
        Paint()..color = glow ? _goldLight : _gold);
    canvas.drawRRect(window, Paint()..color = const Color(0xFFFDF3DA));
    canvas.save();
    canvas.clipRRect(window);
    final pitch = window.height * 0.5;
    final base = pos.floor();
    for (var k = -1; k <= 2; k++) {
      final index = base + k;
      if (index < 0 || index >= strip.length) continue;
      final dy = (index - pos) * pitch;
      final center = window.center.dy - dy;
      final near = 1 - min(1.0, dy.abs() / pitch);
      final text = TextPainter(
          text: TextSpan(
              text: strip[index],
              style: TextStyle(
                  color: (index == 0 && pos < 0.5 && strip.length == 1
                          ? _red
                          : _ink)
                      .withValues(alpha: 0.35 + 0.65 * near),
                  fontSize: h * 0.055,
                  fontWeight: FontWeight.w700,
                  height: 1.2)),
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.center,
          maxLines: 3,
          ellipsis: '…')
        ..layout(maxWidth: window.width * 0.88);
      text.paint(canvas,
          Offset(window.center.dx - text.width / 2, center - text.height / 2));
    }
    // Тень цилиндра барабана сверху и снизу.
    canvas.drawRect(
        window.outerRect,
        Paint()
          ..shader = const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xCC120604),
                Color(0x00120604),
                Color(0x00120604),
                Color(0xCC120604)
              ],
              stops: [0, 0.25, 0.75, 1]).createShader(window.outerRect));
    canvas.restore();

    // Рычаг.
    final pivot = Offset(w * 0.87, h * 0.58);
    final angle = lever * 2;
    final length = h * 0.3;
    final knob = Offset(pivot.dx + 0.03 * w * sin(angle),
        pivot.dy - length * cos(angle));
    canvas.drawLine(
        pivot,
        knob,
        Paint()
          ..color = _gold
          ..strokeWidth = w * 0.022
          ..strokeCap = StrokeCap.round);
    canvas.drawCircle(pivot, w * 0.03, Paint()..color = _gold);
    canvas.drawCircle(
        knob,
        w * 0.04 * (1 + 0.4 * sin(angle).abs()),
        Paint()
          ..shader = const RadialGradient(
                  center: Alignment(-0.4, -0.4),
                  colors: [Color(0xFFFFB0A2), Color(0xFFC23B33), Color(0xFF62100C)])
              .createShader(Rect.fromCircle(center: knob, radius: w * 0.05)));
  }

  @override
  bool shouldRepaint(covariant _SlotPainter old) =>
      old.pos != pos ||
      old.strip != strip ||
      old.title != title ||
      old.lever != lever ||
      old.glow != glow;
}
