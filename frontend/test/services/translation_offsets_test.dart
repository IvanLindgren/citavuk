import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/translation_client.dart';

void main() {
  group('пересчёт смещений в байты UTF-8', () {
    // Сервер написан на Go, где строка — это байты UTF-8, а Dart индексирует
    // строку в единицах UTF-16. Для латиницы числа совпадают, для кириллицы —
    // нет, и без пересчёта тегом пометилось бы не то слово: перевод «в
    // контексте» тихо начал бы возвращать значение соседнего слова.
    test('латиница: смещения совпадают с индексами', () {
      const sentence = 'Ovo je velika kuća sa baštom.';
      final start = sentence.indexOf('kuća');
      expect(utf8ByteOffset(sentence, start), start);
    });

    test('кириллица: каждый символ весит два байта', () {
      const sentence = 'Ово је прва глава књиге.';
      final start = sentence.indexOf('прва');
      final byteStart = utf8ByteOffset(sentence, start);

      expect(byteStart, isNot(start),
          reason:
              'для кириллицы индекс и байтовое смещение обязаны различаться');
      // Проверка по сути: вырезанное по байтовым границам совпадает со словом.
      final bytes = utf8.encode(sentence);
      final byteEnd = utf8ByteOffset(sentence, start + 'прва'.length);
      expect(utf8.decode(bytes.sublist(byteStart, byteEnd)), 'прва');
    });

    test('диакритика сербской латиницы тоже двухбайтовая', () {
      const sentence = 'Čitam knjigu o džezu i đacima.';
      for (final word in ['Čitam', 'džezu', 'đacima']) {
        final start = sentence.indexOf(word);
        final byteStart = utf8ByteOffset(sentence, start);
        final byteEnd = utf8ByteOffset(sentence, start + word.length);
        final bytes = utf8.encode(sentence);
        expect(utf8.decode(bytes.sublist(byteStart, byteEnd)), word,
            reason: 'слово "$word" вырезано неверно');
      }
    });

    test('суррогатная пара не рассекается', () {
      // Эмодзи занимает две единицы UTF-16 и четыре байта UTF-8 — самый
      // опасный случай для пересчёта.
      const sentence = 'Волк 🐺 читает књигу.';
      final start = sentence.indexOf('књигу');
      final byteStart = utf8ByteOffset(sentence, start);
      final byteEnd = utf8ByteOffset(sentence, start + 'књигу'.length);
      final bytes = utf8.encode(sentence);
      expect(utf8.decode(bytes.sublist(byteStart, byteEnd)), 'књигу');
    });

    test('границы обрабатываются без падения', () {
      const sentence = 'Кратка реченица.';
      expect(utf8ByteOffset(sentence, 0), 0);
      expect(utf8ByteOffset(sentence, -5), 0);
      expect(utf8ByteOffset(sentence, sentence.length),
          utf8.encode(sentence).length);
      expect(utf8ByteOffset(sentence, sentence.length + 100),
          utf8.encode(sentence).length,
          reason: 'выход за конец строки не должен ронять приложение');
    });

    test('пустая строка', () {
      expect(utf8ByteOffset('', 0), 0);
      expect(utf8ByteOffset('', 5), 0);
    });
  });
}
