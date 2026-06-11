/// Один грамматический признак для отображения (например, «Падеж: винительный»).
class GrammarFact {
  final String label;
  final String value;
  const GrammarFact(this.label, this.value);
}

/// Разбор формы: часть речи, признаки и человекочитаемое объяснение «почему так».
class GrammarInfo {
  final String posLabel;
  final List<GrammarFact> facts;
  final String summary;
  final String why;

  const GrammarInfo({
    required this.posLabel,
    this.facts = const [],
    this.summary = '',
    this.why = '',
  });
}

/// Ячейка парадигмы (строка таблицы спряжения/склонения).
class ParadigmCell {
  final String label; // напр. «Винительный» или «ja»
  final String form; // словоформа ('—' если неизвестна)
  final bool current; // совпадает с разбираемой формой
  final bool generated; // сгенерировано правилом (приблизительно)
  final String? caseKey; // UD-код падежа для цветовой метки (если применимо)

  const ParadigmCell({
    required this.label,
    required this.form,
    this.current = false,
    this.generated = false,
    this.caseKey,
  });
}

/// Таблица парадигмы (склонение по числу или одно из времён).
class ParadigmTable {
  final String title;
  final String? subtitle;
  final List<ParadigmCell> rows;

  /// Подсвечивать ли окончания: для склонения и презента формы — одиночные
  /// слова с общей основой, поэтому окончание можно выделить. Для перфекта/
  /// футура формы составные (вспом. глагол + причастие/инфинитив) — выключено.
  final bool highlightEndings;

  const ParadigmTable({
    required this.title,
    this.subtitle,
    required this.rows,
    this.highlightEndings = false,
  });

  bool get hasGenerated => rows.any((r) => r.generated && r.form != '—');
}

/// Карточка-перевёртыш для запоминания правила (вопрос → объяснение).
typedef RuleCard = ({String front, String back, String tag});

/// Грамматический разбор ФРАЗЫ: составное время и/или энклитики
/// («video sam ga» → перфекат + объяснение порядка кратких форм).
class PhraseInsight {
  final String title; // «Перфекат (прошедшее время)» / «Энклитики»
  final List<GrammarFact> parts; // «video — причастие», «sam — всп. глагол…»
  final String note; // пояснение (закон Ваккернагеля и т.п.)

  const PhraseInsight({
    required this.title,
    this.parts = const [],
    required this.note,
  });
}

/// Раздел подробного объяснения внутри грамматической темы.
class GrammarTopicSection {
  final String title;
  final String body;
  const GrammarTopicSection(this.title, this.body);
}

/// Тема грамматического раздела: подробное правило + карточки для запоминания.
class GrammarTopic {
  final String id;
  final String title; // «Аорист (aorist)»
  final String subtitle; // короткая подпись в списке тем
  final String tag; // «Падежи» / «Время»
  final String intro; // вводное объяснение темы
  final List<GrammarTopicSection> sections; // правило по шагам
  final List<RuleCard> cards; // карточки этой темы

  const GrammarTopic({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.tag,
    required this.intro,
    this.sections = const [],
    this.cards = const [],
  });
}

/// Управление предлога падежом: на какой падеж он ставит слово и в каком смысле.
class PrepositionGovernment {
  final String caseKey; // UD-код падежа: Gen/Dat/Acc/Ins/Loc
  final String caseName; // русское название
  final String meaning; // когда/в каком значении используется

  const PrepositionGovernment({
    required this.caseKey,
    required this.caseName,
    required this.meaning,
  });
}
