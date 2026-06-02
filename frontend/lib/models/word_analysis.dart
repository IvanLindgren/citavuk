/// Типизированный результат разбора слова/фразы (онлайн или офлайн).
class WordAnalysis {
  final String surface;
  final String lemma;
  final String upos;
  final Map<String, String> feats;
  final Map<String, String> forms;
  final String translation;
  final bool isOffline;
  final bool isPhrase;

  const WordAnalysis({
    required this.surface,
    required this.lemma,
    required this.upos,
    this.feats = const {},
    this.forms = const {},
    this.translation = '',
    this.isOffline = false,
    this.isPhrase = false,
  });

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
      isOffline: false,
      isPhrase: upos == 'PHRASE',
    );
  }
}
