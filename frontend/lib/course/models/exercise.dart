/// Типизированные модели упражнений курса (см. course_content/SCHEMA.md).
///
/// Sealed-иерархия: непроверенный `Map<String, dynamic>` не доходит до UI —
/// весь разбор и валидация происходят здесь (master-prompt §7).
library;

import 'source_ref.dart';

/// Письменность, которую проверяет упражнение.
enum SerbianScript { latin, cyrillic, both }

SerbianScript _scriptFromJson(dynamic raw, String exerciseId) => switch (raw) {
      'latin' => SerbianScript.latin,
      'cyrillic' => SerbianScript.cyrillic,
      'both' => SerbianScript.both,
      _ => throw CourseFormatException(
          exerciseId, "неизвестный serbianScript: '$raw'"),
    };

/// Ошибка разбора контента курса. Всегда содержит ID элемента, чтобы автор
/// контента мог найти проблему (master-prompt §7).
class CourseFormatException implements Exception {
  final String elementId;
  final String message;

  const CourseFormatException(this.elementId, this.message);

  @override
  String toString() => 'Упражнение «$elementId»: $message';
}

/// Вариант ответа. `misconceptionId` и `feedbackKey` позволяют объяснить
/// конкретную ошибку, а не просто сказать «неверно» (master-prompt §28).
class ChoiceOption {
  final String id;
  final String text;
  final bool correct;
  final String? misconceptionId;
  final String? feedbackKey;

  const ChoiceOption({
    required this.id,
    required this.text,
    required this.correct,
    this.misconceptionId,
    this.feedbackKey,
  });

  factory ChoiceOption.fromJson(Map<String, dynamic> j, String exerciseId) {
    final id = j['id'];
    final text = j['text'];
    if (id is! String || id.isEmpty) {
      throw CourseFormatException(exerciseId, 'вариант без id');
    }
    if (text is! String || text.isEmpty) {
      throw CourseFormatException(exerciseId, "вариант '$id' без text");
    }
    return ChoiceOption(
      id: id,
      text: text,
      correct: j['correct'] == true,
      misconceptionId: j['misconceptionId'] as String?,
      feedbackKey: j['feedbackKey'] as String?,
    );
  }
}

/// Слово-плитка в упражнении на сборку предложения.
class Token {
  final String id;
  final String text;

  const Token({required this.id, required this.text});

  factory Token.fromJson(Map<String, dynamic> j, String exerciseId) {
    final id = j['id'];
    final text = j['text'];
    if (id is! String || id.isEmpty) {
      throw CourseFormatException(exerciseId, 'токен без id');
    }
    if (text is! String || text.isEmpty) {
      throw CourseFormatException(exerciseId, "токен '$id' без text");
    }
    return Token(id: id, text: text);
  }
}

/// Грамматическая цель упражнения на окончание.
class EndingTarget {
  final String lemma;
  final int? person;
  final String? number;
  final String? tense;
  final String? grammaticalCase;
  final String? gender;
  final String? animacy;

  const EndingTarget({
    required this.lemma,
    this.person,
    this.number,
    this.tense,
    this.grammaticalCase,
    this.gender,
    this.animacy,
  });

  factory EndingTarget.fromJson(Map<String, dynamic> j) => EndingTarget(
        lemma: (j['lemma'] ?? '') as String,
        person: j['person'] as int?,
        number: j['number'] as String?,
        tense: j['tense'] as String?,
        grammaticalCase: j['case'] as String?,
        gender: j['gender'] as String?,
        animacy: j['animacy'] as String?,
      );
}

/// Изображение упражнения с provenance (master-prompt §6.4).
class ImageAsset {
  final String assetId;
  final String path;
  final String altText;
  final String license;
  final List<String> entities;
  final double focalX;
  final double focalY;

  const ImageAsset({
    required this.assetId,
    required this.path,
    required this.altText,
    required this.license,
    this.entities = const [],
    this.focalX = 0.5,
    this.focalY = 0.5,
  });

