/// Шкала CEFR в порядке возрастания.
const serbianLevels = <String>['A1', 'A2', 'B1', 'B2', 'C1'];

/// Как называется ступень для человека: «B1» само по себе ничего не говорит.
const serbianLevelNames = <String, String>{
  'A1': 'Первые слова',
  'A2': 'Простые фразы',
  'B1': 'Читаю с переводчиком',
  'B2': 'Читаю почти свободно',
  'C1': 'Свободно',
};

/// Один вопрос теста на уровень. Верного ответа здесь нет: проверяет сервер.
class LevelQuestion {
  final String id;
  final String level;

  /// Предложение с пропуском. Пропуск обозначен «___».
  final String prompt;

  /// Перевод на русский. Без него вопрос проверял бы знание слов, а не
  /// грамматики: не поняв фразы, наугад отвечают все одинаково.
  final String hint;
  final List<String> options;

  const LevelQuestion({
    required this.id,
    required this.level,
    required this.prompt,
    required this.hint,
    required this.options,
  });

  factory LevelQuestion.fromJson(Map<String, dynamic> j) => LevelQuestion(
        id: (j['id'] ?? '').toString(),
        level: (j['level'] ?? '').toString(),
        prompt: (j['prompt'] ?? '').toString(),
        hint: (j['hint'] ?? '').toString(),
        options: [
          for (final o in (j['options'] as List?) ?? const []) o.toString(),
        ],
      );
}

class LevelTestResult {
  final String level;
  final int correct;
  final int total;

  const LevelTestResult({
    required this.level,
    required this.correct,
    required this.total,
  });

  factory LevelTestResult.fromJson(Map<String, dynamic> j) => LevelTestResult(
        level: (j['level'] ?? 'A1').toString(),
        correct: (j['correct'] as num?)?.toInt() ?? 0,
        total: (j['total'] as num?)?.toInt() ?? 0,
      );
}

/// Насколько труден текст.
class TextLevel {
  /// Пусто, если слов не хватило для суждения.
  final String level;
  final int words;

  /// Самые редкие слова текста. Показываются человеку: «книга трудная» без
  /// примеров звучит как приговор без объяснения.
  final List<String> hardWords;

  const TextLevel({
    required this.level,
    required this.words,
    required this.hardWords,
  });

  factory TextLevel.fromJson(Map<String, dynamic> j) => TextLevel(
        level: (j['level'] ?? '').toString(),
        words: (j['words'] as num?)?.toInt() ?? 0,
        hardWords: [
          for (final w in (j['hardWords'] as List?) ?? const []) w.toString(),
        ],
      );
}

/// Стоит ли предупредить читателя о книге.
///
/// Разрыв в две ступени, а не в одну: читать на ступень выше своего уровня как
/// раз и полезно, и отговаривать от этого значит мешать единственному способу
/// вырасти. Правило то же, что на сервере (level.TooHardFor).
bool tooHardFor(String textLevel, String readerLevel) {
  final text = serbianLevels.indexOf(textLevel);
  final reader = serbianLevels.indexOf(readerLevel);
  return text >= 0 && reader >= 0 && text - reader >= 2;
}
