/// Временное событие «Одиссея»: 24 песни, прогресс и награда.
///
/// Повторяет `web/src/events/odyssey.ts` по правилам, а не по коду: событие
/// одно, документ прогресса на сервере общий (`event-odyssey-2026`), и песня,
/// закрытая в браузере, обязана быть закрытой в приложении. Разошедшиеся
/// правила означали бы, что человек «теряет» пройденное при смене устройства.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';

/// Идентификатор события в локальном хранилище.
const String kOdysseyEventId = 'odyssey-2026';

/// Документ прогресса на сервере. Транспорт общий с курсом
/// (`/v1/course/progress/{id}`), но id отдельный.
const String kOdysseyRemoteId = 'event-odyssey-2026';

const int kOdysseyChapterCount = 24;

/// Окно события. Время московское — как на сайте.
final DateTime kOdysseyStartsAt = DateTime.parse('2026-08-01T00:00:00+03:00');
final DateTime kOdysseyEndsAt = DateTime.parse('2026-09-01T00:00:00+03:00');

/// Награда: фон читалки со спартанскими шлемами.
const String kOdysseyRewardTexture = 'odyssey';

bool odysseyAvailable([DateTime? at]) {
  final now = (at ?? DateTime.now()).toUtc();
  return !now.isBefore(kOdysseyStartsAt.toUtc()) &&
      now.isBefore(kOdysseyEndsAt.toUtc());
}

/// Прогресс одного человека по событию.
@immutable
class OdysseyProgress {
  const OdysseyProgress({
    this.completedChapters = const [],
    this.lastChapter = 1,
    this.updatedAt = 0,
  });

  /// Закрытые песни. Всегда непрерывный ряд 1..n — см. [completeChapter].
  final List<int> completedChapters;

  /// Песня, на которой человек остановился.
  final int lastChapter;

  final int updatedAt;

  bool get rewardUnlocked => completedChapters.length == kOdysseyChapterCount;

  /// Первая незакрытая песня — дальше неё пройти нельзя.
  int get firstIncomplete =>
      completedChapters.length + 1 > kOdysseyChapterCount
          ? kOdysseyChapterCount
          : completedChapters.length + 1;

  double get fraction => completedChapters.length / kOdysseyChapterCount;

  bool isCompleted(int chapter) => completedChapters.contains(chapter);