  factory ImageAsset.fromJson(Map<String, dynamic> j, String exerciseId) {
    final assetId = j['assetId'];
    final path = j['path'];
    if (assetId is! String || assetId.isEmpty) {
      throw CourseFormatException(exerciseId, 'image без assetId');
    }
    if (path is! String || path.isEmpty) {
      throw CourseFormatException(exerciseId, 'image без path');
    }
    final focal = j['focalPoint'];
    return ImageAsset(
      assetId: assetId,
      path: path,
      altText: (j['altText'] ?? '') as String,
      license: (j['license'] ?? '') as String,
      entities: _stringList(j['entities']),
      focalX: focal is Map ? ((focal['x'] as num?)?.toDouble() ?? 0.5) : 0.5,
      focalY: focal is Map ? ((focal['y'] as num?)?.toDouble() ?? 0.5) : 0.5,
    );
  }
}

/// Пара для упражнения на сопоставление.
class MatchPair {
  final String left;
  final String right;

  const MatchPair({required this.left, required this.right});
}

/// Сегмент текста с пропусками: обычный текст или пропуск.
class FillSegment {
  final bool isBlank;
  final String text;
  final String blankId;

  const FillSegment.text(this.text)
      : isBlank = false,
        blankId = '';
  const FillSegment.blank(this.blankId)
      : isBlank = true,
        text = '';
}

/// Пропуск с допустимыми ответами.
class Blank {
  final String id;
  final List<String> acceptedAnswers;
  final bool caseSensitive;

  const Blank({
    required this.id,
    required this.acceptedAnswers,
    this.caseSensitive = false,
  });
}

List<String> _stringList(dynamic raw) =>
    raw is List ? raw.whereType<String>().toList() : const [];

List<Map<String, dynamic>> _mapList(dynamic raw) => raw is List
    ? raw.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList()
    : const [];

/// Базовый тип упражнения. Общие поля — из master-prompt §7.
sealed class Exercise {
  final String id;
  final String unitId;
  final String skillId;
  final String lessonId;
  final List<String> learningObjectiveIds;

  /// 1–5, задаёт порядок внутри урока.
  final int difficulty;
  final String prompt;

  /// Язык инструкции: 'ru' или 'sr'.
  final String instructionLanguage;
  final SerbianScript serbianScript;

  /// Объяснение правила, показывается после проверки.
  final String explanation;
  final String? hint;
  final SourceRef sourceRef;
  final ReviewStatus contentReviewStatus;

  const Exercise({
    required this.id,
    required this.unitId,
    required this.skillId,
    required this.lessonId,
    required this.learningObjectiveIds,
    required this.difficulty,
    required this.prompt,
    required this.instructionLanguage,
    required this.serbianScript,
    required this.explanation,
    required this.sourceRef,
    required this.contentReviewStatus,
    this.hint,
  });

  /// Разбирает упражнение любого известного типа.
  ///
  /// Неизвестный тип и структурно некорректный payload — это
  /// [CourseFormatException] с ID элемента, а не молчаливый пропуск.
  factory Exercise.fromJson(Map<String, dynamic> j) {
    final id = (j['id'] ?? '') as String;
    if (id.isEmpty) {
      throw const CourseFormatException('<без id>', 'у упражнения пустой id');
    }
    final type = (j['type'] ?? '') as String;
    final base = _BaseFields.parse(j, id);

    return switch (type) {
      'multiple_choice' => MultipleChoiceExercise._parse(j, base),
      'sentence_builder' => SentenceBuilderExercise._parse(j, base),
      'ending_picker' => EndingPickerExercise._parse(j, base),
      'letter_unscramble' => LetterUnscrambleExercise._parse(j, base),
      'image_description' => ImageDescriptionExercise._parse(j, base),
      'matching' => MatchingExercise._parse(j, base),
      'fill_blank' => FillBlankExercise._parse(j, base),
      'reading_qa' => ReadingQaExercise._parse(j, base),
      'form_hunt' => FormHuntExercise._parse(j, base),
      _ =>
        throw CourseFormatException(id, "неизвестный тип упражнения '$type'"),
    };
  }
}

/// Разобранные общие поля — чтобы не дублировать разбор в каждом подтипе.
class _BaseFields {
  final String id;
  final String unitId;
  final String skillId;
  final String lessonId;
  final List<String> objectives;
  final int difficulty;
  final String prompt;
  final String instructionLanguage;
  final SerbianScript script;
  final String explanation;
  final String? hint;
  final SourceRef sourceRef;
  final ReviewStatus reviewStatus;

  const _BaseFields({
    required this.id,
    required this.unitId,
    required this.skillId,
    required this.lessonId,
    required this.objectives,
    required this.difficulty,
    required this.prompt,
    required this.instructionLanguage,
    required this.script,
    required this.explanation,
    required this.hint,
    required this.sourceRef,
    required this.reviewStatus,
  });

