class LanguageDetector {
  /// Проверяет, похож ли текст на сербский язык.
  /// Использует простые эвристики: поиск специфично русских букв и частых английских слов
  /// в отсутствие специфичных сербских символов.
  static bool isLikelySerbian(List<String> paragraphs) {
    if (paragraphs.isEmpty) return true; // Если пусто, пропускаем проверку
    
    // Проверяем только первые несколько абзацев для скорости
    final text = paragraphs.take(15).join(' ');
    
    // Русская кириллица (в сербском этих букв нет)
    final russianSpecific = RegExp(r'[ыэъьяющйёЫЭЪЬЯЮЩЙЁ]');
    final russianCount = russianSpecific.allMatches(text).length;

    // Сербская кириллица
    final serbianSpecificCyrillic = RegExp(r'[јљњћџђЈЉЊЋЏЂ]');
    final serbCyrillicCount = serbianSpecificCyrillic.allMatches(text).length;

    // Сербская латиница
    final serbianSpecificLatin = RegExp(r'[šđžčćŠĐŽČĆ]');
    final serbLatinCount = serbianSpecificLatin.allMatches(text).length;

    // Частые английские слова
    final englishWords = RegExp(r'\b(the|and|is|are|you|that|it|of|in|to)\b', caseSensitive: false);
    final englishWordCount = englishWords.allMatches(text).length;

    // Если много русских букв и нет сербских кириллических — это скорее русский
    if (russianCount > 5 && serbCyrillicCount == 0) {
      return false;
    }

    // Если много частых английских слов и нет сербской латиницы — это скорее английский
    if (englishWordCount > 5 && serbLatinCount == 0) {
      return false;
    }

    return true;
  }
}
