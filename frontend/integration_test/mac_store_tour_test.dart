// Скриншоты для Mac App Store: тот же обход, что на iPhone, но кадр снимает
// сам Flutter — окно раннера меньше витринных 2880×1800, а слой сцены
// рисуется в картинку любого размера.
//
// Запуск: см. .github/workflows/build-ios.yml (job mac-screenshots).
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'store_tour.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('экраны для Mac App Store', (tester) async {
    tester.view.physicalSize = const ui.Size(2880, 1800);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

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
