import 'dart:convert';

class AudioTranscriptWord {
  final String text;
  final double start;
  final double end;

  const AudioTranscriptWord({
    required this.text,
    required this.start,
    required this.end,
  });

  factory AudioTranscriptWord.fromJson(Map<String, dynamic> json) =>
      AudioTranscriptWord(
        text: (json['text'] ?? '').toString(),
        start: (json['start'] as num?)?.toDouble() ?? 0,
        end: (json['end'] as num?)?.toDouble() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'text': text,
        'start': start,
        'end': end,
      };
}

class AudioTranscriptSegment {
  final String speaker;
  final double start;
  final double end;
  final String text;
  final List<AudioTranscriptWord> words;

  const AudioTranscriptSegment({
    required this.speaker,
    required this.start,
    required this.end,
    required this.text,
    required this.words,
  });

  factory AudioTranscriptSegment.fromJson(Map<String, dynamic> json) =>
      AudioTranscriptSegment(
        speaker: (json['speaker'] ?? 'speaker_0').toString(),
        start: (json['start'] as num?)?.toDouble() ?? 0,
        end: (json['end'] as num?)?.toDouble() ?? 0,
        text: (json['text'] ?? '').toString(),
        words: ((json['words'] as List?) ?? const [])
            .whereType<Map>()
            .map((word) =>
                AudioTranscriptWord.fromJson(Map<String, dynamic>.from(word)))
            .where(
                (word) => word.text.trim().isNotEmpty && word.end > word.start)
            .toList(growable: false),
      );

  Map<String, dynamic> toJson() => {
        'speaker': speaker,
        'start': start,
        'end': end,
        'text': text,
        'words': words.map((word) => word.toJson()).toList(growable: false),
      };
}

class AudioTranscript {
  final String languageCode;
  final double languageProbability;
  final double duration;
  final List<String> speakers;
  final List<AudioTranscriptSegment> segments;

  const AudioTranscript({
    required this.languageCode,
    required this.languageProbability,
    required this.duration,
    required this.speakers,
    required this.segments,
  });

  factory AudioTranscript.fromJson(Map<String, dynamic> json) {
    final transcript = AudioTranscript(
      languageCode: (json['language_code'] ?? '').toString(),
      languageProbability:
          (json['language_probability'] as num?)?.toDouble() ?? 0,
      duration: (json['duration'] as num?)?.toDouble() ?? 0,
      speakers: ((json['speakers'] as List?) ?? const [])
          .map((speaker) => speaker.toString())
          .where((speaker) => speaker.isNotEmpty)
          .toList(growable: false),
      segments: ((json['segments'] as List?) ?? const [])
          .whereType<Map>()
          .map((segment) => AudioTranscriptSegment.fromJson(
              Map<String, dynamic>.from(segment)))
          .where((segment) =>
              segment.text.trim().isNotEmpty && segment.words.isNotEmpty)
          .toList(growable: false),
    );
    if (transcript.languageCode != 'srp' || transcript.segments.isEmpty) {
      throw const FormatException(
          'В записи не удалось подтвердить сербскую речь.');
    }
    return transcript;
  }

  factory AudioTranscript.fromEncoded(String encoded) =>
      AudioTranscript.fromJson(
          Map<String, dynamic>.from(jsonDecode(encoded) as Map));

  Map<String, dynamic> toJson() => {
        'language_code': languageCode,
        'language_probability': languageProbability,
        'duration': duration,
        'speakers': speakers,
        'segments':
            segments.map((segment) => segment.toJson()).toList(growable: false),
      };

  String encode() => jsonEncode(toJson());
}

class LocalAudioFile {
  final String id;
  final String title;
  final String filename;
  final String storedPath;
  final String mimeType;
  final int sizeBytes;
  final double duration;
  final int speakerCount;
  final int addedAt;
  final AudioTranscript? transcript;

  const LocalAudioFile({
    required this.id,
    required this.title,
    required this.filename,
    required this.storedPath,
    required this.mimeType,
    required this.sizeBytes,
    required this.duration,
    required this.speakerCount,
    required this.addedAt,
    this.transcript,
  });

  factory LocalAudioFile.fromDb(Map<String, dynamic> row) {
    final encoded = row['transcript_json']?.toString();
    return LocalAudioFile(
      id: row['id']?.toString() ?? '',
      title: row['title']?.toString() ?? 'Без названия',
      filename: row['filename']?.toString() ?? '',
      storedPath: row['stored_path']?.toString() ?? '',
      mimeType: row['mime_type']?.toString() ?? 'application/octet-stream',
      sizeBytes: (row['size_bytes'] as num?)?.toInt() ?? 0,
      duration: (row['duration'] as num?)?.toDouble() ?? 0,
      speakerCount: (row['speaker_count'] as num?)?.toInt() ?? 0,
      addedAt: (row['added_at'] as num?)?.toInt() ?? 0,
      transcript: encoded == null || encoded.isEmpty
          ? null
          : AudioTranscript.fromEncoded(encoded),
    );
  }
}
