/// Одна реплика аудиоурока (предложение/строка субтитров).
class AudioWord {
  final String text;
  final double start;
  final double end;
  const AudioWord({required this.text, required this.start, required this.end});
  factory AudioWord.fromJson(Map<String, dynamic> j) => AudioWord(text: (j['text'] ?? j['word'] ?? '').toString(), start: (j['start'] as num?)?.toDouble() ?? -1, end: (j['end'] as num?)?.toDouble() ?? -1);
}

class AudioCue {
  final String text;

  /// Тайминги в секундах — только для потокового аудио (подкаст с
  /// субтитрами). В TTS-режиме null: каждая реплика — отдельный файл.
  final double? start;
  final double? end;
  final List<AudioWord> words;
  final String? speaker;

  const AudioCue({required this.text, this.start, this.end, this.words = const [], this.speaker});

  // Реальные времена ASR; для записи не растягиваем текст по длине.
  int characterAt(double seconds) {
    var cursor = 0;
    for (final word in words) {
      final needle = word.text.replaceAll(RegExp(r'^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$', unicode: true), '').toLowerCase();
      if (needle.isEmpty) continue;
      final offset = text.toLowerCase().indexOf(needle, cursor);
      if (offset < 0) continue;
      if (seconds >= word.start && seconds < word.end) return offset;
      cursor = offset + needle.length;
    }
    return -1;
  }

  double? timeAtCharacter(int character) {
    var cursor = 0;
    for (final word in words) {
      final needle = word.text.replaceAll(RegExp(r'^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$', unicode: true), '').toLowerCase();
      if (needle.isEmpty) continue;
      final offset = text.toLowerCase().indexOf(needle, cursor);
      if (offset < 0) continue;
      if (character >= offset && character < offset + needle.length) return word.start;
      cursor = offset + needle.length;
    }
    return start;
  }

  factory AudioCue.fromJson(Map<String, dynamic> j) => AudioCue(
        text: (j['text'] ?? '').toString(),
        start: (j['start'] as num?)?.toDouble(),
        end: (j['end'] as num?)?.toDouble(),
        speaker: j['speaker'] as String?,
        words: ((j['words'] as List?) ?? const []).whereType<Map<String, dynamic>>().map(AudioWord.fromJson).where((w) => w.start >= 0 && w.end > w.start && w.text.isNotEmpty).toList(),
      );
}

/// Аудиоурок: либо потоковое аудио с таймированными субтитрами (подкаст,
/// запись), либо TTS-озвучка текста (каждая реплика озвучивается бэкендом).
class AudioLesson {
  final String id;
  final String title;
  final String subtitle;

  /// null → TTS-режим.
  final String? audioUrl;
  final List<AudioCue> cues;

  /// Страница с полным транскриптом эпизода (если есть) — клиент дотягивает
  /// её лениво через /audio/transcript и заменяет реплики из описания.
  final String? transcriptUrl;
  final double durationSec;
  final String kind;
  final String category;
  final String cefr;
  final String sourceTitle;
  final String? sourceUrl;
  final String? externalUrl;

  bool get isTts => audioUrl == null;

  const AudioLesson({
    required this.id,
    required this.title,
    this.subtitle = '',
    this.audioUrl,
    required this.cues,
    this.transcriptUrl,
    this.durationSec = 0,
    this.kind = 'podcast',
    this.category = 'Учебные',
    this.cefr = '',
    this.sourceTitle = '',
    this.sourceUrl,
    this.externalUrl,
  });

  factory AudioLesson.fromJson(Map<String, dynamic> j) => AudioLesson(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        subtitle: (j['subtitle'] ?? '').toString(),
        audioUrl: (j['audio_url'] as String?)?.trim().isEmpty ?? true
            ? null
            : (j['audio_url'] as String).trim(),
        cues: ((j['cues'] as List?) ?? const [])
            .map((e) => AudioCue.fromJson(e as Map<String, dynamic>))
            .where((c) => c.text.trim().isNotEmpty)
            .toList(),
        transcriptUrl: (j['transcript_url'] as String?)?.trim().isEmpty ?? true
            ? null
            : (j['transcript_url'] as String).trim(),
        durationSec: (j['duration'] as num?)?.toDouble() ?? 0,
        kind: (j['kind'] ?? 'podcast').toString(),
        category: (j['category'] ?? 'Учебные').toString(),
        cefr: (j['cefr'] ?? '').toString(),
        sourceTitle: (j['source_title'] ?? '').toString(),
        sourceUrl: (j['source_url'] as String?)?.trim().isEmpty ?? true
            ? null
            : (j['source_url'] as String).trim(),
        externalUrl: (j['external_url'] as String?)?.trim().isEmpty ?? true
            ? null
            : (j['external_url'] as String).trim(),
      );
}
