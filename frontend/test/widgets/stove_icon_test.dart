import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/widgets/stove_icon.dart';

void main() {
  // Печь берётся из того же файла, что кладёт на виджет рабочего стола
  // tools/widget_assets.py. Разъедутся пути — на одном из двух экранов
  // окажется пустое место, и заметит это только пользователь.
  testWidgets('печь берётся из общего с виджетом ассета', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: StoveIcon(size: 24))),
    );

    final image = tester.widget<Image>(find.byType(Image));
    // Картинка декодируется под размер: провайдер обёрнут в ResizeImage.
    final provider = image.image is ResizeImage ? (image.image as ResizeImage).imageProvider : image.image;
    expect((provider as AssetImage).assetName,
        'assets/imgs/citavuk_stove.png');
    expect(image.width, 24);
  });
}
