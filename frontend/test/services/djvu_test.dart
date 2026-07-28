import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/djvu/bzz.dart';
import 'package:srbski_read/services/djvu_parser.dart';

Uint8List _fixture(String name) =>
    File('test/fixtures/$name').readAsBytesSync();

void main() {
  group('bzzDecode', () {
    test('распаковывает короткий блок', () {
      final decoded = bzzDecode(_fixture('test_short.bzz'));
      expect(decoded, equals(_fixture('test_short.txt')));
    });

    // 9 КБ — это уже несколько проходов адаптации частот, где ошибка в MTF
    // сразу разъезжается.
    test('распаковывает длинный блок', () {
      final decoded = bzzDecode(_fixture('test_long.bzz'));
      expect(decoded, equals(_fixture('test_long.txt')));
    });

    test('короткий поток отвергается, а не падает', () {
      expect(() => bzzDecode(Uint8List.fromList([0x00])),
          throwsA(isA<FormatException>()));
    });
  });

  group('DjvuParser', () {
    test('читает текстовый слой страницы', () {
      final paragraphs = DjvuParser.parse(_fixture('ccitt_2.djvu'));
      expect(paragraphs, isNotEmpty);
      expect(paragraphs.join(' ').trim(), isNotEmpty);
    });

    test('не-DjVu отвергается понятной ошибкой', () {
      expect(() => DjvuParser.parse(Uint8List.fromList(List.filled(64, 0x41))),
          throwsA(isA<FormatException>()));
    });
  });
}
