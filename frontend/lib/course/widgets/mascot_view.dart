/// Читавук в уроке и на карте курса.
///
/// Основной путь — sprite-анимация из сгенерированного atlas. Если manifest
/// или atlas недоступны, показывается статичный арт `Wolf.*`: маскот не
/// должен исчезать из-за проблемы с ассетом (master-prompt §11.6).
library;

import 'package:flutter/material.dart';

import '../../widgets/wolf_mascot.dart';
import '../services/sprite_manifest.dart';
import '../state/lesson_controller.dart';
import 'citavuk_sprite.dart';

/// Загружает manifest один раз на всё приложение.
class MascotSprites {
  MascotSprites._();

  static Future<SpriteManifest>? _future;

  static Future<SpriteManifest> load() => _future ??= SpriteManifest.load();

  /// Прогревает atlas до начала урока (§37: карта не декодирует всё сразу,
  /// но урок открывается без мигания).
  static Future<void> precache() async {
    try {
      final manifest = await load();
      await SpriteAtlasCache.instance.precache(manifest.byId.values);
    } catch (_) {
      // Прогрев необязателен: при ошибке останется статичный fallback.
    }
  }

  @visibleForTesting
  static void reset() => _future = null;
}

class MascotView extends StatelessWidget {
  const MascotView({
    super.key,
    required this.state,
    this.size = 72,
    this.onAnimationCompleted,
    this.still = false,
  });

  final MascotState state;
  final double size;
  final VoidCallback? onAnimationCompleted;

  /// Один кадр вместо анимации: Читавук как часть оформления экрана, а не
  /// ответ на действие человека.
  final bool still;

  /// Статичный арт под состояние — он же fallback для sprite-пути.
  String get _asset => switch (state) {
        MascotState.idle => Wolf.ukaz,
        MascotState.thinking => Wolf.rule,
        MascotState.correct => Wolf.zdravo,
        MascotState.incorrect => Wolf.rule,
        MascotState.lessonComplete => Wolf.zdravo,
      };

  String get _semanticLabel => switch (state) {
        MascotState.idle => 'Читавук ждёт ответа',
        MascotState.thinking => 'Читавук думает',
        MascotState.correct => 'Читавук радуется правильному ответу',
        MascotState.incorrect => 'Читавук подсказывает',
        MascotState.lessonComplete => 'Читавук поздравляет с завершением урока',
      };

  @override
  Widget build(BuildContext context) {
    final fallback = _StaticMascot(asset: _asset, label: _semanticLabel);

    return SizedBox(
      // Высота фиксирована: смена состояния не двигает layout (§11.6).
      height: size,
      child: FutureBuilder<SpriteManifest>(
        future: MascotSprites.load(),
        builder: (context, snapshot) {
          final manifest = snapshot.data;
          final spec = manifest?.byState[state.name];
          if (spec == null) return fallback;
          return CitavukSprite(
            spec: spec,
            height: size,
            semanticLabel: _semanticLabel,
            fallback: fallback,
            onCompleted: onAnimationCompleted,
            still: still,
          );
        },
      ),
    );
  }
}

class _StaticMascot extends StatelessWidget {
  const _StaticMascot({required this.asset, required this.label});

  final String asset;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: label,
      child: Image.asset(
        asset,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
      ),
    );
  }
}
