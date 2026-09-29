import 'dart:async';
import 'dart:typed_data';

import 'package:super_clipboard/super_clipboard.dart';

const clipboardMaxBytes = 48 * 1024 * 1024;

class ClipboardPayload {
  const ClipboardPayload.file({
    required this.filename,
    required this.bytes,
  }) : text = null;

  const ClipboardPayload.text(this.text)
      : filename = null,
        bytes = null;

  final String? filename;
  final Uint8List? bytes;
  final String? text;

  bool get isFile => filename != null && bytes != null;
}

class ClipboardImportException implements Exception {
  const ClipboardImportException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Читает один файл или текст из системного буфера.
///
/// Файлы имеют приоритет над текстом: Проводник и мессенджеры могут положить
/// рядом URI и текстовое имя. [super_clipboard] получает CF_HDROP/URI на
/// Windows, Android и iOS, а также настоящий paste event в браузере.
Future<ClipboardPayload?> readClipboardPayload() async {
  final clipboard = SystemClipboard.instance;
  if (clipboard == null) return null;
  final reader = await clipboard.read();
  final formats = <({FileFormat format, String fallback})>[
    (format: Formats.mp3, fallback: 'Вставка.mp3'),
    (format: Formats.m4a, fallback: 'Вставка.m4a'),
    (format: Formats.wav, fallback: 'Вставка.wav'),
    (format: Formats.ogg, fallback: 'Вставка.ogg'),
    (format: Formats.flac, fallback: 'Вставка.flac'),
    (format: Formats.webm, fallback: 'Вставка.webm'),
    (format: Formats.aac, fallback: 'Вставка.aac'),
    (format: Formats.pdf, fallback: 'Вставка.pdf'),
    (format: Formats.docx, fallback: 'Вставка.docx'),
    (format: Formats.epub, fallback: 'Вставка.epub'),
    (format: Formats.htmlFile, fallback: 'Вставка.html'),
    (format: Formats.plainTextFile, fallback: 'Вставка.txt'),
    // URI без распознанного расширения всё равно можно забрать через
    // synthesizeFilesFromURIs; ниже импорт сообщит понятную ошибку формата.
    (format: Formats.webUnknown, fallback: 'Вставка.bin'),
  ];

  for (final item in reader.items) {
    for (final candidate in formats) {
      if (!item.canProvide(candidate.format)) continue;
      final payload =
          await _readFile(item, candidate.format, candidate.fallback);
      if (payload != null) return payload;
    }
    // Файлы из «Файлов» на iOS и из Проводника Windows могут прийти только
    // как file:// / CF_HDROP URI без MIME. Нулевой формат просит пакет
    // материализовать такой URI и сохраняет настоящее имя с расширением.
    if (item.canProvide(Formats.fileUri) ||
        item.canProvide(Formats.webUnknown)) {
      final uriPayload = await _readFile(item, null, 'Вставка.bin');
      if (uriPayload != null) return uriPayload;
    }
    final text = (await item.readValue(Formats.plainText))?.trim() ?? '';
    if (text.isNotEmpty) return ClipboardPayload.text(text);
  }
  return null;
}

Future<ClipboardPayload?> _readFile(
  ClipboardDataReader item,
  FileFormat? format,
  String fallback,
) async {
  final result = Completer<ClipboardPayload?>();
  final progress = item.getFile(
    format,
    (file) async {
      try {
        if (file.fileSize != null && file.fileSize! > clipboardMaxBytes) {
          throw const ClipboardImportException('Файл из буфера больше 48 МБ.');
        }
        final bytes = await _readLimited(file);
        if (!result.isCompleted) {
          result.complete(ClipboardPayload.file(
            filename: _fileName(file.fileName, fallback),
            bytes: bytes,
          ));
        }
      } catch (error) {
        if (!result.isCompleted) result.completeError(error);
      }
    },
    onError: (error) {
      if (!result.isCompleted) result.completeError(error);
    },
    // Если в буфере лежит file:// или content:// URI, пакет материализует
    // его в DataReaderFile и отдаёт поток байтов здесь.
    synthesizeFilesFromURIs: true,
  );
  if (progress == null) return null;
  try {
    return await result.future.timeout(const Duration(seconds: 30));
  } on ClipboardImportException {
    rethrow;
  } catch (_) {
    return null;
  }
}

Future<Uint8List> _readLimited(DataReaderFile file) async {
  final builder = BytesBuilder(copy: false);
  var length = 0;
  await for (final chunk in file.getStream()) {
    length += chunk.length;
    if (length > clipboardMaxBytes) {
      throw const ClipboardImportException('Файл из буфера больше 48 МБ.');
    }
    builder.add(chunk);
  }
  return builder.takeBytes();
}

String _fileName(String? name, String fallback) {
  final clean = (name ?? '').trim();
  if (clean.isEmpty) return fallback;
  // Имя нужно только для выбора парсера; пути и управляющие символы не
  // должны попасть в UI или в метаданные книги.
  final basename = clean.split(RegExp(r'[\\/]')).last;
  return basename.replaceAll(RegExp(r'[\u0000-\u001f]'), '').trim().isEmpty
      ? fallback
      : basename.replaceAll(RegExp(r'[\u0000-\u001f]'), '').trim();
}
