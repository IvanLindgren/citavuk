/// Короткая подпись для длинного текста.
///
/// В словарь попадают не только слова, но и выделенные фразы целиком — иногда
/// в полстраницы. В списках такая запись вытесняет всё остальное, поэтому
/// показывается начало, а целиком текст открывается по нажатию.
library;

/// Сколько слов показывать по умолчанию.
const _defaultWords = 2;

/// Знаки, с которых начинается выделенная реплика, а не слово.
final _leadingPunctuation = RegExp(r'^[\s\-–—―«»"“”„…•\* ]+');

/// Первые [words] слов текста; если текст длиннее — с многоточием.
String shortPhrase(String text, {int words = _defaultWords}) {
  final trimmed = text
      .replaceFirst(_leadingPunctuation, '')
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ');
  if (trimmed.isEmpty) return '';

  final parts = trimmed.split(' ');
  if (parts.length <= words) return trimmed;
  return '${parts.take(words).join(' ')}…';
}

/// Одиночное слово, а не выделенная фраза.
bool isSingleWord(String text) {
  final trimmed = text.replaceFirst(_leadingPunctuation, '').trim();
  return trimmed.isNotEmpty && !trimmed.contains(RegExp(r'\s'));
}

/// Влезает ли текст целиком — то есть нужно ли вообще предлагать раскрытие.
bool isLongPhrase(String text, {int words = _defaultWords}) =>
    text.trim().split(RegExp(r'\s+')).length > words;
