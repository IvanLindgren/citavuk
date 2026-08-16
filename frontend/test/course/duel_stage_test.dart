import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/widgets/duel_stage.dart';

void main() {
  test('часы горят тем сильнее, чем меньше осталось', () {
    expect(urgencyOf(120, 200), Urgency.calm);
    expect(urgencyOf(25, 200), Urgency.warm);
    expect(urgencyOf(5, 200), Urgency.hot);
    // У короткой фазы пороги свои: четверть и половина её собственной длины.
    expect(urgencyOf(30, 40), Urgency.calm);
    expect(urgencyOf(5, 40), Urgency.hot);
  });

  testWidgets('часы называют остаток вслух для доступности', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: DuelClock(seconds: 95, total: 200)),
    ));
    expect(find.text('1:35'), findsOneWidget);
    expect(
      tester.getSemantics(find.byType(DuelClock)).label,
      contains('Осталось 95 секунд'),
    );
    handle.dispose();
  });

  testWidgets('пьедестал показывает места, счёт и того, кто смотрит',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: Podium(
          rows: [
            DuelStanding(id: 'me', name: 'Ты', score: 12, place: 1),
            DuelStanding(
                id: 'bot', name: 'DeepL', score: 8, place: 2, machine: true),
          ],
          you: 'me',
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 800));

    expect(find.text('Ты'), findsOneWidget);
    expect(find.text('DeepL'), findsOneWidget);
    expect(find.text('12'), findsOneWidget);
    // Своё место подписано отдельно: в чужом списке себя ищут глазами.
    expect(find.text('ТЫ'), findsOneWidget);
  });

  testWidgets('занавес объявляет фазу и уходит сам', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: PhaseCurtain(label: 'Поехали', title: 'Раунд 2 из 3'),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('ПОЕХАЛИ'), findsOneWidget);
    expect(find.text('Раунд 2 из 3'), findsOneWidget);
    await tester.pump(curtainSpan);
  });

  testWidgets('колода судьи не растёт бесконечно', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: ShuffleDeck(count: 40)),
    ));
    await tester.pump(const Duration(milliseconds: 100));
    // Шесть рубашек — предел: дальше они не читаются как колода.
    expect(find.byType(Container), findsNWidgets(6));
  });
}
