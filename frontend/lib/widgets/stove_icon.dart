import 'package:flutter/material.dart';

/// Сербская печь с огнём за дверцей — знак серии дней.
///
/// Картинка, а не значок шрифта: ту же печь показывает виджет на рабочем столе,
/// а там ничего, кроме готовых битмапов, нарисовать нельзя. Общий рисунок
/// собирает `tools/widget_assets.py` — печь в приложении и печь на виджете
/// обязаны быть одной печью.
class StoveIcon extends StatelessWidget {
  const StoveIcon({super.key, this.size = 18});

  final double size;

  @override
  Widget build(BuildContext context) => Image.asset(
        'assets/imgs/citavuk_stove.png',
        width: size,
        height: size,
        filterQuality: FilterQuality.medium,
        // Печь цветная и остаётся собой в обеих темах: перекрашивать её под
        // цвет текста значило бы потерять и латунь, и огонь.
        excludeFromSemantics: true,
      );
}
