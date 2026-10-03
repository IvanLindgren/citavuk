// Скриншоты для App Store: кадр снимает сам Flutter, рисуя слой сцены в
// картинку. Снимок экрана симулятора (simctl) между шагами обхода не
// обновлялся, а окно мак-раннера меньше витринных 2880×1800.
//
// Размер задаётся --dart-define=SHOT_W/SHOT_H/SHOT_DPR; без них берётся
// экран устройства как есть. Запуск: см. .github/workflows/build-ios.yml.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'store_tour.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('экраны для App Store', (tester) async {
    const width = int.fromEnvironment('SHOT_W');
    const height = int.fromEnvironment('SHOT_H');
    if (width > 0 && height > 0) {
      tester.view.physicalSize = ui.Size(width.toDouble(), height.toDouble());
      tester.view.devicePixelRatio =
          double.parse(const String.fromEnvironment('SHOT_DPR', defaultValue: '2'));
      addTearDown(tester.view.reset);
    }

    final dir = Directory('${Directory.systemTemp.path}/citavuk-shots');
    await dir.create(recursive: true);
    // ignore: avoid_print
    print('SHOTS_DIR=${dir.path}');

    await storeTour(tester, (name) async {
      final view = tester.binding.renderViews.first;
      final layer = view.debugLayer! as OffsetLayer;
      final size = tester.view.physicalSize;
      final image = await layer.toImage(ui.Offset.zero & size);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      await File('${dir.path}/$name.png').writeAsBytes(png!.buffer.asUint8List());
    });
  });
}
