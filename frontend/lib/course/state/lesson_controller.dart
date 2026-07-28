/// Состояние прохождения одного урока.
///
/// Контроллер намеренно не зависит от Flutter-виджетов (кроме
/// [ChangeNotifier]) — его можно тестировать без `WidgetTester`
/// (master-prompt §24).
library;

import 'package:flutter/foundation.dart';

import '../models/answer.dart';
import '../models/course.dart';
import '../models/exercise.dart';
import '../services/answer_evaluator.dart';

/// Фаза экрана урока.
enum LessonPhase {
  /// Показывается вступление к уроку.
  intro,

  /// Пользователь отвечает на текущее упражнение.
  answering,

  /// Ответ проверен, показана обратная связь.
  checked,

  /// Урок завершён.
  finished,
}

/// Состояние маскота, вытекающее из фазы урока (§11.5).
enum MascotState { idle, thinking, correct, incorrect, lessonComplete }

/// Одна зафиксированная попытка. Отправляется на сервер и хранится локально
/// до синхронизации (master-prompt §13).
class AttemptRecord {
  final String exerciseId;
  final List<String> objectiveIds;
  final Map<String, dynamic> answerPayload;
  final bool isCorrect;

  /// true, если это была первая попытка по данному упражнению.
  final bool firstTry;
  final bool hintUsed;
  final int durationMs;
  final DateTime attemptedAt;

  const AttemptRecord({
    required this.exerciseId,
    required this.objectiveIds,
    required this.answerPayload,
    required this.isCorrect,
    required this.firstTry,
    required this.hintUsed,
    required this.durationMs,
    required this.attemptedAt,
  });

  Map<String, dynamic> toJson() => {
        'exerciseId': exerciseId,
        'objectiveIds': objectiveIds,
        'answerPayload': answerPayload,
        'isCorrect': isCorrect,
        'firstTry': firstTry,
        'hintUsed': hintUsed,
        'durationMs': durationMs,
        'attemptedAt': attemptedAt.toUtc().toIso8601String(),
      };

  static AttemptRecord fromJson(Map<String, dynamic> j) => AttemptRecord(
        exerciseId: (j['exerciseId'] ?? '') as String,
        objectiveIds:
            (j['objectiveIds'] as List?)?.whereType<String>().toList() ??
                const [],
        answerPayload:
            (j['answerPayload'] as Map?)?.cast<String, dynamic>() ?? const {},
        isCorrect: j['isCorrect'] == true,
        firstTry: j['firstTry'] == true,
        hintUsed: j['hintUsed'] == true,
        durationMs: (j['durationMs'] as num?)?.toInt() ?? 0,
        attemptedAt:
            DateTime.tryParse((j['attemptedAt'] ?? '') as String)?.toLocal() ??
                DateTime.now(),
      );
}

/// Итог урока.
class LessonSummary {
  final String lessonId;

  /// Сколько упражнений пройдено с первой попытки.
  final int firstTryCorrect;

  /// Сколько всего уникальных упражнений в уроке.
  final int total;
  final Duration elapsed;

  /// Цели, по которым были ошибки, — кандидаты в очередь повторения.
  final Set<String> weakObjectiveIds;
  final List<AttemptRecord> attempts;

  const LessonSummary({
    required this.lessonId,
    required this.firstTryCorrect,
    required this.total,
    required this.elapsed,
    required this.weakObjectiveIds,
    required this.attempts,
  });

  /// Доля успеха от 0 до 1.
  double get score => total == 0 ? 0 : firstTryCorrect / total;
}

/// Управляет прохождением урока: очередь упражнений, проверка, повтор ошибок.
class LessonController extends ChangeNotifier {
  LessonController({
    required this.lesson,
    required this.evaluator,
    required this.courseVersion,
    required this.contentChecksum,
    DateTime? startedAt,
    this.now = DateTime.now,
  })  : _startedAt = startedAt ?? DateTime.now(),
        _queue = lesson.exercises.map((e) => e.id).toList() {
    _phase = lesson.intro == null ? LessonPhase.answering : LessonPhase.intro;
  }

  final Lesson lesson;
  final AnswerEvaluator evaluator;
  final String courseVersion;
  final String contentChecksum;

  /// Источник времени — подменяется в тестах.
  final DateTime Function() now;

  final DateTime _startedAt;

