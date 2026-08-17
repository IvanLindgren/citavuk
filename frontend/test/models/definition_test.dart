import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/definition.dart';

/// Ответ боевого сервера на «шљака» — с сокращённой цитатой.
const _fromDictionary = '''
{
  "headword": "шља̏ка",
  "grammar": "ж",
  "senses": [
    {
      "register": "dialectal",
      "definition": "штака, штап.",
      "examples": [{"text": "Најприје уђе један хроми.", "source": "Ћоп."}]
    }
  ],
  "sourceTitle": "Речник српскохрватскога књижевног језика",
  "volume": 6,
  "page": 979,
  "url": "https://srpskirecnik.com/odrednica/x"
}
''';

void main() {
  test('статья словаря разбирается со всеми пометами', () {
    final entry = Definition.fromJson(
        jsonDecode(_fromDictionary) as Map<String, dynamic>);

    expect(entry.grammar, 'ж');
    expect(entry.senses, hasLength(1));
    expect(entry.senses.first.register, 'dialectal');
    expect(entry.senses.first.examples.first.source, 'Ћоп.');
    expect(entry.volume, 6);
    expect(entry.page, 979);
    expect(entry.generated, isFalse);
  });

  test('сочинённое толкование помечено', () {
    final entry = Definition.fromJson({
      'headword': 'изгуглати',
      'senses': [
        {'definition': 'пронаћи нешто на интернету.'}
      ],
      'sourceTitle': 'Объяснение составлено нейросетью',
      'generated': true,
    });

    expect(entry.generated, isTrue);
    expect(entry.volume, 0);
    expect(entry.url, isEmpty);
  });

  // Значение без текста показывать нечем, а пустой пункт списка в карточке
  // выглядит сбоем словаря.
  test('пустые значения выбрасываются', () {
    final entry = Definition.fromJson({
      'headword': 'reč',
      'senses': [
        {'definition': '   '},
        {'definition': 'основна јединица језика.'},
      ],
      'sourceTitle': 'Речник',
    });

    expect(entry.senses, hasLength(1));
    expect(entry.senses.first.definition, 'основна јединица језика.');
  });

  test('ответ без значений даёт пустой список, а не падение', () {
    final entry = Definition.fromJson({'headword': 'x', 'sourceTitle': 'y'});
    expect(entry.senses, isEmpty);
  });
}
