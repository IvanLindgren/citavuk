/// Ответы пользователя. Отдельный тип на каждое семейство упражнений, чтобы
/// evaluator не разбирал произвольные `dynamic`.
library;

/// Ответ пользователя на одно упражнение.
sealed class Answer {
  const Answer();

  /// Пустой ответ: кнопку «Проверить» держим неактивной.
  bool get isEmpty;

  /// Сериализация для локального сохранения незавершённого урока
  /// (master-prompt §25) и для отправки попытки на сервер.
  Map<String, dynamic> toJson();

  static Answer fromJson(Map<String, dynamic> j) => switch (j['kind']) {
        'choice' => ChoiceAnswer(((j['optionIds'] as List?) ?? const [])
            .whereType<String>()
            .toSet()),
        'order' => OrderAnswer(((j['tokenIds'] as List?) ?? const [])
            .whereType<String>()
            .toList()),
        'text' => TextAnswer((j['text'] ?? '') as String),
        'blanks' => BlanksAnswer(((j['values'] as Map?) ?? const {})
            .map((k, v) => MapEntry('$k', '$v'))),
        'pairs' => PairsAnswer(((j['assignments'] as Map?) ?? const {})
            .map((k, v) => MapEntry('$k', '$v'))),
        _ => throw FormatException("Неизвестный вид ответа: '${j['kind']}'"),
      };
}

/// Выбор одного или нескольких вариантов.
final class ChoiceAnswer extends Answer {
  final Set<String> optionIds;

  const ChoiceAnswer(this.optionIds);

  @override
  bool get isEmpty => optionIds.isEmpty;

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'choice',
        'optionIds': optionIds.toList()..sort(),
      };
}

/// Порядок собранных токенов.
final class OrderAnswer extends Answer {
  final List<String> tokenIds;

  const OrderAnswer(this.tokenIds);

  @override
  bool get isEmpty => tokenIds.isEmpty;

  @override
  Map<String, dynamic> toJson() => {'kind': 'order', 'tokenIds': tokenIds};
}

/// Свободный или собранный текст (буквы, свободное описание).
final class TextAnswer extends Answer {
  final String text;

  const TextAnswer(this.text);

  @override
  bool get isEmpty => text.trim().isEmpty;

  @override
  Map<String, dynamic> toJson() => {'kind': 'text', 'text': text};
}

/// Заполненные пропуски: blankId → введённое значение.
final class BlanksAnswer extends Answer {
  final Map<String, String> values;

  const BlanksAnswer(this.values);

  @override
  bool get isEmpty => values.values.every((v) => v.trim().isEmpty);

  @override
  Map<String, dynamic> toJson() => {'kind': 'blanks', 'values': values};
}

/// Сопоставление: левое → выбранное правое.
final class PairsAnswer extends Answer {
  final Map<String, String> assignments;

  const PairsAnswer(this.assignments);

  @override
  bool get isEmpty => assignments.isEmpty;

  @override
  Map<String, dynamic> toJson() =>
      {'kind': 'pairs', 'assignments': assignments};
}
