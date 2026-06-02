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

  const ParadigmCell({
    required this.label,
    required this.form,
    this.current = false,
    this.generated = false,
  });
}

/// Таблица парадигмы (склонение по числу или одно из времён).
class ParadigmTable {
  final String title;
  final String? subtitle;
  final List<ParadigmCell> rows;

  const ParadigmTable({required this.title, this.subtitle, required this.rows});

  bool get hasGenerated => rows.any((r) => r.generated && r.form != '—');
}
