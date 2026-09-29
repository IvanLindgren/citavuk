import 'dart:typed_data';

import '../models/local_audio_file.dart';
import '../utils/uuid.dart';
import 'api_client.dart';
import 'audio_file_storage.dart';
import 'auth_service.dart';
import 'user_db.dart';

const audioFileMaxBytes = 48 * 1024 * 1024;
const audioFileExtensions = [
  'mp3',
  'm4a',
  'wav',
  'ogg',
  'oga',
  'flac',
  'webm',
  'aac',
];

class AudioFileService {
  AudioFileService({required this.api, required this.auth});

  final ApiClient api;
  final AuthService auth;

  Future<LocalAudioFile> import({
    required String filename,
    required Uint8List bytes,
  }) async {
    final account = auth.account;
    if (!auth.isSignedIn || account == null) {
      throw ApiException('Чтобы расшифровать запись, войди в аккаунт.',
          status: 401);
    }
    if (bytes.isEmpty) throw ApiException('Аудиофайл пустой.');
    if (bytes.length > audioFileMaxBytes) {
      throw ApiException('Аудиофайл должен быть не больше 48 МБ.');
    }
    final extension =
        filename.contains('.') ? filename.split('.').last.toLowerCase() : '';
    if (!audioFileExtensions.contains(extension)) {
      throw ApiException('Поддерживаются MP3, M4A, WAV, OGG, FLAC и WebM.');
    }

    final generation = UserDb.instance.generation;
    final response = await api.postFile(
      '/v1/audio/transcribe',
      field: 'file',
      bytes: bytes,
      filename: filename,
      mime: _mimeFor(extension),
      // Резервный проход Aiesa может ждать очередь; не обрываем его раньше
      // серверного дедлайна.
      timeout: const Duration(minutes: 25),
    );
    if (generation != UserDb.instance.generation ||
        auth.account?.id != account.id) {
      throw StateError('Аккаунт сменился во время расшифровки.');
    }
    final transcript =
        AudioTranscript.fromJson(Map<String, dynamic>.from(response as Map));
    final id = newUuid();
    final path = await persistAudioBytes(
      accountId: account.id,
      id: id,
      filename: filename,
      bytes: bytes,
    );
    final title = filename.replaceFirst(RegExp(r'\.[^.]+$'), '').trim();
    final record = LocalAudioFile(
      id: id,
      title: title.isEmpty ? 'Без названия' : title,
      filename: filename,
      storedPath: path,
      mimeType: _mimeFor(extension),
      sizeBytes: bytes.length,
      duration: transcript.duration,
      speakerCount: transcript.speakers.length,
      addedAt: DateTime.now().millisecondsSinceEpoch,
      transcript: transcript,
    );
    try {
      await UserDb.instance
          .insertAudioFile(record, expectedGeneration: generation);
    } catch (_) {
      await deleteStoredAudio(path);
      rethrow;
    }
    return record;
  }

  Future<void> delete(LocalAudioFile file) async {
    await UserDb.instance.deleteAudioFile(file.id);
    await deleteStoredAudio(file.storedPath);
  }

  String _mimeFor(String extension) => switch (extension) {
        'mp3' => 'audio/mpeg',
        'm4a' => 'audio/mp4',
        'wav' => 'audio/wav',
        'ogg' => 'audio/ogg',
        'oga' => 'audio/ogg',
        'flac' => 'audio/flac',
        'webm' => 'audio/webm',
        'aac' => 'audio/aac',
        _ => 'application/octet-stream',
      };
}
