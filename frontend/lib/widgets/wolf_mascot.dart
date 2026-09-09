import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../theme/app_theme.dart';
import '../state/app_settings.dart';
import '../services/interface_sounds.dart';
import 'animated_widgets.dart';

/// Пути к артам маскота-волка Читавука (assets/imgs) + сведения о фоне арта.
///
/// Арты лежат в WebP (q90): PNG весили в 7–8 раз больше при неотличимой на
/// глаз картинке (альфа пиксель в пиксель, видимые пиксели ±4/255 в среднем).
/// Движок Flutter декодирует WebP на всех платформах.
///
/// Где Читавук уместен (семь ролей — всё остальное без него):
/// 1. Знакомство: онбординг, пустая библиотека. Один раз, hero/regular.
/// 2. Собеседник: перевод в карточке разбора говорит волк (читалка, Вукоток).
/// 3. Реакция: урок следит за состоянием (MascotView), финал — slavlje.
/// 4. Процесс: thinking при загрузке разбора, ukaz в прогрессе перевода.
/// 5. Пустое/ошибочное состояние: поза по смыслу (zbunjen — пусто/ошибка)
///    плюс действие (повторить, добавить).
/// 6. Реплика-предупреждение: говорит от первого лица («книга тяжеловата»).
/// 7. Подпись: «О приложении» — авторский волк.
///
/// Шапки разделов, списки и диалоги-инструкции обходятся без него: волк,
/// который ничего не делает и ничего не говорит, — обои. Анимация (парение,
/// искры) — только у живого момента: приветствие, реакция, победа. Иллюстрация
/// процесса или раздела стоит спокойно. Reduced motion гасит всё через
/// FloatingBob/SparkleBurst — новых бесконечных анимаций не заводить.
class Wolf {
  static const zdravo =
      'assets/imgs/citavuk_zdravo.webp'; // приветствие (тёмный фон)
  static const povtor =
      'assets/imgs/citavuk_povtor.webp'; // карточки/повторение (светлый)
  static const ukaz =
      'assets/imgs/citavuk_ukaz.webp'; // лапка-указатель (светлый)
  static const gram =
      'assets/imgs/citavuk_gram.webp'; // перевод слова/фразы (тёмный фон)
  static const rule =
      'assets/imgs/citavuk_rule.webp'; // грамматика, лупа (светлый)
  static const english =
      'assets/imgs/citavuk_english.webp'; // английское слово (светлый)
  static const zadumch =
      'assets/imgs/citavuk_zadumch.webp'; // раздумье: книга не по зубам (светлый)
  static const roadmap =
      'assets/imgs/citavuk_roadmap.webp'; // дорожная карта языка (светлый)
  static const utesi =
      'assets/imgs/citavuk_utesi.webp'; // утешение после ошибки (светлый)
  static const slavlje =
      'assets/imgs/citavuk_slavlje.webp'; // празднование победы (светлый)
  static const cita = 'assets/imgs/citavuk_cita.webp'; // читает книгу (светлый)
  static const zbunjen =
      'assets/imgs/citavuk_zbunjen.webp'; // растерянность: ошибка, пусто (светлый)
  static const vukotok =
      'assets/imgs/citavuk_vukotok.webp'; // лента Вукотока (светлый)

  /// Арты-стикеры, у которых фон вокруг волка тёмный (нарисован в самом файле).
  /// Их красивее показывать в тёмной «рамке-стикере», светлые — в светлой.
  static const _darkBg = {zdravo, gram};
  static bool hasDarkBackground(String asset) => _darkBg.contains(asset);
}

/// Единые размеры маскота: компактный — плотные списки и карточки, обычный —
/// реплики и приветствия, hero — знакомство, пустые состояния, финал занятия.
/// Волк в приложении крупный: мелкий маскот не читается и теряется.
///
/// Коробка изображения фиксированная под размер, поэтому смена позы текст не
/// двигает: внутри коробки арт показывается целиком (BoxFit.contain).
abstract final class WolfSize {
  static const double compact = 96;
  static const double regular = 168;
  static const double hero = 220;
}

