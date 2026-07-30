/// Состояние курса: контент, прогресс, доступность узлов.
library;

import 'package:flutter/foundation.dart';

import '../models/course.dart';
import '../models/progress.dart';
import '../services/course_content_loader.dart';
import '../services/course_progress_store.dart';
import '../services/mastery_engine.dart';
import '../state/lesson_controller.dart';

/// Стадия загрузки курса.
enum CourseLoadState { idle, loading, ready, error }

class CourseController extends ChangeNotifier {
  CourseController({
    CourseContentLoader? loader,
    CourseProgressStore? store,
    this.mastery = const MasteryEngine(),
    this.now = DateTime.now,
  })  : _loader = loader ?? CourseContentLoader(),
        _store = store ?? CourseProgressStore();

  final CourseContentLoader _loader;
  final CourseProgressStore _store;
  final MasteryEngine mastery;
  final DateTime Function() now;

  /// Минимальная доля правильных ответов, открывающая следующий урок.
  static const double kUnlockThreshold = 0.6;

  CourseLoadState _state = CourseLoadState.idle;
  Course? _course;
  CourseProgress? _progress;
  Object? _error;

  CourseLoadState get state => _state;
  Course? get course => _course;
  CourseProgress? get progress => _progress;
  Object? get error => _error;

  Future<void> load() async {
    if (_state == CourseLoadState.loading) return;
    _state = CourseLoadState.loading;
    _error = null;
    notifyListeners();
    try {
      final course = await _loader.load();
      final stored = await _store.load(course.courseId);
      _course = course;
      _progress = _reconcile(stored, course);
      _state = CourseLoadState.ready;
    } catch (e) {
      _error = e;
      _state = CourseLoadState.error;
    }
    notifyListeners();
  }

  /// Сопоставляет сохранённый прогресс с текущим контентом.
  ///
  /// Обновление курса не стирает прогресс (master-prompt §9.2): записи по
  /// исчезнувшим урокам просто отбрасываются, остальное сохраняется. Если
  /// незавершённый урок относится к другой версии контента, снимок снимается —
  /// продолжать его небезопасно.
  CourseProgress _reconcile(CourseProgress? stored, Course course) {
    if (stored == null) {
      return CourseProgress(
        courseId: course.courseId,
        courseVersion: course.courseVersion,
      );
    }
    final validLessons = course.allLessons.map((l) => l.id).toSet();
    final validObjectives = course.allObjectives.map((o) => o.id).toSet();

    final active = stored.activeLesson;
    final activeStillValid = active != null &&
        active['contentChecksum'] == course.contentChecksum &&
        validLessons.contains(active['lessonId']);

    return stored.copyWith(
      courseVersion: course.courseVersion,
      lessons: {
        for (final entry in stored.lessons.entries)
          if (validLessons.contains(entry.key)) entry.key: entry.value,
      },
      mastery: {
        for (final entry in stored.mastery.entries)
          if (validObjectives.contains(entry.key)) entry.key: entry.value,
      },
      clearActiveLesson: !activeStillValid,
    );
  }

  /// Состояние узла урока на карте (§9.1).
  LessonStatus statusOf(Lesson lesson) {
    final progress = _progress;
    if (progress == null) return LessonStatus.locked;

    final record = progress.lessons[lesson.id];
    if (record != null && record.isDone) {
      return _refineDoneStatus(lesson, record);
    }
    if (progress.activeLesson?['lessonId'] == lesson.id) {
      return LessonStatus.inProgress;
    }
    return _prerequisitesMet(lesson, progress)
        ? LessonStatus.available
        : LessonStatus.locked;
  }

  /// Пройденный урок может требовать повторения или быть освоенным.
  LessonStatus _refineDoneStatus(Lesson lesson, LessonProgress record) {
    final progress = _progress!;
    final objectives = _objectivesOf(lesson);
    if (objectives.isEmpty) return record.status;

    final current = now();
    final due = objectives.any((id) {
      final m = progress.mastery[id];
      return m == null || m.isDue(current);
    });
    if (due) return LessonStatus.needsReview;

    final allMastered = objectives.every((id) {
      final m = progress.mastery[id];
      return m != null && mastery.isMastered(m);
    });
    return allMastered ? LessonStatus.mastered : LessonStatus.completed;
  }

