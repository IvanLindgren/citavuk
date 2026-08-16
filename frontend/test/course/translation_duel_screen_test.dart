import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:srbski_read/course/screens/translation_duel_screen.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/duel_sounds.dart';

void main() {
  testWidgets('бой помещается на экран 360dp и открывает раунд',
      (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    // В тестах аудиоплагина нет. Звук выключается тем же переключателем, что и
    // кнопкой на арене, — заодно проверяется, что он вообще выключается.
    DuelSounds.instance.enabled = false;
    addTearDown(() => DuelSounds.instance.enabled = true);

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
    // pumpAndSettle здесь не годится: с началом раунда включается счётчик
    // времени, который перерисовывает экран каждые сто миллисекунд, и ждать
    // «пока всё успокоится» пришлось бы до конца матча.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('A2 · раунд 1 из 3'), findsOneWidget);
    expect(find.text('ПЕРЕВЕДИ НА РУССКИЙ'), findsOneWidget);
    expect(find.text('Ovo je probna rečenica broj 1.'), findsOneWidget);
    // Фразы идут по одной, значит поле ровно одно.
    expect(find.byType(TextField), findsOneWidget);
    expect(tester.takeException(), isNull,
        reason: 'экран матча не должен переполняться на 360dp');

    await tester.enterText(find.byType(TextField), 'Это пробное предложение');
    await tester.pump();
    expect(find.textContaining('серия '), findsOneWidget);
    expect(tester.takeException(), isNull);

    // Экран уходит с таймерами внутри — они обязаны сниматься в dispose,
    // иначе тест упадёт на «Timer is still pending».
    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    await tester.pump(const Duration(seconds: 2));
  });
}
