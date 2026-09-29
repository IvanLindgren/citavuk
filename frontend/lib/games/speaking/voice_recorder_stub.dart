import 'dart:typed_data';

/// Запись голоса недоступна (веб-сборка): там пользуются сайтом.
class VoiceRecording {
  const VoiceRecording({required this.bytes, required this.filename, required this.mime, required this.seconds});
  final Uint8List bytes;
  final String filename, mime;
  final double seconds;
}

class VoiceRecorderException implements Exception {
  const VoiceRecorderException(this.message);
  final String message;
}

class VoiceRecorder {
  static bool get supported => false;

  Future<void> start({required void Function(double level) onLevel}) =>
      throw const VoiceRecorderException('Запись голоса в этой сборке недоступна.');

  Future<VoiceRecording> stop() => throw const VoiceRecorderException('Запись голоса в этой сборке недоступна.');

  Future<void> cancel() async {}

  void dispose() {}
}
