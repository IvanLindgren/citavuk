/// Пример из книги для слова, сохранённого без контекста.
///
/// В приложении у записи словаря контекста нет вовсе: сохраняются слово,
/// перевод и разбор. А слово с одним переводом через месяц не значит уже
/// ничего — «kraj» это и «конец», и «край», и понять, какое из них имелось в
/// виду, без предложения нельзя.
///
/// Книга при этом лежит рядом: искать предложение заново дешевле, чем хранить
/// его копию. Найденное НЕ записывается в карточку — иначе понадобилась бы
/// миграция и отправка на сервер ради подсказки, которую всегда можно собрать
/// заново.
///
/// Тот же поиск на сайте — web/src/lib/vocabContext.ts.
library;

import '../utils/transliteration.dart';

/// Границы предложения: точка, вопрос, восклицание и многоточие.
final _sentenceEnd = RegExp(r'(?<=[.!?…])\s+');

/// Не-буквы, по которым предложение делится на слова.
final _notLetter = RegExp(r'[^\p{L}]+', unicode: true);

final _spaces = RegExp(r'\s');

/// Сколько знаков предложения показываем целиком.
const _maxLength = 220;

String _normalize(String text) =>
    SerbianTransliteration.toLatin(text.toLowerCase());

/// Примеры сразу для многих слов: книга читается один раз.
///
/// Искать каждое слово словаря отдельным проходом по всему тексту — сотни
/// проходов на одну книгу. Здесь проход один: предложение разбирается на слова,
/// и слова ищутся в нём, а не оно в них.
///
/// Ключ ответа — слово в том виде, в каком его передали.
Map<String, String> findSentences(
    List<String> paragraphs, Iterable<String> words) {
  final found = <String, String>{};

  // Ищем по латинице в нижнем регистре: «кућа» и «kuća» — одно слово, а слово
  // в начале предложения написано с большой буквы.
  final wanted = <String, String>{};
  for (final word in words) {
    final trimmed = word.trim();
    // Фраза целым куском в книге, конечно, есть — она из неё и взята, — но
    // разбирать её на слова здесь нечестно, а искать целиком незачем.
    if (trimmed.isEmpty || trimmed.contains(_spaces)) continue;
    final needle = _normalize(trimmed);
    if (needle.isNotEmpty) wanted.putIfAbsent(needle, () => trimmed);
  }
  if (wanted.isEmpty) return found;

  for (final paragraph in paragraphs) {
    for (final sentence in paragraph.split(_sentenceEnd)) {
      final text = sentence.trim();
      // Длинное предложение в карточке нечитаемо, а обрывать его на полуслове
      // значит спрятать как раз то место, ради которого искали. Пропускаем и
      // смотрим дальше: слово в книге встречается не по одному разу.
      if (text.isEmpty || text.length > _maxLength) continue;
      for (final part in _normalize(text).split(_notLetter)) {
        final original = wanted.remove(part);
        if (original != null) found[original] = text;
      }
      if (wanted.isEmpty) return found;
    }
  }
  return found;
}

/// Первое подходящее предложение книги, где слово стоит целым словом.
///
/// Первое, а не самое короткое: слово ищут, чтобы вспомнить смысл, а порядок в
/// книге ближе всего к тому, как оно человеку встретилось.
///
/// Целым словом, а не куском: «rad» иначе находился бы в «radost» и «gradu», и
/// пример вставал бы к чужому слову — это хуже, чем никакого примера.
String? findSentence(List<String> paragraphs, String word) =>
    findSentences(paragraphs, [word])[word.trim()];
