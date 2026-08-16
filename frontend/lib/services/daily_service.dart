import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/daily.dart';
import 'api_client.dart';
import 'daily_widget.dart';

/// «На каждый день»: слова, текст и сводка повторений.
///
/// Слова приходят сразу, а текст догоняет отдельным запросом: модель думает
/// секунды, а слова человек хочет видеть сейчас.
class DailyService {
  DailyService({required this.api});

  final ApiClient api;

  /// День последнего показа окна. Окно, встречающее по десять раз на дню,
  /// закрывают не глядя — вместе со всем, что в нём было полезного.
  static const _shownKey = 'citavuk_daily_shown_day';

  /// Слепок набора и сводки для виджета на рабочем столе: виджет живёт вне
  /// приложения и в сеть не ходит.
  static const cacheKey = 'citavuk_daily_cache_v1';

  Future<DailyState> load() async {
    final data = await api.get('/v1/daily');
    final state = DailyState.fromJson(data as Map<String, dynamic>);
    await _cache(state);
    return state;
  }

  Future<DailySettings> settings() async {
    final data = await api.get('/v1/daily/settings');
    return DailySettings.fromJson(data as Map<String, dynamic>);
  }

  /// Пустой [themes] значит «всё подряд».
  Future<void> saveSettings({
    required List<String> themes,
    bool enabled = true,
    String level = '',
  }) async {
    await api.put('/v1/daily/settings', {
      'themes': themes,
      'enabled': enabled,
      if (level.isNotEmpty) 'level': level,
    });
  }

  /// Просит модель написать текст с сегодняшними словами.
  ///
  /// Ждём дольше обычного запроса: сервер сам держит соединение с моделью до
  /// семидесяти секунд, и оборвать его раньше значит потерять готовый текст.
  Future<DailyLesson> compose() async {
    final data = await api.post(
      '/v1/daily/lesson',
      null,
      timeout: const Duration(seconds: 80),
    );
    final lesson = (data as Map<String, dynamic>)['lesson'];
    return DailyLesson.fromJson(lesson as Map<String, dynamic>);
  }

  /// Отмечает слово выученным. Возвращает все отмеченные за день.
  Future<List<String>> markLearned(String lemma) async {
    final data = await api.post('/v1/daily/learn', {'lemma': lemma});
    final learned = [
      for (final item in ((data as Map<String, dynamic>)['learned'] as List? ??
          const []))
        item.toString(),
    ];
    await noteLearned(learned);
    return learned;
  }

  Future<DailyProgress> progress() async {
    final data = await api.get('/v1/daily/progress');
    return DailyProgress.fromJson(
      (data as Map<String, dynamic>)['progress'] as Map<String, dynamic>? ??
          const {},
    );
  }

  /// Показывали ли окно сегодня.
  Future<bool> shownToday() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_shownKey) == _today();
  }

  Future<void> rememberShown() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_shownKey, _today());
  }

  /// Последний слепок для виджета. Null, если приложение ещё не выходило в сеть.
  Future<Map<String, dynamic>?> cached() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(cacheKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      // Слепок испорчен — виджет обойдётся без него до следующего запуска.
      return null;
    }
  }

  Future<void> _cache(DailyState state) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      cacheKey,
      jsonEncode({
        'day': state.set?.day ?? _today(),
        'set': state.set?.toJson(),
        'progress': state.progress.toJson(),
      }),
    );
    // Не ждём: перерисовка виджета — побочное дело, а человек ждёт слова.
    // Ожидание тут однажды уже вешало окно на вечном кружке.
    unawaited(DailyWidget.refresh());
  }

  /// Отмечает слово выученным в слепке для виджета.
  ///
  /// Ждать следующего захода в окно незачем: галочка на рабочем столе — то
  /// немногое, что видно сразу после добавления слова.
  Future<void> noteLearned(List<String> learned) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(cacheKey);
    if (raw == null || raw.isEmpty) return;
    try {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      final set = data['set'];
      if (set is! Map<String, dynamic>) return;
      set['learned'] = learned;
      await prefs.setString(cacheKey, jsonEncode(data));
      unawaited(DailyWidget.refresh());
    } catch (_) {
      // Слепок испорчен — обновится при следующей загрузке набора.
    }
  }

  static String _today() {
    final now = DateTime.now();
    return '${now.year.toString().padLeft(4, '0')}-'
        '${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
  }
}
