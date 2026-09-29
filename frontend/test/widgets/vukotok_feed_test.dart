import 'dart:convert';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/screens/vukotok_screen.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/micro_feed_service.dart';

Map<String, Object?> _item(int n) => {
      'id': 'item-$n',
      'category': 'history',
      'titleCyrillic': 'Наслов $n',
      'titleLatin': 'Naslov $n',
      'textCyrillic': 'Текст $n',
      'textLatin': 'Kratak tekst broj $n o gradu Beogradu.',
      'cefr': 'A2',
      'imageUrl': '',
      'attributionText': '',
    };

void _configure({int count = 3}) {
  SharedPreferences.setMockInitialValues({});
  MicroFeedService.configure(
    api: ApiClient(
      baseUrl: 'https://example.test',
      token: 'session',
      client: MockClient((request) async {
        final body = request.url.path == '/v1/micro-feed'
            ? {
                'items': [for (var i = 1; i <= count; i++) _item(i)],
                'visitorToken': 'v',
                'preferences': {'categories': <String>[], 'cefr': 'A2', 'onboarded': true},
              }
            : {'items': <Object>[]};
        return http.Response(jsonEncode(body), 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    ),
  );
}

Widget _app(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  for (final size in [const Size(390, 780), const Size(1280, 800)]) {
    testWidgets('лента текстов не переполняется на ${size.width.toInt()} px',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      _configure();
      await tester.pumpWidget(_app(const VukotokScreen()));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(milliseconds: 200));

      expect(find.text('Тексты'), findsOneWidget);
      expect(find.text('Видео'), findsOneWidget);
      expect(find.text('1 / 3'), findsOneWidget);
      expect(find.byTooltip('Следующая карточка'),
          size.width >= 760 ? findsOneWidget : findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('стрелка вниз и кнопка листают по одной карточке',
      (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    _configure();
    await tester.pumpWidget(_app(const VukotokScreen()));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('2 / 3'), findsOneWidget);

    await tester.tap(find.byTooltip('Следующая карточка'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('3 / 3'), findsOneWidget);

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('2 / 3'), findsOneWidget);
  });

  testWidgets('двойное касание ставит лайк один раз', (tester) async {
    tester.view.physicalSize = const Size(390, 780);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    _configure();
    await tester.pumpWidget(_app(const VukotokScreen()));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    // Пустое место над текстом: слова карточки сами ловят касания.
    const point = Offset(195, 250);
    final gesture = await tester.startGesture(point, kind: PointerDeviceKind.touch);
    await gesture.up();
    await tester.pump(const Duration(milliseconds: 60));
    final second = await tester.startGesture(point, kind: PointerDeviceKind.touch);
    await second.up();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byIcon(Icons.favorite), findsWidgets);
    // Ещё одна двойная попытка не снимает поставленный лайк.
    final third = await tester.startGesture(point, kind: PointerDeviceKind.touch);
    await third.up();
    await tester.pump(const Duration(milliseconds: 60));
    final fourth = await tester.startGesture(point, kind: PointerDeviceKind.touch);
    await fourth.up();
    await tester.pump(const Duration(milliseconds: 900));
    expect(find.byIcon(Icons.favorite), findsWidgets);
    // Подсказка «Сохранено» гаснет сама через четыре секунды.
    await tester.pump(const Duration(seconds: 5));
    expect(tester.takeException(), isNull);
  });

  testWidgets('переключатель «Видео» открывает видеоленту без ошибок',
      (tester) async {
    tester.view.physicalSize = const Size(390, 780);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    _configure(count: 0);
    await tester.pumpWidget(_app(const VukotokScreen()));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Видео'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Для тебя'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