/// Ширина декодирования под фактическую плотность экрана, а не постоянный
/// множитель: на экране 1x тройной запас зря грел память и процессор.
int mascotCacheWidth(BuildContext context, double size) {
  final dpr = MediaQuery.devicePixelRatioOf(context);
  if (!dpr.isFinite || dpr <= 0) return (size * 2).round();
  return (size * dpr).round();
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
    this.size = WolfSize.regular,
    this.animate = false,
    this.frame = false, // Отключили рамки по умолчанию
  });

  @override
  Widget build(BuildContext context) {
    final dark = Wolf.hasDarkBackground(asset);
    if (size <= WolfSize.compact) {
      return WolfPortrait(asset: asset, size: size);
    }
    // Декодируем под размер показа с учётом плотности экрана, а не в полное
    // разрешение (исходники — 1254 px), иначе зря тратим память/CPU.
    final image = Image.asset(
      asset,
      fit: BoxFit.contain,
      cacheWidth: mascotCacheWidth(context, size),
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
/// На небольшом месте показываем лицо, а не уменьшаем всю фигуру до иконки.
class WolfPortrait extends StatelessWidget {
  const WolfPortrait({super.key, required this.asset, required this.size});
  final String asset;
  final double size;
  @override
  Widget build(BuildContext context) => Semantics(
      image: true,
      label: 'Читавук',
      child: SizedBox.square(
          dimension: size,
          child: ClipOval(
              child: Transform.scale(
            scale: 1.65,
            alignment: const Alignment(0, -.4),
            child: Image.asset(asset,
                fit: BoxFit.contain,
                cacheWidth: mascotCacheWidth(context, size * 1.65)),
          ))));
}

class WolfAvatar extends StatelessWidget {
  final double size;
  final String? asset;
  const WolfAvatar({super.key, this.size = WolfSize.compact, this.asset});

  @override
  Widget build(BuildContext context) {
    return WolfPortrait(asset: asset ?? Wolf.zdravo, size: size);
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

  /// Крутить ли волка бесконечным парением. В повторяющихся рабочих сценах
  /// (карточка слова) парение выключают: достаточно короткой реакции.
  final bool animate;

  /// Одноразовое приветственное подпрыгивание вместо парения: волк встречает
  /// после перерыва, а не висит в воздухе постоянно. Играет один раз при
  /// появлении; reduced motion и скрытые вкладки гасятся внутри реакции.
  final bool greet;

  const WolfBubble({
    super.key,
    required this.text,
    this.title,
    this.textStyle,
    this.asset,
    this.wolfSize = WolfSize.regular,
    this.animate = false,
    this.greet = false,
  });

  @override
  State<WolfBubble> createState() => _WolfBubbleState();
}

class _WolfBubbleState extends State<WolfBubble> {
  bool _isPetting = false;

  void _petWolf() {
    if (_isPetting) return;
    setState(() => _isPetting = true);
    // Довольное подтверждение — тихо: поглаживание не должно пугать.
    InterfaceSounds.instance.enabled =
        context.read<AppSettings>().interfaceSoundEnabled;
    unawaited(
        InterfaceSounds.instance.play(InterfaceSound.confirm, volume: 0.18));
    Future.delayed(const Duration(seconds: 4), () {
      if (mounted) setState(() => _isPetting = false);
    });
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
      builder: (context, constraints) =>
          _buildBubble(context, constraints.maxWidth));

  Widget _buildBubble(BuildContext context, double availableWidth) {
    final scheme = Theme.of(context).colorScheme;

    final wolfSize = availableWidth < 420
        ? widget.wolfSize.clamp(0.0, WolfSize.compact)
        : widget.wolfSize;

    final currentText =
        _isPetting ? 'Ой, спасибо! Я так тебя люблю! ❤️' : widget.text;
    final currentAsset = _isPetting ? Wolf.zdravo : widget.asset;

    return FadeSlideIn(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          GestureDetector(
            onTap: _petWolf,
            child: currentAsset == null
                ? WolfAvatar(size: wolfSize, asset: currentAsset)
                : widget.greet
                    // Встреча — прыжок один раз, дальше волк стоит спокойно.
                    ? MascotReaction(
                        reaction: 'correct',
                        child: WolfSticker(
                          asset: currentAsset,
                          size: wolfSize,
                          frame: false,
                          animate: false,
                        ),
                      )
                    : WolfSticker(
                        asset: currentAsset,
                        size: wolfSize,
                        frame: false,
                        animate: widget.animate,
                      ),
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
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
