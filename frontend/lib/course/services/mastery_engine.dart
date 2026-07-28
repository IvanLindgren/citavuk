/// Модель освоенности целей (master-prompt §17).
///
/// Простая объяснимая эвристика, а не ML: понятно, почему цель попала в
/// повторение. Все коэффициенты вынесены в [MasteryConfig] и покрыты тестами.
/// Научной точности эта модель не заявляет.
library;

import '../models/progress.dart';
import '../state/lesson_controller.dart';

class MasteryConfig {
  /// Прирост за правильный ответ с первой попытки без подсказки.
  final double gainFirstTry;

  /// Прирост за правильный ответ со второй попытки или с подсказкой.
  final double gainAssisted;

  /// Снижение за ошибку.
  final double lossOnError;

  /// Порог, с которого цель считается освоенной.
  final double masteredThreshold;

  /// Сколько ответов нужно, чтобы считать оценку обоснованной.
  final int minEvidence;

  /// Базовый интервал повторения для только что освоенной цели.
  final Duration baseReviewInterval;

  /// Во сколько раз растёт интервал с каждым уровнем уверенности.
  final double intervalGrowth;

  /// Интервал для цели, в которой была ошибка.
  final Duration errorReviewInterval;

  const MasteryConfig({
    this.gainFirstTry = 0.25,
    this.gainAssisted = 0.10,
    this.lossOnError = 0.20,
    this.masteredThreshold = 0.8,
    this.minEvidence = 3,
    this.baseReviewInterval = const Duration(days: 1),
    this.intervalGrowth = 2.2,
    this.errorReviewInterval = const Duration(hours: 8),
  });
}

class MasteryEngine {
  const MasteryEngine({this.config = const MasteryConfig()});

  final MasteryConfig config;

  /// Применяет одну попытку к состоянию цели.
  ObjectiveMastery applyAttempt(
    ObjectiveMastery current, {
    required bool isCorrect,
    required bool firstTry,
    required bool hintUsed,
    required DateTime now,
  }) {
    final delta = switch ((isCorrect, firstTry && !hintUsed)) {
      (false, _) => -config.lossOnError,
      (true, true) => config.gainFirstTry,
      (true, false) => config.gainAssisted,
    };
    final score = (current.score + delta).clamp(0.0, 1.0);
    final evidence = current.evidenceCount + 1;

    return ObjectiveMastery(
      objectiveId: current.objectiveId,
      score: score,
      evidenceCount: evidence,
      lastSeenAt: now,
      nextReviewAt: _nextReview(score, evidence, isCorrect, now),
    );
  }

  /// Срок следующего повторения.
  ///
  /// Ошибка возвращает цель в ближайшую очередь; уверенное знание отодвигается
  /// тем дальше, чем выше score и чем больше подтверждений.
  DateTime _nextReview(
      double score, int evidence, bool isCorrect, DateTime now) {
    if (!isCorrect) return now.add(config.errorReviewInterval);
    if (score < config.masteredThreshold) {
      return now.add(config.baseReviewInterval);
    }
    final level = (evidence - config.minEvidence).clamp(0, 6);
    final days = config.baseReviewInterval.inHours *
        _pow(config.intervalGrowth, level) /
        24.0;
    return now.add(Duration(hours: (days * 24).round()));
  }

  static double _pow(double base, int exponent) {
    var result = 1.0;
    for (var i = 0; i < exponent; i++) {
      result *= base;
    }
    return result;
  }

  /// Цель освоена: и оценка высока, и подтверждений достаточно.
  bool isMastered(ObjectiveMastery m) =>
      m.score >= config.masteredThreshold &&
      m.evidenceCount >= config.minEvidence;

  /// Применяет все попытки урока к карте mastery.
  Map<String, ObjectiveMastery> applyLesson(
    Map<String, ObjectiveMastery> current,
    List<AttemptRecord> attempts, {
    required DateTime now,
  }) {
    final next = Map<String, ObjectiveMastery>.of(current);
    for (final attempt in attempts) {
      for (final objectiveId in attempt.objectiveIds) {
        final existing =
            next[objectiveId] ?? ObjectiveMastery(objectiveId: objectiveId);
        next[objectiveId] = applyAttempt(
          existing,
          isCorrect: attempt.isCorrect,
          firstTry: attempt.firstTry,
          hintUsed: attempt.hintUsed,
          now: now,
        );
      }
    }
    return next;
  }
}
