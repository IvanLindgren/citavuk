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

  ReaderSettings _reader = const ReaderSettings();
  ReaderSettings get reader => _reader;

  bool _notificationsEnabled = false;
  int _reminderHour = 19;
  int _reminderMinute = 0;
  bool get notificationsEnabled => _notificationsEnabled;
  int get reminderHour => _reminderHour;
  int get reminderMinute => _reminderMinute;

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw != null) {
        _reader = ReaderSettings.fromMap(jsonDecode(raw) as Map<String, dynamic>);
      }
      _notificationsEnabled = prefs.getBool(_kNotify) ?? false;
      _reminderHour = prefs.getInt(_kHour) ?? 19;
      _reminderMinute = prefs.getInt(_kMinute) ?? 0;
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
}
