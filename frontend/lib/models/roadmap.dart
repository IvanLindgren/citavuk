/// Дорожная карта сербского языка.
///
/// Каркас — шесть уровней и четыре раздела — приходит с сервера вместе с
/// описаниями: одни и те же формулировки на сайте и в приложении, и правятся
/// они в одном месте.
library;

class RoadmapCategory {
  final String key;
  final String title;
  final String local;
  final String about;

  /// Раздел, которого ещё нет. В зачёт уровня не идёт: требовать 80% от того,
  /// чего не существует, значило бы закрыть переход навсегда.
  final bool planned;

  const RoadmapCategory({
    required this.key,
    required this.title,
    required this.local,
    required this.about,
    required this.planned,
  });

  factory RoadmapCategory.fromJson(Map<String, dynamic> j) => RoadmapCategory(
        key: (j['key'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        local: (j['local'] ?? '').toString(),
        about: (j['about'] ?? '').toString(),
        planned: j['planned'] == true,
      );
}

class RoadmapProgress {
  final int done;
  final int total;

  /// Доля 0..1. Считает сервер: два независимых деления рано или поздно
  /// разошлись бы, и приложение показывало бы не то же, что сайт.
  final double ratio;
  final bool passed;

  const RoadmapProgress({
    required this.done,
    required this.total,
    required this.ratio,
    required this.passed,
  });

  static const empty =
      RoadmapProgress(done: 0, total: 0, ratio: 0, passed: false);

  factory RoadmapProgress.fromJson(Map<String, dynamic> j) => RoadmapProgress(
        done: (j['done'] as num?)?.toInt() ?? 0,
        total: (j['total'] as num?)?.toInt() ?? 0,
        ratio: (j['ratio'] as num?)?.toDouble() ?? 0,
        passed: j['passed'] == true,
      );
}

class RoadmapLevelView {
  final String level;
  final String name;
  final Map<String, RoadmapProgress> categories;
  final bool passed;

  const RoadmapLevelView({
    required this.level,
    required this.name,
    required this.categories,
    required this.passed,
  });

  factory RoadmapLevelView.fromJson(Map<String, dynamic> j) {
    final raw = (j['categories'] as Map?) ?? const {};
    return RoadmapLevelView(
      level: (j['level'] ?? '').toString(),
      name: (j['name'] ?? '').toString(),
      categories: {
        for (final entry in raw.entries)
          entry.key.toString(): RoadmapProgress.fromJson(
              (entry.value as Map).cast<String, dynamic>()),
      },
      passed: j['passed'] == true,
    );
  }

  RoadmapProgress progressOf(String category) =>
      categories[category] ?? RoadmapProgress.empty;
}

class RoadmapOverview {
  final List<RoadmapLevelView> levels;
  final List<RoadmapCategory> categories;

  /// Цель: к какому уровню человек идёт. Пусто — цель не выбрана.
  final String target;

  /// Уровень аккаунта: где человек сейчас. Это не то же, что цель.
  final String current;
  final double passingScore;
  final bool signedIn;

  const RoadmapOverview({
    required this.levels,
    required this.categories,
    required this.target,
    required this.current,
    required this.passingScore,
    required this.signedIn,
  });

  factory RoadmapOverview.fromJson(Map<String, dynamic> j) => RoadmapOverview(
        levels: [
          for (final item in (j['levels'] as List?) ?? const [])
            RoadmapLevelView.fromJson((item as Map).cast<String, dynamic>()),
        ],
        categories: [
          for (final item in (j['categories'] as List?) ?? const [])
            RoadmapCategory.fromJson((item as Map).cast<String, dynamic>()),
        ],
        target: (j['target'] ?? '').toString(),
        current: (j['current'] ?? '').toString(),
        passingScore: (j['passingScore'] as num?)?.toDouble() ?? 0.8,
        signedIn: j['signedIn'] == true,
      );
}

class RoadmapItem {
  final String id;
  final String kind;
  final String title;
  final String summary;
  final String body;
  final Map<String, dynamic> payload;
  final bool done;

  const RoadmapItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.summary,
    required this.body,
    required this.payload,
    required this.done,
  });

