import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/games/speaking/speaking_screen.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/auth_service.dart';

Map<String, Object?> _topics() => {
      'genres': [
        {'id': 'politika', 'icon': 'P', 'art': '<path d="M4 4h16"/>', 'ru': 'Политика', 'sr': 'Politika'},
        {'id': 'hrana', 'icon': 'H', 'ru': 'Еда', 'sr': 'Hrana'},
      ],
      'topics': [
        for (var i = 1; i <= 6; i++)
          {
            'id': '${i.isEven ? 'hrana' : 'politika'}-0$i',
            'genre': i.isEven ? 'hrana' : 'politika',
            'sr': 'Tema broj $i?',
            'ru': 'Тема номер $i?',
            'words': [
              {'sr': 'reč$i', 'ru': 'слово$i'}
            ],
          }
      ],
    };

ApiClient _api({required bool open, List<Map<String, Object?>>? reviews}) {
  return ApiClient(
    baseUrl: 'https://example.test',
    token: 'session',
    client: MockClient((request) async {
      Map<String, Object?> body;
      switch (request.url.path) {
        case '/v1/games/speaking/access':
          body = {
            'open': open,
            'publicFrom': '2026-10-13T00:00:00+03:00',
            'supporter': open,
            'signedIn': true,
          };
        case '/v1/games/speaking/topics':
          body = _topics();
        case '/v1/games/speaking/review':
          reviews?.add(jsonDecode(request.body) as Map<String, Object?>);
          body = {
            'text': 'Ja sam bio u Beograd i video sam mnogo lepih zgrada.',
            'review': {
              'level': 'A2',
              'onTopic': true,
              'summary': 'Хороший рассказ.',
              'strengths': ['Связный текст'],
              'mistakes': [
                {
                  'original': 'u Beograd',
                  'fixed': 'u Beogradu',
                  'kind': 'case',
                  'label': 'Падеж',
                  'explanation': 'После «u» нужен локатив.',
                }
              ],
              'polished': 'Ja sam bio u Beogradu i video sam mnogo lepih zgrada.',
              'tips': ['Повтори локатив.'],
              'words': [
                {'sr': 'zgrada', 'ru': 'здание'}
              ],
            },
          };
        default:
          body = {};
      }
      return http.Response(jsonEncode(body), 200,
          headers: {'content-type': 'application/json; charset=utf-8'});
    }),
  );
}

class _SignedIn extends AuthService {
  _SignedIn(ApiClient api) : super(api: api);

  @override
  bool get isSignedIn => true;
}

Widget _app(ApiClient api) => MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        ChangeNotifierProvider<AuthService>(create: (_) => _SignedIn(api)),
      ],
      child: const MaterialApp(home: SpeakingScreen()),
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('до открытия остаётся витрина раннего доступа', (tester) async {
    await tester.pumpWidget(_app(_api(open: false)));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Ранний доступ'), findsOneWidget);
    expect(find.text('Крутить барабан'), findsNothing);
    expect(find.textContaining('13 октября'), findsOneWidget);
  });

  testWidgets('барабан выдаёт тему, ответ разбирается и подсвечивается',
      (tester) async {
    tester.view.physicalSize = const Size(600, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final sent = <Map<String, Object?>>[];
    await tester.pumpWidget(_app(_api(open: true, reviews: sent)));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Крутить барабан'), findsOneWidget);
    // Жанры рисуются значками: эмодзи из поля icon на экран не попадает.
    expect(find.byType(SvgPicture), findsWidgets);
    expect(find.text('P'), findsNothing);
    expect(find.byIcon(Icons.chat_bubble_outline), findsWidgets);

    await tester.tap(find.text('Крутить барабан'));
    await tester.pump();
    // Пока барабан крутится, кнопка неактивна.
    expect(find.text('Крутится…'), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.textContaining('ТВОЯ ТЕМА'), findsOneWidget);
    expect(find.text('Сказать'), findsOneWidget);

    await tester.ensureVisible(find.text('Написать'));
    await tester.tap(find.text('Написать'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.enterText(find.byType(TextField),
        '  Ja sam bio u Beograd   i video sam mnogo lepih zgrada.  ');
    await tester.pump();
    await tester.ensureVisible(find.text('Разобрать ошибки'));
    await tester.tap(find.text('Разобрать ошибки'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 600));

    expect(sent, hasLength(1));
    expect(sent.single['source'], 'text');
    expect(sent.single['sessionId'], isNotEmpty);
    expect((sent.single['topicId'] as String), matches(RegExp(r'^(hrana|politika)-0\d$')));
    expect(find.textContaining('Уровень текста'), findsOneWidget);
    expect(find.textContaining('Ошибок: 1'), findsOneWidget);
    expect(find.text('Как это звучит правильно'.toUpperCase()), findsOneWidget);
    expect(tester.takeException(), isNull);
    // История попыток осталась в настройках.
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('citavuk-speaking-history'), contains('Тема номер'));
  });
}
