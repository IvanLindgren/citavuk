import 'package:flutter_test/flutter_test.dart';

import 'package:srbski_read/models/level.dart';
import 'package:srbski_read/services/level_service.dart';

void main() {
  group('предупреждение о сложной книге', () {
    // Разрыв в две ступени, а не в одну: читать на ступень выше своего уровня
    // как раз и полезно, и отговаривать от этого значит мешать единственному
    // способу вырасти. Правило то же, что на сервере.
    test('срабатывает только при разрыве в две ступени', () {
      expect(tooHardFor('C1', 'A2'), isTrue);
      expect(tooHardFor('B2', 'A2'), isTrue);
      expect(tooHardFor('B1', 'A2'), isFalse);
      expect(tooHardFor('C1', 'B2'), isFalse);
    });

    test('молчит на лёгкой книге', () {
      expect(tooHardFor('A1', 'C1'), isFalse);
    });

    // Уровень неизвестен — сравнивать не с чем. Выдумывать его нельзя: на этой
    // оценке стоит предупреждение, которое человек примет всерьёз.
    test('молчит, когда уровень неизвестен', () {
      expect(tooHardFor('C1', ''), isFalse);
      expect(tooHardFor('', 'A1'), isFalse);
      expect(tooHardFor('непонятно что', 'A1'), isFalse);
    });
  });

  group('выборка абзацев для оценки', () {
    test('короткий текст отдаёт как есть', () {
      expect(sampleParagraphs(['раз', 'два']), ['раз', 'два']);
    });

    // Пустые абзацы места в выборке не занимают: слов в них нет, а оценка идёт
    // по словам.
    test('выбрасывает пустые абзацы', () {
      expect(sampleParagraphs(['раз', '', '   ', 'два']), ['раз', 'два']);
    });

    // Судить о книге по её началу нельзя: у переводных изданий там выходные
    // данные, у учебников — предисловие на другом языке.
    test('берёт абзацы по всей книге, а не только сначала', () {
      final paragraphs = [for (var i = 0; i < 1000; i++) 'абзац $i'];
      final sample = sampleParagraphs(paragraphs);

      expect(sample.length, lessThan(paragraphs.length));
      expect(sample.first, 'абзац 0');
      expect(
        sample.any((item) => int.parse(item.split(' ')[1]) > 900),
        isTrue,
        reason: 'выборка не достаёт до конца книги',
      );
    });
  });

  group('разбор ответа сервера', () {
    test('уровень текста читается вместе с трудными словами', () {
      final level = TextLevel.fromJson({
        'level': 'C1',
        'words': 1200,
        'hardWords': ['чамотиња', 'прегнуће'],
      });
      expect(level.level, 'C1');
      expect(level.hardWords, hasLength(2));
    });

    // Неполный ответ ронять чтение не должен: оценка — украшение поверх него.
    test('переживает пустой ответ', () {
      final level = TextLevel.fromJson({});
      expect(level.level, isEmpty);
      expect(level.hardWords, isEmpty);
    });
  });
}