  factory RoadmapItem.fromJson(Map<String, dynamic> j) => RoadmapItem(
        id: (j['id'] ?? '').toString(),
        kind: (j['kind'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        summary: (j['summary'] ?? '').toString(),
        body: (j['body'] ?? '').toString(),
        payload: ((j['payload'] as Map?) ?? const {}).cast<String, dynamic>(),
        done: j['done'] == true,
      );

  String get url => (payload['url'] ?? '').toString();
  String get slug => (payload['slug'] ?? '').toString();
  String get bookId => (payload['bookId'] ?? '').toString();
  String get trainerTopicId => (payload['trainerTopicId'] ?? '').toString();
}

class RoadmapExerciseSet {
  final String id;
  final String title;
  final List<Map<String, dynamic>> exercises;
  final bool done;
  final double score;

  const RoadmapExerciseSet({
    required this.id,
    required this.title,
    required this.exercises,
    required this.done,
    required this.score,
  });

  factory RoadmapExerciseSet.fromJson(Map<String, dynamic> j) {
    final content =
        ((j['content'] as Map?) ?? const {}).cast<String, dynamic>();
    return RoadmapExerciseSet(
      id: (j['id'] ?? '').toString(),
      title: (j['title'] ?? '').toString(),
      exercises: [
        for (final item in (content['exercises'] as List?) ?? const [])
          (item as Map).cast<String, dynamic>(),
      ],
      done: j['done'] == true,
      score: (j['score'] as num?)?.toDouble() ?? 0,
    );
  }
}

class RoadmapWord {
  final String id;
  final String theme;
  final String lemma;
  final String translation;
  final String note;

  /// Фраза с этим словом и её перевод. Слово в обеих помечено звёздочками:
  /// в сербской фразе оно стоит в падеже, а в русском переводе искать его
  /// иначе нечем — русской морфологии у нас нет.
  final String example;
  final String exampleTranslation;
  final bool known;

  const RoadmapWord({
    required this.id,
    required this.theme,
    required this.lemma,
    required this.translation,
    required this.note,
    required this.example,
    required this.exampleTranslation,
    required this.known,
  });

  factory RoadmapWord.fromJson(Map<String, dynamic> j) => RoadmapWord(
        id: (j['id'] ?? '').toString(),
        theme: (j['theme'] ?? '').toString(),
        lemma: (j['lemma'] ?? '').toString(),
        translation: (j['translation'] ?? '').toString(),
        note: (j['note'] ?? '').toString(),
        example: (j['example'] ?? '').toString(),
        exampleTranslation: (j['exampleTranslation'] ?? '').toString(),
        known: j['known'] == true,
      );
}

/// Кусок размеченной фразы: обычный текст либо само слово.
class ExamplePart {
  final String text;
  final bool target;

  const ExamplePart(this.text, {required this.target});
}

final _exampleMark = RegExp(r'\*([^*]+)\*');

/// Разбирает размеченную фразу на части.
///
/// Помечено ровно одно место — так пишет сборщик примеров и так проверяет его
/// валидатор. Без разметки фраза возвращается целиком: примеры, добавленные
/// автором руками, должны показываться, а не пропадать.
List<ExamplePart> splitExample(String phrase) {
  final source = phrase.trim();
  if (source.isEmpty) return const [];
  final match = _exampleMark.firstMatch(source);
  if (match == null) return [ExamplePart(source, target: false)];

  final parts = <ExamplePart>[];
  final before = source.substring(0, match.start);
  final after = source.substring(match.end);
  if (before.isNotEmpty) parts.add(ExamplePart(before, target: false));
  parts.add(ExamplePart(match.group(1) ?? '', target: true));
  if (after.isNotEmpty) parts.add(ExamplePart(after, target: false));
  return parts;
}

class RoadmapSection {
  final String level;
  final RoadmapCategory category;
  final String intro;
  final List<RoadmapItem> items;
  final List<RoadmapExerciseSet> exercises;
  final List<RoadmapWord> words;
  final RoadmapProgress progress;

  const RoadmapSection({
    required this.level,
    required this.category,
    required this.intro,
    required this.items,
    required this.exercises,
    required this.words,
    required this.progress,
  });

  factory RoadmapSection.fromJson(Map<String, dynamic> j) => RoadmapSection(
        level: (j['level'] ?? '').toString(),
        category: RoadmapCategory.fromJson(
            ((j['category'] as Map?) ?? const {}).cast<String, dynamic>()),
        intro: (j['intro'] ?? '').toString(),
        items: [
          for (final item in (j['items'] as List?) ?? const [])
            RoadmapItem.fromJson((item as Map).cast<String, dynamic>()),
        ],
        exercises: [
          for (final item in (j['exercises'] as List?) ?? const [])
            RoadmapExerciseSet.fromJson((item as Map).cast<String, dynamic>()),
        ],
        words: [
          for (final item in (j['words'] as List?) ?? const [])
            RoadmapWord.fromJson((item as Map).cast<String, dynamic>()),
        ],
        progress: RoadmapProgress.fromJson(
            ((j['progress'] as Map?) ?? const {}).cast<String, dynamic>()),
      );

  bool get isEmpty => items.isEmpty && exercises.isEmpty && words.isEmpty;
}

class RoadmapComment {
  final String id;
  final String parentId;
  final String author;
  final String body;
  final DateTime createdAt;
  final bool mine;

  const RoadmapComment({
    required this.id,
    required this.parentId,
    required this.author,
    required this.body,
    required this.createdAt,
    required this.mine,
  });

  factory RoadmapComment.fromJson(Map<String, dynamic> j) => RoadmapComment(
        id: (j['id'] ?? '').toString(),
        parentId: (j['parentId'] ?? '').toString(),
        author: (j['author'] ?? 'Читатель').toString(),
        body: (j['body'] ?? '').toString(),
        createdAt:
            DateTime.tryParse((j['createdAt'] ?? '').toString())?.toLocal() ??
                DateTime.now(),
        mine: j['mine'] == true,
      );
}

/// Уровень взят целиком: по всем считаемым разделам не ниже порога.
///
/// Планируемые разделы пропускаются. Правило то же, что на сервере
/// (roadmap.LevelPassed) — здесь оно нужно, чтобы не ждать ответа ради уже
/// известного.
bool roadmapLevelPassed(
    RoadmapLevelView level, List<RoadmapCategory> categories) {
  final counted = categories.where((category) => !category.planned).toList();
  if (counted.isEmpty) return false;
  return counted.every((category) {
    final progress = level.progressOf(category.key);
    return progress.total > 0 && progress.passed;
  });
}

/// Следующая ступень. Пусто, если дальше некуда.
String roadmapNextLevel(String level, List<RoadmapLevelView> levels) {
  final index = levels.indexWhere((item) => item.level == level);
  if (index < 0 || index + 1 >= levels.length) return '';
  return levels[index + 1].level;
}
