import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/ebook_parser.dart';
import 'package:srbski_read/utils/legacy_encodings.dart';

Uint8List _fixture(String name) =>
    File('test/fixtures/$name').readAsBytesSync();

void main() {
  group('FB2', () {
    // Файл лежит в windows-1251: так до сих пор отдаёт половина библиотек.
    test('читает абзацы и уважает объявленную кодировку', () {
      final paragraphs = EbookParser.parseFb2(_fixture('sample.fb2'));

      expect(paragraphs.first, 'Прва глава');
      expect(paragraphs, contains('Читав сам књигу на српском језику.'));
      expect(paragraphs.join(' '), contains('курзивом'));
    });

    test('сноски не попадают в основной текст', () {
      final paragraphs = EbookParser.parseFb2(_fixture('sample.fb2'));
      expect(paragraphs, isNot(contains('Сноска')));
    });
  });

  group('EPUB', () {
    test('главы идут в порядке spine', () {
      final paragraphs = EbookParser.parseEpub(_fixture('sample.epub'));

      expect(paragraphs.first, 'Глава 1');
      expect(paragraphs, contains('Први пасус.'));
      expect(paragraphs.indexOf('Први пасус.'),
          lessThan(paragraphs.indexWhere((p) => p.contains('Трећа глава'))));
    });

    test('сущности разворачиваются, теги снимаются', () {
      final paragraphs = EbookParser.parseEpub(_fixture('sample.epub'));
      expect(paragraphs, contains('Други пасус — с тире.'));
      expect(paragraphs.join(' '), isNot(contains('<b>')));
    });
  });

  group('TXT', () {
    test('абзац разделяется пустой строкой, а не переводом строки', () {
      final bytes = Uint8List.fromList(
          utf8.encode('Прва\nстрока и продужетак.\n\nДруги пасус.'));
      final paragraphs = EbookParser.parseTxt(bytes);

      expect(paragraphs, ['Прва строка и продужетак.', 'Други пасус.']);
    });

    test('файл в windows-1251 не превращается в кракозябры', () {
      final bytes = Uint8List.fromList([
        for (final code in 'Проба'.codeUnits) _cp1251Byte(code),
      ]);
      expect(EbookParser.parseTxt(bytes).first, 'Проба');
    });
  });

  group('кодировки', () {
    test('декларация кодировки читается до декодирования', () {
      final bytes = Uint8List.fromList(
          '<?xml version="1.0" encoding="windows-1251"?><a/>'.codeUnits);
      expect(xmlDeclaredEncoding(bytes), 'windows-1251');
    });
  });
}

/// Обратное преобразование для теста: кириллица в windows-1251.
int _cp1251Byte(int code) {
  if (code < 0x80) return code;
  if (code >= 0x410 && code <= 0x44F) return code - 0x410 + 0xC0;
  if (code == 0x401) return 0xA8;
  if (code == 0x451) return 0xB8;
  throw ArgumentError('нет в cp1251: $code');
}
