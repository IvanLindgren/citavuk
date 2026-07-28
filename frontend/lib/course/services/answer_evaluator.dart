/// Детерминированная проверка ответов (master-prompt §8).
///
/// Здесь нет ни онлайн-переводчика, ни LLM-судьи: каждое решение принимается
/// сравнением с проверенным контентом. Правильность грамматики определяет
/// content, а не эвристика похожести.
library;

import '../models/answer.dart';
import '../models/course.dart';
import '../models/exercise.dart';
import 'serbian_text.dart';

/// Результат проверки одного упражнения.
class EvaluationResult {
  final bool correct;

  /// Ответ пользователя в человекочитаемом виде.
  final String userDisplay;

  /// Правильный ответ в человекочитаемом виде.
  final String correctDisplay;

  /// Индекс первой расходящейся буквы, чтобы подсветить именно её.
  /// -1, если расхождения нет или подсветка неприменима.
  final int divergenceIndex;

  /// Диагноз типичной ошибки, если distractor его несёт (§28).
  final String? misconceptionId;
  final String? feedbackKey;

  /// Объяснение правила из контента.
  final String explanation;

  const EvaluationResult({
    required this.correct,
    required this.correctDisplay,
    required this.explanation,
    this.userDisplay = '',
    this.divergenceIndex = -1,
    this.misconceptionId,
    this.feedbackKey,
  });
}

/// Проверяет ответы всех типов упражнений.
class AnswerEvaluator {
  final CourseConfig config;

  const AnswerEvaluator(this.config);

  /// Проверяет [answer] против [exercise].
  ///
  /// Бросает [ArgumentError], если тип ответа не соответствует типу упражнения:
  /// это ошибка программиста, а не пользователя.
  EvaluationResult evaluate(Exercise exercise, Answer answer) {
    return switch (exercise) {
      MultipleChoiceExercise e =>
        _choice(e.options, e.multi, answer, e.explanation),
      EndingPickerExercise e => _endingPicker(e, answer),
      SentenceBuilderExercise e => _sentenceBuilder(e, answer),
      LetterUnscrambleExercise e => _letterUnscramble(e, answer),
      MatchingExercise e => _matching(e, answer),
      FillBlankExercise e => _fillBlank(e, answer),
      ImageDescriptionExercise e => _imageDescription(e, answer),
      ReadingQaExercise e => _readingQa(e, answer),
      FormHuntExercise e => _formHunt(e, answer),
    };
  }

  /// Приводит ответ к сравнимому виду с учётом письменности урока.
  ///
  /// Латиница и кириллица приравниваются **только** при
  /// `acceptBothScripts: true` (master-prompt §8.2): иначе упражнение
  /// перестанет проверять владение конкретным письмом.
  String _key(String value, {bool caseSensitive = false}) {
    final normalized = normalizeAnswer(value, caseSensitive: caseSensitive);
    if (!config.acceptBothScripts) return normalized;
    return _toLatinFold(normalized);
  }

  /// Сворачивает кириллицу в латиницу для script-независимого сравнения.
  ///
  /// Локальная таблица, а не `SerbianTransliteration`: та работает и с
  /// русскими буквами, которых в сербском алфавите нет, и приняла бы русский
  /// ввод за сербский ответ.
  static String _toLatinFold(String input) {
    const map = {
      'а': 'a',
      'б': 'b',
      'в': 'v',
      'г': 'g',
      'д': 'd',
      'ђ': 'đ',
      'е': 'e',
      'ж': 'ž',
      'з': 'z',
      'и': 'i',
      'ј': 'j',
      'к': 'k',
      'л': 'l',
      'љ': 'lj',
      'м': 'm',
      'н': 'n',
      'њ': 'nj',
      'о': 'o',
      'п': 'p',
      'р': 'r',
      'с': 's',
      'т': 't',
      'ћ': 'ć',
      'у': 'u',
      'ф': 'f',
      'х': 'h',
      'ц': 'c',
      'ч': 'č',
      'џ': 'dž',
      'ш': 'š',
    };
    final out = StringBuffer();
    for (final ch in input.split('')) {
      out.write(map[ch] ?? ch);
    }
    return out.toString();
  }

