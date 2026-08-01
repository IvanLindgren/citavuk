import '../utils/tokenizer.dart';
import 'english_engine.dart';
import 'lexicon_db.dart';

/// Решает, на каком языке нажатое слово.
///
/// Решение принимается **по предложению, а не по отдельному слову**, и иначе
/// работать не может: в сербской латинице «on», «to», «no», «most», «sam»,
/// «list», «bar» — обычные сербские слова, и все они одновременно английские.
/// В отрыве от фразы такое слово неразличимо в принципе, а внутри фразы —
/// почти всегда однозначно: «on je došao» против «on the table».
class LanguageRouter {
  /// Сколько слов предложения учитывать. Длинная фраза ничего не уточняет,
  /// зато стоит лишних запросов к словарю.
  static const _maxTokens = 40;

  /// Порог уверенности для смешанного текста.
  static const _minEnglishScore = 2;

  static Future<bool> isEnglish({
    required String word,
    required String sentence,
  }) async {
    final engine = EnglishEngine.instance;
    await engine.load();
    if (!engine.isLoaded) return false;

    final low = word.trim().toLowerCase();
    if (low.isEmpty || EnglishEngine.looksSerbian(low)) return false;
    // Нечего показывать — разбирать как английское незачем.
    if (engine.analyze(low) == null) return false;

    final words = SerbianTokenizer.tokenize(sentence)
        .where((t) => t.isWord)
        .map((t) => t.text.toLowerCase())
        .take(_maxTokens)
        .toList();
    if (!words.contains(low)) words.add(low);

    final serbian = await LexiconDb.instance.knownSerbianForms(words);
    final wordIsSerbian = serbian.contains(low);

    // Орфография, невозможная в сербском (q, w, x, y, th, ck, ph, gh, апостроф),
    // решает сама: сербский пишет как слышит, таких сочетаний там нет.
    if (EnglishEngine.hasEnglishOrthography(low) && !wordIsSerbian) return true;

    var en = 0;
    var sr = 0;
    for (final token in words) {
      if (EnglishEngine.looksSerbian(token)) {
        sr += 2;
        continue;
      }
      final knownSerbian = serbian.contains(token);
      final knownEnglish = engine.knows(token);
      if (EnglishEngine.hasEnglishOrthography(token)) {
        en += 2;
      } else if (knownEnglish && !knownSerbian) {
        en += 1;
      } else if (knownSerbian && !knownEnglish) {
        sr += 1;
      }
      // Слово, известное обоим языкам, не голосует: именно из-за таких слов
      // счёт и ведётся.
    }

    if (en >= _minEnglishScore && en > sr) return true;
    // Одиночное слово вне фразы (подпись, заголовок): сербский словарь его не
    // знает, а английский знает — считаем английским.
    if (!wordIsSerbian && sr == 0 && engine.knows(low)) return true;
    return false;
  }
}