  static _BaseFields parse(Map<String, dynamic> j, String id) {
    final prompt = (j['prompt'] ?? '') as String;
    if (prompt.isEmpty) {
      throw CourseFormatException(id, 'пустой prompt');
    }
    final sourceRefRaw = j['sourceRef'];
    if (sourceRefRaw is! Map) {
      throw CourseFormatException(
          id, 'отсутствует sourceRef (provenance обязателен)');
    }
    final reviewRaw = j['contentReviewStatus'];
    final sourceRef = SourceRef.fromJson(sourceRefRaw.cast<String, dynamic>());
    return _BaseFields(
      id: id,
      unitId: (j['unitId'] ?? '') as String,
      skillId: (j['skillId'] ?? '') as String,
      lessonId: (j['lessonId'] ?? '') as String,
      objectives: _stringList(j['learningObjectiveIds']),
      difficulty: (j['difficulty'] as num?)?.toInt() ?? 1,
      prompt: prompt,
      instructionLanguage: (j['instructionLanguage'] ?? 'ru') as String,
      script: _scriptFromJson(j['serbianScript'], id),
      explanation: (j['explanation'] ?? '') as String,
      hint: j['hint'] as String?,
      sourceRef: sourceRef,
      reviewStatus: reviewRaw == null
          ? sourceRef.reviewStatus
          : reviewStatusFromJson(reviewRaw),
    );
  }
}

/// Проверяет, что среди вариантов ровно один (или хотя бы один при [multi])
/// правильный, и что ID уникальны.
List<ChoiceOption> _parseOptions(
  dynamic raw,
  String id, {
  required bool multi,
  int minimum = 2,
}) {
  final options =
      _mapList(raw).map((o) => ChoiceOption.fromJson(o, id)).toList();
  if (options.length < minimum) {
    throw CourseFormatException(
        id, 'нужно минимум $minimum вариантов, есть ${options.length}');
  }
  final ids = <String>{};
  for (final o in options) {
    if (!ids.add(o.id)) {
      throw CourseFormatException(id, "дублирующийся id варианта '${o.id}'");
    }
  }
  final correct = options.where((o) => o.correct).length;
  if (correct == 0) {
    throw CourseFormatException(id, 'нет правильного варианта');
  }
  if (!multi && correct > 1) {
    throw CourseFormatException(
        id, 'несколько правильных вариантов при multi=false');
  }
  return options;
}

/// Выбор одного или нескольких вариантов.
final class MultipleChoiceExercise extends Exercise {
  final bool multi;
  final List<ChoiceOption> options;

  const MultipleChoiceExercise({
    required super.id,
    required super.unitId,
    required super.skillId,
    required super.lessonId,
    required super.learningObjectiveIds,
    required super.difficulty,
    required super.prompt,
    required super.instructionLanguage,
    required super.serbianScript,
    required super.explanation,
    required super.sourceRef,
    required super.contentReviewStatus,
    required this.multi,
    required this.options,
    super.hint,
  });

  static MultipleChoiceExercise _parse(Map<String, dynamic> j, _BaseFields b) {
    final multi = j['multi'] == true;
    return MultipleChoiceExercise(
      id: b.id,
      unitId: b.unitId,
      skillId: b.skillId,
      lessonId: b.lessonId,
      learningObjectiveIds: b.objectives,
      difficulty: b.difficulty,
      prompt: b.prompt,
      instructionLanguage: b.instructionLanguage,
      serbianScript: b.script,
      explanation: b.explanation,
      sourceRef: b.sourceRef,
      contentReviewStatus: b.reviewStatus,
      hint: b.hint,
      multi: multi,
      options: _parseOptions(j['options'], b.id, multi: multi),
    );
  }
}

/// Сборка предложения из банка слов (master-prompt §6.1).
final class SentenceBuilderExercise extends Exercise {
  /// Слова, входящие в правильный ответ.
  final List<Token> tokens;

  /// Лишние слова-ловушки. В acceptedOrders не участвуют.
  final List<Token> distractorTokens;

  /// Допустимые порядки. Несколько — если у предложения есть варианты.
  final List<List<String>> acceptedOrders;

  /// Токены, которые можно опустить.
  final List<String> optionalTokenIds;

