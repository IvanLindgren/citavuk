/// Манифест sprite-анимаций Читавука.
///
/// Файл генерируется `tools/sprite_build` из исходных PNG-кадров; здесь он
/// только читается (master-prompt §11.4).
library;

import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

const String kSpriteManifestAsset = 'assets/animations/generated/manifest.json';

/// Описание одной анимации в atlas.
class SpriteAnimationSpec {
  final String id;

  /// Путь к atlas внутри assets.
  final String asset;
  final int frameWidth;
  final int frameHeight;
  final int columns;
  final int rows;
  final int frames;
  final int fps;
  final bool loop;
  final double anchorX;
  final double anchorY;

  /// Контрольная сумма исходной последовательности кадров.
  final String sourceChecksum;

  /// Состояния маскота, которые обслуживает эта анимация.
  final List<String> states;

  const SpriteAnimationSpec({
    required this.id,
    required this.asset,
    required this.frameWidth,
    required this.frameHeight,
    required this.columns,
    required this.rows,
    required this.frames,
    required this.fps,
    required this.loop,
    required this.sourceChecksum,
    this.states = const [],
    this.anchorX = 0.5,
    this.anchorY = 1.0,
  });

  Duration get frameDuration =>
      Duration(microseconds: fps <= 0 ? 125000 : (1000000 / fps).round());

  double get aspectRatio => frameHeight == 0 ? 1 : frameWidth / frameHeight;

  factory SpriteAnimationSpec.fromJson(Map<String, dynamic> j) {
    final anchor = j['anchor'];
    final spec = SpriteAnimationSpec(
      id: (j['id'] ?? '') as String,
      asset: (j['asset'] ?? '') as String,
      frameWidth: (j['frameWidth'] as num?)?.toInt() ?? 0,
      frameHeight: (j['frameHeight'] as num?)?.toInt() ?? 0,
      columns: (j['columns'] as num?)?.toInt() ?? 1,
      rows: (j['rows'] as num?)?.toInt() ?? 1,
      frames: (j['frames'] as num?)?.toInt() ?? 0,
      fps: (j['fps'] as num?)?.toInt() ?? 8,
      loop: j['loop'] == true,
      sourceChecksum: (j['sourceChecksum'] ?? '') as String,
      states: (j['states'] as List?)?.whereType<String>().toList() ?? const [],
      anchorX: anchor is Map ? ((anchor['x'] as num?)?.toDouble() ?? 0.5) : 0.5,
      anchorY: anchor is Map ? ((anchor['y'] as num?)?.toDouble() ?? 1.0) : 1.0,
    );
    if (spec.id.isEmpty || spec.asset.isEmpty) {
      throw const FormatException('sprite manifest: анимация без id или asset');
    }
    if (spec.frames <= 0 || spec.frameWidth <= 0 || spec.frameHeight <= 0) {
      throw FormatException(
          'sprite manifest: у «${spec.id}» некорректные размеры кадра');
    }
    if (spec.columns * spec.rows < spec.frames) {
      throw FormatException(
          'sprite manifest: сетка ${spec.columns}×${spec.rows} меньше ${spec.frames} кадров у «${spec.id}»');
    }
    return spec;
  }
}

/// Разобранный манифест: анимации по id и по состоянию маскота.
class SpriteManifest {
  final int version;
  final Map<String, SpriteAnimationSpec> byId;
  final Map<String, SpriteAnimationSpec> byState;

  const SpriteManifest({
    required this.version,
    required this.byId,
    required this.byState,
  });

  static SpriteManifest parse(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! Map) {
      throw const FormatException('sprite manifest: ожидался JSON-объект');
    }
    final specs = (decoded['animations'] as List? ?? const [])
        .whereType<Map>()
        .map((a) => SpriteAnimationSpec.fromJson(a.cast<String, dynamic>()))
        .toList();
    if (specs.isEmpty) {
      throw const FormatException('sprite manifest не содержит анимаций');
    }
    final byState = <String, SpriteAnimationSpec>{};
    for (final spec in specs) {
      for (final state in spec.states) {
        byState[state] = spec;
      }
    }
    return SpriteManifest(
      version: (decoded['version'] as num?)?.toInt() ?? 1,
      byId: {for (final s in specs) s.id: s},
      byState: byState,
    );
  }

  static Future<SpriteManifest> load(
      {String asset = kSpriteManifestAsset}) async {
    return parse(await rootBundle.loadString(asset));
  }
}
