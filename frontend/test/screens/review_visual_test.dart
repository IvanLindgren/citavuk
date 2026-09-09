import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/course/models/progress.dart';
import 'package:srbski_read/course/services/course_progress_store.dart';
import 'package:srbski_read/course/state/course_controller.dart';
import 'package:srbski_read/course/screens/course_path_screen.dart';
import 'package:srbski_read/state/app_settings.dart';
import 'package:srbski_read/theme/app_theme.dart';
import 'package:srbski_read/widgets/wolf_mascot.dart';

class EmptyStore implements CourseProgressStore {
  @override
  Future<CourseProgress?> load(String id) async => null;
  @override
  Future<void> save(CourseProgress p) async {}
  @override
  Future<void> clear() async {}
}

void main() {
  testWidgets('курс и портреты: реальные шрифты, светлая и тёмная темы',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final loader = FontLoader('NotoSans')
      ..addFont(rootBundle.load('assets/fonts/NotoSans-Regular.ttf'));
    await loader.load();
    await (FontLoader('MaterialIcons')
          ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf')))
        .load();
    await tester.binding.setSurfaceSize(const Size(1280, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final controller = CourseController(store: EmptyStore());
    await tester.runAsync(() => controller.load());
    expect(controller.state, CourseLoadState.ready,
        reason: '${controller.error}');
    final capture = GlobalKey();
    for (final dark in [false, true]) {
      await tester.pumpWidget(ChangeNotifierProvider(
          create: (_) => AppSettings(),
          child: MaterialApp(
              theme: dark ? AppTheme.dark() : AppTheme.light(),
              builder: (context, child) => MediaQuery(
                  data:
                      MediaQuery.of(context).copyWith(disableAnimations: true),
                  child: RepaintBoundary(key: capture, child: child!)),
              home: CoursePathScreen(controller: controller))));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      if (const bool.fromEnvironment('REVIEW_CAPTURE')) {
        await tester.runAsync(() async {
          final image = await tester
              .renderObject<RenderRepaintBoundary>(find.byKey(capture))
              .toImage();
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          await File(
                  '${Directory.systemTemp.path}/citavuk-course-${dark ? 'dark' : 'light'}.png')
              .writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }
    }
    await tester.binding.setSurfaceSize(const Size(360, 640));
    await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light(),
        builder: (context, child) =>
            RepaintBoundary(key: capture, child: child!),
        home: Scaffold(
            body: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(children: const [
                  WolfBubble(
                      asset: Wolf.zdravo,
                      title: 'С возвращением!',
                      text: 'Твои слова ждут повторения.',
                      wolfSize: WolfSize.compact),
                  WolfBubble(
                      asset: Wolf.slavlje,
                      title: 'Готово!',
                      text: 'Ты закончил занятие.'),
                ])))));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 250)));
    await tester.pump();
    expect(
        tester
            .renderObjectList<RenderImage>(find.byType(RawImage))
            .every((r) => r.image != null),
        isTrue);
    if (const bool.fromEnvironment('REVIEW_CAPTURE')) {
      await tester.runAsync(() async {
        final image = await tester
            .renderObject<RenderRepaintBoundary>(find.byKey(capture))
            .toImage();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File('${Directory.systemTemp.path}/citavuk-portraits.png')
            .writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });
}
