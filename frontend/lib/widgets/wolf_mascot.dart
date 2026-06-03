import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'animated_widgets.dart';

/// Пути к артам маскота-волка Читавука (assets/imgs) + сведения о фоне арта.
class Wolf {
  static const zdravo = 'assets/imgs/citavuk_zdravo.png'; // приветствие (тёмный фон)
  static const povtor = 'assets/imgs/citavuk_povtor.png'; // карточки/повторение (светлый)
  static const ukaz = 'assets/imgs/citavuk_ukaz.png'; // лапка-указатель (светлый)
  static const gram = 'assets/imgs/citavuk_gram.png'; // перевод слова/фразы (тёмный фон)
  static const rule = 'assets/imgs/citavuk_rule.png'; // грамматика, лупа (светлый)

  /// Арты-стикеры, у которых фон вокруг волка тёмный (нарисован в самом PNG).
  /// Их красивее показывать в тёмной «рамке-стикере», светлые — в светлой.
  static const _darkBg = {zdravo, gram};
  static bool hasDarkBackground(String asset) => _darkBg.contains(asset);
}

/// Большой волк-стикер: показывает арт ЦЕЛИКОМ (BoxFit.contain, без обрезки)
/// По желанию — «парит». Рамки убраны по запросу пользователя.
class WolfSticker extends StatelessWidget {
  final String asset;
  final double size;
  final bool animate;
  final bool frame;

  const WolfSticker({
    super.key,
    required this.asset,
    this.size = 140, // Увеличенный размер
    this.animate = true,
    this.frame = false, // Отключили рамки по умолчанию
  });

  @override
  Widget build(BuildContext context) {
    final dark = Wolf.hasDarkBackground(asset);
    // Арты волка — крупные PNG (~2 МБ). Декодируем под размер показа, а не в
    // полное разрешение, иначе зря тратим память/CPU (бывают подвисания).
    final image = Image.asset(
      asset,
      fit: BoxFit.contain,
      cacheWidth: (size * 3).round(),
    );

    Widget sticker = frame
        ? Container(
            width: size,
            height: size,
            padding: EdgeInsets.all(size * 0.06),
            decoration: BoxDecoration(
              color: dark ? const Color(0xFF12131A) : Colors.white,
              borderRadius: BorderRadius.circular(size * 0.22),
              border: Border.all(
                color: SerbColors.gold.withValues(alpha: 0.55),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: dark ? 0.35 : 0.18),
                  blurRadius: 14,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(size * 0.16),
              child: image,
            ),
          )
        : SizedBox(width: size, height: size, child: image);

    if (animate) sticker = FloatingBob(child: sticker);
    return sticker;
  }
}

/// Маленький круглый аватар волка (для плотных списков). 
/// Рамки убраны.
class WolfAvatar extends StatelessWidget {
  final double size;
  final String? asset;
  const WolfAvatar({super.key, this.size = 64, this.asset}); // Увеличен размер

  @override
  Widget build(BuildContext context) {
    if (asset == null) {
      return Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: SerbColors.indigo,
        ),
        child: Text('🐺', style: TextStyle(fontSize: size * 0.5)),
      );
    }
    
    return SizedBox(
      width: size,
      height: size,
      child: Image.asset(
        asset!,
        fit: BoxFit.contain,
        cacheWidth: (size * 3).round(),
      ),
    );
  }
}

/// Волк с «репликой»: крупный волк-стикер + облачко с текстом и хвостиком.
/// Появляется с плавной анимацией. Сделан интерактивным.
class WolfBubble extends StatefulWidget {
  final String text;
  final String? title;
  final TextStyle? textStyle;
  final String? asset;
  final double wolfSize;

  const WolfBubble({
    super.key,
    required this.text,
    this.title,
    this.textStyle,
    this.asset,
    this.wolfSize = 130, // Увеличен размер
  });

  @override
  State<WolfBubble> createState() => _WolfBubbleState();
}

class _WolfBubbleState extends State<WolfBubble> {
  bool _isPetting = false;

  void _petWolf() {
    if (_isPetting) return;
    setState(() => _isPetting = true);
    Future.delayed(const Duration(seconds: 4), () {
      if (mounted) setState(() => _isPetting = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    
    final currentText = _isPetting ? 'Ой, спасибо! Я так тебя люблю! ❤️' : widget.text;
    final currentAsset = _isPetting ? Wolf.zdravo : widget.asset;

    return FadeSlideIn(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          GestureDetector(
            onTap: _petWolf,
            child: currentAsset == null
                ? WolfAvatar(size: widget.wolfSize, asset: currentAsset)
                : WolfSticker(asset: currentAsset, size: widget.wolfSize, frame: false),
          ),
          // Хвостик облачка, указывающий на волка.
          CustomPaint(
            size: const Size(10, 18),
            painter: _BubbleTail(
              color: scheme.surfaceContainerHighest,
              border: scheme.primary.withValues(alpha: 0.25),
            ),
          ),
          Flexible(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              child: Container(
                key: ValueKey(_isPetting),
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
                    if (widget.title != null) ...[
                      Text(widget.title!,
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: scheme.primary)),
                      const SizedBox(height: 3),
                    ],
                    Text(currentText,
                        style: widget.textStyle ??
                            TextStyle(
                                fontSize: 15,
                                height: 1.35,
                                color: scheme.onSurface)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Треугольный хвостик облачка реплики (смотрит влево, на волка).
class _BubbleTail extends CustomPainter {
  final Color color;
  final Color border;
  _BubbleTail({required this.color, required this.border});

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
  bool shouldRepaint(_BubbleTail old) =>
      old.color != color || old.border != border;
}