  /// Очередь ID упражнений. Ошибочные добавляются в конец (§5.3).
  final List<String> _queue;
  int _index = 0;

  LessonPhase _phase = LessonPhase.answering;
  Answer? _draft;
  EvaluationResult? _result;
  bool _hintShown = false;
  DateTime? _exerciseShownAt;

  /// Сколько раз пользователь отвечал на каждое упражнение.
  final Map<String, int> _attemptCounts = {};

  /// Упражнения, уже поставленные в очередь на повтор, — чтобы не добавить
  /// одно и то же дважды.
  final Set<String> _requeued = {};

  /// Упражнения, решённые с первой попытки.
  final Set<String> _firstTryCorrect = {};
  final List<AttemptRecord> _attempts = [];

  LessonPhase get phase => _phase;
  EvaluationResult? get result => _result;
  Answer? get draft => _draft;
  bool get hintShown => _hintShown;
  List<AttemptRecord> get attempts => List.unmodifiable(_attempts);

  /// Текущее упражнение. null — когда урок завершён.
  Exercise? get current {
    if (_index >= _queue.length) return null;
    final id = _queue[_index];
    for (final e in lesson.exercises) {
      if (e.id == id) return e;
    }
    return null;
  }

  /// Прогресс урока от 0 до 1 — по числу закрытых уникальных упражнений.
  double get progress {
    final total = lesson.exercises.length;
    if (total == 0) return 1;
    final done = lesson.exercises
        .where(
            (e) => _attemptCounts.containsKey(e.id) && !_requeuedPending(e.id))
        .length;
    return (done / total).clamp(0, 1);
  }

  bool _requeuedPending(String exerciseId) =>
      _queue.skip(_index).contains(exerciseId);

  /// Номер текущего шага и общее число шагов в очереди — для индикатора.
  int get step => _index + 1;
  int get totalSteps => _queue.length;

  MascotState get mascot => switch (_phase) {
        LessonPhase.finished => MascotState.lessonComplete,
        LessonPhase.checked => _result?.correct == true
            ? MascotState.correct
            : MascotState.incorrect,
        LessonPhase.answering => _draft != null && !_draft!.isEmpty
            ? MascotState.thinking
            : MascotState.idle,
        LessonPhase.intro => MascotState.idle,
      };

  /// Кнопка «Проверить» активна только при непустом ответе.
  bool get canCheck =>
      _phase == LessonPhase.answering && _draft != null && !_draft!.isEmpty;

  /// Завершает показ вступления.
  void startExercises() {
    if (_phase != LessonPhase.intro) return;
    _phase = LessonPhase.answering;
    _exerciseShownAt = now();
    notifyListeners();
  }

  /// Обновляет черновик ответа. Проверку не запускает.
  void setAnswer(Answer? answer) {
    if (_phase != LessonPhase.answering) return;
    _draft = answer;
    _exerciseShownAt ??= now();
    notifyListeners();
  }

  /// Показывает подсказку. Влияет на прирост mastery (§17).
  void showHint() {
    if (_hintShown) return;
    _hintShown = true;
    notifyListeners();
  }

  /// Проверяет текущий ответ.
  void check() {
    final exercise = current;
    final answer = _draft;
    if (_phase != LessonPhase.answering || exercise == null || answer == null) {
      return;
    }
    final result = evaluator.evaluate(exercise, answer);
    final priorAttempts = _attemptCounts[exercise.id] ?? 0;
    final firstTry = priorAttempts == 0;
    _attemptCounts[exercise.id] = priorAttempts + 1;

    if (result.correct && firstTry && !_hintShown) {
      _firstTryCorrect.add(exercise.id);
    }
    // Ошибку показываем ещё раз в конце урока — но ставим в очередь один раз.
    if (!result.correct && !_requeued.contains(exercise.id)) {
      _requeued.add(exercise.id);
      _queue.add(exercise.id);
    }

    _attempts.add(AttemptRecord(
      exerciseId: exercise.id,
      objectiveIds: exercise.learningObjectiveIds,
      answerPayload: answer.toJson(),
      isCorrect: result.correct,
      firstTry: firstTry,
      hintUsed: _hintShown,
      durationMs: _exerciseShownAt == null
          ? 0
          : now().difference(_exerciseShownAt!).inMilliseconds,
      attemptedAt: now(),
    ));

    _result = result;
    _phase = LessonPhase.checked;
    notifyListeners();
  }

