import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Горизонтальный орнамент-разделитель в стиле сербской вышивки крестиком:
/// ряд ромбов с крестом внутри. Рисуется кодом (CustomPainter), без картинок —
/// масштабируется и перекрашивается под тему.
class OrnamentDivider extends StatelessWidget {
  final double height;
  final Color? color;
  final Color? accent;

  const OrnamentDivider({super.key, this.height = 26, this.color, this.accent});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _CrossStitchPainter(
          color: color ?? scheme.primary,
          accent: accent ?? SerbColors.indigo,
        ),
      ),
    );
  }
}

class _CrossStitchPainter extends CustomPainter {
  final Color color;
  final Color accent;
  _CrossStitchPainter({required this.color, required this.accent});

  @override
  void paint(Canvas canvas, Size size) {
    final cy = size.height / 2;
    final r = size.height * 0.42; // полудиагональ ромба
    final step = r * 2.4;

    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6;
    final fill = Paint()..color = accent;

    for (double cx = step / 2; cx < size.width + step; cx += step) {
      // Ромб
      final path = Path()
        ..moveTo(cx, cy - r)
        ..lineTo(cx + r, cy)
        ..lineTo(cx, cy + r)
        ..lineTo(cx - r, cy)
        ..close();
      canvas.drawPath(path, stroke);

      // Крест/квадрат в центре
      final c = r * 0.34;
      canvas.drawRect(Rect.fromCenter(center: Offset(cx, cy), width: c, height: c), fill);

      // Маленькие «стежки» между ромбами
      canvas.drawCircle(Offset(cx + step / 2, cy), 1.6, fill);
    }
  }

  @override
  bool shouldRepaint(covariant _CrossStitchPainter old) =>
      old.color != color || old.accent != accent;
}
