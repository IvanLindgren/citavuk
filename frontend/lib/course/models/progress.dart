/// Модели прогресса курса.
///
/// Пока хранятся локально; серверная синхронизация (master-prompt §13)
/// добавляется на следующем этапе, поэтому формат сразу близок к серверному:
/// те же сущности lesson_progress / objective_mastery / streak.
library;

/// Состояние узла на карте курса (master-prompt §9.1).
enum LessonStatus {
  locked,
  available,
  inProgress,
  completed,

  /// Пройден и подтверждён высоким mastery.
  mastered,

  /// Пройден, но mastery просел или подошёл срок повторения.
  needsReview,
}

/// Прогресс по одному уроку.
class LessonProgress {
  final String lessonId;
  final LessonStatus status;

  /// Лучший результат от 0 до 1.
  final double bestScore;
  final int attemptsCount;
  final DateTime? completedAt;

  const LessonProgress({
    required this.lessonId,
    this.status = LessonStatus.available,
    this.bestScore = 0,
    this.attemptsCount = 0,
    this.completedAt,
  });

  bool get isDone =>
      status == LessonStatus.completed ||
      status == LessonStatus.mastered ||
      status == LessonStatus.needsReview;

  LessonProgress copyWith({
    LessonStatus? status,
    double? bestScore,
    int? attemptsCount,
    DateTime? completedAt,
  }) =>
      LessonProgress(
        lessonId: lessonId,
        status: status ?? this.status,
        bestScore: bestScore ?? this.bestScore,
        attemptsCount: attemptsCount ?? this.attemptsCount,
        completedAt: completedAt ?? this.completedAt,
      );

  Map<String, dynamic> toJson() => {
        'lessonId': lessonId,
        'status': status.name,
        'bestScore': bestScore,
        'attemptsCount': attemptsCount,
        'completedAt': completedAt?.toUtc().toIso8601String(),
      };

  factory LessonProgress.fromJson(Map<String, dynamic> j) => LessonProgress(
        lessonId: (j['lessonId'] ?? '') as String,
        status: LessonStatus.values.firstWhere(
          (s) => s.name == j['status'],
          orElse: () => LessonStatus.available,
        ),
        bestScore: (j['bestScore'] as num?)?.toDouble() ?? 0,
        attemptsCount: (j['attemptsCount'] as num?)?.toInt() ?? 0,
        completedAt:
            DateTime.tryParse((j['completedAt'] ?? '') as String)?.toLocal(),
      );
}

/// Освоенность одной учебной цели.
class ObjectiveMastery {
  final String objectiveId;

  /// От 0 до 1.
  final double score;

  /// Сколько ответов учтено — защищает от вывода по одному наблюдению.
  final int evidenceCount;
  final DateTime? lastSeenAt;
  final DateTime? nextReviewAt;

  const ObjectiveMastery({
    required this.objectiveId,
    this.score = 0,
    this.evidenceCount = 0,
    this.lastSeenAt,
    this.nextReviewAt,
  });

  /// Цель ждёт повторения.
  bool isDue(DateTime now) =>
      nextReviewAt != null && !nextReviewAt!.isAfter(now);

  Map<String, dynamic> toJson() => {
        'objectiveId': objectiveId,
        'score': score,
        'evidenceCount': evidenceCount,
        'lastSeenAt': lastSeenAt?.toUtc().toIso8601String(),
        'nextReviewAt': nextReviewAt?.toUtc().toIso8601String(),
      };

  factory ObjectiveMastery.fromJson(Map<String, dynamic> j) => ObjectiveMastery(
        objectiveId: (j['objectiveId'] ?? '') as String,
        score: (j['score'] as num?)?.toDouble() ?? 0,
        evidenceCount: (j['evidenceCount'] as num?)?.toInt() ?? 0,
        lastSeenAt:
            DateTime.tryParse((j['lastSeenAt'] ?? '') as String)?.toLocal(),
        nextReviewAt:
            DateTime.tryParse((j['nextReviewAt'] ?? '') as String)?.toLocal(),
      );
}

/// Серия учебных дней (master-prompt §13.3).
class Streak {
  final int currentDays;
  final int longestDays;

  /// Локальная учебная дата последней активности (без времени).
  final DateTime? lastStudyDate;

  const Streak({
    this.currentDays = 0,
    this.longestDays = 0,
    this.lastStudyDate,
  });

  /// Отмечает учебный день. Повторный вызов в тот же день серию не удваивает.
  Streak markStudied(DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    final last = lastStudyDate;
    if (last != null) {
      final lastDay = DateTime(last.year, last.month, last.day);
      if (lastDay == today) return this;
      final continued = today.difference(lastDay).inDays == 1;
      final next = continued ? currentDays + 1 : 1;
      return Streak(
        currentDays: next,
        longestDays: next > longestDays ? next : longestDays,
        lastStudyDate: today,
      );
    }
    return Streak(
      currentDays: 1,
      longestDays: longestDays < 1 ? 1 : longestDays,
      lastStudyDate: today,
    );
  }

