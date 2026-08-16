/// «На каждый день»: десять слов, текст с ними и упражнения.
///
/// Набор собирает и хранит сервер — сутки, один на все устройства. Приложение
/// его не пересобирает: иначе человек, заглянувший в окно с телефона и с сайта,
/// получил бы два разных набора и не смог бы доучить начатое.
library;

class DailyWord {
  const DailyWord({
    required this.lemma,
    required this.translation,
    this.pos = '',
    this.note = '',
    this.theme = '',
    this.example = '',
    this.exampleTranslation = '',
  });

  final String lemma;
  final String translation;
  final String pos;
  final String note;
  final String theme;
  final String example;
  final String exampleTranslation;

  factory DailyWord.fromJson(Map<String, dynamic> json) => DailyWord(
        lemma: (json['lemma'] ?? '').toString(),
        translation: (json['translation'] ?? '').toString(),
        pos: (json['pos'] ?? '').toString(),
        note: (json['note'] ?? '').toString(),
        theme: (json['theme'] ?? '').toString(),
        example: (json['example'] ?? '').toString(),
        exampleTranslation: (json['exampleTranslation'] ?? '').toString(),
      );

  Map<String, dynamic> toJson() => {
        'lemma': lemma,
        'translation': translation,
        'pos': pos,
        'note': note,
        'theme': theme,
        'example': example,
        'exampleTranslation': exampleTranslation,
      };
}

class DailyExercise {
  const DailyExercise({
    required this.kind,
    required this.question,
    required this.answer,
    this.options = const [],
    this.hint = '',
  });

  /// choice — выбор варианта, fill — вписать пропущенное, translate — перевод.
  final String kind;
  final String question;
  final String answer;
  final List<String> options;
  final String hint;

  bool get hasOptions => options.length >= 2;

  factory DailyExercise.fromJson(Map<String, dynamic> json) => DailyExercise(
        kind: (json['kind'] ?? 'translate').toString(),
        question: (json['question'] ?? '').toString(),
        answer: (json['answer'] ?? '').toString(),
        options: [
          for (final item in (json['options'] as List? ?? const []))
            item.toString(),
        ],
        hint: (json['hint'] ?? '').toString(),
      );
}

class DailyLesson {
  const DailyLesson({
    required this.title,
    required this.text,
    this.exercises = const [],
  });

  final String title;
  final String text;
  final List<DailyExercise> exercises;

  factory DailyLesson.fromJson(Map<String, dynamic> json) => DailyLesson(
        title: (json['title'] ?? '').toString(),
        text: (json['text'] ?? '').toString(),
        exercises: [
          for (final item in (json['exercises'] as List? ?? const []))
            DailyExercise.fromJson(item as Map<String, dynamic>),
        ],
      );
}

class DailySet {
  const DailySet({
    required this.id,
    required this.day,
    required this.level,
    required this.words,
    this.lesson,
    this.learned = const [],
  });

  final String id;
  final String day;
  final String level;
  final List<DailyWord> words;
  final DailyLesson? lesson;

  /// Леммы слов, уже отправленных в карточки.
  final List<String> learned;

  bool isLearned(String lemma) => learned.contains(lemma);

  DailySet copyWith({DailyLesson? lesson, List<String>? learned}) => DailySet(
        id: id,
        day: day,
        level: level,
        words: words,
        lesson: lesson ?? this.lesson,
        learned: learned ?? this.learned,
      );

  factory DailySet.fromJson(Map<String, dynamic> json) => DailySet(
        id: (json['id'] ?? '').toString(),
        day: (json['day'] ?? '').toString(),
        level: (json['level'] ?? '').toString(),
        words: [
          for (final item in (json['words'] as List? ?? const []))
            DailyWord.fromJson(item as Map<String, dynamic>),
        ],
        lesson: json['lesson'] is Map<String, dynamic>
            ? DailyLesson.fromJson(json['lesson'] as Map<String, dynamic>)
            : null,
        learned: [
          for (final item in (json['learned'] as List? ?? const []))
            item.toString(),
        ],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'day': day,
        'level': level,
        'words': [for (final word in words) word.toJson()],
        'learned': learned,
      };
}

/// Слово, которое давно знали, а повторить забыли.
class FadedWord {
  const FadedWord({
    required this.word,
    required this.translation,
    required this.overdueDays,
  });

  final String word;
  final String translation;
  final int overdueDays;