  EvaluationResult _choice(
    List<ChoiceOption> options,
    bool multi,
    Answer answer,
    String explanation,
  ) {
    if (answer is! ChoiceAnswer) {
      throw ArgumentError('Для этого упражнения нужен ChoiceAnswer');
    }
    final correctIds = options.where((o) => o.correct).map((o) => o.id).toSet();
    final chosen = answer.optionIds;
    final ok =
        chosen.length == correctIds.length && chosen.containsAll(correctIds);

    // Диагноз берём у первого выбранного неправильного варианта.
    ChoiceOption? wrong;
    for (final o in options) {
      if (chosen.contains(o.id) && !o.correct) {
        wrong = o;
        break;
      }
    }
    String label(Iterable<String> ids) =>
        options.where((o) => ids.contains(o.id)).map((o) => o.text).join(', ');

    return EvaluationResult(
      correct: ok,
      userDisplay: label(chosen),
      correctDisplay: label(correctIds),
      explanation: explanation,
      misconceptionId: wrong?.misconceptionId,
      feedbackKey: wrong?.feedbackKey,
    );
  }

  EvaluationResult _endingPicker(EndingPickerExercise e, Answer answer) {
    final base = _choice(e.options, false, answer, e.explanation);
    if (answer is! ChoiceAnswer) {
      throw ArgumentError('Для ending_picker нужен ChoiceAnswer');
    }
    // Показываем целую словоформу, а не голое окончание: так понятнее.
    final chosenText = e.options
        .where((o) => answer.optionIds.contains(o.id))
        .map((o) => o.text)
        .join();
    final userForm = chosenText.isEmpty ? '' : '${e.stem}$chosenText';
    return EvaluationResult(
      correct: base.correct,
      userDisplay: userForm,
      correctDisplay: e.fullForm,
      explanation: e.explanation,
      divergenceIndex:
          base.correct ? -1 : firstDivergence(userForm, e.fullForm),
      misconceptionId: base.misconceptionId,
      feedbackKey: base.feedbackKey,
    );
  }

  EvaluationResult _sentenceBuilder(SentenceBuilderExercise e, Answer answer) {
    if (answer is! OrderAnswer) {
      throw ArgumentError('Для sentence_builder нужен OrderAnswer');
    }
    final optional = e.optionalTokenIds.toSet();
    final ok = e.acceptedOrders
        .any((order) => _matchesOrder(answer.tokenIds, order, optional));
    final byId = {for (final t in e.allTokens) t.id: t.text};
    final userSentence =
        _joinWords(answer.tokenIds.map((id) => byId[id] ?? '?').toList());
    return EvaluationResult(
      correct: ok,
      userDisplay: userSentence,
      correctDisplay: e.canonicalSentence,
      explanation: e.explanation,
    );
  }

  /// Ответ совпадает с порядком, если он является подпоследовательностью
  /// [order], а все пропущенные токены помечены как необязательные.
  ///
  /// Именно подпоследовательность, а не совпадение множеств: порядок слов —
  /// то, что упражнение и проверяет (master-prompt §6.1).
  static bool _matchesOrder(
    List<String> given,
    List<String> order,
    Set<String> optional,
  ) {
    var gi = 0;
    for (final expected in order) {
      if (gi < given.length && given[gi] == expected) {
        gi++;
        continue;
      }
      // Токен пропущен — это допустимо только для необязательных.
      if (!optional.contains(expected)) return false;
    }
    // Все слова пользователя должны быть израсходованы: лишние = ошибка.
    return gi == given.length;
  }

  EvaluationResult _letterUnscramble(
      LetterUnscrambleExercise e, Answer answer) {
    if (answer is! TextAnswer) {
      throw ArgumentError('Для letter_unscramble нужен TextAnswer');
    }
    final ok = _key(answer.text) == _key(e.answer);
    return EvaluationResult(
      correct: ok,
      userDisplay: answer.text,
      correctDisplay: e.answer,
      explanation: e.explanation,
      divergenceIndex: ok ? -1 : firstDivergence(answer.text, e.answer),
    );
  }

  EvaluationResult _matching(MatchingExercise e, Answer answer) {
    if (answer is! PairsAnswer) {
      throw ArgumentError('Для matching нужен PairsAnswer');
    }
    var ok = e.pairs.length == answer.assignments.length;
    for (final p in e.pairs) {
      if (_key(answer.assignments[p.left] ?? '') != _key(p.right)) {
        ok = false;
        break;
      }
    }
    String render(String Function(MatchPair) pick) =>
        e.pairs.map((p) => '${p.left} → ${pick(p)}').join('; ');
    return EvaluationResult(
      correct: ok,
      userDisplay: render((p) => answer.assignments[p.left] ?? '—'),
      correctDisplay: render((p) => p.right),
      explanation: e.explanation,
    );
  }