  Map<String, dynamic> toJson() => {
        'currentDays': currentDays,
        'longestDays': longestDays,
        'lastStudyDate': lastStudyDate?.toIso8601String(),
      };

  factory Streak.fromJson(Map<String, dynamic> j) => Streak(
        currentDays: (j['currentDays'] as num?)?.toInt() ?? 0,
        longestDays: (j['longestDays'] as num?)?.toInt() ?? 0,
        lastStudyDate: DateTime.tryParse((j['lastStudyDate'] ?? '') as String),
      );
}

class DialogueProgress {
  final String dialogueId;
  final String status;
  final String currentNodeId;
  final List<String> choices;
  final DateTime updatedAt;

  const DialogueProgress({
    required this.dialogueId,
    required this.status,
    required this.currentNodeId,
    required this.choices,
    required this.updatedAt,
  });

  bool get isCompleted => status == 'completed';

  Map<String, dynamic> toJson() => {
        'dialogueId': dialogueId,
        'status': status,
        'currentNodeId': currentNodeId,
        'choices': choices,
        'updatedAt': updatedAt.toUtc().toIso8601String(),
      };

  factory DialogueProgress.fromJson(Map<String, dynamic> j) =>
      DialogueProgress(
        dialogueId: '${j['dialogueId'] ?? ''}',
        status: '${j['status'] ?? 'notStarted'}',
        currentNodeId: '${j['currentNodeId'] ?? ''}',
        choices: ((j['choices'] as List?) ?? const [])
            .map((value) => '$value')
            .toList(growable: false),
        updatedAt: DateTime.tryParse('${j['updatedAt']}') ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      );
}

/// Полный прогресс пользователя по курсу.
class CourseProgress {
  final String courseId;
  final String courseVersion;
  final Map<String, LessonProgress> lessons;
  final Map<String, ObjectiveMastery> mastery;
  final Streak streak;
  final int xp;
  final Map<String, DialogueProgress> dialogues;

  /// Снимок незавершённого урока, если он есть.
  final Map<String, dynamic>? activeLesson;

  const CourseProgress({
    required this.courseId,
    required this.courseVersion,
    this.lessons = const {},
    this.mastery = const {},
    this.streak = const Streak(),
    this.xp = 0,
    this.dialogues = const {},
    this.activeLesson,
  });

  CourseProgress copyWith({
    String? courseVersion,
    Map<String, LessonProgress>? lessons,
    Map<String, ObjectiveMastery>? mastery,
    Streak? streak,
    int? xp,
    Map<String, DialogueProgress>? dialogues,
    Map<String, dynamic>? activeLesson,
    bool clearActiveLesson = false,
  }) =>
      CourseProgress(
        courseId: courseId,
        courseVersion: courseVersion ?? this.courseVersion,
        lessons: lessons ?? this.lessons,
        mastery: mastery ?? this.mastery,
        streak: streak ?? this.streak,
        xp: xp ?? this.xp,
        dialogues: dialogues ?? this.dialogues,
        activeLesson:
            clearActiveLesson ? null : (activeLesson ?? this.activeLesson),
      );

  /// Цели, ожидающие повторения.
  List<String> dueObjectives(DateTime now) => mastery.values
      .where((m) => m.isDue(now))
      .map((m) => m.objectiveId)
      .toList()
    ..sort();

  Map<String, dynamic> toJson() => {
        'courseId': courseId,
        'courseVersion': courseVersion,
        'lessons': lessons.map((k, v) => MapEntry(k, v.toJson())),
        'mastery': mastery.map((k, v) => MapEntry(k, v.toJson())),
        'streak': streak.toJson(),
        'xp': xp,
        'dialogues': dialogues.map((k, v) => MapEntry(k, v.toJson())),
        'activeLesson': activeLesson,
      };

  factory CourseProgress.fromJson(Map<String, dynamic> j) => CourseProgress(
        courseId: (j['courseId'] ?? '') as String,
        courseVersion: (j['courseVersion'] ?? '') as String,
        lessons: ((j['lessons'] as Map?) ?? const {}).map(
          (k, v) => MapEntry('$k',
              LessonProgress.fromJson((v as Map).cast<String, dynamic>())),
        ),
        mastery: ((j['mastery'] as Map?) ?? const {}).map(
          (k, v) => MapEntry('$k',
              ObjectiveMastery.fromJson((v as Map).cast<String, dynamic>())),
        ),
        streak: Streak.fromJson(
            ((j['streak'] as Map?) ?? const {}).cast<String, dynamic>()),
        xp: (j['xp'] as num?)?.toInt() ?? 0,
        dialogues: ((j['dialogues'] as Map?) ?? const {}).map(
          (k, v) => MapEntry(
            '$k',
            DialogueProgress.fromJson((v as Map).cast<String, dynamic>()),
          ),
        ),
        activeLesson: (j['activeLesson'] as Map?)?.cast<String, dynamic>(),
      );
}