  factory FadedWord.fromJson(Map<String, dynamic> json) => FadedWord(
        word: (json['word'] ?? '').toString(),
        translation: (json['translation'] ?? '').toString(),
        overdueDays: (json['overdueDays'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'word': word,
        'translation': translation,
        'overdueDays': overdueDays,
      };
}

class DailyProgress {
  const DailyProgress({
    this.reviewedToday = 0,
    this.dueNow = 0,
    this.words = 0,
    this.strong = 0,
    this.faded = const [],
    this.streak = 0,
  });

  final int reviewedToday;
  final int dueNow;
  final int words;
  final int strong;
  final List<FadedWord> faded;
  final int streak;

  factory DailyProgress.fromJson(Map<String, dynamic> json) => DailyProgress(
        reviewedToday: (json['reviewedToday'] as num?)?.toInt() ?? 0,
        dueNow: (json['dueNow'] as num?)?.toInt() ?? 0,
        words: (json['words'] as num?)?.toInt() ?? 0,
        strong: (json['strong'] as num?)?.toInt() ?? 0,
        faded: [
          for (final item in (json['faded'] as List? ?? const []))
            FadedWord.fromJson(item as Map<String, dynamic>),
        ],
        streak: (json['streak'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'reviewedToday': reviewedToday,
        'dueNow': dueNow,
        'words': words,
        'strong': strong,
        'faded': [for (final word in faded) word.toJson()],
        'streak': streak,
      };
}

class DailyTheme {
  const DailyTheme({required this.theme, required this.words});

  final String theme;
  final int words;

  factory DailyTheme.fromJson(Map<String, dynamic> json) => DailyTheme(
        theme: (json['theme'] ?? '').toString(),
        words: (json['words'] as num?)?.toInt() ?? 0,
      );
}

class DailyState {
  const DailyState({
    this.set,
    this.level = '',
    this.themes = const [],
    this.enabled = true,
    this.configured = false,
    this.progress = const DailyProgress(),
    this.canCompose = false,
  });

  final DailySet? set;
  final String level;
  final List<String> themes;
  final bool enabled;

  /// Окно уже настроено. Пустой список тем при этом значит «всё подряд», а не
  /// «человек ничего не выбрал».
  final bool configured;
  final DailyProgress progress;

  /// Модель доступна: без неё окно показывает только слова.
  final bool canCompose;

  bool get ready => configured && level.isNotEmpty;

  DailyState copyWith({DailySet? set, DailyProgress? progress}) => DailyState(
        set: set ?? this.set,
        level: level,
        themes: themes,
        enabled: enabled,
        configured: configured,
        progress: progress ?? this.progress,
        canCompose: canCompose,
      );

  factory DailyState.fromJson(Map<String, dynamic> json) => DailyState(
        set: json['set'] is Map<String, dynamic>
            ? DailySet.fromJson(json['set'] as Map<String, dynamic>)
            : null,
        level: (json['level'] ?? '').toString(),
        themes: [
          for (final item in (json['themes'] as List? ?? const []))
            item.toString(),
        ],
        enabled: json['enabled'] as bool? ?? true,
        configured: json['configured'] as bool? ?? false,
        progress: json['progress'] is Map<String, dynamic>
            ? DailyProgress.fromJson(json['progress'] as Map<String, dynamic>)
            : const DailyProgress(),
        canCompose: json['canCompose'] as bool? ?? false,
      );
}

class DailySettings {
  const DailySettings({
    this.themes = const [],
    this.enabled = true,
    this.level = '',
    this.configured = false,
    this.available = const [],
  });

  final List<String> themes;
  final bool enabled;
  final String level;
  final bool configured;
  final List<DailyTheme> available;

  factory DailySettings.fromJson(Map<String, dynamic> json) => DailySettings(
        themes: [
          for (final item in (json['themes'] as List? ?? const []))
            item.toString(),
        ],
        enabled: json['enabled'] as bool? ?? true,
        level: (json['level'] ?? '').toString(),
        configured: json['configured'] as bool? ?? false,
        available: [
          for (final item in (json['available'] as List? ?? const []))
            DailyTheme.fromJson(item as Map<String, dynamic>),
        ],
      );
}

/// Пример без разметки: на сайте выделенное слово помечено звёздочками.
String plainExample(String phrase) => phrase.replaceAll('*', '').trim();
