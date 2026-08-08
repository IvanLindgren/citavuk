import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:srbski_read/course/screens/translation_duel_screen.dart';
import 'package:srbski_read/services/api_client.dart';

void main() {
  testWidgets('игра помещается на экран 360dp и открывает раунд',
      (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final client = MockClient((request) async {
      expect(request.url.path, '/v1/translation-game/round');
      return http.Response(
        jsonEncode({
          'level': 'A2',
          'round': 1,
          'translator': 'deepl',
          'judgeEnabled': true,
          'sentences': [
            for (var index = 0; index < 5; index++)
              {
                'id': 'a2-0$index',
                'text': 'Ovo je probna rečenica broj ${index + 1}.',
                'translatorTranslation':
                    'Это тестовое предложение номер ${index + 1}.',
              },
          ],
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final api = ApiClient(baseUrl: 'https://example.test', client: client);
    addTearDown(api.close);

    await tester.pumpWidget(
      Provider<ApiClient>.value(
        value: api,
        child: const MaterialApp(home: TranslationDuelScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Google Translate'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Начать матч'));
    await tester.pumpAndSettle();

    expect(find.text('A2 · раунд 1 из 3'), findsOneWidget);
    expect(find.byType(TextField), findsWidgets);
    expect(tester.takeException(), isNull,
        reason: 'экран матча не должен переполняться на 360dp');
  });
}
