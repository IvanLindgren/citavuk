import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Готовая запись: обычный файл, который принимает та же расшифровка, что и
/// загруженные пользователем записи.
class VoiceRecording {
  const VoiceRecording({required this.bytes, required this.filename, required this.mime, required this.seconds});
  final Uint8List bytes;
  final String filename, mime;
  final double seconds;
}

class VoiceRecorderException implements Exception {
  const VoiceRecorderException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Формат записи зависит от платформы: AAC в m4a есть на Android и Windows,
/// FLAC и WAV — запасные там, где AAC нет. Все три расширения принимает сервер.
const _formats = [
  (AudioEncoder.aacLc, 'm4a', 'audio/mp4'),
  (AudioEncoder.flac, 'flac', 'audio/flac'),
  (AudioEncoder.wav, 'wav', 'audio/wav'),
];

class VoiceRecorder {
  final _recorder = AudioRecorder();
  StreamSubscription<Amplitude>? _levels;
  DateTime? _startedAt;
  String? _path;
  String _ext = 'm4a', _mime = 'audio/mp4';

  static bool get supported => true;

  Future<void> start({required void Function(double level) onLevel}) async {
    try {
      if (!await _recorder.hasPermission()) {
        throw const VoiceRecorderException('Нет доступа к микрофону. Разреши его в настройках системы.');
      }
      var chosen = _formats.last;
      for (final format in _formats) {
        if (await _recorder.isEncoderSupported(format.$1)) {
          chosen = format;
          break;
        }
      }
      _ext = chosen.$2;
      _mime = chosen.$3;
      final dir = await getTemporaryDirectory();
      _path = '${dir.path}${Platform.pathSeparator}govori_${DateTime.now().millisecondsSinceEpoch}.$_ext';
      await _recorder.start(
        RecordConfig(
          encoder: chosen.$1,
          numChannels: 1,
          // Для речи хватает 16 кГц: файл втрое меньше, а расшифровка та же.
          sampleRate: 16000,
          bitRate: 48000,
          echoCancel: true,
          noiseSuppress: true,
        ),
        path: _path!,
      );
      _startedAt = DateTime.now();
      _levels = _recorder.onAmplitudeChanged(const Duration(milliseconds: 80)).listen((amp) {
        // dBFS: около −55 — тишина, около −5 — громкая речь у микрофона.
        onLevel(((amp.current + 55) / 50).clamp(0.0, 1.0));
      });
    } on VoiceRecorderException {
      rethrow;
    } catch (_) {
      throw const VoiceRecorderException('Не удалось включить микрофон.');
    }
  }

  Future<VoiceRecording> stop() async {
    final startedAt = _startedAt;
    await _levels?.cancel();
    _levels = null;
    String? path;
    try {
      path = await _recorder.stop() ?? _path;
    } catch (_) {
      throw const VoiceRecorderException('Запись не удалось остановить.');
    }
    if (path == null || startedAt == null) throw const VoiceRecorderException('Запись не началась.');
    final file = File(path);
    try {
      final bytes = await file.readAsBytes();
      if (bytes.isEmpty) throw const VoiceRecorderException('Запись получилась пустой.');
      return VoiceRecording(
        bytes: bytes,
        filename: 'govori.$_ext',
        mime: _mime,
        seconds: DateTime.now().difference(startedAt).inMilliseconds / 1000,
      );
    } finally {
      // Голос не остаётся на диске: файл нужен только для отправки.
      unawaited(file.delete().catchError((_) => file));
    }
  }

  Future<void> cancel() async {
    await _levels?.cancel();
    _levels = null;
    try {
      final path = await _recorder.stop();
      if (path != null) unawaited(File(path).delete().catchError((_) => File(path)));
    } catch (_) {}
  }

  void dispose() {
    unawaited(_levels?.cancel());
    unawaited(_recorder.dispose());
  }
}
