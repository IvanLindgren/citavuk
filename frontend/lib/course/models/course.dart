/// Структура курса: Course → Unit → Skill → Lesson → Exercise.
library;

import 'exercise.dart';
import 'source_ref.dart';

/// Конфигурация курса. Пороговые значения живут здесь, а не магическими
/// числами в UI (master-prompt §16.3).
class CourseConfig {
  final SerbianScript defaultScript;
  final bool acceptBothScripts;
  final bool showTransliterationHint;

  /// Порог прохождения итоговой контрольной, доля от 0 до 1.
  final double passThreshold;
  final bool allowDraftContent;

  const CourseConfig({
    required this.defaultScript,
    required this.acceptBothScripts,
    required this.showTransliterationHint,
    required this.passThreshold,
    required this.allowDraftContent,
  });

  factory CourseConfig.fromJson(Map<String, dynamic> j) => CourseConfig(
        defaultScript: j['defaultScript'] == 'cyrillic'
            ? SerbianScript.cyrillic
            : SerbianScript.latin,
        acceptBothScripts: j['acceptBothScripts'] == true,
        showTransliterationHint: j['showTransliterationHint'] == true,
        passThreshold: (j['passThreshold'] as num?)?.toDouble() ?? 0.8,
        allowDraftContent: j['allowDraftContent'] == true,
      );
}

/// Учебная цель. Прогресс измеряется по целям, а не только по фактy
/// прохождения урока (master-prompt §5.3).
class LearningObjective {
  final String id;
  final String title;

  const LearningObjective({required this.id, required this.title});

  factory LearningObjective.fromJson(Map<String, dynamic> j) =>
      LearningObjective(
        id: (j['id'] ?? '') as String,
        title: (j['title'] ?? '') as String,
      );
}

/// Вид блока вступления.
enum IntroBlockKind {
  /// Обычный абзац объяснения.
  paragraph,

  /// Выделенная мысль-подсказка.
  tip,

  /// Таблица терминов: «genitiv → koga, čega».
  terms,

  /// Пример: сербская фраза и перевод.
  example,
}

/// Строка таблицы терминов.
class TermRow {
  final String term;
  final String gloss;

  /// Пояснение по-русски, необязательно.
  final String note;

  const TermRow({required this.term, required this.gloss, this.note = ''});
}

/// Один блок структурированного вступления.
class IntroBlock {
  final IntroBlockKind kind;

  /// Текст для paragraph и tip. Фрагменты в `*звёздочках*` — сербские
  /// термины, они выделяются при отрисовке.
  final String text;

  /// Заголовок таблицы терминов.
  final String title;
  final List<TermRow> rows;

  /// Сербская фраза примера.
  final String serbian;

  /// Перевод примера.
  final String russian;

  /// Фрагмент [serbian], который нужно подсветить.
  final String highlight;

  const IntroBlock({
    required this.kind,
    this.text = '',
    this.title = '',
    this.rows = const [],
    this.serbian = '',
    this.russian = '',
    this.highlight = '',
  });

  factory IntroBlock.fromJson(Map<String, dynamic> j) {
    final kind = switch (j['kind']) {
      'paragraph' => IntroBlockKind.paragraph,
      'tip' => IntroBlockKind.tip,
      'terms' => IntroBlockKind.terms,
      'example' => IntroBlockKind.example,
      _ => throw FormatException(
          "Неизвестный вид блока вступления: '${j['kind']}'"),
    };
    return IntroBlock(
      kind: kind,
      text: (j['text'] ?? '') as String,
      title: (j['title'] ?? '') as String,
      rows: (j['rows'] as List? ?? const [])
          .whereType<Map>()
          .map((r) => TermRow(
                term: (r['term'] ?? '') as String,
                gloss: (r['gloss'] ?? '') as String,
                note: (r['note'] ?? '') as String,
              ))
          .toList(),
      serbian: (j['serbian'] ?? '') as String,
      russian: (j['russian'] ?? '') as String,
      highlight: (j['highlight'] ?? '') as String,
    );
  }
}

