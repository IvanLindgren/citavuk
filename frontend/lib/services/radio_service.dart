import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

/// Радиостанция для фоновой музыки во время чтения.
class RadioStation {
  final String name;
  final String genre;
  final String url;
  final String emoji;
  const RadioStation({
    required this.name,
    required this.genre,
    required this.url,
    required this.emoji,
  });
}

/// Управляет фоновым радио (потоковое аудио) для чтения. Singleton-ChangeNotifier:
/// UI слушает его и обновляется. Все вызовы плеера обёрнуты в try/catch, чтобы
/// проблемы со звуком/сетью никогда не роняли приложение.
class RadioService extends ChangeNotifier {
  RadioService._();
  static final RadioService instance = RadioService._();

  final AudioPlayer _player = AudioPlayer(playerId: 'chitavuk_radio');
  bool _initialized = false;

  /// Подборка лёгких станций для чтения (SomaFM — чилл/эмбиент/lo-fi).
  static const stations = <RadioStation>[
    RadioStation(
      name: 'Groove Salad',
      genre: 'Спокойный',
      emoji: '🌿',
      url: 'https://ice1.somafm.com/groovesalad-128-mp3',
    ),
    RadioStation(
      name: 'Fluid',
      genre: 'Lo-fi',
      emoji: '🎧',
      url: 'https://ice1.somafm.com/fluid-128-mp3',
    ),
    RadioStation(
      name: 'Beat Blender',
      genre: 'Мягкий',
      emoji: '🌊',
      url: 'https://ice1.somafm.com/beatblender-128-mp3',
    ),
    RadioStation(
      name: 'Drone Zone',
      genre: 'Эмбиент',
      emoji: '🌌',
      url: 'https://ice1.somafm.com/dronezone-128-mp3',
    ),
    RadioStation(
      name: 'Deep Space One',
      genre: 'Космический эмбиент',
      emoji: '🚀',
      url: 'https://ice1.somafm.com/deepspaceone-128-mp3',
    ),
  ];

  int _stationIndex = 0;
  bool _playing = false;
  bool _loading = false;
  double _volume = 0.45;
  String? _error;

  int get stationIndex => _stationIndex.clamp(0, stations.length - 1);
  RadioStation get station => stations[stationIndex];
  bool get playing => _playing;
  bool get loading => _loading;
  double get volume => _volume;
  String? get error => _error;

  Future<void> _ensureInit() async {
    if (_initialized) return;
    _initialized = true;
    try {
      await _player.setReleaseMode(ReleaseMode.stop);
      _player.onPlayerStateChanged.listen((s) {
        _playing = s == PlayerState.playing;
        if (_playing) _loading = false;
        notifyListeners();
      });
    } catch (_) {}
  }

  /// Восстанавливает выбор станции/громкости из сохранённых настроек.
  void configure({int? stationIndex, double? volume}) {
    if (stationIndex != null) {
      _stationIndex = stationIndex.clamp(0, stations.length - 1);
    }
    if (volume != null) _volume = volume.clamp(0.0, 1.0);
  }

  Future<void> setStation(int index) async {
    _stationIndex = index.clamp(0, stations.length - 1);
    notifyListeners();
    if (_playing || _loading) await play();
  }

  Future<void> setVolume(double v) async {
    _volume = v.clamp(0.0, 1.0);
    notifyListeners();
    try {
      await _player.setVolume(_volume);
    } catch (_) {}
  }

  Future<void> play() async {
    await _ensureInit();
    _error = null;
    _loading = true;
    notifyListeners();
    try {
      await _player.stop();
      await _player.setVolume(_volume);
      await _player.play(UrlSource(station.url));
      _playing = true;
    } catch (_) {
      _error = 'Не получилось включить радио — проверь интернет';
      _playing = false;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> stop() async {
    try {
      await _player.stop();
    } catch (_) {}
    _playing = false;
    _loading = false;
    notifyListeners();
  }

  Future<void> toggle() async {
    if (_playing || _loading) {
      await stop();
    } else {
      await play();
    }
  }
}
