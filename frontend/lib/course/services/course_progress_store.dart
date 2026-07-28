/// Локальное хранение прогресса курса.
///
/// Пока это единственное хранилище; при появлении серверного прогресса
/// (master-prompt §13) станет офлайн-кешем — формат уже совпадает с
/// серверными сущностями.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../models/progress.dart';

class CourseProgressStore {
  static const String _key = 'course_progress_v1';
  static const String _updatedKey = 'course_progress_updated_at_v1';
  static ApiClient? _api;
  static AuthService? _auth;

  /// Один транспорт используется приложением и курсом. Статическая настройка
  /// сохраняет простой конструктор контроллера и не связывает виджеты курса с
  /// Provider.
  static void configure({
    required ApiClient api,
    required AuthService auth,
  }) {
    _api = api;
    _auth = auth;
  }

  /// Читает прогресс. Возвращает null, если его ещё нет или он повреждён.
  Future<CourseProgress?> load(String courseId) async {
    final local = await _loadLocal(courseId);
    final api = _api;
    final auth = _auth;
    if (api == null || auth?.isSignedIn != true) return local;

    try {
      final response = await api
          .get('/v1/course/progress/$courseId')
          .timeout(const Duration(seconds: 6));
      if (response is! Map || response['payload'] is! Map) return local;
      final remote = CourseProgress.fromJson(
          (response['payload'] as Map).cast<String, dynamic>());
      if (remote.courseId != courseId) return local;

      final merged = local == null ? remote : _merge(local, remote);
      final remoteAt = DateTime.tryParse('${response['updatedAt']}')
              ?.millisecondsSinceEpoch ??
          0;
      await _saveLocal(merged, remoteAt);

      // Если локальные уроки дополнили серверные, сразу отправляем общий
      // документ. Ошибка сети не отменяет локальное сохранение.
      if (jsonEncode(merged.toJson()) != jsonEncode(remote.toJson())) {
        unawaited(_upload(merged));
      }
      return merged;
    } on ApiException catch (e) {
      if (e.status == 404 && local != null) unawaited(_upload(local));
      return local;
    } on TimeoutException {
      return local;
    } catch (e) {
      debugPrint('course progress: сервер недоступен ($e)');
      return local;
    }
  }

  Future<void> save(CourseProgress progress) async {
    final updatedAt = DateTime.now().millisecondsSinceEpoch;
    await _saveLocal(progress, updatedAt);
    if (_auth?.isSignedIn == true && _api != null) {
      unawaited(_upload(progress, updatedAt: updatedAt));
    }
  }

  Future<CourseProgress?> _loadLocal(String courseId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      final progress = CourseProgress.fromJson(decoded.cast<String, dynamic>());
      return progress.courseId == courseId ? progress : null;
    } catch (e) {
      debugPrint('course progress: не удалось прочитать ($e)');
      return null;
    }
  }

  Future<void> _saveLocal(CourseProgress progress, int updatedAt) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, jsonEncode(progress.toJson()));
      await prefs.setInt(_updatedKey, updatedAt);
    } catch (e) {
      debugPrint('course progress: не удалось сохранить ($e)');
    }
  }

  Future<void> _upload(CourseProgress progress, {int? updatedAt}) async {
    final api = _api;
    if (api == null || _auth?.isSignedIn != true) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final timestamp = updatedAt ??
          prefs.getInt(_updatedKey) ??
          DateTime.now().millisecondsSinceEpoch;
      await api.put(
        '/v1/course/progress/${progress.courseId}',
        {
          'payload': progress.toJson(),
          'updatedAt':
              DateTime.fromMillisecondsSinceEpoch(timestamp, isUtc: true)
                  .toIso8601String(),
        },
        timeout: const Duration(seconds: 10),
      );
    } catch (e) {
      debugPrint('course progress: отправка отложена ($e)');
    }
  }

  CourseProgress _merge(CourseProgress local, CourseProgress remote) {
    final lessons = Map<String, LessonProgress>.of(remote.lessons);
    for (final entry in local.lessons.entries) {
      final current = lessons[entry.key];
      if (current == null) {
        lessons[entry.key] = entry.value;
        continue;
      }
      final localAt = entry.value.completedAt?.millisecondsSinceEpoch ?? 0;
      final remoteAt = current.completedAt?.millisecondsSinceEpoch ?? 0;
      final newest = localAt >= remoteAt ? entry.value : current;
      lessons[entry.key] = newest.copyWith(
        bestScore: entry.value.bestScore > current.bestScore
            ? entry.value.bestScore
            : current.bestScore,
        attemptsCount: entry.value.attemptsCount > current.attemptsCount
            ? entry.value.attemptsCount
            : current.attemptsCount,
      );
    }

    final mastery = Map<String, ObjectiveMastery>.of(remote.mastery);
    for (final entry in local.mastery.entries) {
      final current = mastery[entry.key];
      final localAt = entry.value.lastSeenAt?.millisecondsSinceEpoch ?? 0;
      final remoteAt = current?.lastSeenAt?.millisecondsSinceEpoch ?? 0;
      if (current == null || localAt >= remoteAt) {
        mastery[entry.key] = entry.value;
      }
    }

    final localDay = local.streak.lastStudyDate?.millisecondsSinceEpoch ?? 0;
    final remoteDay = remote.streak.lastStudyDate?.millisecondsSinceEpoch ?? 0;
    final latestStreak = localDay >= remoteDay ? local.streak : remote.streak;
    final longest = local.streak.longestDays > remote.streak.longestDays
        ? local.streak.longestDays
        : remote.streak.longestDays;

    return CourseProgress(
      courseId: local.courseId,
      courseVersion: local.courseVersion,
      lessons: lessons,
      mastery: mastery,
      streak: Streak(
        currentDays: latestStreak.currentDays,
        longestDays: longest,
        lastStudyDate: latestStreak.lastStudyDate,
      ),
      xp: local.xp > remote.xp ? local.xp : remote.xp,
      activeLesson: local.activeLesson ?? remote.activeLesson,
    );
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
    await prefs.remove(_updatedKey);
  }
}
