import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/utils/reflow.dart';
import 'package:srbski_read/utils/serbian_encoding_fix.dart';

/// Строка колонки шириной 400 пунктов.
LayoutLine line(String text, {double left = 100, double right = 500}) =>
    (text: text, left: left, right: right);

void main() {
  group('reflowDocumentWithLayout', () {
    test('красная строка начинает новый абзац', () {
      final paragraphs = reflowDocumentWithLayout([
        [
          line('Neko mora da je oklevetao Jozefa K., jer je, iako nije'),
          line('učinio nikakvo zlo, jednog jutra bio uhapšen.'),
          // Отступ первой строки — новый абзац, хотя предыдущая полная.
          line('Kuvarica gospođe Grubah, njegove gazdarice, donosila mu je',
              left: 118),
          line('svakog dana doručak oko osam časova.'),
        ],
      ]);

      expect(paragraphs.length, 2);
      expect(paragraphs.first, startsWith('Neko mora'));
      expect(paragraphs[1], startsWith('Kuvarica'));
    });

    test('строка, не дошедшая до правого края, закрывает абзац', () {
      final paragraphs = reflowDocumentWithLayout([
        [
          line('Prvi red teksta koji ide do samog kraja kolone i dalje'),
          line('kratak kraj pasusa.', right: 300),
          line('Sledeći pasus počinje ovde i nastavlja se dalje po redu'),
        ],
      ]);

      expect(paragraphs.length, 2);
      expect(paragraphs[1], startsWith('Sledeći'));
    });

    test('сплошной текст без отступов остаётся одним абзацем', () {
      final paragraphs = reflowDocumentWithLayout([
        [
          line('Prva linija teksta koja se nastavlja bez ikakvog prekida'),
          line('druga linija istog pasusa koja takođe ide do kraja reda'),
          line('treća linija istog pasusa koja se završava tačkom.'),
        ],
      ]);

      expect(paragraphs.length, 1);
    });
  });

  group('сербские буквы из ломаного шрифта', () {
    test('восстанавливаются, когда текст сербский', () {
      const broken =
          'Kuvarica gospoĊe Grubah donosila mu je doruĉak oko osam ĉasova, '
          'a on je gledao u staru ţenu koja je stanovala preko puta.';
      final fixed = fixSerbianDocument([broken]).first;

      expect(fixed, contains('gospođe'));
      expect(fixed, contains('časova'));
      expect(fixed, contains('ženu'));
      expect(fixed, isNot(contains('Ċ')));
    });

    test('чужой язык не трогаем', () {
      const esperanto = 'Ĉu vi parolas Esperanton? Ĉiuj homoj estas liberaj.';
      expect(fixSerbianDocument([esperanto]).first, esperanto);
    });
  });
}
