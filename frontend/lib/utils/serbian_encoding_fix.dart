/// Восстановление сербских букв, испорченных кодировкой PDF.
///
/// В книгах, свёрстанных старыми редакторами, шрифт отдаёт đ, č и ž чужими
/// буквами: «gospoĊe» вместо «gospođe», «ĉasova» вместо «časova», «ţenu»
/// вместо «ženu». Сам текст при этом читается, поэтому обычная проверка на
/// кодировку такой файл пропускает.
library;

/// Что на что подменяется. Пары взяты из книг, где поломка встретилась.
const _replacements = {
  'Ċ': 'đ', 'ċ': 'đ', // C с точкой — вместо đ
  'Ĉ': 'Č', 'ĉ': 'č', // C с циркумфлексом — вместо č
  'Ţ': 'Ž', 'ţ': 'ž', // T с седилью — вместо ž
  'Ď': 'Đ', 'ď': 'đ',
  'Ŝ': 'Š', 'ŝ': 'š',
};

/// Сколько подмен на текст, чтобы считать его испорченным.
///
/// Одиночное вхождение может быть настоящей буквой другого языка: ĉ есть в
/// эсперанто, ċ — в мальтийском, ţ — в румынском.
const _minHits = 3;

/// Признаки сербской латиницы: если их нет, чужие буквы трогать нельзя.
final _serbian = RegExp(
  r'\b(je|da|se|na|za|su|nije|koji|koja|sam|bio|ali|ovo)\b|[šžćč]',
  caseSensitive: false,
);

/// Похоже ли, что в тексте сербские буквы заменены чужими.
bool hasBrokenSerbianLetters(String text) {
  var hits = 0;
  for (final broken in _replacements.keys) {
    hits += broken.allMatches(text).length;
    if (hits >= _minHits) break;
  }
  return hits >= _minHits && _serbian.hasMatch(text);
}

/// Возвращает текст с восстановленными буквами.
String fixSerbianLetters(String text) {
  var result = text;
  for (final entry in _replacements.entries) {
    if (result.contains(entry.key)) {
      result = result.replaceAll(entry.key, entry.value);
    }
  }
  return result;
}

/// Чинит весь документ разом — решение принимается по всему тексту, а не по
/// отдельной строке: на одной строке признаков языка может не быть.
List<String> fixSerbianDocument(List<String> paragraphs) {
  if (paragraphs.isEmpty) return paragraphs;

  final sample = paragraphs.take(80).join(' ');
  if (!hasBrokenSerbianLetters(sample)) return paragraphs;
  return [for (final p in paragraphs) fixSerbianLetters(p)];
}