  const SentenceBuilderExercise({
    required super.id,
    required super.unitId,
    required super.skillId,
    required super.lessonId,
    required super.learningObjectiveIds,
    required super.difficulty,
    required super.prompt,
    required super.instructionLanguage,
    required super.serbianScript,
    required super.explanation,
    required super.sourceRef,
    required super.contentReviewStatus,
    required this.tokens,
    required this.acceptedOrders,
    this.distractorTokens = const [],
    this.optionalTokenIds = const [],
    super.hint,
  });

  /// Все плитки, которые видит пользователь.
  List<Token> get allTokens => [...tokens, ...distractorTokens];

  /// Текст правильного ответа — для показа после ошибки.
  String get canonicalSentence {
    final byId = {for (final t in allTokens) t.id: t.text};
    return _joinTokens(
        acceptedOrders.first.map((id) => byId[id] ?? '').toList());
  }

  static SentenceBuilderExercise _parse(Map<String, dynamic> j, _BaseFields b) {
    final tokens =
        _mapList(j['tokens']).map((t) => Token.fromJson(t, b.id)).toList();
    final distractors = _mapList(j['distractorTokens'])
        .map((t) => Token.fromJson(t, b.id))
        .toList();
    if (tokens.isEmpty) {
      throw CourseFormatException(b.id, 'sentence_builder без токенов');
    }
    // Одинаковые слова обязаны иметь разные ID (master-prompt §6.1).
    final seen = <String>{};
    for (final t in [...tokens, ...distractors]) {
      if (!seen.add(t.id)) {
        throw CourseFormatException(b.id, "дублирующийся id токена '${t.id}'");
      }
    }
    final orders = <List<String>>[];
    for (final order in (j['acceptedOrders'] as List? ?? const [])) {
      final ids = _stringList(order);
      if (ids.isEmpty) {
        throw CourseFormatException(b.id, 'пустой acceptedOrder');
      }
      final tokenIds = tokens.map((t) => t.id).toSet();
      for (final id in ids) {
        if (!tokenIds.contains(id)) {
          throw CourseFormatException(
              b.id, "acceptedOrder ссылается на '$id' вне списка tokens");
        }
      }
      orders.add(ids);
    }
    if (orders.isEmpty) {
      throw CourseFormatException(b.id, 'sentence_builder без acceptedOrders');
    }
    return SentenceBuilderExercise(
      id: b.id,
      unitId: b.unitId,
      skillId: b.skillId,
      lessonId: b.lessonId,
      learningObjectiveIds: b.objectives,
      difficulty: b.difficulty,
      prompt: b.prompt,
      instructionLanguage: b.instructionLanguage,
      serbianScript: b.script,
      explanation: b.explanation,
      sourceRef: b.sourceRef,
      contentReviewStatus: b.reviewStatus,
      hint: b.hint,
      tokens: tokens,
      distractorTokens: distractors,
      acceptedOrders: orders,
      optionalTokenIds: _stringList(j['optionalTokenIds']),
    );
  }
}

/// Склеивает слова в предложение: перед пунктуацией пробел не ставится.
String _joinTokens(List<String> words) {
  final out = StringBuffer();
  for (var i = 0; i < words.length; i++) {
    final w = words[i];
    final isPunctuation = w.length == 1 && '.,!?;:'.contains(w);
    if (i > 0 && !isPunctuation) out.write(' ');
    out.write(w);
  }
  return out.toString();
}

/// Подбор окончания глагола или существительного (§6.2, §6.3).
final class EndingPickerExercise extends Exercise {
  /// 'verb' или 'noun'.
  final String wordClass;

  /// Предложение-контекст, где `___` — место словоформы.
  final String contextSentence;

  /// Неизменяемая основа, показывается отдельно от слота окончания.
  final String stem;
  final EndingTarget target;

  /// Полная правильная форма (основа + правильное окончание).
  final String fullForm;
  final List<ChoiceOption> options;

  /// Предлог, управляющий падежом, если он есть.
  final String? preposition;

  const EndingPickerExercise({
    required super.id,
    required super.unitId,
    required super.skillId,
    required super.lessonId,
    required super.learningObjectiveIds,
    required super.difficulty,
    required super.prompt,
    required super.instructionLanguage,
    required super.serbianScript,
    required super.explanation,
    required super.sourceRef,
    required super.contentReviewStatus,
    required this.wordClass,
    required this.contextSentence,
    required this.stem,
    required this.target,
    required this.fullForm,
    required this.options,
    this.preposition,
    super.hint,
  });