  Set<String> _objectivesOf(Lesson lesson) =>
      lesson.exercises.expand((e) => e.learningObjectiveIds).toSet();

  bool _prerequisitesMet(Lesson lesson, CourseProgress progress) {
    if (lesson.prerequisites.isEmpty) return true;
    return lesson.prerequisites.every((id) {
      final record = progress.lessons[id];
      return record != null &&
          record.isDone &&
          record.bestScore >= kUnlockThreshold;
    });
  }

  /// Урок можно открыть: он доступен или уже пройден (повтор разрешён всегда).
  bool canOpen(Lesson lesson) => statusOf(lesson) != LessonStatus.locked;

  /// Следующий урок, который стоит пройти.
  Lesson? get nextLesson {
    final course = _course;
    if (course == null) return null;
    for (final lesson in course.allLessons) {
      final status = statusOf(lesson);
      if (status == LessonStatus.inProgress ||
          status == LessonStatus.available ||
          status == LessonStatus.needsReview) {
        return lesson;
      }
    }
    return null;
  }

  /// Доля пройденных уроков курса.
  double get completionRatio {
    final course = _course;
    final progress = _progress;
    if (course == null || progress == null) return 0;
    final lessons = course.allLessons;
    if (lessons.isEmpty) return 0;
    final done =
        lessons.where((l) => progress.lessons[l.id]?.isDone ?? false).length;
    return done / lessons.length;
  }

  DialogueProgress? dialogueProgress(String dialogueId) =>
      _progress?.dialogues[dialogueId];

  Future<void> saveDialogueProgress(DialogueProgress dialogue) async {
    final progress = _progress;
    if (progress == null) return;
    _progress = progress.copyWith(
      dialogues: {
        ...progress.dialogues,
        dialogue.dialogueId: dialogue,
      },
    );
    await _store.save(_progress!);
    notifyListeners();
  }

  /// Сохраняет незавершённую попытку.
  Future<void> saveActiveLesson(Map<String, dynamic> snapshot) async {
    final progress = _progress;
    if (progress == null) return;
    _progress = progress.copyWith(activeLesson: snapshot);
    await _store.save(_progress!);
    notifyListeners();
  }

  /// Фиксирует завершённый урок: статус, mastery, streak, XP.
  Future<void> completeLesson(LessonSummary summary) async {
    final progress = _progress;
    if (progress == null) return;
    final current = now();

    final previous = progress.lessons[summary.lessonId];
    final bestScore = previous == null
        ? summary.score
        : (summary.score > previous.bestScore
            ? summary.score
            : previous.bestScore);

    final lessons = Map<String, LessonProgress>.of(progress.lessons);
    lessons[summary.lessonId] = LessonProgress(
      lessonId: summary.lessonId,
      status: LessonStatus.completed,
      bestScore: bestScore,
      attemptsCount: (previous?.attemptsCount ?? 0) + 1,
      completedAt: current,
    );

    // XP начисляется за верные ответы; повторное прохождение уже пройденного
    // урока даёт меньше, чтобы реплей не фармил прогресс бесконечно.
    final correct = summary.attempts.where((a) => a.isCorrect).length;
    final replayFactor = previous?.isDone == true ? 0.25 : 1.0;
    final gainedXp = (correct * 10 * replayFactor).round();

    _progress = progress.copyWith(
      lessons: lessons,
      mastery:
          mastery.applyLesson(progress.mastery, summary.attempts, now: current),
      streak: progress.streak.markStudied(current),
      xp: progress.xp + gainedXp,
      clearActiveLesson: true,
    );
    await _store.save(_progress!);
    notifyListeners();
  }

  /// Сбрасывает весь прогресс (например, при выходе из аккаунта).
  Future<void> reset() async {
    final course = _course;
    if (course == null) return;
    _progress = CourseProgress(
      courseId: course.courseId,
      courseVersion: course.courseVersion,
    );
    await _store.save(_progress!);
    notifyListeners();
  }
}
