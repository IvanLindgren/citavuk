import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/services/duel_room_service.dart';
import 'package:srbski_read/course/widgets/duel_stage.dart';
import 'package:srbski_read/course/widgets/duel_table.dart';
import 'package:srbski_read/travel/content.dart';
import 'package:srbski_read/travel/place_sheet.dart';

/// Узкий экран и крупный системный шрифт для перенесённых разделов.
///
/// Переполнение вёрстки во Flutter не роняет приложение, а рисует жёлто-чёрную
/// полосу: в разработке её не видит никто, а на телефоне с увеличенным шрифтом
/// — все. Значения взяты нарочно длинные: сербские названия и имена игроков
/// длиннее тестовых «Аня» и «кафе».

const _narrow = Size(320, 640);

Future<void> _show(
  WidgetTester tester,
  Widget child, {
  Size size = _narrow,
  double scale = 1.0,
  // Карточка места сама себе шторка: класть её в прокрутку нельзя, высота
  // окажется бесконечной.
  bool scrollable = true,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(scale)),
      child: MaterialApp(
        home: Scaffold(body: scrollable ? SingleChildScrollView(child: child) : child),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 200));
}

DuelRoom _room() => DuelRoom.fromJson({
      'code': 'ЧИТАВУК',
      'level': 'B1',
      'seats': 4,
      'phase': 'translate',
      'round': 2,
      'rounds': 3,
      'you': 'me',
      'host': true,
      'players': [
        {
          'id': 'me',
          'name': 'Константин Александрович',
          'score': 128,
          'ready': true,
          'progress': 3,
        },
        {'id': 'deepl', 'name': 'DeepL', 'machine': 'deepl', 'score': 96},
        {'id': 'g', 'name': 'Google Translate', 'machine': 'google', 'score': 64},
      ],
      'standings': [
        {'id': 'me', 'name': 'Константин Александрович', 'score': 128, 'place': 1},
        {'id': 'deepl', 'name': 'DeepL', 'score': 96, 'place': 2, 'machine': 'deepl'},
        {
          'id': 'g',
          'name': 'Google Translate',
          'score': 64,
          'place': 3,
          'machine': 'google',
        },
      ],
    });

PlaceContent _place() => PlaceContent.fromJson({
      'kind': 'bakery',
      'hint': 'В пекаре хлеб продают на вес, а бурек — на куски; '
          'спрашивают «колико?» и отвечают числом.',
      'words': [
        {'sr': 'бурек са сиром', 'ru': 'слоёный пирог с сыром'},
        {'sr': 'кифла', 'ru': 'рогалик'},
      ],
      'phrases': [
        {
          'sr': 'Молим вас, један бурек са сиром и један јогурт.',
          'ru': 'Будьте добры, один бурек с сыром и один йогурт.',
        },
      ],
      'dialogue': {
        'start': 'greet',
        'nodes': [
          {
            'id': 'greet',
            'sr': 'Добар дан, изволите?',
            'ru': 'Добрый день, что желаете?',
            'options': [
              {
                'sr': 'Један бурек са сиром, молим вас.',
                'ru': 'Один бурек с сыром, пожалуйста.',
                'next': '',
              },
            ],
          },
        ],
      },
    });

void main() {
  group('дуэль на узком экране', () {
    testWidgets('стол помещается при длинных именах', (tester) async {
      await _show(tester, DuelTable(room: _room(), sentences: 5));
      expect(tester.takeException(), isNull);
    });

    testWidgets('стол выдерживает крупный шрифт', (tester) async {
      await _show(tester, DuelTable(room: _room(), sentences: 5), scale: 1.6);
      expect(tester.takeException(), isNull);
    });

    testWidgets('пьедестал помещается при длинных именах', (tester) async {
      await _show(
        tester,
        const Podium(
          rows: [
            DuelStanding(
              id: 'me',
              name: 'Константин Александрович',
              score: 128,
              place: 1,
            ),
            DuelStanding(
              id: 'deepl',
              name: 'DeepL',
              score: 96,
              place: 2,
              machine: true,
            ),
            DuelStanding(
              id: 'g',
              name: 'Google Translate',
              score: 64,
              place: 3,
              machine: true,
            ),
          ],
          you: 'me',
        ),
        scale: 1.4,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('часы раунда не переполняются', (tester) async {
      await _show(
        tester,
        const SizedBox(
          height: 120,
          child: Center(child: DuelClock(seconds: 7, total: 45)),
        ),
        scale: 1.6,
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('карточка места на узком экране', () {
    testWidgets('слова и разговор помещаются', (tester) async {
      await _show(
        tester,
        PlaceSheet(
          kind: const PlaceKind(
            id: 'bakery',
            group: 'place',
            sr: 'пекара',
            ru: 'пекарня',
            icon: 'bread',
            rank: 2,
            osm: ['shop=bakery'],
            omt: ['bakery'],
          ),
          content: _place(),
          title: 'Пекара Трпковић на Булевару краља Александра',
          script: TravelScript.cyrillic,
        ),
        scrollable: false,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('карточка выдерживает крупный шрифт', (tester) async {
      await _show(
        tester,
        PlaceSheet(
          kind: const PlaceKind(
            id: 'bakery',
            group: 'place',
            sr: 'пекара',
            ru: 'пекарня',
            icon: 'bread',
            rank: 2,
            osm: ['shop=bakery'],
            omt: ['bakery'],
          ),
          content: _place(),
          title: 'Пекара Трпковић',
          script: TravelScript.latin,
        ),
        scale: 1.6,
        scrollable: false,
      );
      expect(tester.takeException(), isNull);
    });
  });
}
