import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/reader_settings.dart';

/// Глобальное реактивное состояние настроек (тема, чтение, напоминания).
/// Подключается через provider в main.dart.
class AppSettings extends ChangeNotifier {
  static const _key = 'reader_settings_v1';
  static const _kNotify = 'notify_enabled';
  static const _kHour = 'notify_hour';
  static const _kMinute = 'notify_minute';
  static const _kMusicPrompted = 'music_prompted';
  static const _kMusicEnabled = 'music_enabled';
  static const _kMusicStation = 'music_station';
  static const _kMusicVolume = 'music_volume';
  static const _kBackendUrl = 'backend_url';
  static const _kSyncUrl = 'sync_url';
  static const _kFirstRunDone = 'first_run_done';
  static const _kCourseSound = 'course_sound_enabled';
  static const _kInterfaceSound = 'interface_sound_enabled';
  static const _kAutoUpdate = 'auto_update_check';
  static const _kKeepScreenOn = 'keep_screen_on';
  static const _kLastLibraryVisit = 'citavuk_last_library_visit_ms';
  static const _kLastFarewellDay = 'citavuk_last_farewell_day';
  static const _kLastSeasonalDay = 'citavuk_last_seasonal_day';

  /// Сервер разбора/перевода по умолчанию — твой Hugging Face Space.
  /// На реальном телефоне localhost (10.0.2.2/127.0.0.1) недоступен, поэтому
  /// нужен публичный адрес.
  static const defaultBackendUrl =
      'https://ivanessalingren-citavukspace.hf.space';

  /// Прямая ссылка на файл словаря в репозитории Space (можно заменить более
  /// полным словарём, загрузив его в Space).
  static const defaultDictionaryUrl =
      'https://huggingface.co/spaces/ivanessalingren/citavukspace/resolve/main/lexicon.db';

  /// Сервер аккаунтов и синхронизации (Go-бэкенд на собственном сервере).
  ///
  /// Отделён от [defaultBackendUrl] намеренно: разбор слов и новости пока живут
  /// на прежнем Python-сервисе, и переносить их можно по частям, не трогая
  /// синхронизацию.
  static const defaultSyncUrl = 'https://api.citavuk.ru';

  ReaderSettings _reader = const ReaderSettings();
  ReaderSettings get reader => _reader;

  bool _notificationsEnabled = false;
  int _reminderHour = 19;
  int _reminderMinute = 0;
  bool get notificationsEnabled => _notificationsEnabled;
  int get reminderHour => _reminderHour;
  int get reminderMinute => _reminderMinute;

  // Радио/музыка для чтения.
  bool _musicPrompted = false; // спрашивали ли уже «любишь читать с музыкой?»
  bool _musicEnabled = false;
  int _musicStation = 0;
  double _musicVolume = 0.45;
  bool get musicPrompted => _musicPrompted;
  bool get musicEnabled => _musicEnabled;
  int get musicStation => _musicStation;
  double get musicVolume => _musicVolume;

  // Сервер перевода/разбора и первый запуск.
  String _backendUrl = defaultBackendUrl;
  String _syncUrl = defaultSyncUrl;
  bool _firstRunDone = false;
  String get backendUrl => _backendUrl;
  String get syncUrl => _syncUrl;
  bool get firstRunDone => _firstRunDone;

  /// Звук обратной связи в курсе. По умолчанию включён, но громкость низкая,
  /// и радио он не прерывает (master-prompt §19).
  bool _courseSoundEnabled = true;
  bool get courseSoundEnabled => _courseSoundEnabled;

  bool _interfaceSoundEnabled = true;
  bool get interfaceSoundEnabled => _interfaceSoundEnabled;

  /// Последний визит в библиотеку: волк встречает после перерыва, а не при
  /// каждой перерисовке. Перерыв — первый визит или больше 6 часов тишины.
  int _lastLibraryVisitMs = 0;

