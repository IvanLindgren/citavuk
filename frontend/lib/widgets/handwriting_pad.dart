import 'package:flutter/material.dart';

/// Холст для письма от руки.
///
/// Пишут пальцем, мышью или пером, поэтому [Listener] с событиями указателя, а
/// не [GestureDetector]: жестовая арена перехватывает движение ради прокрутки
/// и глотает начало штриха, из-за чего первая буква выходит рваной.
///
/// Штрихи хранятся списком точек, а не только рисуются. Это нужно отмене
/// последнего штриха и перерисовке при повороте экрана: растянутый готовый
/// битмап превратился бы в мыло.
class HandwritingPad extends StatefulWidget {
  const HandwritingPad({
    super.key,
    required this.controller,
    this.height = 170,
    this.enabled = true,
  });

  final HandwritingController controller;
  final double height;
  final bool enabled;

  @override
  State<HandwritingPad> createState() => _HandwritingPadState();
}

/// Управление холстом снаружи: стереть, отменить штрих, узнать, пусто ли.
class HandwritingController extends ChangeNotifier {
  final List<List<Offset>> _strokes = [];

  List<List<Offset>> get strokes => _strokes;
  bool get isEmpty => _strokes.isEmpty;

  void clear() {
    if (_strokes.isEmpty) return;
    _strokes.clear();
    notifyListeners();
  }

  void undo() {
    if (_strokes.isEmpty) return;
    _strokes.removeLast();
    notifyListeners();
  }

  void _start(Offset point) {
    _strokes.add([point]);
    notifyListeners();
  }

  void _extend(Offset point) {
    if (_strokes.isEmpty) return;
    _strokes.last.add(point);
    notifyListeners();
  }
}

class _HandwritingPadState extends State<HandwritingPad> {
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Opacity(
      opacity: widget.enabled ? 1 : 0.5,
      child: Container(
        height: widget.height,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: scheme.outlineVariant,
            width: 2,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Listener(
          onPointerDown: widget.enabled
              ? (event) => widget.controller._start(event.localPosition)
              : null,
          onPointerMove: widget.enabled
              ? (event) => widget.controller._extend(event.localPosition)
              : null,
          child: AnimatedBuilder(
            animation: widget.controller,
            builder: (_, __) => CustomPaint(
              size: Size.infinite,
              painter: _InkPainter(
                strokes: widget.controller.strokes,
                ink: scheme.onSurface,
                rule: scheme.outlineVariant,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _InkPainter extends CustomPainter {
  _InkPainter({required this.strokes, required this.ink, required this.rule});

  final List<List<Offset>> strokes;
  final Color ink;
  final Color rule;

  @override
  void paint(Canvas canvas, Size size) {
    // Линовка — как в тетради: без опоры буквы уплывают, и написанное выглядит
    // хуже, чем человек умеет на самом деле.
    final guide = Paint()
      ..color = rule
      ..strokeWidth = 1;
    for (final y in [size.height * 0.28, size.height * 0.72]) {
      _dashedLine(canvas, Offset(12, y), Offset(size.width - 12, y), guide);
    }

    final pen = Paint()
      ..color = ink
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    for (final stroke in strokes) {
      if (stroke.isEmpty) continue;
      if (stroke.length == 1) {
        // Одна точка — это точка над «i», а не отрезок нулевой длины: линия из
        // точки в неё же не рисуется вовсе.
        canvas.drawCircle(stroke.first, 1.8, Paint()..color = ink);
        continue;
      }

      final path = Path()..moveTo(stroke.first.dx, stroke.first.dy);
      // Кривая через середины отрезков: ломаная из сырых точек указателя
      // выглядит дёргано даже при аккуратном письме.
      for (var i = 1; i < stroke.length - 1; i++) {
        final current = stroke[i];
        final next = stroke[i + 1];
        path.quadraticBezierTo(
          current.dx,
          current.dy,
          (current.dx + next.dx) / 2,
          (current.dy + next.dy) / 2,
        );
      }
      path.lineTo(stroke.last.dx, stroke.last.dy);
      canvas.drawPath(path, pen);
    }
  }

  void _dashedLine(Canvas canvas, Offset from, Offset to, Paint paint) {
    const dash = 6.0;
    const gap = 6.0;
    var x = from.dx;
    while (x < to.dx) {
      canvas.drawLine(
        Offset(x, from.dy),
        Offset((x + dash).clamp(from.dx, to.dx), from.dy),
        paint,
      );
      x += dash + gap;
    }
  }

  // Всегда true, и это не лень. Список штрихов принадлежит контроллеру и
  // меняется НА МЕСТЕ: у старого и нового художника это один и тот же объект,
  // поэтому любое сравнение полей дало бы «ничего не изменилось» — и линия не
  // рисовалась бы вовсе. Перерисовка и так происходит только по уведомлению
  // контроллера, то есть ровно тогда, когда точка добавилась.
  @override
  bool shouldRepaint(_InkPainter old) => true;
}
