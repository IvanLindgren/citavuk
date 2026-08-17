/// Повторение фразы сборкой из слов.
///
/// Обычная карточка спрашивает перевод, и для фразы это выходит «переведи
/// предложение» — упражнение совсем другой тяжести, чем вспомнить слово.
///
/// Поэтому у фраз своё: показывается перевод, а сербскую фразу надо собрать из
/// перемешанных слов. Порядок слов в сербском и есть то, что в ней трудно, а
/// узнавание среди готовых кусков даётся легче письма — и на телефоне работает.
///
/// То же на сайте — web/src/lib/phraseBuilder.ts.
library;

import 'dart:math';

class Tile {
  const Tile(this.id, this.text);

  /// Своё место в перемешанном ряду: одинаковые слова во фразе не редкость.
  final int id;
  final String text;

  @override
  bool operator ==(Object other) =>
      other is Tile && other.id == id && other.text == text;

  @override
  int get hashCode => Object.hash(id, text);
}

final _spaces = RegExp(r'\s+');
final _edges = RegExp(r'^[^\p{L}\d]+|[^\p{L}\d]+$', unicode: true);

/// Слова фразы в исходном порядке. Знаки препинания остаются при словах.
List<String> phraseWords(String phrase) =>
    phrase.trim().split(_spaces).where((word) => word.isNotEmpty).toList();

/// Перемешанные кусочки фразы.
///
/// Перемешивание проверяется на результат: если фраза случайно легла в исходном
/// порядке, упражнение выродилось в «нажми всё подряд». Из фраз в одно-два слова
/// перемешать нечего, и они отдаются как есть.
List<Tile> shuffleTiles(String phrase, [Random? random]) {
  final words = phraseWords(phrase);
  final tiles = [
    for (var i = 0; i < words.length; i++) Tile(i, words[i]),
  ];
  if (tiles.length < 3) return tiles;

  final rnd = random ?? Random();
  for (var attempt = 0; attempt < 8; attempt++) {
    tiles.shuffle(rnd);
    if (tiles.asMap().entries.any((e) => e.value.id != e.key)) break;
  }
  return tiles;
}

/// Собрано ли верно.
///
/// Сравниваются слова, а не строка целиком: двойной пробел между кусочками —
/// не ошибка ученика. Регистр и знаки на концах слов тоже прощаются: упражнение
/// про порядок слов, а не про заглавную букву в начале.
bool isAssembled(List<Tile> picked, String phrase) {
  final expected = phraseWords(phrase).map(_bare).toList();
  final actual = picked.map((tile) => _bare(tile.text)).toList();
  if (expected.length != actual.length) return false;
  for (var i = 0; i < expected.length; i++) {
    if (expected[i] != actual[i]) return false;
  }
  return true;
}

String _bare(String word) => word.toLowerCase().replaceAll(_edges, '');
