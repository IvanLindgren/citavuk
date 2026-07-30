/// Загрузка курса из bundled asset.
///
/// Выбран вариант A из master-prompt §15: базовый курс входит в assets
/// приложения, прогресс хранится отдельно. JSON парсится один раз и кешируется
/// (§37: «content JSON парсится один раз и кешируется»).
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:shared_preferences/shared_preferences.dart';

import '../../services/api_client.dart';
import '../models/course.dart';
import '../models/source_ref.dart';

/// Путь к собранному bundle. Файл генерируется `tools/course_build`.
const String kCourseBundleAsset = 'assets/course/course_bundle.json';
const String kDefaultCourseId = 'sr_grammar_prosvirina';
const String _remoteCourseCacheKey = 'course_bundle_remote_v1';

class CourseContentLoader {
  CourseContentLoader({this.assetPath = kCourseBundleAsset});

  final String assetPath;
  static ApiClient? _api;

  /// Подключает общий API, не делая курс зависимым от аккаунта. Публичный
  /// bundle доступен без авторизации, а встроенный asset остаётся fallback.
  static void configure({required ApiClient api}) => _api = api;

  Course? _cached;
  Future<Course>? _inFlight;

  /// Разобранный курс. Повторные вызовы возвращают кеш.
  Future<Course> load() {
    final cached = _cached;
    if (cached != null) return Future.value(cached);
    return _inFlight ??= _load().then((course) {
      _cached = course;
      _inFlight = null;
      return course;
    }, onError: (Object e) {
      _inFlight = null;
      throw e;
    });
  }

  Future<Course> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final cachedRaw = prefs.getString(_remoteCourseCacheKey);
    if (cachedRaw != null) {
      try {
        final cached = parseBundle(cachedRaw);
        unawaited(_refreshRemote(prefs));
        return cached;
      } catch (_) {
        await prefs.remove(_remoteCourseCacheKey);
      }
    }

    // Первый запуск не должен ждать сеть: базовый курс уже входит в приложение.
    // Опубликованная серверная версия сохранится в фоне и будет использована при
    // следующем открытии курса.
    final bundled = parseBundle(await rootBundle.loadString(assetPath));
    unawaited(_refreshRemote(prefs));
    return bundled;
  }

  Future<void> _refreshRemote(SharedPreferences prefs) async {
    try {
      final remote = await _fetchRemote();
      if (remote != null) {
        // Не кладём повреждённую публикацию в кеш: иначе следующий запуск
        // покажет пустой экран до ручной очистки данных приложения.
        parseBundle(remote);
        await prefs.setString(_remoteCourseCacheKey, remote);
      }
    } catch (e) {
      debugPrint('course: не удалось обновить серверную версию ($e)');
    }
  }

  Future<String?> _fetchRemote() async {
    final api = _api;
    if (api == null) return null;
    try {
      final response = await api.get(
        '/v1/course/bundle/$kDefaultCourseId',
        timeout: const Duration(seconds: 4),
      );
      if (response is Map) return jsonEncode(response);
    } catch (_) {
      // Сеть и серверный курс необязательны: asset всегда доступен офлайн.
    }
    return null;
  }

  /// Разбирает содержимое bundle. Вынесено отдельно, чтобы тестировать без
  /// участия asset-системы.
  static Course parseBundle(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! Map) {
      throw const FormatException('course bundle: ожидался JSON-объект');
    }
    final course = Course.fromJson(decoded.cast<String, dynamic>());
    if (course.units.isEmpty) {
      throw const FormatException('course bundle не содержит ни одного unit');
    }
    if (kDebugMode) {
      _warnAboutDraftContent(course);
    }
    return course;
  }

  /// В debug сообщаем о draft-контенте, который валидатор пропустил бы только
  /// при `allowDraftContent: true`.
  static void _warnAboutDraftContent(Course course) {
    if (course.config.allowDraftContent) return;
    for (final lesson in course.allLessons) {
      for (final e in lesson.exercises) {
        if (e.contentReviewStatus == ReviewStatus.draft) {
          debugPrint('course: упражнение ${e.id} имеет статус draft');
        }
      }
    }
  }

  @visibleForTesting
  void seed(Course course) => _cached = course;
}
