import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/book_block.dart';
import 'package:srbski_read/screens/page_editor_screen.dart';

void main() {
  test('оформление сохраняется после вставки и удаления текста', () {
    final controller =
        StyledTextController('Ovo je kuća.', const [TextStyleSpan(7, 11, 'b')]);
    addTearDown(controller.dispose);
    controller.text = 'Ovo je velika kuća.';
    var block = parseBookBlock(controller.toParagraph());
    expect(block.text, 'Ovo je velika kuća.');
    expect(block.spans, const [TextStyleSpan(14, 18, 'b')]);
    controller.text = 'Ovo je kuća.';
    block = parseBookBlock(controller.toParagraph());
    expect(block.spans, const [TextStyleSpan(7, 11, 'b')]);
  });

  test('стили включаются и снимаются на выделении', () {
    final controller = StyledTextController('  kuća  ', const []);
    addTearDown(controller.dispose);
    controller.selection = const TextSelection(baseOffset: 2, extentOffset: 6);
    controller.toggle('i');
    expect(parseBookBlock(controller.toParagraph()).spans,
        const [TextStyleSpan(0, 4, 'i')]);
    controller.toggle('i');
    expect(controller.toParagraph(), 'kuća');
    controller.toggle('b');
    controller.clearStyles();
    expect(controller.toParagraph(), 'kuća');
  });

  test('пустой абзац можно сохранить и удалить', () {
    final controller = StyledTextController('', const []);
    addTearDown(controller.dispose);
    expect(controller.toParagraph(), '');
    controller.text = '   ';
    expect(controller.toParagraph(), '');
  });

  testWidgets('редактор помещается на телефоне и возвращает правку',
      (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    List<String>? result;
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                    body: TextButton(
                  onPressed: () async {
                    result = await Navigator.of(context).push<List<String>>(
                        MaterialPageRoute(
                            builder: (_) => const PageEditorScreen(
                                paragraphs: ['Dobar dan.'])));
                  },
                  child: const Text('Открыть'),
                )))));
    await tester.tap(find.text('Открыть'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Dobar dan svima.');
    await tester.tap(find.text('Готово'));
    await tester.pumpAndSettle();
    expect(result, ['Dobar dan svima.']);
    expect(tester.takeException(), isNull);
  });
}
