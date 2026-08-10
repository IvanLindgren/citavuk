/// Звук дуэли с переводчиком.
///
/// Файлы синтезированы (tools/build_duel_sounds.py) и лежат в
/// assets/sounds/duel. Отличие от звуков курса (course/services/course_sounds)
/// — пул проигрывателей: клик клавиши срабатывает по нескольку раз в секунду, и
/// одиночный player обрывал бы сам себя, а удар попадал бы в тишину.
library;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

/// Звуки боя. Значение — путь относительно `assets/`, как его ждёт AssetSource.
enum DuelSound {
  hit('sounds/duel/hit.wav', 0.8),
  crit('sounds/duel/crit.wav', 0.9),
  guard('sounds/duel/guard.wav', 0.6),
  charge('sounds/duel/charge.wav', 0.45),
  alarm('sounds/duel/alarm.wav', 0.5),
  start('sounds/duel/start.wav', 0.75),
  combo('sounds/duel/combo.wav', 0.5),
  victory('sounds/duel/victory.wav', 0.7),
  defeat('sounds/duel/defeat.wav', 0.6);

  const DuelSound(this.asset, this.volume);

  final String asset;
  final double volume;
}

/// Ступеней клика столько же, сколько файлов key_*.wav.
const int duelKeySteps = 8;

class DuelSounds {
  DuelSounds._();

  static final DuelSounds instance = DuelSounds._();

  /// Сколько проигрывателей держать: столько ударов может звучать внахлёст.
  static const _poolSize = 3;

  final List<AudioPlayer> _pool = [];
  int _next = 0;
  bool _unavailable = false;

  /// Включён ли звук боя. Переключается кнопкой на арене.
  bool enabled = true;

  Future<void> _ensurePool() async {
    if (_unavailable || _pool.isNotEmpty) return;
    try {
      for (var index = 0; index < _poolSize; index++) {
        final player = AudioPlayer(playerId: 'citavuk_duel_$index')
          ..setReleaseMode(ReleaseMode.stop);
        // mixWithOthers — как и у курса: бой не выбивает чужое радио.
        await player.setAudioContext(
          AudioContextConfig(
            focus: AudioContextConfigFocus.mixWithOthers,
            respectSilence: true,
          ).build(),
        );
        _pool.add(player);
      }
    } catch (e) {
      _unavailable = true;
      debugPrint('duel sounds: аудио недоступно ($e)');
    }
  }

  Future<void> _play(String asset, double volume) async {
    if (!enabled) return;
    try {
      await _ensurePool();
      if (_pool.isEmpty) return;
      final player = _pool[_next];
      _next = (_next + 1) % _pool.length;
      await player.stop();
      await player.play(AssetSource(asset), volume: volume);
    } catch (e) {
      debugPrint('duel sounds: не удалось проиграть $asset ($e)');
    }
  }

  Future<void> play(DuelSound sound) => _play(sound.asset, sound.volume);

  /// Клик клавиши. [step] — ступень серии, 0..7.
  Future<void> playKey(int step) {
    final index = step.clamp(0, duelKeySteps - 1);
    return _play('sounds/duel/key_$index.wav', 0.5);
  }

  Future<void> dispose() async {
    for (final player in _pool) {
      await player.dispose();
    }
    _pool.clear();
    _next = 0;
  }
}