  static EndingPickerExercise _parse(Map<String, dynamic> j, _BaseFields b) {
    final stem = (j['stem'] ?? '') as String;
    final fullForm = (j['fullForm'] ?? '') as String;
    if (stem.isEmpty) {
      throw CourseFormatException(b.id, 'ending_picker без stem');
    }
    if (fullForm.isEmpty) {
      throw CourseFormatException(b.id, 'ending_picker без fullForm');
    }
    return EndingPickerExercise(
      id: b.id,
      unitId: b.unitId,
      skillId: b.skillId,
      lessonId: b.lessonId,
      learningObjectiveIds: b.objectives,
      difficulty: b.difficulty,
      prompt: b.prompt,
      instructionLanguage: b.instructionLanguage,
      serbianScript: b.script,
      explanation: b.explanation,
      sourceRef: b.sourceRef,
      contentReviewStatus: b.reviewStatus,
      hint: b.hint,
      wordClass: (j['wordClass'] ?? '') as String,
      contextSentence: (j['contextSentence'] ?? '') as String,
      stem: stem,
      target: EndingTarget.fromJson(
          (j['target'] as Map?)?.cast<String, dynamic>() ?? const {}),
      fullForm: fullForm,
      options: _parseOptions(j['options'], b.id, multi: false),
      preposition: j['preposition'] as String?,
    );
  }
}

/// Сборка словоформы из перемешанных букв (§6.5).
final class LetterUnscrambleExercise extends Exercise {
  final String context;
  final String lemma;

  /// UD-признаки целевой формы, например 'Case=Acc|Number=Sing'.
  final String targetFeats;
  final String answer;

  /// Лишние буквы, усложняющие сборку.
  final List<String> extraLetters;
  final bool showLemma;

  /// Основа, которую можно подсветить в разборе ошибки.
  final String highlightStem;

  /// Считать ли `lj`/`nj`/`dž` одной плиткой.
  final bool digraphsAsUnits;

  const LetterUnscrambleExercise({
    required super.id,
    required super.unitId,
    required super.skillId,
    required super.lessonId,
    required super.learningObjectiveIds,
    required super.difficulty,
    required super.prompt,
    required super.instructionLanguage,
    required super.serbianScript,
    required super.explanation,
    required super.sourceRef,
    required super.contentReviewStatus,
    required this.answer,
    this.context = '',
    this.lemma = '',
    this.targetFeats = '',
    this.extraLetters = const [],
    this.showLemma = true,
    this.highlightStem = '',
    this.digraphsAsUnits = false,
    super.hint,
  });

  static LetterUnscrambleExercise _parse(
      Map<String, dynamic> j, _BaseFields b) {
    final answer = (j['answer'] ?? '') as String;
    if (answer.isEmpty) {
      throw CourseFormatException(b.id, 'letter_unscramble без answer');
    }
    return LetterUnscrambleExercise(
      id: b.id,
      unitId: b.unitId,
      skillId: b.skillId,
      lessonId: b.lessonId,
      learningObjectiveIds: b.objectives,
      difficulty: b.difficulty,
      prompt: b.prompt,
      instructionLanguage: b.instructionLanguage,
      serbianScript: b.script,
      explanation: b.explanation,
      sourceRef: b.sourceRef,
      contentReviewStatus: b.reviewStatus,
      hint: b.hint,
      context: (j['context'] ?? '') as String,
      lemma: (j['lemma'] ?? '') as String,
      targetFeats: (j['targetFeats'] ?? '') as String,
      answer: answer,
      extraLetters: _stringList(j['extraLetters']),
      showLemma: j['showLemma'] != false,
      highlightStem: (j['highlightStem'] ?? '') as String,
      digraphsAsUnits: j['digraphsAsUnits'] == true,
    );
  }
}

/// Режим упражнения по изображению.
enum ImageMode {
  /// Выбрать предложение, описывающее изображение.
  choose,

  /// Собрать описание из слов.
  build,

  /// Заполнить форму в готовом описании.
  fill,

  /// Ввести описание самостоятельно.
  free,
}

/// Описание изображения (§6.4).
final class ImageDescriptionExercise extends Exercise {
  final ImageMode mode;
  final ImageAsset image;
  final List<ChoiceOption> options;
  final List<String> acceptedAnswers;

