import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/games/cases/typewriter_view.dart';

Widget _host(Size size, {required ValueChanged<String> onKey, KeyStrike? strike}) => MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(size: size),
        child: Scaffold(
          body: SizedBox(
            width: size.width,
            height: size.height,
            child: TypewriterView(
              lines: const [
                PrintedLine(before: 'bez', typed: 'kuce', after: '', status: 'slip', missing: ['ć']),
                PrintedLine(before: 'sa', typed: 'kuca', after: '', status: 'wrong', correct: 'kućom'),
              ],
              before: 'Vidim',
              typed: 'ku',
              after: '',
              strike: strike,
              returning: false,
              onKey: onKey,
            ),
          ),
        ),
      ),
    );

void main() {
  for (final size in const [Size(360, 640), Size(1280, 720)]) {
    testWidgets('машинка помещается и печатает на ${size.width.toInt()}px', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final pressed = <String>[];
      await tester.pumpWidget(_host(size, onKey: pressed.add));
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(find.text('Š'), findsOneWidget);
      expect(find.text('Đ'), findsOneWidget);

      await tester.tap(find.text('K'));
      await tester.tap(find.byIcon(Icons.backspace_outlined));
      await tester.tap(find.byIcon(Icons.keyboard_return));
      expect(pressed, ['k', 'backspace', 'enter']);

      // Удар лапой: состояние меняется и возвращается без висящих таймеров.
      await tester.pumpWidget(_host(size, onKey: pressed.add, strike: const KeyStrike('k', 1)));
      await tester.pump(const Duration(milliseconds: 120));
      await tester.pump(const Duration(seconds: 1));
      expect(tester.takeException(), isNull);
    });
  }
}
