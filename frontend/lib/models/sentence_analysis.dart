/// Разбор одного слова внутри фразы.
class SentenceTokenAnalysis {
  const SentenceTokenAnalysis({
    required this.index,
    required this.surface,
    required this.start,
    required this.end,
    required this.lemma,
    required this.upos,
    required this.posShort,
    required this.feats,
    required this.known,
    required this.translation,
    required this.chosenByContext,
  });

  final int index;
  final String surface;
  final int start;
  final int end;
  final String lemma;
  final String upos;
  final String posShort;
  final Map<String, String> feats;
  final bool known;
  final String translation;
  final bool chosenByContext;

  factory SentenceTokenAnalysis.fromJson(Map<String, dynamic> json) {
    final rawFeats = json['feats'];
    return SentenceTokenAnalysis(
      index: (json['index'] as num?)?.toInt() ?? 0,
      surface: (json['surface'] ?? '').toString(),
      start: (json['start'] as num?)?.toInt() ?? 0,
      end: (json['end'] as num?)?.toInt() ?? 0,
      lemma: (json['lemma'] ?? '').toString(),
      upos: (json['upos'] ?? 'UNKNOWN').toString(),
      posShort: (json['posShort'] ?? 'слово').toString(),
      feats: rawFeats is Map
          ? rawFeats.map(
              (key, value) => MapEntry(key.toString(), value.toString()),
            )
          : const {},
      known: json['known'] == true,
      translation: (json['translation'] ?? '').toString(),
      chosenByContext: json['chosenByContext'] == true,
    );
  }
}

/// Связанная группа слов: предложная, глагольная или именная.
class SentenceChunkAnalysis {
  const SentenceChunkAnalysis({
    required this.kind,
    required this.head,
    required this.tokens,
    required this.text,
    required this.caseKey,
    required this.caseName,
    required this.label,
    required this.note,
  });

  final String kind;
  final int head;
  final List<int> tokens;
  final String text;
  final String caseKey;
  final String caseName;
  final String label;
  final String note;

  factory SentenceChunkAnalysis.fromJson(Map<String, dynamic> json) =>
      SentenceChunkAnalysis(
        kind: (json['kind'] ?? '').toString(),
        head: (json['head'] as num?)?.toInt() ?? 0,
        tokens: (json['tokens'] as List<dynamic>? ?? const [])
            .whereType<num>()
            .map((value) => value.toInt())
            .toList(growable: false),
        text: (json['text'] ?? '').toString(),
        caseKey: (json['case'] ?? '').toString(),
        caseName: (json['caseName'] ?? '').toString(),
        label: (json['label'] ?? '').toString(),
        note: (json['note'] ?? '').toString(),
      );
}

/// Контекстный грамматический разбор целой фразы.
class SentenceAnalysis {
  const SentenceAnalysis({
    required this.sentence,
    required this.tokens,
    required this.chunks,
  });

  final String sentence;
  final List<SentenceTokenAnalysis> tokens;
  final List<SentenceChunkAnalysis> chunks;

  factory SentenceAnalysis.fromJson(Map<String, dynamic> json) =>
      SentenceAnalysis(
        sentence: (json['sentence'] ?? '').toString(),
        tokens: (json['tokens'] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map((item) => SentenceTokenAnalysis.fromJson(
                  Map<String, dynamic>.from(item),
                ))
            .toList(growable: false),
        chunks: (json['chunks'] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map((item) => SentenceChunkAnalysis.fromJson(
                  Map<String, dynamic>.from(item),
                ))
            .toList(growable: false),
      );
}