  const ImageDescriptionExercise({
    required super.id,
    required super.unitId,
    required super.skillId,
    required super.lessonId,
    required super.learningObjectiveIds,
    required super.difficulty,
    required super.prompt,
    required super.instructionLanguage,
    required super.serbianScript,
    required super.explanation,
    required super.sourceRef,
    required super.contentReviewStatus,
    required this.mode,
    required this.image,
    this.options = const [],
    this.acceptedAnswers = const [],
    super.hint,
  });

  static ImageDescriptionExercise _parse(
      Map<String, dynamic> j, _BaseFields b) {
    final mode = switch (j['mode']) {
      'choose' => ImageMode.choose,
      'build' => ImageMode.build,
      'fill' => ImageMode.fill,
      'free' => ImageMode.free,
      _ => throw CourseFormatException(
          b.id, "неизвестный режим image_description: '${j['mode']}'"),
    };
    final accepted = _stringList(j['acceptedAnswers']);
    if (mode == ImageMode.free && accepted.isEmpty) {
      throw CourseFormatException(b.id, "режим 'free' без acceptedAnswers");
    }
    return ImageDescriptionExercise(
      id: b.id,
      unitId: b.unitId,
      skillId: b.skillId,
      lessonId: b.lessonId,
      learningObjectiveIds: b.objectives,
      difficulty: b.difficulty,
      prompt: b.prompt,
      instructionLanguage: b.instructionLanguage,
      serbianScript: b.script,
      explanation: b.explanation,
      sourceRef: b.sourceRef,
      contentReviewStatus: b.reviewStatus,
      hint: b.hint,
      mode: mode,
      image: ImageAsset.fromJson(
          (j['image'] as Map?)?.cast<String, dynamic>() ?? const {}, b.id),
      options: mode == ImageMode.choose
          ? _parseOptions(j['options'], b.id, multi: false)
          : const [],
      acceptedAnswers: accepted,
    );
  }
}

/// Сопоставление «левое → правое» (предлог → падеж и т.п.).
final class MatchingExercise extends Exercise {
  final String leftLabel;
  final String rightLabel;
  final List<MatchPair> pairs;

  /// Лишние правые варианты.
  final List<String> distractorsRight;

  const MatchingExercise({
    required super.id,
    required super.unitId,
    required super.skillId,
    required super.lessonId,
    required super.learningObjectiveIds,
    required super.difficulty,
    required super.prompt,
    required super.instructionLanguage,
    required super.serbianScript,
    required super.explanation,
    required super.sourceRef,
    required super.contentReviewStatus,
    required this.pairs,
    this.leftLabel = '',
    this.rightLabel = '',
    this.distractorsRight = const [],
    super.hint,
  });

  static MatchingExercise _parse(Map<String, dynamic> j, _BaseFields b) {
    final pairs = _mapList(j['pairs'])
        .map((p) => MatchPair(
              left: (p['left'] ?? '') as String,
              right: (p['right'] ?? '') as String,
            ))
        .toList();
    if (pairs.isEmpty) {
      throw CourseFormatException(b.id, 'matching без пар');
    }
    final lefts = <String>{};
    for (final p in pairs) {
      if (p.left.isEmpty || p.right.isEmpty) {
        throw CourseFormatException(
            b.id, 'matching содержит пустую сторону пары');
      }
      if (!lefts.add(p.left)) {
        throw CourseFormatException(
            b.id, "matching: левая часть '${p.left}' повторяется");
      }
    }
    return MatchingExercise(
      id: b.id,
      unitId: b.unitId,
      skillId: b.skillId,
      lessonId: b.lessonId,
      learningObjectiveIds: b.objectives,
      difficulty: b.difficulty,
      prompt: b.prompt,
      instructionLanguage: b.instructionLanguage,
      serbianScript: b.script,
      explanation: b.explanation,
      sourceRef: b.sourceRef,
      contentReviewStatus: b.reviewStatus,
      hint: b.hint,
      leftLabel: (j['leftLabel'] ?? '') as String,
      rightLabel: (j['rightLabel'] ?? '') as String,
      pairs: pairs,
      distractorsRight: _stringList(j['distractorsRight']),
    );
  }
}

/// Заполнение пропусков в предложении.
final class FillBlankExercise extends Exercise {
  final List<FillSegment> segments;
  final List<Blank> blanks;

