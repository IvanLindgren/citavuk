import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Пути к артам маскота-волка Читавука (assets/imgs).
class Wolf {
  static const zdravo = 'assets/imgs/citavuk_zdravo.png'; // приветствие
  static const povtor = 'assets/imgs/citavuk_povtor.png'; // карточки/повторение
  static const ukaz = 'assets/imgs/citavuk_ukaz.png'; // указатель строки
  static const gram = 'assets/imgs/citavuk_gram.png'; // перевод слова/фразы
  static const rule = 'assets/imgs/citavuk_rule.png'; // грамматика
}

/// Аватар маскота: показывает арт волка (если задан [asset]), иначе эмодзи 🐺.
class WolfAvatar extends StatelessWidget {
  final double size;
  final String? asset;
  const WolfAvatar({super.key, this.size = 44, this.asset});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: SerbColors.indigo,
        border: Border.all(color: SerbColors.gold, width: 2),
      ),
      child: asset == null
          ? Text('🐺', style: TextStyle(fontSize: size * 0.5))
          : ClipOval(
              child: Image.asset(asset!,
                  width: size, height: size, fit: BoxFit.cover),
            ),
    );
  }
}

/// Волк с «репликой»: окно перевода, грамматика, приветствие.
class WolfBubble extends StatelessWidget {
  final String text;
  final String? title;
  final TextStyle? textStyle;
  final String? asset;

  const WolfBubble({
    super.key,
    required this.text,
    this.title,
    this.textStyle,
    this.asset,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeOut,
      builder: (context, t, child) => Opacity(
        opacity: t.clamp(0.0, 1.0),
        child: Transform.translate(offset: Offset(0, (1 - t) * 10), child: child),
      ),
      child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        WolfAvatar(size: 44, asset: asset),
        const SizedBox(width: 10),
        Flexible(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(4),
                topRight: Radius.circular(14),
                bottomLeft: Radius.circular(14),
                bottomRight: Radius.circular(14),
              ),
              border: Border.all(color: scheme.primary.withValues(alpha: 0.25)),
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
                  const SizedBox(height: 2),
                ],
                Text(text,
                    style: textStyle ??
                        TextStyle(fontSize: 15, color: scheme.onSurface)),
              ],
            ),
          ),
        ),
      ],
      ),
    );
  }
}
