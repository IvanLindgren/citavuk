import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/models/micro_feed.dart';
import 'package:srbski_read/screens/vukotok_screen.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/micro_feed_service.dart';

void main() {
  testWidgets('ошибка сохранения интересов не запирает пользователя в анкете', (tester) async {
    SharedPreferences.setMockInitialValues({});
    MicroFeedService.configure(api: ApiClient(
      baseUrl: 'https://example.test', token: 'test-session',
      client: MockClient((_) async => http.Response('{"message":"Сервер временно недоступен"}', 503,
        headers: {'content-type': 'application/json; charset=utf-8'})),
    ));
    MicroFeedPreferences? result;
    await tester.pumpWidget(MaterialApp(home: VukotokOnboarding(
      preferences: const MicroFeedPreferences(categories: ['history'], cefr: 'A2', onboarded: false, levelFromAccount: true),
      onDone: (value) => result = value,
    )));
    await tester.ensureVisible(find.text('Открыть ленту'));
    await tester.tap(find.text('Открыть ленту'));
    await tester.pumpAndSettle();
    expect(result, isNull);
    await tester.ensureVisible(find.text('Продолжить без сохранения'));
    await tester.tap(find.text('Продолжить без сохранения'));
    expect(result?.onboarded, isTrue);
    expect(result?.categories, ['history']);
  });
}
