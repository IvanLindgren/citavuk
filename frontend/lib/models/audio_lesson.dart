/// Одна реплика аудиоурока (предложение/строка субтитров).
class AudioCue {
  final String text;

  /// Тайминги в секундах — только для потокового аудио (подкаст с
  /// субтитрами). В TTS-режиме null: каждая реплика — отдельный файл.
  final double? start;
  final double? end;

  const AudioCue({required this.text, this.start, this.end});

  factory AudioCue.fromJson(Map<String, dynamic> j) => AudioCue(
        text: (j['text'] ?? '').toString(),
        start: (j['start'] as num?)?.toDouble(),
        end: (j['end'] as num?)?.toDouble(),
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

  bool get isTts => audioUrl == null;

  const AudioLesson({
    required this.id,
    required this.title,
    this.subtitle = '',
    this.audioUrl,
    required this.cues,
    this.transcriptUrl,
    this.durationSec = 0,
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
      );
}
