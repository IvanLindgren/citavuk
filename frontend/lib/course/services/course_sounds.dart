/// Звуковая обратная связь курса (master-prompt §19).
///
/// Сигналы короткие и тихие, а режим воспроизведения — «подмешать к другим»:
/// пользовательское радио продолжает играть, курс его не останавливает.
/// Отключается в настройках; на неподдерживаемых платформах молча ничего не
/// делает, а не падает.
library;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

/// Какой сигнал проиграть.
enum CourseSound {
  correct('sounds/correct.wav'),
  incorrect('sounds/incorrect.wav'),
  lessonComplete('sounds/lesson_complete.wav');

  const CourseSound(this.asset);

  /// Путь относительно `assets/` — так его ждёт AssetSource.
  final String asset;
}

class CourseSounds {
  CourseSounds._();

  static final CourseSounds instance = CourseSounds._();

  AudioPlayer? _player;
  bool _unavailable = false;

  /// Включён ли звук. Значение приходит из настроек приложения.
  bool enabled = true;

  Future<AudioPlayer?> _ensurePlayer() async {
    if (_unavailable) return null;
    final existing = _player;
    if (existing != null) return existing;
    try {
      final player = AudioPlayer(playerId: 'citavuk_course_sfx')
        ..setReleaseMode(ReleaseMode.stop);
      // mixWithOthers — ключевой пункт: учебный сигнал не выбивает радио и
      // не забирает аудиофокус насовсем.
      await player.setAudioContext(
        AudioContextConfig(
          focus: AudioContextConfigFocus.mixWithOthers,
          respectSilence: true,
        ).build(),
      );
      _player = player;
      return player;
    } catch (e) {
      _unavailable = true;
      debugPrint('course sounds: аудио недоступно ($e)');
      return null;
    }
  }

  /// Проигрывает сигнал. Ошибки воспроизведения не всплывают в UI: звук —
  /// вспомогательный канал, урок без него работает полностью.
  Future<void> play(CourseSound sound) async {
    if (!enabled) return;
    try {
      final player = await _ensurePlayer();
      if (player == null) return;
      await player.stop();
      await player.play(AssetSource(sound.asset), volume: 0.45);
    } catch (e) {
      debugPrint('course sounds: не удалось проиграть ${sound.asset} ($e)');
    }
  }

  Future<void> dispose() async {
    await _player?.dispose();
    _player = null;
  }
}
