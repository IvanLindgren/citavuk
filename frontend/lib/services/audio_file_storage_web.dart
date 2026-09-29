import 'dart:typed_data';

Future<String> persistAudioBytes({
  required String accountId,
  required String id,
  required String filename,
  required Uint8List bytes,
}) =>
    throw UnsupportedError(
        'Во Flutter Web звуковые файлы не сохраняются. Используй сайт Читавука.');

Future<void> deleteStoredAudio(String path) async {}

Future<bool> storedAudioExists(String path) async => false;
