import 'package:srbski_read/course/services/serbian_text.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('toPrecomposed', () {
    test('собирает разложенные диакритики сербской латиницы', () {
      expect(toPrecomposed('č'), 'č');
      expect(toPrecomposed('ć'), 'ć');
      expect(toPrecomposed('š'), 'š');
      expect(toPrecomposed('ž'), 'ž');
      expect(toPrecomposed('Č'), 'Č');
    });

    test('не трогает обычный текст и đ', () {
      expect(toPrecomposed('student'), 'student');
      expect(toPrecomposed('đak'), 'đak');
      expect(toPrecomposed(''), '');
    });

    test('разложенная и предсоставленная запись сравниваются одинаково', () {
      expect(normalizeAnswer('čovek'), normalizeAnswer('čovek'));
    });
  });

  group('normalizeAnswer', () {
    test('обрезает края и схлопывает пробелы', () {
      expect(normalizeAnswer('  idem   u   školu '), 'idem u školu');
    });

    test('по умолчанию игнорирует регистр', () {
      expect(normalizeAnswer('Studenta'), 'studenta');
    });

    test('уважает caseSensitive', () {
      expect(normalizeAnswer('Marko', caseSensitive: true), 'Marko');
    });

    test('по умолчанию отбрасывает терминальную пунктуацию', () {
      expect(
          normalizeAnswer('Profesor pita studenta.'), 'profesor pita studenta');
      expect(normalizeAnswer('Zašto?'), 'zašto');
    });

    test('сохраняет пунктуацию, когда она является целью', () {
      expect(
        normalizeAnswer('Zašto?', keepTerminalPunctuation: true),
        'zašto?',
      );
    });

    test('НЕ схлопывает č и ć — это разные буквы', () {
      expect(normalizeAnswer('č') == normalizeAnswer('ć'), isFalse);
    });

    test('НЕ схлопывает dž и đ', () {
      expect(normalizeAnswer('dž') == normalizeAnswer('đ'), isFalse);
    });

    test('не конвертирует кириллицу в латиницу', () {
      expect(normalizeAnswer('студент') == normalizeAnswer('student'), isFalse);
    });
  });

  group('splitLetters', () {
    test('диакритические буквы — единые плитки', () {
      expect(splitLetters('čaša'), ['č', 'a', 'š', 'a']);
      expect(splitLetters('đak'), ['đ', 'a', 'k']);
    });

    test('диграфы по умолчанию — два символа', () {
      expect(splitLetters('ljudi'), ['l', 'j', 'u', 'd', 'i']);
      expect(splitLetters('konj'), ['k', 'o', 'n', 'j']);
      expect(splitLetters('džep'), ['d', 'ž', 'e', 'p']);
    });

    test('digraphsAsUnits склеивает lj/nj/dž', () {
      expect(
          splitLetters('ljudi', digraphsAsUnits: true), ['lj', 'u', 'd', 'i']);
      expect(splitLetters('džep', digraphsAsUnits: true), ['dž', 'e', 'p']);
    });

    test('повторяющиеся буквы дают отдельные элементы', () {
      // prijateljem: две 'e' и три 'j' не должны схлопнуться.
      final letters = splitLetters('prijateljem');
      expect(letters.where((l) => l == 'e').length, 2);
      expect(letters.where((l) => l == 'j').length, 2);
      expect(letters.length, 11);
    });
  });

  group('firstDivergence', () {
    test('возвращает -1 для совпадающих строк', () {
      expect(firstDivergence('studenta', 'studenta'), -1);
    });

    test('находит позицию различия в окончании', () {
      expect(firstDivergence('studentu', 'studenta'), 7);
    });

    test('различает длину', () {
      expect(firstDivergence('student', 'studenta'), 7);
    });
  });
}
