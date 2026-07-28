/// Шелест страницы в читалке.
///
/// Как и звуки курса, подмешивается к другому звуку: радио под чтением не
/// должно прерываться. Файл собирается скриптом tools/make_page_turn.py.
library;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

class PageTurnSound {
  PageTurnSound._();

  static final PageTurnSound instance = PageTurnSound._();

  AudioPlayer? _player;
  bool _unavailable = false;

  /// Включён ли звук; значение приходит из настроек чтения.
  bool enabled = true;

  Future<AudioPlayer?> _ensurePlayer() async {
    if (_unavailable) return null;
    final existing = _player;
    if (existing != null) return existing;
    try {
      final player = AudioPlayer(playerId: 'citavuk_page_turn')
        ..setReleaseMode(ReleaseMode.stop);
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
      debugPrint('page turn: аудио недоступно ($e)');
      return null;
    }
  }

  Future<void> play() async {
    if (!enabled) return;
    try {
      final player = await _ensurePlayer();
      if (player == null) return;
      await player.stop();
      await player.play(AssetSource('sounds/page_turn.wav'), volume: 0.5);
    } catch (e) {
      debugPrint('page turn: не удалось проиграть ($e)');
    }
  }

  Future<void> dispose() async {
    await _player?.dispose();
    _player = null;
  }
}
