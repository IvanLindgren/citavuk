// Обход главных экранов для скриншотов на симуляторе iPhone.
//
// Снимки делает не Flutter, а драйвер на маке через `simctl`: так в кадр
// попадают статус-бар и Dynamic Island, а ради них всё и затевалось —
// по кадру из Flutter не видно, что текст ушёл под вырез.
//
// Запуск: см. .github/workflows/build-ios.yml.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:srbski_read/main.dart' as app;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // pumpAndSettle здесь не годится: у маскота и сада бесконечные анимации,
  // и он ждал бы до тайм-аута.
  Future<void> settle(WidgetTester tester, [int seconds = 4]) async {
    for (var i = 0; i < seconds * 5; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
  }

  testWidgets('главные экраны', (tester) async {
    app.main(const []);
    await settle(tester, 8);
    await binding.takeScreenshot('01-start');

    final skip = find.text('Пропустить');
    if (skip.evaluate().isNotEmpty) {
      await tester.tap(skip.first);
      await settle(tester, 5);
    }

    final tabs = find.byType(NavigationDestination);
    final count = tabs.evaluate().length;
    for (var i = 0; i < count; i++) {
      await tester.tap(find.byType(NavigationDestination).at(i));
      await settle(tester, 4);
      await binding.takeScreenshot('${(i + 2).toString().padLeft(2, '0')}-tab-$i');
    }
  });
}
