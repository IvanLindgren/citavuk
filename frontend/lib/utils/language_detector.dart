class LanguageDetector {
  /// Проверяет, похож ли текст на сербский язык.
  ///
  /// Опирается на буквы, которых НЕТ в сербском алфавите. Сербская кириллица —
  /// это а б в г д ђ е ж з и ј к л љ м н њ о п р с т ћ у ф х ц ч џ ш; в ней
  /// отсутствуют ы, э, ъ, ь, я, ю, щ, й, ё. Если такие буквы встречаются, а
  /// специфично сербских (ј љ њ ћ џ ђ или латиницей š đ ž č ć) нет — это русский.
  static bool isLikelySerbian(List<String> paragraphs) {
    if (paragraphs.isEmpty) return true; // Если пусто, пропускаем проверку

    // Берём больше абзацев — короткие документы (титул, оглавление) иначе могут
    // не набрать порог и ошибочно «пройти» как сербский.
    final text = paragraphs.take(30).join(' ');
    if (text.trim().isEmpty) return true;

    // Буквы, отсутствующие в сербском алфавите → маркеры русского.
    final russianSpecific = RegExp(r'[ыэъьяющйёЫЭЪЬЯЮЩЙЁ]');
    final russianCount = russianSpecific.allMatches(text).length;

    // Специфично сербская кириллица.
    final serbianSpecificCyrillic = RegExp(r'[јљњћџђЈЉЊЋЏЂ]');
    final serbCyrillicCount = serbianSpecificCyrillic.allMatches(text).length;

    // Сербская латиница.
    final serbianSpecificLatin = RegExp(r'[šđžčćŠĐŽČĆ]');
    final serbLatinCount = serbianSpecificLatin.allMatches(text).length;

    final serbCount = serbCyrillicCount + serbLatinCount;

    // Частые английские слова.
    final englishWords = RegExp(
        r'\b(the|and|is|are|you|that|it|of|in|to)\b',
        caseSensitive: false);
    final englishWordCount = englishWords.allMatches(text).length;

    // Есть русские буквы и нет сербских — это русский (порог низкий: даже пары
    // букв ы/э/ъ достаточно, их в сербском не бывает в принципе).
    if (russianCount >= 2 && serbCount == 0) {
      return false;
    }
    // Русских маркеров заметно больше сербских — тоже считаем русским
    // (на случай смешанных или транслитерированных вставок).
    if (russianCount >= 3 && russianCount > serbCount * 3) {
      return false;
    }

    // Много частых английских слов и нет сербской латиницы — скорее английский.
    if (englishWordCount > 5 && serbLatinCount == 0) {
      return false;
    }

    return true;
  }
}
