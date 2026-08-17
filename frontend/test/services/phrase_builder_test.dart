import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/phrase_builder.dart';

void main() {
  group('сборка фразы из слов', () {
    test('делит фразу на слова', () {
      expect(phraseWords('  Kako  ste danas? '), ['Kako', 'ste', 'danas?']);
    });

    test('у каждого кусочка своё место', () {
      final tiles = shuffleTiles('da li je to to', Random(7));
      expect(tiles.map((t) => t.id).toList()..sort(), [0, 1, 2, 3, 4]);
      expect(tiles.map((t) => t.text).toList()..sort(), ['da', 'je', 'li', 'to', 'to']);
    });

    // Исходный порядок превратил бы упражнение в «нажми всё подряд», поэтому
    // перемешивание повторяется, пока ряд не сдвинется.
    test('исходный порядок не отдаётся', () {
      for (var seed = 0; seed < 200; seed++) {
        final tiles = shuffleTiles('jedan dva tri', Random(seed));
        expect(tiles.map((t) => t.id).toList(), isNot([0, 1, 2]), reason: 'seed $seed');
      }
    });

    test('из двух слов перемешивать нечего', () {
      expect(shuffleTiles('dobar dan').map((t) => t.text).toList(), ['dobar', 'dan']);
    });

    test('собранное в правильном порядке принимается', () {
      const phrase = 'Kako ste danas?';
      final picked = shuffleTiles(phrase, Random(3))..sort((a, b) => a.id - b.id);
      expect(isAssembled(picked, phrase), isTrue);
    });

    test('перепутанный порядок не принимается', () {
      const phrase = 'Kako ste danas?';
      final picked = shuffleTiles(phrase, Random(3))..sort((a, b) => b.id - a.id);
      expect(isAssembled(picked, phrase), isFalse);
    });

    // Упражнение про порядок слов: заглавная буква и точка в конце к нему не
    // относятся, придираться к ним значит наказывать за чужую ошибку.
    test('регистр и знаки на концах прощаются', () {
      const picked = [Tile(0, 'kako'), Tile(1, 'ste'), Tile(2, 'danas')];
      expect(isAssembled(picked, 'Kako ste danas?'), isTrue);
    });

    test('недособранная фраза не принимается', () {
      const picked = [Tile(0, 'Kako'), Tile(1, 'ste')];
      expect(isAssembled(picked, 'Kako ste danas?'), isFalse);
    });

    test('одинаковые слова считаются каждое за себя', () {
      const phrase = 'to je to';
      expect(
        isAssembled(const [Tile(0, 'to'), Tile(1, 'je'), Tile(2, 'to')], phrase),
        isTrue,
      );
      expect(
        isAssembled(const [Tile(0, 'je'), Tile(1, 'to'), Tile(2, 'to')], phrase),
        isFalse,
      );
    });
  });
}
