import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/screens/roadmap_screen.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/auth_service.dart';
import 'package:srbski_read/services/roadmap_service.dart';

/// Шапка дорожной карты.
///
/// Экран открывался двумя абзацами авторского текста подряд, и до тропы
/// уровней доходил не всякий. Текст остался дословно, но под раскрытием.

const _about = 'Внимательное чтение и пассивное изучение слов.';

final _overview = jsonEncode({
  'levels': [
    {
      'level': 'A1',
      'name': 'Первые слова',
      'categories': {
        'reading': {'done': 0, 'total': 10, 'ratio': 0.0, 'passed': false},
      },
      'passed': false,
    },
  ],
  'categories': [
    {
      'key': 'reading',
      'title': 'Reading',
      'local': 'Čitanje',
      'about': _about,
      'planned': false,
    },
  ],
  'target': '',
  'current': '',
  'passingScore': 0.8,
  'signedIn': false,
});

Future<void> _pump(WidgetTester tester) async {
  SharedPreferences.setMockInitialValues({});
  final api = ApiClient(
    baseUrl: 'https://example.test',
    client: MockClient((request) async {
      if (request.url.path.endsWith('/v1/roadmap')) {
        return http.Response(_overview, 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }
      return http.Response('{}', 404);
    }),
  );

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider<RoadmapService>.value(value: RoadmapService(api: api)),
        ChangeNotifierProvider<AuthService>.value(
            value: AuthService(api: api)),
      ],
      child: const MaterialApp(home: RoadmapScreen()),
    ),
  );
  await _tick(tester);
}

/// Читавук в шапке качается бесконечно, поэтому pumpAndSettle тут не годится.
Future<void> _tick(WidgetTester tester) async {
  for (var i = 0; i < 6; i += 1) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  testWidgets('вводный текст свёрнут, но открывается по кнопке',
      (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await _pump(tester);

    expect(find.textContaining('Дорожная карта'), findsWidgets);
    expect(find.textContaining('редкий, как сербский'), findsNothing);

    await tester.tap(find.text('Зачем эта карта'));
    await _tick(tester);

    expect(find.textContaining('редкий, как сербский'), findsOneWidget);
  });

  testWidgets('описание категории появляется только при раскрытии',
      (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await _pump(tester);

    expect(find.text('Reading'), findsOneWidget);
    expect(find.text(_about), findsNothing);

    await tester.tap(find.text('Reading'));
    await _tick(tester);

    expect(find.text(_about), findsOneWidget);
  });
}