  /// Ответы на вопросы к тексту: [PairsAnswer] отображает id вопроса в id
  /// выбранного варианта.
  ///
  /// Задание засчитывается целиком: половина верных ответов о тексте — это
  /// не половина понимания, а угаданное место.
  EvaluationResult _readingQa(ReadingQaExercise e, Answer answer) {
    if (answer is! PairsAnswer) {
      throw ArgumentError('Для reading_qa нужен PairsAnswer');
    }
    var ok = true;
    ChoiceOption? firstWrong;
    final user = <String>[];
    final right = <String>[];
    for (final q in e.questions) {
      final chosenId = answer.assignments[q.id];
      ChoiceOption? chosen;
      for (final o in q.options) {
        if (o.id == chosenId) {
          chosen = o;
          break;
        }
      }
      final correct = q.options.firstWhere((o) => o.correct);
      if (chosen == null || !chosen.correct) {
        ok = false;
        firstWrong ??= chosen;
      }
      user.add(chosen?.text ?? '—');
      right.add(correct.text);
    }
    return EvaluationResult(
      correct: ok,
      userDisplay: user.join('; '),
      correctDisplay: right.join('; '),
      explanation: e.explanation,
      misconceptionId: firstWrong?.misconceptionId,
      feedbackKey: firstWrong?.feedbackKey,
    );
  }

  /// Поиск форм в тексте: [ChoiceAnswer] содержит id отмеченных слов.
  ///
  /// Требуется точное совпадение множеств. Пропуск одной формы и лишнее
  /// слово — разные ошибки, поэтому оба показываются в разборе.
  EvaluationResult _formHunt(FormHuntExercise e, Answer answer) {
    if (answer is! ChoiceAnswer) {
      throw ArgumentError('Для form_hunt нужен ChoiceAnswer');
    }
    final target = e.targetIds;
    final chosen = answer.optionIds;
    final ok = chosen.length == target.length && chosen.containsAll(target);
    String label(Set<String> ids) =>
        e.tokens.where((t) => ids.contains(t.id)).map((t) => t.text).join(', ');
    return EvaluationResult(
      correct: ok,
      userDisplay: chosen.isEmpty ? '—' : label(chosen),
      correctDisplay: label(target),
      explanation: e.explanation,
    );
  }

  EvaluationResult _fillBlank(FillBlankExercise e, Answer answer) {
    if (answer is! BlanksAnswer) {
      throw ArgumentError('Для fill_blank нужен BlanksAnswer');
    }
    var ok = true;
    for (final blank in e.blanks) {
      final given = answer.values[blank.id] ?? '';
      final matched = blank.acceptedAnswers.any((a) =>
          _key(a, caseSensitive: blank.caseSensitive) ==
          _key(given, caseSensitive: blank.caseSensitive));
      if (!matched) {
        ok = false;
        break;
      }
    }
    return EvaluationResult(
      correct: ok,
      userDisplay: e.blanks.map((b) => answer.values[b.id] ?? '—').join(' / '),
      correctDisplay: e.blanks.map((b) => b.acceptedAnswers.first).join(' / '),
      explanation: e.explanation,
    );
  }

  EvaluationResult _imageDescription(
      ImageDescriptionExercise e, Answer answer) {
    switch (e.mode) {
      case ImageMode.choose:
        return _choice(e.options, false, answer, e.explanation);
      case ImageMode.free:
        if (answer is! TextAnswer) {
          throw ArgumentError("Для image_description 'free' нужен TextAnswer");
        }
        // Ограниченный список допустимых описаний. Semantic similarity здесь
        // сознательно не используется (master-prompt §6.4).
        final given = _key(answer.text);
        final ok = e.acceptedAnswers.any((a) => _key(a) == given);
        return EvaluationResult(
          correct: ok,
          userDisplay: answer.text,
          correctDisplay: e.acceptedAnswers.first,
          explanation: e.explanation,
        );
      case ImageMode.build:
      case ImageMode.fill:
        // Эти режимы требуют полей tokens/blanks, которых в схеме v1 у
        // image_description нет. Появятся вместе с реальными изображениями.
        throw UnimplementedError(
            "image_description mode '${e.mode.name}' пока не реализован: "
            'схема не описывает его payload (упражнение ${e.id})');
    }
  }
}

/// Склейка слов в предложение с корректными пробелами перед пунктуацией.
String _joinWords(List<String> words) {
  final out = StringBuffer();
  for (var i = 0; i < words.length; i++) {
    final w = words[i];
    final isPunctuation = w.length == 1 && '.,!?;:'.contains(w);
    if (i > 0 && !isPunctuation) out.write(' ');
    out.write(w);
  }
  return out.toString();
}
