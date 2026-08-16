/// Мелочи для пиксельной графики сада.
///
/// Спрайты нарисованы по пикселям, и сглаживание при увеличении превращает их
/// в мыло: `FilterQuality.none` здесь не украшение, а условие того, что сад
/// выглядит так же, как на сайте.
library;

import 'package:flutter/widgets.dart';

const String gardenArt = 'assets/imgs/garden';

/// Картинка мира: путь короткий, потому что каталог один.
class PixelImage extends StatelessWidget {
  const PixelImage(
    this.asset, {
    super.key,
    required this.width,
    required this.height,
    this.flip = false,
    this.opacity,
  });

  final String asset;
  final double width;
  final double height;

  /// Отражение по горизонтали: тем же спрайтом Читавук смотрит в обе стороны.
  final bool flip;
  final double? opacity;

  @override
  Widget build(BuildContext context) {
    Widget image = Image.asset(
      asset,
      width: width,
      height: height,
      filterQuality: FilterQuality.none,
      isAntiAlias: false,
      fit: BoxFit.fill,
      opacity: opacity == null ? null : AlwaysStoppedAnimation(opacity!),
    );
    if (flip) {
      image = Transform(
        alignment: Alignment.center,
        transform: Matrix4.identity()..scaleByDouble(-1, 1, 1, 1),
        child: image,
      );
    }
    return image;
  }
}

/// Один кадр из горизонтального листа.
///
/// Кадры вырезаются обрезкой и сдвигом, а не отдельными файлами: лист ходьбы —
/// это четыре позы в одном рисунке, и резать его на диске значило бы держать
/// четыре почти одинаковых файла.
class SpriteFrame extends StatelessWidget {
  const SpriteFrame({
    super.key,
    required this.asset,
    required this.frame,
    required this.frames,
    required this.width,
    required this.height,
    this.flip = false,
  });

  final String asset;
  final int frame;
  final int frames;

  /// Размер одного кадра на экране.
  final double width;
  final double height;
  final bool flip;

  @override
  Widget build(BuildContext context) {
    final index = frames <= 0 ? 0 : frame % frames;
    final sheet = SizedBox(
      width: width,
      height: height,
      child: ClipRect(
        child: OverflowBox(
          alignment: Alignment.topLeft,
          maxWidth: width * frames,
          maxHeight: height,
          child: Transform.translate(
            offset: Offset(-width * index, 0),
            child: Image.asset(
              asset,
              width: width * frames,
              height: height,
              filterQuality: FilterQuality.none,
              isAntiAlias: false,
              fit: BoxFit.fill,
            ),
          ),
        ),
      ),
    );
    if (!flip) return sheet;
    return Transform(
      alignment: Alignment.center,
      transform: Matrix4.identity()..scaleByDouble(-1, 1, 1, 1),
      child: sheet,
    );
  }
}

/// Поле, вымощенное тайлом. Тайлы сада — 16×16 пикселей.
BoxDecoration tiled(String asset, double scale) => BoxDecoration(
      image: DecorationImage(
        image: ExactAssetImage(asset, scale: 1 / scale),
        repeat: ImageRepeat.repeat,
        filterQuality: FilterQuality.none,
        isAntiAlias: false,
      ),
    );

/// Табличка с сербским словом и русским пояснением.
class GardenLabel extends StatelessWidget {
  const GardenLabel({super.key, required this.serbian, required this.russian});

  final String serbian;
  final String russian;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 2, 8, 3),
      decoration: BoxDecoration(
        color: const Color(0xFFF8E7BA),
        border: Border.all(color: const Color(0xFF70452F), width: 2),
        boxShadow: const [
          BoxShadow(color: Color(0xFF4D3227), offset: Offset(0, 3)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            serbian,
            style: const TextStyle(
              color: Color(0xFF3F2A1D),
              fontWeight: FontWeight.w700,
              height: 1.1,
            ),
          ),
          Text(
            russian,
            style: const TextStyle(color: Color(0xFF7A5B43), fontSize: 11),
          ),
        ],
      ),
    );
  }
}
