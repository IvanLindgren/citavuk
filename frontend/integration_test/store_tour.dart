// Обход экранов для витрины App Store: общий для iPhone, iPad и Mac.
//
// Снимок делает вызывающий: на симуляторе — драйвер через simctl (в кадр
// попадают статус-бар и Dynamic Island), на маке — сам Flutter (см.
// mac_store_tour_test.dart).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/main.dart' as app;
import 'package:srbski_read/screens/book_reader_screen.dart';
import 'package:srbski_read/services/user_db.dart';

typedef Shot = Future<void> Function(String name);

/// pumpAndSettle не годится: у маскота и сада бесконечные анимации.
Future<void> settle(WidgetTester tester, [int seconds = 4]) async {
  for (var i = 0; i < seconds * 5; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

const sampleTitle = 'Subota u Beogradu';
const sampleText = [
  'Subota je. Ana ustaje rano, pije kafu na terasi i gleda kako se grad '
      'polako budi. Danas ima plan: da prošeta sa prijateljima kroz stari '
      'deo Beograda.',
  'Nalaze se kod Knez Mihailove ulice. Marko kasni deset minuta, kao i '
      'uvek, ali donosi topao burek iz pekare na uglu. Svi se smeju.',
  'Šetaju do Kalemegdana. Sa zidina se vidi kako se Sava uliva u Dunav. '
      'Ana kaže da je to njeno omiljeno mesto u celom gradu.',
  'Posle podne sedaju u malu kafanu na Skadarliji. Konobar im preporučuje '
      'domaću supu i pitu od višanja. Muzičari sviraju staru pesmu, a Marko '
      'pokušava da peva.',
  'Uveče se vraćaju kući umorni, ali srećni. Ana zapisuje u svesku nove '
      'reči koje je danas naučila.',
];

/// Касание слова в тексте: ищет его в абзацах на экране и бьёт в середину.
Future<bool> tapWord(WidgetTester tester, String word) async {
  for (final element in find.byType(RichText).evaluate()) {
    final render = element.renderObject;
    if (render is! RenderParagraph || !render.attached) continue;
    final text = render.text.toPlainText(includeSemanticsLabels: false);
    final at = text.indexOf(word);
    if (at < 0) continue;
    final boxes = render.getBoxesForSelection(
        TextSelection(baseOffset: at, extentOffset: at + word.length));
    if (boxes.isEmpty) continue;
    await tester.tapAt(render.localToGlobal(boxes.first.toRect().center));
    return true;
  }
  return false;
}

Future<void> _tab(WidgetTester tester, String label) async {
  for (final bar in [NavigationBar, NavigationRail]) {
    final target = find.descendant(of: find.byType(bar), matching: find.text(label));
    if (target.evaluate().isNotEmpty) {
      await tester.tap(target.first);
      return;
    }
  }
}

Future<void> storeTour(WidgetTester tester, Shot shot) async {
  app.main(const []);
  await settle(tester, 8);

  final skip = find.text('Пропустить');
  if (skip.evaluate().isNotEmpty) {
    await tester.tap(skip.first);
    await settle(tester, 5);
  }

  // Слова дня открываются сами раз в сутки — это тоже экран для витрины.
  final close = find.byTooltip('Закрыть');
  if (close.evaluate().isNotEmpty) {
    await settle(tester, 4);
    await shot('06-daily');
    await tester.tap(close.first);
    await settle(tester, 2);
  }

  final bookId = await UserDb.instance.insertBook(sampleTitle, '', sampleText);
  final navigator = tester.state<NavigatorState>(find.byType(Navigator).first);
  unawaited(navigator.push(MaterialPageRoute<void>(
    builder: (_) => BookReaderScreen(
      bookId: bookId,
      title: sampleTitle,
      paragraphs: sampleText,
      initialParagraph: 0,
    ),
  )));
  await settle(tester, 5);
  await shot('02-reader');
  if (await tapWord(tester, 'prijateljima')) {
    await settle(tester, 8);
    await shot('01-word');
  }
  navigator.popUntil((route) => route.isFirst);
  await settle(tester, 3);

  const tabs = [
    ('Курс', '03-course'),
    ('Вукоток', '04-vukotok'),
    ('Карта', '05-roadmap'),
    ('Слушание', '07-listening'),
    ('Чтение', '08-library'),
  ];
  for (final (label, name) in tabs) {
    await _tab(tester, label);
    await settle(tester, 5);
    await shot(name);
  }
}
