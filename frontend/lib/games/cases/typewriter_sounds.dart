import 'dart:async';
import 'dart:math';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum TypewriterSound { key, space, bell, thud }

/// Звуки печатной машинки. Пулы, а не один плеер: на быстром наборе удары
/// накладываются, как у настоящих рычагов, а не обрывают друг друга.
class TypewriterSounds {
  TypewriterSounds._();
  static final instance = TypewriterSounds._();

  static const _muteKey = 'citavuk-typewriter-muted';
  final _random = Random();
  List<AudioPool> _keys = const [];
  AudioPool? _space, _bell;
  Future<void>? _loading;
  int _lastKey = -1;
  bool muted = false;

  Future<void> prepare() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      muted = prefs.getBool(_muteKey) ?? false;
    } catch (_) {
      // Без настроек звук просто включён.
    }
    try {
      _keys = await Future.wait([
        for (var i = 1; i <= 7; i++)
          AudioPool.createFromAsset(path: 'sounds/typewriter/key-$i.mp3', maxPlayers: 2),
      ]);
      _space = await AudioPool.createFromAsset(path: 'sounds/typewriter/space.mp3', maxPlayers: 2);
      _bell = await AudioPool.createFromAsset(path: 'sounds/typewriter/bell.mp3', maxPlayers: 1);
    } catch (error) {
      // Нет звукового устройства — игра остаётся без звука, но работает.
      debugPrint('Звуки машинки не загрузились: $error');
    }
  }

  Future<void> setMuted(bool value) async {
    muted = value;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_muteKey, value);
    } catch (_) {}
  }

  void play(TypewriterSound sound) {
    if (muted) return;
    switch (sound) {
      case TypewriterSound.bell:
        unawaited(_bell?.start(volume: .7));
      case TypewriterSound.space:
        unawaited((_space ?? _keyPool())?.start(volume: .8));
      case TypewriterSound.thud:
        unawaited(_keyPool()?.start(volume: 1));
      case TypewriterSound.key:
        unawaited(_keyPool()?.start(volume: .85));
    }
  }

  AudioPool? _keyPool() {
    if (_keys.isEmpty) return null;
    // Соседние удары не повторяются: иначе быстрый набор звучит пулемётом.
    var index = _random.nextInt(_keys.length);
    if (index == _lastKey && _keys.length > 1) index = (index + 1) % _keys.length;
    _lastKey = index;
    return _keys[index];
  }
}
