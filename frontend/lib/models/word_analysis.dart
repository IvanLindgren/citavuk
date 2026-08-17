import 'english_analysis.dart';
import 'grammar.dart';
import 'sentence_analysis.dart';

/// Типизированный результат разбора слова/фразы (онлайн или офлайн).
class WordAnalysis {
  final String surface;
  final String lemma;
  final String upos;
  final Map<String, String> feats;
  final Map<String, String> forms;
  final String translation;
  final String? contextualTranslation;
  final bool isOffline;
  final bool isPhrase;

  /// Грамматика фразы (составное время/энклитики) — только для isPhrase.
  final PhraseInsight? phraseInsight;

  /// Контекстный пословный разбор и связи между словами во фразе.
  final SentenceAnalysis? sentenceAnalysis;

  /// Разбор английского слова. Не null — значит слово опознано английским, и
  /// карточка показывает английскую ветку вместо сербской.
  final EnglishAnalysis? english;

  /// Начальную форму подсказала нейросеть: в словаре форм этого слова нет.
  ///
  /// Падеж, число и формы всё равно посчитал грамматический движок — и только
  /// после того, как парадигма от подсказки дала ровно эту форму. Но сказать
  /// об этом читателю надо: словарной статьи за таким разбором не стоит.
  final bool generated;

  const WordAnalysis({
    required this.surface,
    required this.lemma,
    required this.upos,
    this.feats = const {},
    this.forms = const {},
    this.translation = '',
    this.contextualTranslation,
    this.isOffline = false,
    this.isPhrase = false,
    this.phraseInsight,
    this.sentenceAnalysis,
    this.english,
    this.generated = false,
  });

  bool get isEnglish => english != null;

  WordAnalysis copyWith({
    String? lemma,
    String? upos,
    Map<String, String>? feats,
    Map<String, String>? forms,
    String? translation,
    String? contextualTranslation,
    bool? isOffline,
    PhraseInsight? phraseInsight,
    SentenceAnalysis? sentenceAnalysis,
    EnglishAnalysis? english,
    bool? generated,
  }) =>
      WordAnalysis(
        surface: surface,
        lemma: lemma ?? this.lemma,
        upos: upos ?? this.upos,
        feats: feats ?? this.feats,
        forms: forms ?? this.forms,
        translation: translation ?? this.translation,
        contextualTranslation:
            contextualTranslation ?? this.contextualTranslation,
        isOffline: isOffline ?? this.isOffline,
        isPhrase: isPhrase,
        phraseInsight: phraseInsight ?? this.phraseInsight,
        sentenceAnalysis: sentenceAnalysis ?? this.sentenceAnalysis,
        english: english ?? this.english,
        generated: generated ?? this.generated,
      );

  /// Разбирает строку признаков UD ("Case=Nom|Gender=Masc|Number=Sing").
  static Map<String, String> parseFeats(String? raw) {
    final m = <String, String>{};
    if (raw == null || raw.isEmpty || raw == '_') return m;
    for (final part in raw.split('|')) {
      final i = part.indexOf('=');
      if (i > 0) m[part.substring(0, i)] = part.substring(i + 1);
    }
    return m;
  }

  factory WordAnalysis.fromServer(Map<String, dynamic> j, String surface) {
    Map<String, String> strMap(dynamic v) => (v is Map)
        ? v.map((k, val) => MapEntry(k.toString(), val.toString()))
        : <String, String>{};
    final upos = (j['upos'] ?? 'UNKNOWN').toString();
    return WordAnalysis(
      surface: surface,
      lemma: (j['lemma'] ?? surface.toLowerCase()).toString(),
      upos: upos,
      feats: strMap(j['feats']),
      forms: strMap(j['forms']),
      translation: (j['translation'] ?? '').toString(),
      contextualTranslation: j['contextual_translation']?.toString(),
      isOffline: false,
      isPhrase: upos == 'PHRASE',
    );
  }

  // --- Кэш разборов (user_db.analysis_cache) ---
  // Контекстный перевод НЕ кэшируется: он зависит от предложения, и при
  // повторном тапе в другом контексте был бы неверен.

  Map<String, dynamic> toCacheJson() => {
        'lemma': lemma,
        'upos': upos,
        'feats': feats,
        'forms': forms,
        'translation': translation,
        // Пометка живёт вместе с разбором: подсказанная нейросетью начальная
        // форма не становится словарной оттого, что её достали из кэша.
        if (generated) 'generated': true,
      };

  factory WordAnalysis.fromCacheJson(Map<String, dynamic> j, String surface) {
    Map<String, String> strMap(dynamic v) => (v is Map)
        ? v.map((k, val) => MapEntry(k.toString(), val.toString()))
        : <String, String>{};
    return WordAnalysis(
      surface: surface,
      lemma: (j['lemma'] ?? surface.toLowerCase()).toString(),
      upos: (j['upos'] ?? 'UNKNOWN').toString(),
      feats: strMap(j['feats']),
      forms: strMap(j['forms']),
      translation: (j['translation'] ?? '').toString(),
      isOffline: true, // уточняется после попытки контекстного перевода
      generated: j['generated'] == true,
    );
  }
}