  /// Отмечает визит и возвращает, был ли перерыв. Ошибка хранилища визит не
  /// отменяет: молчание волка хуже лишнего приветствия.
  Future<bool> markLibraryVisit() async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final hadBreak = _lastLibraryVisitMs == 0 ||
        now - _lastLibraryVisitMs > const Duration(hours: 6).inMilliseconds;
    _lastLibraryVisitMs = now;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_kLastLibraryVisit, now);
    } catch (_) {}
    return hadBreak;
  }

  /// День последнего вечернего прощания (`год-месяц-день`, локальное время).
  String _lastFarewellDay = '';

  /// День последнего сезонного приветствия (как у прощания).
  String _lastSeasonalDay = '';

  /// Сезонное приветствие: раз в сутки. Возвращает, показывать ли сегодня.
  /// Пустой id (обычный день) не запоминается — завтра календарь спросят снова.
  Future<bool> markSeasonal(String id) async {
    if (id.isEmpty) return false;
    final now = DateTime.now();
    final today = '${now.year}-${now.month}-${now.day}:$id';
    if (_lastSeasonalDay == today) return false;
    _lastSeasonalDay = today;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kLastSeasonalDay, today);
    } catch (_) {}
    return true;
  }

  /// Прощание на ночь: раз в сутки, вечером (после 21 или до 5), когда
  /// повторять нечего. Симметрия утренней встрече: волк провожает так же
  /// лично, как встречает.
  Future<bool> markFarewell() async {
    final now = DateTime.now();
    final evening = now.hour >= 21 || now.hour < 5;
    final today = '${now.year}-${now.month}-${now.day}';
    final due = evening && _lastFarewellDay != today;
    if (due) {
      _lastFarewellDay = today;
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_kLastFarewellDay, today);
      } catch (_) {}
    }
    return due;
  }

  Future<void> setInterfaceSoundEnabled(bool value) async {
    _interfaceSoundEnabled = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kInterfaceSound, value);
  }

  Future<void> setCourseSoundEnabled(bool value) async {
    _courseSoundEnabled = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kCourseSound, value);
  }

  /// Не давать экрану гаснуть в читалке и в плеере.
  ///
  /// Чтение — редкое занятие, при котором экрана не касаются минутами, и
  /// системный тайм-аут гасит его посреди страницы. Выключатель существует
  /// потому, что батарея — расходуемый ресурс: телефон, забытый открытым на
  /// книге, иначе разрядится за ночь, и виноватым окажется приложение.
  bool _keepScreenOn = true;
  bool get keepScreenOn => _keepScreenOn;

  Future<void> setKeepScreenOn(bool value) async {
    _keepScreenOn = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kKeepScreenOn, value);
  }

  /// Проверять обновления при запуске (только Windows и Linux).
  bool _autoUpdateCheck = true;
  bool get autoUpdateCheck => _autoUpdateCheck;

  Future<void> setAutoUpdateCheck(bool value) async {
    _autoUpdateCheck = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kAutoUpdate, value);
  }

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw != null) {
        _reader =
            ReaderSettings.fromMap(jsonDecode(raw) as Map<String, dynamic>);
      }
      _notificationsEnabled = prefs.getBool(_kNotify) ?? false;
      _reminderHour = prefs.getInt(_kHour) ?? 19;
      _reminderMinute = prefs.getInt(_kMinute) ?? 0;
      _musicPrompted = prefs.getBool(_kMusicPrompted) ?? false;
      _musicEnabled = prefs.getBool(_kMusicEnabled) ?? false;
      _musicStation = prefs.getInt(_kMusicStation) ?? 0;
      _musicVolume = prefs.getDouble(_kMusicVolume) ?? 0.45;
      final savedBackend = prefs.getString(_kBackendUrl);
      if (savedBackend != null && savedBackend.trim().isNotEmpty) {
        _backendUrl = savedBackend.trim();
      }
      final savedSync = prefs.getString(_kSyncUrl);
      if (savedSync != null && savedSync.trim().isNotEmpty) {
        _syncUrl = savedSync.trim();
      }
      _firstRunDone = prefs.getBool(_kFirstRunDone) ?? false;
      _lastFarewellDay = prefs.getString(_kLastFarewellDay) ?? '';
      _lastSeasonalDay = prefs.getString(_kLastSeasonalDay) ?? '';
      _lastLibraryVisitMs = prefs.getInt(_kLastLibraryVisit) ?? 0;
      _courseSoundEnabled = prefs.getBool(_kCourseSound) ?? true;
      _interfaceSoundEnabled = prefs.getBool(_kInterfaceSound) ?? true;
      _autoUpdateCheck = prefs.getBool(_kAutoUpdate) ?? true;
      _keepScreenOn = prefs.getBool(_kKeepScreenOn) ?? true;
    } catch (_) {
      // Повреждённые настройки — откатываемся к дефолтам.
    }
  }

  Future<void> update(ReaderSettings next) async {
    _reader = next;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, jsonEncode(next.toMap()));
    } catch (_) {}
  }

  Future<void> setReminder(
      {required bool enabled, int? hour, int? minute}) async {
    _notificationsEnabled = enabled;
    if (hour != null) _reminderHour = hour;
    if (minute != null) _reminderMinute = minute;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_kNotify, _notificationsEnabled);
      await prefs.setInt(_kHour, _reminderHour);
      await prefs.setInt(_kMinute, _reminderMinute);
    } catch (_) {}
  }

  /// Помечаем, что уже спросили про музыку (чтобы не спрашивать повторно).
  Future<void> setMusicPrompted(bool v) async {
    _musicPrompted = v;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_kMusicPrompted, v);
    } catch (_) {}
  }

  Future<void> setMusic({bool? enabled, int? station, double? volume}) async {
    if (enabled != null) _musicEnabled = enabled;
    if (station != null) _musicStation = station;
    if (volume != null) _musicVolume = volume;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_kMusicEnabled, _musicEnabled);
      await prefs.setInt(_kMusicStation, _musicStation);
      await prefs.setDouble(_kMusicVolume, _musicVolume);
    } catch (_) {}
  }

  Future<void> setBackendUrl(String url) async {
    _backendUrl = url.trim().isEmpty ? defaultBackendUrl : url.trim();
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kBackendUrl, _backendUrl);
    } catch (_) {}
  }

  Future<void> setSyncUrl(String url) async {
    _syncUrl = url.trim().isEmpty ? defaultSyncUrl : url.trim();
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kSyncUrl, _syncUrl);
    } catch (_) {}
  }

  Future<void> setFirstRunDone(bool v) async {
    _firstRunDone = v;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_kFirstRunDone, v);
    } catch (_) {}
  }
}
