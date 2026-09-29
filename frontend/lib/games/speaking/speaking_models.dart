/// Модели игры «Говори!». Формат — ответ Go-сервера (`/v1/games/speaking/*`),
/// парная реализация: `web/src/api/speaking.ts`.
library;

/// Сервер требует не меньше пяти слов и не больше четырёх тысяч знаков.
const speakingMinWords = 5;
const speakingMaxChars = 4000;

int countWords(String text) => text.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;

class SpeakingAccess {
  const SpeakingAccess({
    required this.open,
    required this.publicFrom,
    required this.supporter,
    required this.signedIn,
  });

  factory SpeakingAccess.fromJson(Map<String, dynamic> json) => SpeakingAccess(
        open: json['open'] == true,
        publicFrom: DateTime.tryParse(json['publicFrom'] as String? ?? '')?.toLocal() ?? DateTime(2026, 10, 13),
        supporter: json['supporter'] == true,
        signedIn: json['signedIn'] == true,
      );

  final bool open, supporter, signedIn;
  final DateTime publicFrom;
}

class SpeakingGenre {
  const SpeakingGenre({required this.id, required this.icon, required this.ru, required this.sr, this.art = ''});

  factory SpeakingGenre.fromJson(Map<String, dynamic> json) => SpeakingGenre(
        id: json['id'] as String? ?? '',
        icon: json['icon'] as String? ?? '',
        art: json['art'] as String? ?? '',
        ru: json['ru'] as String? ?? '',
        sr: json['sr'] as String? ?? '',
      );

  final String id, ru, sr;

  /// Эмодзи для приложений 1.22.0, новые рисуют [art].
  final String icon;

  /// Содержимое значка 24×24 без обёртки `<svg>`.
  final String art;
}

class SpeakingWord {
  const SpeakingWord({required this.sr, required this.ru});

  factory SpeakingWord.fromJson(Map<String, dynamic> json) =>
      SpeakingWord(sr: json['sr'] as String? ?? '', ru: json['ru'] as String? ?? '');

  final String sr, ru;
}

class SpeakingTopic {
  const SpeakingTopic({required this.id, required this.genre, required this.sr, required this.ru, required this.words});

  factory SpeakingTopic.fromJson(Map<String, dynamic> json) => SpeakingTopic(
        id: json['id'] as String? ?? '',
        genre: json['genre'] as String? ?? '',
        sr: json['sr'] as String? ?? '',
        ru: json['ru'] as String? ?? '',
        words: [
          for (final word in json['words'] as List? ?? const [])
            SpeakingWord.fromJson(Map<String, dynamic>.from(word as Map)),
        ],
      );

  final String id, genre, sr, ru;
  final List<SpeakingWord> words;
}

class SpeakingCatalog {
  const SpeakingCatalog({required this.genres, required this.topics});

  factory SpeakingCatalog.fromJson(Map<String, dynamic> json) => SpeakingCatalog(
        genres: [
          for (final item in json['genres'] as List? ?? const [])
            SpeakingGenre.fromJson(Map<String, dynamic>.from(item as Map)),
        ],
        topics: [
          for (final item in json['topics'] as List? ?? const [])
            SpeakingTopic.fromJson(Map<String, dynamic>.from(item as Map)),
        ],
      );

  final List<SpeakingGenre> genres;
  final List<SpeakingTopic> topics;

  SpeakingGenre? genre(String id) {
    for (final item in genres) {
      if (item.id == id) return item;
    }
    return null;
  }
}

class SpeakingMistake {
  const SpeakingMistake({
    required this.original,
    required this.fixed,
    required this.kind,
    required this.label,
    required this.explanation,
  });

  factory SpeakingMistake.fromJson(Map<String, dynamic> json) => SpeakingMistake(
        original: json['original'] as String? ?? '',
        fixed: json['fixed'] as String? ?? '',
        kind: json['kind'] as String? ?? 'other',
        label: json['label'] as String? ?? 'Другое',
        explanation: json['explanation'] as String? ?? '',
      );

  final String original, fixed, kind, label, explanation;
}

class SpeakingReview {
  const SpeakingReview({
    required this.level,
    required this.onTopic,
    required this.summary,
    required this.strengths,
    required this.mistakes,
    required this.polished,
    required this.tips,
    required this.words,
  });

  factory SpeakingReview.fromJson(Map<String, dynamic> json) {
    List<String> strings(String key) => [
          for (final item in json[key] as List? ?? const [])
            if (item is String && item.trim().isNotEmpty) item,
        ];
    return SpeakingReview(
      level: json['level'] as String? ?? '',
      onTopic: json['onTopic'] != false,
      summary: json['summary'] as String? ?? '',
      strengths: strings('strengths'),
      mistakes: [
        for (final item in json['mistakes'] as List? ?? const [])
          SpeakingMistake.fromJson(Map<String, dynamic>.from(item as Map)),
      ],
      polished: json['polished'] as String? ?? '',
      tips: strings('tips'),
      words: [
        for (final item in json['words'] as List? ?? const [])
          SpeakingWord.fromJson(Map<String, dynamic>.from(item as Map)),
      ],
    );
  }

  final String level, summary, polished;
  final bool onTopic;
  final List<String> strengths, tips;
  final List<SpeakingMistake> mistakes;
  final List<SpeakingWord> words;
}

class SpeakingReviewResult {
  const SpeakingReviewResult({required this.text, required this.review, this.study});

  /// То, что действительно разбиралось (пробелы свёрнуты): ошибки подсвечиваются
  /// именно в этой строке.
  final String text;
  final SpeakingReview review;
  final Map<String, dynamic>? study;
}
