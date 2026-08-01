/// Разбор английского слова.
///
/// Читавук — про сербский, но английский в сербских учебниках работает
/// языком-посредником, и по такому слову тоже нажимают. Модель намеренно
/// повторяет форму [WordAnalysis]: карточка разбора рисуется одним и тем же
/// кодом, меняется только ветка контента.
library;

/// Факт о форме слова: «Число: множественное».
class EnglishFact {
  final String label;
  final String value;

  const EnglishFact(this.label, this.value);
}

/// Как слово соотносится со своей начальной формой.
enum EnglishFormKind {
  /// Слово и есть начальная форма.
  lemma,

  /// Форма построена по правилу (books, walked, making).
  regular,

  /// Форма из таблицы исключений WordNet (children, ran, better).
  irregular,
}

class EnglishAnalysis {
  final String surface;
  final String lemma;

  /// Часть речи в нотации UD — та же, что у сербского разбора.
  final String upos;

  final EnglishFormKind formKind;
  final List<EnglishFact> facts;

  /// Короткое имя формы для словаря: «мн. ч.», «прош. вр.».
  /// Пустое, если слово и так начальная форма.
  final String formLabel;

  /// Объяснение «почему так» для карточки.
  final String why;

  /// Слово бывает и самостоятельной леммой: «saw» — и «пила», и прошедшее
  /// от «see». Разбор показывает основной вариант, но молчать о втором нельзя.
  final bool alsoLemma;

  const EnglishAnalysis({
    required this.surface,
    required this.lemma,
    required this.upos,
    required this.formKind,
    this.facts = const [],
    this.formLabel = '',
    this.why = '',
    this.alsoLemma = false,
  });

  bool get isLemma => formKind == EnglishFormKind.lemma;
}