/// Вступление к уроку.
class LessonIntro {
  /// Плоский текст (схема v1). Используется, если [blocks] пуст.
  final String text;

  /// Структурированное вступление.
  final List<IntroBlock> blocks;
  final SourceRef? sourceRef;

  const LessonIntro({
    this.text = '',
    this.blocks = const [],
    this.sourceRef,
  });

  /// Блоки для отрисовки: структурированные, либо один абзац из [text].
  List<IntroBlock> get effectiveBlocks => blocks.isNotEmpty
      ? blocks
      : [IntroBlock(kind: IntroBlockKind.paragraph, text: text)];

  factory LessonIntro.fromJson(Map<String, dynamic> j) => LessonIntro(
        text: (j['text'] ?? '') as String,
        blocks: (j['blocks'] as List? ?? const [])
            .whereType<Map>()
            .map((b) => IntroBlock.fromJson(b.cast<String, dynamic>()))
            .toList(),
        sourceRef: j['sourceRef'] is Map
            ? SourceRef.fromJson(
                (j['sourceRef'] as Map).cast<String, dynamic>())
            : null,
      );
}

/// Урок: вступление и серия упражнений.
class Lesson {
  final String id;
  final String title;

  /// ID уроков, которые нужно завершить до этого.
  final List<String> prerequisites;

  /// Контрольная точка раздела.
  final bool isCheckpoint;

  /// Урок по желанию: его можно пройти, а можно пропустить без потери
  /// доступа к следующим. Такие уроки никогда не стоят в prerequisites.
  final bool optional;
  final LessonIntro? intro;
  final List<Exercise> exercises;

  const Lesson({
    required this.id,
    required this.title,
    required this.exercises,
    this.prerequisites = const [],
    this.isCheckpoint = false,
    this.optional = false,
    this.intro,
  });

  factory Lesson.fromJson(Map<String, dynamic> j) {
    final id = (j['id'] ?? '') as String;
    if (id.isEmpty) {
      throw const CourseFormatException('<lesson>', 'урок без id');
    }
    final rawExercises = j['exercises'];
    final exercises = <Exercise>[];
    if (rawExercises is List) {
      for (final e in rawExercises) {
        if (e is Map) {
          exercises.add(Exercise.fromJson(e.cast<String, dynamic>()));
        }
      }
    }
    if (exercises.isEmpty) {
      throw CourseFormatException(id, 'урок без упражнений');
    }
    return Lesson(
      id: id,
      title: (j['title'] ?? '') as String,
      prerequisites:
          (j['prerequisites'] as List?)?.whereType<String>().toList() ??
              const [],
      isCheckpoint: j['isCheckpoint'] == true,
      optional: j['optional'] == true,
      intro: j['intro'] is Map
          ? LessonIntro.fromJson((j['intro'] as Map).cast<String, dynamic>())
          : null,
      exercises: exercises,
    );
  }
}

/// Тема: набор учебных целей и уроков.
class Skill {
  final String id;
  final String title;
  final List<LearningObjective> objectives;
  final List<Lesson> lessons;

  const Skill({
    required this.id,
    required this.title,
    required this.objectives,
    required this.lessons,
  });

  factory Skill.fromJson(Map<String, dynamic> j) => Skill(
        id: (j['id'] ?? '') as String,
        title: (j['title'] ?? '') as String,
        objectives: (j['objectives'] as List? ?? const [])
            .whereType<Map>()
            .map((o) => LearningObjective.fromJson(o.cast<String, dynamic>()))
            .toList(),
        lessons: (j['lessons'] as List? ?? const [])
            .whereType<Map>()
            .map((l) => Lesson.fromJson(l.cast<String, dynamic>()))
            .toList(),
      );
}

/// Раздел курса.
class CourseUnit {
  final String id;
  final String title;
  final String description;
  final List<Skill> skills;

  const CourseUnit({
    required this.id,
    required this.title,
    required this.description,
    required this.skills,
  });

