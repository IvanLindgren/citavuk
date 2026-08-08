import 'api_client.dart';

class TranslationGameSentence {
  const TranslationGameSentence({
    required this.id,
    required this.text,
    required this.translatorTranslation,
  });

  final String id;
  final String text;
  final String translatorTranslation;

  factory TranslationGameSentence.fromJson(Map<String, dynamic> json) =>
      TranslationGameSentence(
        id: (json['id'] ?? '').toString(),
        text: (json['text'] ?? '').toString(),
        translatorTranslation: (json['translatorTranslation'] ?? '').toString(),
      );
}

class TranslationGameRound {
  const TranslationGameRound({
    required this.level,
    required this.round,
    required this.translator,
    required this.sentences,
    required this.judgeEnabled,
  });

  final String level;
  final int round;
  final String translator;
  final List<TranslationGameSentence> sentences;
  final bool judgeEnabled;

  factory TranslationGameRound.fromJson(Map<String, dynamic> json) =>
      TranslationGameRound(
        level: (json['level'] ?? '').toString(),
        round: (json['round'] as num?)?.toInt() ?? 0,
        translator: (json['translator'] ?? '').toString(),
        sentences: [
          for (final item in (json['sentences'] as List? ?? const []))
            if (item is Map)
              TranslationGameSentence.fromJson(
                item.cast<String, dynamic>(),
              ),
        ],
        judgeEnabled: json['judgeEnabled'] == true,
      );
}

enum TranslationGameWinner { user, translator, tie }

class TranslationGameVerdict {
  const TranslationGameVerdict({
    required this.index,
    required this.winner,
    required this.userScore,
    required this.translatorScore,
    required this.feedback,
  });

  final int index;
  final TranslationGameWinner winner;
  final double userScore;
  final double translatorScore;
  final String feedback;

  factory TranslationGameVerdict.fromJson(Map<String, dynamic> json) =>
      TranslationGameVerdict(
        index: (json['index'] as num?)?.toInt() ?? -1,
        winner: switch ((json['winner'] ?? '').toString()) {
          'user' => TranslationGameWinner.user,
          'translator' => TranslationGameWinner.translator,
          _ => TranslationGameWinner.tie,
        },
        userScore: (json['userScore'] as num?)?.toDouble() ?? 0,
        translatorScore: (json['translatorScore'] as num?)?.toDouble() ?? 0,
        feedback: (json['feedback'] ?? '').toString(),
      );
}

class TranslationGameJudgement {
  const TranslationGameJudgement({
    required this.verdicts,
    required this.summary,
  });

  final List<TranslationGameVerdict> verdicts;
  final String summary;

  factory TranslationGameJudgement.fromJson(Map<String, dynamic> json) =>
      TranslationGameJudgement(
        verdicts: [
          for (final item in (json['verdicts'] as List? ?? const []))
            if (item is Map)
              TranslationGameVerdict.fromJson(
                item.cast<String, dynamic>(),
              ),
        ]..sort((left, right) => left.index.compareTo(right.index)),
        summary: (json['summary'] ?? '').toString(),
      );
}

class TranslationGameService {
  const TranslationGameService({required this.api});

  final ApiClient api;

  Future<TranslationGameRound> loadRound({
    required String level,
    required int round,
    required String translator,
  }) async {
    final raw = await api.post(
      '/v1/translation-game/round',
      {'level': level, 'round': round, 'translator': translator},
      timeout: const Duration(seconds: 45),
    );
    return TranslationGameRound.fromJson(
      (raw as Map).cast<String, dynamic>(),
    );
  }

  Future<TranslationGameJudgement> judge({
    required TranslationGameRound round,
    required List<String> answers,
  }) async {
    final raw = await api.post(
      '/v1/translation-game/judge',
      {
        'entries': [
          for (var index = 0; index < round.sentences.length; index++)
            {
              'source': round.sentences[index].text,
              'userTranslation': answers[index],
              'translatorTranslation':
                  round.sentences[index].translatorTranslation,
            },
        ],
      },
      timeout: const Duration(seconds: 100),
    );
    return TranslationGameJudgement.fromJson(
      (raw as Map).cast<String, dynamic>(),
    );
  }
}
