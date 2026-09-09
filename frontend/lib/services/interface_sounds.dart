import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

/// Тихие звуки пространства библиотеки. Они не заменяют звук курса и могут
/// быть отключены отдельно: чтение не должно внезапно превращаться в игру.
enum InterfaceSound {
  openCollection('sounds/ui_open.ogg'),
  openBook('sounds/book_open.ogg'),
  dealCards('sounds/card_deal.ogg'),

  /// Переворот карточки: тот же шелест, что раздача, — отдельным именем,
  /// чтобы зов звучал по смыслу, а не по файлу.
  flip('sounds/card_deal.ogg'),

  /// Клик плитки в сборке фразы: короткий чужой блип на минимальной
  /// громкости. Кулдаун плеера не даёт частым нажатиям сложиться в треск.
  tile('sounds/ui_open.ogg'),
  confirm('sounds/ui_confirm.ogg'),
  error('sounds/ui_error.ogg'),
  complete('sounds/ui_complete.ogg');

  const InterfaceSound(this.asset);
  final String asset;
}

class InterfaceSounds {
  InterfaceSounds._();
  static final InterfaceSounds instance = InterfaceSounds._();

  AudioPlayer? _player;
  bool _unavailable = false;
  bool enabled = true;
  bool _playingRequest = false;
  final Stopwatch _cooldown = Stopwatch();

  Future<AudioPlayer?> _ensurePlayer() async {
    if (_unavailable) return null;
    if (_player != null) return _player;
    try {
      final player = AudioPlayer(playerId: 'citavuk_interface_sfx');
      await player.setReleaseMode(ReleaseMode.stop);
      await player.setAudioContext(
        AudioContextConfig(
          focus: AudioContextConfigFocus.mixWithOthers,
          respectSilence: true,
        ).build(),
      );
      _player = player;
      return player;
    } catch (error) {
      _unavailable = true;
      debugPrint('interface sounds: audio unavailable ($error)');
      return null;
    }
  }

  Future<void> play(InterfaceSound sound, {double volume = .24}) async {
    if (!enabled ||
        _playingRequest ||
        (_cooldown.isRunning && _cooldown.elapsedMilliseconds < 120)) {
      return;
    }
    _playingRequest = true;
    _cooldown
      ..reset()
      ..start();
    try {
      final player = await _ensurePlayer();
      if (player == null || !enabled) return;
      await player.stop();
      await player.play(AssetSource(sound.asset), volume: volume);
    } catch (error) {
      debugPrint('interface sounds: could not play ${sound.asset} ($error)');
    } finally {
      _playingRequest = false;
    }
  }

  Future<void> dispose() async {
    await _player?.dispose();
    _player = null;
  }
}
