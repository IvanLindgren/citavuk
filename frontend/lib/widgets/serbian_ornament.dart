import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Сербские мотивы интерфейса: компактная система из двух упрощённых мотивов.
///
/// Вдохновение — пиротский килим (геометричные бордюры со ступенчатыми
/// ромбами) и вышивка крестиком. Это **стилизация, а не этнографическая
/// реконструкция**: произвольные ромбы нельзя выдавать за «аутентичный
/// сербский орнамент», поэтому мотивы безымянные и применяются точечно.
///
/// Правила дозировки:
/// - рабочие области спокойные; на одном экране — один выраженный акцент;
/// - орнамент уместен на обложке курса, в заголовке раздела, на карточке
///   достижения или награды — вокруг каждого поля и кнопки он не нужен;
/// - рядом с длинным текстом для чтения орнамент не ставится.
///
/// Типографика пары: книжная антиква Lora в крупных заголовках веба +
/// интерфейсный Noto Sans (кириллица, сербская латиница, диакритика out of
/// the box). Псевдославянских декоративных шрифтов нет и не будет.
///
/// Мотив 1 — «Крест-ромб»: горизонтальный разделитель в духе вышивки
/// крестиком. Одно место на экран, тонкая линия (под шапкой библиотеки).

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
      canvas.drawRect(
          Rect.fromCenter(center: Offset(cx, cy), width: c, height: c), fill);

      // Маленькие «стежки» между ромбами
      canvas.drawCircle(Offset(cx + step / 2, cy), 1.6, fill);
    }
  }

  @override
  bool shouldRepaint(covariant _CrossStitchPainter old) =>
      old.color != color || old.accent != accent;
}

/// Мотив 2 — «Зубцы»: ступенчатая килимная кромка для верхнего края карточки
/// награды или достижения. Вдохновлена ступенчатыми бордюрами пиротских
/// килимов; упрощена до равнобедренных зубцов и приглушена темой, чтобы не
/// спорить с текстом. Не использовать в списках и формах.
class KilimEdge extends StatelessWidget {
  final double height;
  final Color? color;

  const KilimEdge({super.key, this.height = 10, this.color});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _KilimEdgePainter(color: color ?? SerbColors.serbRed),
      ),
    );
  }
}

class _KilimEdgePainter extends CustomPainter {
  final Color color;
  _KilimEdgePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    // Простые зубцы-треугольники: спокойная кромка в духе ступенчатых
    // бордюров килима. Один зубец — двойная ширина высоты.
    final unit = size.height * 2;
    for (double x = 0; x < size.width + unit; x += unit) {
      canvas.drawPath(
        Path()
          ..moveTo(x, size.height)
          ..lineTo(x + unit / 2, 0)
          ..lineTo(x + unit, size.height)
          ..close(),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _KilimEdgePainter old) => old.color != color;
}