  const FillBlankExercise({
    required super.id,
    required super.unitId,
    required super.skillId,
    required super.lessonId,
    required super.learningObjectiveIds,
    required super.difficulty,
    required super.prompt,
    required super.instructionLanguage,
    required super.serbianScript,
    required super.explanation,
    required super.sourceRef,
    required super.contentReviewStatus,
    required this.segments,
    required this.blanks,
    super.hint,
  });

  static FillBlankExercise _parse(Map<String, dynamic> j, _BaseFields b) {
    final segments = <FillSegment>[];
    for (final s in _mapList(j['segments'])) {
      if (s['kind'] == 'blank') {
        final id = (s['id'] ?? '') as String;
        if (id.isEmpty) {
          throw CourseFormatException(b.id, 'fill_blank: пропуск без id');
        }
        segments.add(FillSegment.blank(id));
      } else {
        segments.add(FillSegment.text((s['text'] ?? '') as String));
      }
    }
    final blanks = <Blank>[];
    for (final bl in _mapList(j['blanks'])) {
      final id = (bl['id'] ?? '') as String;
      final accepted = _stringList(bl['acceptedAnswers'])
          .where((a) => a.trim().isNotEmpty)
          .toList();
      if (id.isEmpty) {
        throw CourseFormatException(b.id, 'fill_blank: blank без id');
      }
      if (accepted.isEmpty) {
        throw CourseFormatException(
            b.id, "fill_blank: пропуск '$id' без acceptedAnswers");
      }
      blanks.add(Blank(
        id: id,
        acceptedAnswers: accepted,
        caseSensitive: bl['caseSensitive'] == true,
      ));
    }
    final blankIds = blanks.map((x) => x.id).toSet();
    if (blankIds.length != blanks.length) {
      throw CourseFormatException(
          b.id, 'fill_blank: дублирующиеся id пропусков');
    }
    final usedIds =
        segments.where((s) => s.isBlank).map((s) => s.blankId).toSet();
    if (usedIds.isEmpty) {
      throw CourseFormatException(b.id, 'fill_blank без пропусков в segments');
    }
    for (final used in usedIds) {
      if (!blankIds.contains(used)) {
        throw CourseFormatException(
            b.id, "fill_blank: пропуск '$used' не описан в blanks");
      }
    }
    return FillBlankExercise(
      id: b.id,
      unitId: b.unitId,
      skillId: b.skillId,
      lessonId: b.lessonId,
      learningObjectiveIds: b.objectives,
      difficulty: b.difficulty,
      prompt: b.prompt,
      instructionLanguage: b.instructionLanguage,
      serbianScript: b.script,
      explanation: b.explanation,
      sourceRef: b.sourceRef,
      contentReviewStatus: b.reviewStatus,
      hint: b.hint,
      segments: segments,
      blanks: blanks,
    );
  }
}

/// Один вопрос к тексту в [ReadingQaExercise].
class ReadingQuestion {
  final String id;
  final String prompt;
  final List<ChoiceOption> options;

  const ReadingQuestion({
    required this.id,
    required this.prompt,
    required this.options,
  });
}

/// Текст на сербском и вопросы к нему.
///
/// От нескольких [MultipleChoiceExercise] подряд отличается тем, что текст
/// остаётся перед глазами: проверяется понимание прочитанного, а не память.
final class ReadingQaExercise extends Exercise {
  final String text;

  /// Перевод целиком. Показывается по кнопке — до ответа он превратил бы
  /// задание в чтение по-русски.
  final String translation;
  final List<ReadingQuestion> questions;

  const ReadingQaExercise({
    required super.id,
    required super.unitId,
    required super.skillId,
    required super.lessonId,
    required super.learningObjectiveIds,
    required super.difficulty,
    required super.prompt,
    required super.instructionLanguage,
    required super.serbianScript,
    required super.explanation,
    required super.sourceRef,
    required super.contentReviewStatus,
    required this.text,
    required this.questions,
    this.translation = '',
    super.hint,
  });

