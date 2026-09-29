import 'package:flutter/material.dart';

/// Картинка из ассетов, которая декодируется под свой размер на экране.
///
/// Маскоты и обложки лежат в ассетах по 1254 px. Без подсказки декодеру
/// каждая раскрывается в память целиком — около 6 МБ, даже когда видна
/// иконкой в две строки. Здесь ширина берётся из раскладки и умножается на
/// плотность экрана: картинка остаётся чёткой, а памяти уходит в разы меньше.
class SizedAssetImage extends StatelessWidget {
  const SizedAssetImage(
    this.asset, {
    super.key,
    this.fit = BoxFit.contain,
    this.alignment = Alignment.center,
    this.color,
    this.colorBlendMode,
    this.errorBuilder,
  });

  final String asset;
  final BoxFit fit;
  final Alignment alignment;
  final Color? color;
  final BlendMode? colorBlendMode;
  final ImageErrorWidgetBuilder? errorBuilder;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      final ratio = MediaQuery.devicePixelRatioOf(context);
      final width = constraints.maxWidth.isFinite ? constraints.maxWidth : null;
      final height = constraints.maxHeight.isFinite ? constraints.maxHeight : null;
      // Только вписывание: для cover пришлось бы знать пропорции исходника,
      // иначе панорама в высокой рамке декодировалась бы слишком мелкой.
      final contain = fit == BoxFit.contain || fit == BoxFit.scaleDown;
      final cacheWidth = contain && width != null ? (width * ratio).round() : null;
      final cacheHeight = contain && width == null && height != null ? (height * ratio).round() : null;
      return Image.asset(
        asset,
        fit: fit,
        alignment: alignment,
        color: color,
        colorBlendMode: colorBlendMode,
        cacheWidth: cacheWidth,
        cacheHeight: cacheHeight,
        filterQuality: FilterQuality.medium,
        errorBuilder: errorBuilder,
      );
    });
  }
}
