/// Толкование сербского слова: что оно значит, а не как переводится.
///
/// Перевод отвечает на вопрос «что это по-русски», толкование — «что это
/// значит»: у «reč» и «слово» разные границы, и выше начального уровня
/// объяснение на изучаемом языке точнее любого перевода.
///
/// Статья берётся из «Речника српскохрватскога књижевног језика» и показывается
/// как цитата: [sourceTitle] с [url] обязательны к показу, иначе выходит, что
/// словарь наш. Словарь вышел в прошлом веке и не знает ни заимствований, ни
/// разговорной речи — такие слова объясняет нейросеть, и тогда приходит
/// [generated]: ссылаться там не на что, а подписать сочинённый текст словарём
/// нельзя.
library;

class DefinitionExample {
  const DefinitionExample({required this.text, this.source = ''});

  final String text;
  final String source;

  factory DefinitionExample.fromJson(Map<String, dynamic> json) =>
      DefinitionExample(
        text: (json['text'] ?? '').toString(),
        source: (json['source'] ?? '').toString(),
      );
}

class DefinitionSense {
  const DefinitionSense({
    required this.definition,
    this.number = '',
    this.domain = '',
    this.register = '',
    this.examples = const [],
  });

  final String definition;

  /// Номер значения в словарной статье: «1», «2. а» и подобное.
  final String number;

  /// Область употребления («мед.», «бот.») и стилистическая помета
  /// («разг.», «покр.») — они идут перед толкованием курсивом.
  final String domain;
  final String register;

  final List<DefinitionExample> examples;

  factory DefinitionSense.fromJson(Map<String, dynamic> json) => DefinitionSense(
        definition: (json['definition'] ?? '').toString(),
        number: (json['number'] ?? '').toString(),
        domain: (json['domain'] ?? '').toString(),
        register: (json['register'] ?? '').toString(),
        examples: ((json['examples'] as List?) ?? const [])
            .whereType<Map>()
            .map((e) => DefinitionExample.fromJson(e.cast<String, dynamic>()))
            .where((e) => e.text.isNotEmpty)
            .toList(),
      );
}

class Definition {
  const Definition({
    required this.headword,
    required this.senses,
    required this.sourceTitle,
    this.grammar = '',
    this.etymology = '',
    this.url = '',
    this.volume = 0,
    this.page = 0,
    this.generated = false,
  });

  /// Заглавное слово статьи — с ударением, как в словаре: «шља̏ка».
  final String headword;

  /// Грамматическая помета статьи: «ж», «несвр.».
  final String grammar;
  final String etymology;

  final List<DefinitionSense> senses;

  final String sourceTitle;
  final String url;
  final int volume;
  final int page;

  /// Толкование составила нейросеть, а не словарь.
  final bool generated;

  factory Definition.fromJson(Map<String, dynamic> json) => Definition(
        headword: (json['headword'] ?? '').toString(),
        grammar: (json['grammar'] ?? '').toString(),
        etymology: (json['etymology'] ?? '').toString(),
        senses: ((json['senses'] as List?) ?? const [])
            .whereType<Map>()
            .map((e) => DefinitionSense.fromJson(e.cast<String, dynamic>()))
            .where((s) => s.definition.trim().isNotEmpty)
            .toList(),
        sourceTitle: (json['sourceTitle'] ?? '').toString(),
        url: (json['url'] ?? '').toString(),
        volume: (json['volume'] as num?)?.toInt() ?? 0,
        page: (json['page'] as num?)?.toInt() ?? 0,
        generated: json['generated'] == true,
      );
}
