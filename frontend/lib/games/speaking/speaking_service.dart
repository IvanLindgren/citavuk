import 'dart:typed_data';

import '../../models/local_audio_file.dart';
import '../../services/api_client.dart';
import 'speaking_models.dart';

/// Сервер игры «Говори!»: доступ, темы, разбор текста и расшифровка речи.
class SpeakingService {
  const SpeakingService(this.api);
  final ApiClient api;

  Future<SpeakingAccess> access() async =>
      SpeakingAccess.fromJson(Map<String, dynamic>.from(await api.get('/v1/games/speaking/access') as Map));

  Future<SpeakingCatalog> topics() async =>
      SpeakingCatalog.fromJson(Map<String, dynamic>.from(await api.get('/v1/games/speaking/topics') as Map));

  Future<SpeakingReviewResult> review({
    required String sessionId,
    required String topicId,
    required String text,
    required String source,
  }) async {
    final json = Map<String, dynamic>.from(await api.post(
      '/v1/games/speaking/review',
      {'sessionId': sessionId, 'topicId': topicId, 'text': text, 'source': source},
      // Модель думает до полутора минут вместе с повторами.
      timeout: const Duration(seconds: 100),
    ) as Map);
    final study = json['study'];
    return SpeakingReviewResult(
      text: json['text'] as String? ?? text,
      review: SpeakingReview.fromJson(Map<String, dynamic>.from(json['review'] as Map)),
      study: study is Map ? Map<String, dynamic>.from(study) : null,
    );
  }

  /// Расшифровывает запись тем же путём, что и загруженные файлы.
  Future<String> transcribe(Uint8List bytes, String filename, String mime) async {
    final response = await api.postFile(
      '/v1/audio/transcribe',
      field: 'file',
      bytes: bytes,
      filename: filename,
      mime: mime,
      timeout: const Duration(minutes: 5),
    );
    final transcript = AudioTranscript.fromJson(Map<String, dynamic>.from(response as Map));
    if (transcript.languageCode != 'srp' || transcript.segments.isEmpty) {
      throw ApiException('В записи не удалось подтвердить сербскую речь.', status: 422);
    }
    final text = transcript.segments.map((s) => s.text.trim()).where((s) => s.isNotEmpty).join(' ');
    if (text.isEmpty) throw ApiException('Речь в записи не распознана.', status: 422);
    return text;
  }
}
