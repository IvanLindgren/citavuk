// Обход главных экранов для скриншотов на симуляторе iPhone и iPad.
//
// Снимки делает не Flutter, а драйвер на маке через `simctl`: так в кадр
// попадают статус-бар и Dynamic Island, а ради них всё и затевалось —
// по кадру из Flutter не видно, что текст ушёл под вырез.
//
// Запуск: см. .github/workflows/build-ios.yml.
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'store_tour.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('главные экраны', (tester) async {
    await storeTour(tester, binding.takeScreenshot);
  });
}