  static ReadingQaExercise _parse(Map<String, dynamic> j, _BaseFields b) {
    final text = (j['text'] ?? '') as String;
    if (text.trim().isEmpty) {
      throw CourseFormatException(b.id, 'reading_qa без текста');
    }
    final questions = <ReadingQuestion>[];
    final ids = <String>{};
    for (final q in _mapList(j['questions'])) {
      final qid = (q['id'] ?? '') as String;
      if (qid.isEmpty) {
        throw CourseFormatException(b.id, 'вопрос без id');
      }
      if (!ids.add(qid)) {
        throw CourseFormatException(b.id, "id вопроса '$qid' повторяется");
      }
      questions.add(ReadingQuestion(
        id: qid,
        prompt: (q['prompt'] ?? '') as String,
        options: _parseOptions(q['options'], '${b.id}/$qid', multi: false),
      ));
    }
    if (questions.isEmpty) {
      throw CourseFormatException(b.id, 'reading_qa без вопросов');
    }
    return ReadingQaExercise(
      id: b.id,
      unitId: b.unitId,
      skillId: b.skillId,
      lessonId: b.lessonId,
      learningObjectiveIds: b.objectives,
      difficulty: b.difficulty,
      prompt: b.prompt,
      instructionLanguage: b.instructionLanguage,
      serbianScript: b.script,
      explanation: b.explanation,
      sourceRef: b.sourceRef,
      contentReviewStatus: b.reviewStatus,
      hint: b.hint,
      text: text,
      translation: (j['translation'] ?? '') as String,
      questions: questions,
    );
  }
}

/// Слово текста в [FormHuntExercise].
class HuntToken {
  final String id;
  final String text;

  /// Знаки препинания после слова: нажимается только само слово.
  final String tail;
  final bool correct;

  const HuntToken({
    required this.id,
    required this.text,
    required this.correct,
    this.tail = '',
  });
}

/// Найти в тексте все формы с заданным признаком.
///
/// Текст хранится списком токенов, а не строкой: делить сербский текст на
/// слова пришлось бы одинаково в Go, Dart и TypeScript, и любое расхождение
/// (апостроф, дефис, đ) разошлось бы с проверкой ответа.
final class FormHuntExercise extends Exercise {
  /// Что искать, словами: «существительные в винительном падеже».
  final String targetLabel;
  final String translation;
  final List<HuntToken> tokens;

  const FormHuntExercise({
    required super.id,
    required super.unitId,
    required super.skillId,
    required super.lessonId,
    required super.learningObjectiveIds,
    required super.difficulty,
    required super.prompt,
    required super.instructionLanguage,
    required super.serbianScript,
    required super.explanation,
    required super.sourceRef,
    required super.contentReviewStatus,
    required this.targetLabel,
    required this.tokens,
    this.translation = '',
    super.hint,
  });

  /// ID слов, которые нужно найти.
  Set<String> get targetIds =>
      tokens.where((t) => t.correct).map((t) => t.id).toSet();

  static FormHuntExercise _parse(Map<String, dynamic> j, _BaseFields b) {
    final tokens = <HuntToken>[];
    final ids = <String>{};
    for (final t in _mapList(j['tokens'])) {
      final tid = (t['id'] ?? '') as String;
      if (tid.isEmpty) {
        throw CourseFormatException(b.id, 'токен без id');
      }
      if (!ids.add(tid)) {
        throw CourseFormatException(b.id, "id токена '$tid' повторяется");
      }
      tokens.add(HuntToken(
        id: tid,
        text: (t['text'] ?? '') as String,
        tail: (t['tail'] ?? '') as String,
        correct: t['correct'] == true,
      ));
    }
    if (tokens.length < 4) {
      throw CourseFormatException(b.id, 'form_hunt: слишком короткий текст');
    }
    final correct = tokens.where((t) => t.correct).length;
    if (correct == 0 || correct == tokens.length) {
      throw CourseFormatException(
          b.id, 'form_hunt: искомых форм должно быть больше нуля и меньше всех');
    }
    return FormHuntExercise(
      id: b.id,
      unitId: b.unitId,
      skillId: b.skillId,
      lessonId: b.lessonId,
      learningObjectiveIds: b.objectives,
      difficulty: b.difficulty,
      prompt: b.prompt,
      instructionLanguage: b.instructionLanguage,
      serbianScript: b.script,
      explanation: b.explanation,
      sourceRef: b.sourceRef,
      contentReviewStatus: b.reviewStatus,
      hint: b.hint,
      targetLabel: (j['targetLabel'] ?? '') as String,
      translation: (j['translation'] ?? '') as String,
      tokens: tokens,
    );
  }
}
