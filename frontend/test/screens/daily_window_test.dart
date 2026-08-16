import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/screens/daily_window.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/daily_service.dart';

/// Окно «На каждый день» на узком экране и с крупным системным шрифтом.
///
/// Проверяется именно вёрстка: RenderFlex-переполнение во Flutter не роняет
/// приложение, а рисует жёлто-чёрную полосу — на телефоне человека с
/// увеличенным шрифтом её увидят все, а в разработке никто.

const _words = [
  {
    'lemma': 'бурек',
    'translation': 'слоёный пирог с мясом или сыром',
    'theme': 'Еда и напитки',
    'example': 'Купујем *бурек* сваког јутра у пекари поред станице.',
    'exampleTranslation': 'Покупаю бурек каждое утро в пекарне у вокзала.',
  },
  {
    'lemma': 'пекара',
    'translation': 'пекарня',
    'theme': 'Еда и напитки',
    'example': 'Пекара ради од шест ујутру.',
  },
];

Map<String, dynamic> _state({bool configured = true, String level = 'A2'}) => {
      'set': {
        'id': 'd1',
        'day': '2026-08-16',
        'level': level,
        'words': _words,
        'lesson': {
          'title': 'Јутро у пекари',
          'text': 'Ана иде у пекару. Купује бурек и јогурт, па седа на клупу.',
          'exercises': [
            {
              'kind': 'choice',
              'question': 'Куда иде Ана рано ујутру, пре посла?',
              'options': ['у пекару поред станице', 'у школу', 'на пијацу'],
              'answer': 'у пекару поред станице',
              'hint': 'Тражи место где се купује хлеб.',
            },
            {
              'kind': 'translate',
              'question': 'Переведи: она покупает бурек',
              'answer': 'она купује бурек',
            },
          ],
        },
        'learned': <String>[],
      },
      'level': level,
      'themes': ['Еда и напитки'],
      'configured': configured,
      'canCompose': true,
      'progress': {
        'reviewedToday': 128,
        'dueNow': 64,
        'streak': 17,
        'faded': [
          {'word': 'кашика', 'translation': 'ложка', 'overdueDays': 9},
          {'word': 'виљушка', 'translation': 'вилка', 'overdueDays': 12},
        ],
      },
    };

DailyService _service({Map<String, dynamic>? state}) {
  final client = MockClient((request) async {
    final path = request.url.path;
    if (path == '/v1/daily') {
      return http.Response(jsonEncode(state ?? _state()), 200,
          headers: {'content-type': 'application/json; charset=utf-8'});
    }
    if (path == '/v1/daily/settings') {
      return http.Response(
        jsonEncode({
          'themes': <String>[],
          'enabled': true,
          'level': '',
          'configured': false,
          'available': [
            {'theme': 'Еда и напитки', 'words': 40},
            {'theme': 'Город и транспорт', 'words': 32},
          ],
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    return http.Response('{}', 200);
  });
  return DailyService(
    api: ApiClient(baseUrl: 'https://example.invalid', client: client),
  );
}

Future<void> _open(
  WidgetTester tester,
  DailyService daily, {
  Size size = const Size(320, 640),
  double scale = 1.0,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(scale)),
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showDailyWindow(context, daily),
                child: const Text('открыть'),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  await tester.tap(find.text('открыть'));
  // Не pumpAndSettle: волк в шапке покачивается бесконечно, и ожидание покоя
  // никогда не закончится.
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
  // Срок ожидания виджета рабочего стола: без этого тест завершился бы с живым
  // таймером внутри.
  await tester.pump(const Duration(seconds: 3));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('слова дня помещаются на узкий экран', (tester) async {
    await _open(tester, _service());

    expect(find.text('бурек'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  // Системный шрифт в полтора раза больше обычного — не редкость, а настройка
  // доступности, которую включают все, кому за сорок.
  testWidgets('слова дня выдерживают крупный системный шрифт', (tester) async {
    await _open(tester, _service(), scale: 1.6);
    expect(tester.takeException(), isNull);
  });

  testWidgets('настройка тем помещается на узкий экран', (tester) async {
    await _open(
      tester,
      _service(state: _state(configured: false, level: '')),
      scale: 1.4,
    );

    expect(find.text('Всё подряд'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  // Ландшафт телефона: высоты меньше, чем ширины, и шторка на 90% экрана
  // становится совсем низкой.
  testWidgets('окно переживает горизонтальный экран', (tester) async {
    await _open(tester, _service(), size: const Size(640, 320));
    expect(tester.takeException(), isNull);
  });

  testWidgets('упражнение проверяется и показывает верный ответ',
      (tester) async {
    await _open(tester, _service());

    await tester.ensureVisible(find.text('у школу'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('у школу'));
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 120));
    }

    expect(find.textContaining('Правильный ответ'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