  factory CourseUnit.fromJson(Map<String, dynamic> j) => CourseUnit(
        id: (j['id'] ?? '') as String,
        title: (j['title'] ?? '') as String,
        description: (j['description'] ?? '') as String,
        skills: (j['skills'] as List? ?? const [])
            .whereType<Map>()
            .map((s) => Skill.fromJson(s.cast<String, dynamic>()))
            .toList(),
      );

  Iterable<Lesson> get lessons => skills.expand((s) => s.lessons);
}

/// Описание итоговой контрольной.
class FinalExamSpec {
  final String id;

  /// skillId → сколько вопросов взять.
  final Map<String, int> blueprint;
  final List<String> requiredExerciseTypes;
  final int cooldownHours;

  const FinalExamSpec({
    required this.id,
    this.blueprint = const {},
    this.requiredExerciseTypes = const [],
    this.cooldownHours = 24,
  });

  /// Контрольная ещё не собрана: blueprint пуст.
  bool get isEmpty => blueprint.isEmpty;

  factory FinalExamSpec.fromJson(Map<String, dynamic> j) {
    final blueprint = <String, int>{};
    for (final entry in (j['blueprint'] as List? ?? const [])) {
      if (entry is Map) {
        final skillId = (entry['skillId'] ?? '') as String;
        final count = (entry['count'] as num?)?.toInt() ?? 0;
        if (skillId.isNotEmpty && count > 0) blueprint[skillId] = count;
      }
    }
    return FinalExamSpec(
      id: (j['id'] ?? '') as String,
      blueprint: blueprint,
      requiredExerciseTypes:
          (j['requiredExerciseTypes'] as List?)?.whereType<String>().toList() ??
              const [],
      cooldownHours: (j['cooldownHours'] as num?)?.toInt() ?? 24,
    );
  }
}

/// Полный курс, разобранный из bundle.
class Course {
  final String courseId;
  final String courseVersion;
  final String title;
  final CourseConfig config;
  final List<CourseUnit> units;
  final FinalExamSpec? finalExam;

  /// sha256 содержимого. Позволяет понять, что контент обновился, и корректно
  /// обойтись с незавершённой попыткой (master-prompt §25).
  final String contentChecksum;

  const Course({
    required this.courseId,
    required this.courseVersion,
    required this.title,
    required this.config,
    required this.units,
    required this.contentChecksum,
    this.finalExam,
  });

  factory Course.fromJson(Map<String, dynamic> j) => Course(
        courseId: (j['courseId'] ?? '') as String,
        courseVersion: (j['courseVersion'] ?? '') as String,
        title: (j['title'] ?? '') as String,
        config: CourseConfig.fromJson(
            (j['config'] as Map?)?.cast<String, dynamic>() ?? const {}),
        units: (j['units'] as List? ?? const [])
            .whereType<Map>()
            .map((u) => CourseUnit.fromJson(u.cast<String, dynamic>()))
            .toList(),
        finalExam: j['finalExam'] is Map
            ? FinalExamSpec.fromJson(
                (j['finalExam'] as Map).cast<String, dynamic>())
            : null,
        contentChecksum: (j['contentChecksum'] ?? '') as String,
      );

  /// Все уроки курса в порядке следования.
  List<Lesson> get allLessons =>
      units.expand((u) => u.skills).expand((s) => s.lessons).toList();

  Lesson? lessonById(String id) {
    for (final l in allLessons) {
      if (l.id == id) return l;
    }
    return null;
  }

  /// Skill, которому принадлежит урок.
  Skill? skillOfLesson(String lessonId) {
    for (final u in units) {
      for (final s in u.skills) {
        if (s.lessons.any((l) => l.id == lessonId)) return s;
      }
    }
    return null;
  }

  /// Unit, которому принадлежит урок.
  CourseUnit? unitOfLesson(String lessonId) {
    for (final u in units) {
      if (u.lessons.any((l) => l.id == lessonId)) return u;
    }
    return null;
  }

  /// Все учебные цели курса.
  List<LearningObjective> get allObjectives =>
      units.expand((u) => u.skills).expand((s) => s.objectives).toList();
}