  /// Переходит к следующему упражнению или завершает урок.
  void next() {
    if (_phase != LessonPhase.checked) return;
    _index++;
    _draft = null;
    _result = null;
    _hintShown = false;
    _exerciseShownAt = now();
    _phase =
        _index >= _queue.length ? LessonPhase.finished : LessonPhase.answering;
    notifyListeners();
  }

  /// Итог урока. Доступен и до завершения — для промежуточного отчёта.
  LessonSummary get summary {
    final weak = <String>{};
    for (final a in _attempts) {
      if (!a.isCorrect) weak.addAll(a.objectiveIds);
    }
    return LessonSummary(
      lessonId: lesson.id,
      firstTryCorrect: _firstTryCorrect.length,
      total: lesson.exercises.length,
      elapsed: now().difference(_startedAt),
      weakObjectiveIds: weak,
      attempts: List.unmodifiable(_attempts),
    );
  }

  /// Снимок незавершённого урока (master-prompt §25).
  ///
  /// Содержит `contentChecksum`: при обновлении контента восстановление
  /// прерывается осознанно, а не приводит к рассинхрону упражнений и ответов.
  Map<String, dynamic> toSnapshot() => {
        'lessonId': lesson.id,
        'courseVersion': courseVersion,
        'contentChecksum': contentChecksum,
        'queue': _queue,
        'index': _index,
        'phase': _phase.name,
        'draft': _draft?.toJson(),
        'hintShown': _hintShown,
        'attemptCounts': _attemptCounts,
        'requeued': _requeued.toList(),
        'firstTryCorrect': _firstTryCorrect.toList(),
        'attempts': _attempts.map((a) => a.toJson()).toList(),
        'startedAt': _startedAt.toUtc().toIso8601String(),
      };

  /// Восстанавливает контроллер из снимка.
  ///
  /// Возвращает null, если снимок относится к другому уроку или к другой
  /// версии контента: молча продолжать в этом случае нельзя.
  static LessonController? restore(
    Map<String, dynamic> snapshot, {
    required Lesson lesson,
    required AnswerEvaluator evaluator,
    required String courseVersion,
    required String contentChecksum,
    DateTime Function() now = DateTime.now,
  }) {
    if (snapshot['lessonId'] != lesson.id) return null;
    if (snapshot['contentChecksum'] != contentChecksum) return null;

    final startedAt =
        DateTime.tryParse((snapshot['startedAt'] ?? '') as String)?.toLocal();
    final c = LessonController(
      lesson: lesson,
      evaluator: evaluator,
      courseVersion: courseVersion,
      contentChecksum: contentChecksum,
      startedAt: startedAt,
      now: now,
    );

    final queue = (snapshot['queue'] as List?)?.whereType<String>().toList();
    final valid = lesson.exercises.map((e) => e.id).toSet();
    if (queue == null ||
        queue.isEmpty ||
        queue.any((id) => !valid.contains(id))) {
      return null;
    }
    c._queue
      ..clear()
      ..addAll(queue);
    c._index =
        ((snapshot['index'] as num?)?.toInt() ?? 0).clamp(0, queue.length);
    c._hintShown = snapshot['hintShown'] == true;
    c._attemptCounts.addAll(
      ((snapshot['attemptCounts'] as Map?) ?? const {})
          .map((k, v) => MapEntry('$k', (v as num).toInt())),
    );
    c._requeued.addAll(
        (snapshot['requeued'] as List?)?.whereType<String>() ?? const []);
    c._firstTryCorrect.addAll(
        (snapshot['firstTryCorrect'] as List?)?.whereType<String>() ??
            const []);
    c._attempts.addAll(((snapshot['attempts'] as List?) ?? const [])
        .whereType<Map>()
        .map((a) => AttemptRecord.fromJson(a.cast<String, dynamic>())));

    final draft = snapshot['draft'];
    if (draft is Map) {
      c._draft = Answer.fromJson(draft.cast<String, dynamic>());
    }
    // Восстанавливаем в состояние ответа: показывать старую обратную связь
    // после перезапуска не нужно, ответ при этом сохраняется.
    c._phase = c._index >= c._queue.length
        ? LessonPhase.finished
        : LessonPhase.answering;
    return c;
  }
}
