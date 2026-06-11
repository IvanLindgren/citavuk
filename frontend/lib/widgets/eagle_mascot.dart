import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'animated_widgets.dart';

/// Маскот аудирования — черногорский орёл Слухао (assets/imgs).
///
/// Арты добавляются позже (три вариации). Пока файла нет, виджеты показывают
/// эмодзи 🦅 через errorBuilder — фича работает и без артов.
class Eagle {
  static const zdravo = 'assets/imgs/sluhao_zdravo.png'; // приветствие
  static const slusa = 'assets/imgs/sluhao_slusa.png'; // слушает (в плеере)
  static const savet = 'assets/imgs/sluhao_savet.png'; // совет/подсказка
}

/// Орёл-стикер: арт целиком, с фолбэком на эмодзи, пока артов нет.
class EagleSticker extends StatelessWidget {
  final String asset;
  final double size;
  final bool animate;

  const EagleSticker({
    super.key,
    required this.asset,
    this.size = 120,
    this.animate = true,
  });

  @override
  Widget build(BuildContext context) {
    Widget sticker = SizedBox(
      width: size,
      height: size,
      child: Image.asset(
        asset,
        fit: BoxFit.contain,
        cacheWidth: (size * 3).round(),
        errorBuilder: (_, __, ___) => Container(
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            color: SerbColors.indigo,
          ),
          child: Text('🦅', style: TextStyle(fontSize: size * 0.45)),
        ),
      ),
    );
    if (animate) sticker = FloatingBob(child: sticker);
    return sticker;
  }
}

/// Орёл с «репликой» — как WolfBubble, но для Слухао.
class EagleBubble extends StatelessWidget {
  final String text;
  final String? title;
  final String asset;
  final double eagleSize;

  const EagleBubble({
    super.key,
    required this.text,
    this.title,
    this.asset = Eagle.zdravo,
    this.eagleSize = 110,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return FadeSlideIn(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          EagleSticker(asset: asset, size: eagleSize),
          CustomPaint(
            size: const Size(10, 18),
            painter: _EagleBubbleTail(
              color: scheme.surfaceContainerHighest,
              border: scheme.primary.withValues(alpha: 0.25),
            ),
          ),
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(4),
                  topRight: Radius.circular(16),
                  bottomLeft: Radius.circular(16),
                  bottomRight: Radius.circular(16),
                ),
                border:
                    Border.all(color: scheme.primary.withValues(alpha: 0.25)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (title != null) ...[
                    Text(title!,
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: scheme.primary)),
                    const SizedBox(height: 3),
                  ],
                  Text(text,
                      style: TextStyle(
                          fontSize: 15,
                          height: 1.35,
                          color: scheme.onSurface)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EagleBubbleTail extends CustomPainter {
  final Color color;
  final Color border;
  _EagleBubbleTail({required this.color, required this.border});

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(size.width, 2)
      ..lineTo(0, size.height / 2)
      ..lineTo(size.width, size.height - 2)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawPath(
      path,
      Paint()
        ..color = border
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(_EagleBubbleTail old) =>
      old.color != color || old.border != border;
}