  /// Приводит прочитанное к допустимому виду.
  ///
  /// Ряд закрытых песен обрезается по первому разрыву: событие проходится по
  /// порядку, и «закрыта 24-я, а 5-я нет» означает испорченные данные, а не
  /// заслуженную награду.
  factory OdysseyProgress.fromJson(Map<String, dynamic> json) {
    final raw = json['completedChapters'];
    final numbers = <int>{};
    if (raw is List) {
      for (final value in raw) {
        final n = value is int ? value : int.tryParse('$value');
        if (n != null && n >= 1 && n <= kOdysseyChapterCount) numbers.add(n);
      }
    }
    final sorted = numbers.toList()..sort();
    final continuous = <int>[];
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i] != i + 1) break;
      continuous.add(sorted[i]);
    }

    final stored = json['lastChapter'];
    final last = stored is int ? stored : int.tryParse('$stored') ?? 1;
    return OdysseyProgress(
      completedChapters: continuous,
      lastChapter: last.clamp(1, kOdysseyChapterCount),
      updatedAt: (json['updatedAt'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'completedChapters': completedChapters,
        'lastChapter': lastChapter,
        'rewardUnlocked': rewardUnlocked,
        'updatedAt': updatedAt,
      };

  /// Закрывает песню. Только следующую по порядку: иначе открытая напрямую
  /// последняя песня засчиталась бы за прочитанную поэму.
  OdysseyProgress completeChapter(int chapter) {
    if (chapter != firstIncomplete || isCompleted(chapter)) return this;
    final next = [...completedChapters, chapter];
    return OdysseyProgress(
      completedChapters: next,
      lastChapter: (chapter + 1).clamp(1, kOdysseyChapterCount),
      updatedAt: DateTime.now().millisecondsSinceEpoch,
    );
  }

  OdysseyProgress rememberChapter(int chapter) => OdysseyProgress(
        completedChapters: completedChapters,
        lastChapter: chapter.clamp(1, kOdysseyChapterCount),
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      );

  /// Объединяет свой прогресс с серверным: закрытые песни складываются, а ряд
  /// снова обрезается по первому разрыву.
  OdysseyProgress mergeWith(OdysseyProgress other) {
    final union = <int>{...completedChapters, ...other.completedChapters};
    return OdysseyProgress.fromJson({
      'completedChapters': union.toList(),
      'lastChapter':
          lastChapter > other.lastChapter ? lastChapter : other.lastChapter,
      'updatedAt': updatedAt > other.updatedAt ? updatedAt : other.updatedAt,
    });
  }
}

/// Хранилище прогресса события: SharedPreferences + серверный документ.
///
/// Ключ привязан к id аккаунта: награда принадлежит человеку, а не устройству,
/// и на общем компьютере чужой фон в настройках появляться не должен.
class OdysseyStore {
  OdysseyStore({required this.api, required this.auth});

  final ApiClient api;
  final AuthService auth;

  static String _key(String accountId) =>
      'citavuk-event-$kOdysseyEventId-$accountId';

  Future<OdysseyProgress> loadLocal(String accountId) async {
    if (accountId.isEmpty) return const OdysseyProgress();
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key(accountId));
      if (raw == null || raw.isEmpty) return const OdysseyProgress();
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return const OdysseyProgress();
      return OdysseyProgress.fromJson(decoded.cast<String, dynamic>());
    } catch (e) {
      debugPrint('odyssey: не удалось прочитать прогресс ($e)');
      return const OdysseyProgress();
    }
  }

  Future<void> saveLocal(String accountId, OdysseyProgress progress) async {
    if (accountId.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key(accountId), jsonEncode(progress.toJson()));
    } catch (e) {
      debugPrint('odyssey: не удалось сохранить прогресс ($e)');
    }
  }

  /// Сливает локальный прогресс с серверным и возвращает результат.
  /// Сеть недоступна — остаётся локальный: событие обязано открываться офлайн.
  Future<OdysseyProgress> sync(String accountId) async {
    final local = await loadLocal(accountId);
    if (accountId.isEmpty || !auth.isSignedIn) return local;

    try {
      final response = await api
          .get('/v1/course/progress/$kOdysseyRemoteId')
          .timeout(const Duration(seconds: 6));
      if (response is! Map || response['payload'] is! Map) return local;
      final remote = OdysseyProgress.fromJson(
          (response['payload'] as Map).cast<String, dynamic>());
      final merged = local.mergeWith(remote);
      await saveLocal(accountId, merged);
      if (merged.completedChapters.length != remote.completedChapters.length) {
        await upload(merged);
      }
      return merged;
    } on ApiException catch (e) {
      if (e.status == 404 && local.completedChapters.isNotEmpty) {
        await upload(local);
      }
      return local;
    } catch (e) {
      debugPrint('odyssey: сервер недоступен ($e)');
      return local;
    }
  }

  /// Отправляет прогресс на сервер. Ошибка сети не откатывает локальное
  /// сохранение — иначе закрытая офлайн песня потерялась бы.
  Future<void> upload(OdysseyProgress progress) async {
    if (!auth.isSignedIn) return;
    try {
      final at = progress.updatedAt == 0
          ? DateTime.now().millisecondsSinceEpoch
          : progress.updatedAt;
      await api.put(
        '/v1/course/progress/$kOdysseyRemoteId',
        {
          'payload': progress.toJson(),
          'updatedAt': DateTime.fromMillisecondsSinceEpoch(at, isUtc: true)
              .toIso8601String(),
        },
        timeout: const Duration(seconds: 10),
      );
    } catch (e) {
      debugPrint('odyssey: отправка отложена ($e)');
    }
  }
}
