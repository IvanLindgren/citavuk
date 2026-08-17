import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/definition.dart';
import 'package:srbski_read/widgets/definition_card.dart';

Future<void> show(WidgetTester tester, Definition entry) => tester.pumpWidget(
      MaterialApp(home: Scaffold(body: DefinitionCard(entry))),
    );

/// Весь текст карточки одной строкой.
///
/// Заглавное слово и значения набраны Text.rich (помета идёт курсивом внутри
/// той же строки), и по отдельным `Text` их не найти.
String visibleText(WidgetTester tester) => tester
    .widgetList<Text>(find.byType(Text))
    .map((text) => text.data ?? text.textSpan?.toPlainText() ?? '')
    .join('\n');

void main() {
  testWidgets('словарная статья подписана томом и страницей', (tester) async {
    await show(
      tester,
      const Definition(
        headword: 'шља̏ка',
        grammar: 'ж',
        senses: [DefinitionSense(definition: 'штака, штап.', register: 'покр.')],
        sourceTitle: 'Речник српскохрватскога књижевног језика',
        volume: 6,
        page: 979,
        url: 'https://srpskirecnik.com/odrednica/x',
      ),
    );

    final text = visibleText(tester);
    expect(text, contains('шља̏ка'));
    expect(text, contains('покр. штака, штап.'));
    expect(text,
        contains('Речник српскохрватскога књижевног језика, том 6, с. 979'));
  });

  // Выдать сочинённый нейросетью текст за статью Матице српске нельзя:
  // ни тома, ни страницы у него нет, и ссылаться там не на что.
  testWidgets('сочинённое толкование подписано без тома и страницы',
      (tester) async {
    await show(
      tester,
      const Definition(
        headword: 'изгуглати',
        senses: [DefinitionSense(definition: 'пронаћи нешто на интернету.')],
        sourceTitle: 'Объяснение составлено нейросетью',
        generated: true,
      ),
    );

    final text = visibleText(tester);
    expect(text, contains('Объяснение составлено нейросетью'));
    expect(text, isNot(contains('том')));
    expect(text, isNot(contains('с. ')));
  });

  testWidgets('несколько значений нумеруются, одно — нет', (tester) async {
    await show(
      tester,
      const Definition(
        headword: 'reč',
        senses: [
          DefinitionSense(definition: 'основна јединица језика.'),
          DefinitionSense(definition: 'говор, беседа.'),
        ],
        sourceTitle: 'Речник',
      ),
    );
    expect(visibleText(tester), contains('1. основна јединица језика.'));
    expect(visibleText(tester), contains('2. говор, беседа.'));

    await show(
      tester,
      const Definition(
        headword: 'reč',
        senses: [DefinitionSense(definition: 'основна јединица језика.')],
        sourceTitle: 'Речник',
      ),
    );
    expect(visibleText(tester), isNot(contains('1. ')));
  });

  testWidgets('цитата показывается со своим источником', (tester) async {
    await show(
      tester,
      const Definition(
        headword: 'шља̏ка',
        senses: [
          DefinitionSense(
            definition: 'штака, штап.',
            examples: [
              DefinitionExample(
                  text: 'Најприје уђе један хроми.', source: 'Ћоп.'),
            ],
          )
        ],
        sourceTitle: 'Речник',
      ),
    );

    final text = visibleText(tester);
    expect(text, contains('Најприје уђе један хроми.'));
    expect(text, contains('— Ћоп.'));
  });
}
