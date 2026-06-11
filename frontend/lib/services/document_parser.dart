import 'dart:async';
import 'dart:convert';
import 'dart:isolate';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:archive/archive.dart';
import 'package:xml/xml.dart' as xml;
import 'package:syncfusion_flutter_pdf/pdf.dart';

class _IsolateParams {
  final Uint8List bytes;
  final SendPort sendPort;
  _IsolateParams({required this.bytes, required this.sendPort});
}

/// Извлечение текста из PDF/DOCX с прогрессом.
///
/// Нативно разбор идёт в отдельном изоляте (UI не фризится). На вебе изолятов
/// нет (dart:isolate не поддерживается), поэтому там разбираем в основном
/// потоке — та же чистая логика, просто без Isolate.
class DocumentParser {
  static Future<List<String>> parsePdf(Uint8List bytes) =>
      parsePdfWithProgress(bytes, (_) {});

  static Future<List<String>> parseDocx(Uint8List bytes) =>
      parseDocxWithProgress(bytes, (_) {});

  static Future<List<String>> parsePdfWithProgress(
    Uint8List bytes,
    void Function(double progress) onProgress,
  ) async {
    if (kIsWeb) {
      return _parsePdfCoreWeb(bytes, onProgress); // веб — асинхронный разбор
    }
    final receivePort = ReceivePort();
    final isolate = await Isolate.spawn(
      _parsePdfIsolateWithPort,
      _IsolateParams(bytes: bytes, sendPort: receivePort.sendPort),
    );
    final completer = Completer<List<String>>();
    receivePort.listen((message) {
      if (message is double) {
        onProgress(message);
      } else if (message is List<String>) {
        completer.complete(message);
        receivePort.close();
        isolate.kill();
      } else if (message is String) {
        completer.completeError(Exception(message));
        receivePort.close();
        isolate.kill();
      }
    });
    return completer.future;
  }

  static Future<List<String>> parseDocxWithProgress(
    Uint8List bytes,
    void Function(double progress) onProgress,
  ) async {
    if (kIsWeb) {
      return _parseDocxCoreWeb(bytes, onProgress); // веб — асинхронный разбор
    }
    final receivePort = ReceivePort();
    final isolate = await Isolate.spawn(
      _parseDocxIsolateWithPort,
      _IsolateParams(bytes: bytes, sendPort: receivePort.sendPort),
    );
    final completer = Completer<List<String>>();
    receivePort.listen((message) {
      if (message is double) {
        onProgress(message);
      } else if (message is List<String>) {
        completer.complete(message);
        receivePort.close();
        isolate.kill();
      } else if (message is String) {
        completer.completeError(Exception(message));
        receivePort.close();
        isolate.kill();
      }
    });
    return completer.future;
  }

  // --- Изолятные обёртки (только нативно) ---

  static void _parsePdfIsolateWithPort(_IsolateParams params) {
    try {
      final result =
          _parsePdfCore(params.bytes, (p) => params.sendPort.send(p));
      params.sendPort.send(result);
    } catch (e) {
      params.sendPort.send(e.toString());
    }
  }

  static void _parseDocxIsolateWithPort(_IsolateParams params) {
    try {
      final result =
          _parseDocxCore(params.bytes, (p) => params.sendPort.send(p));
      params.sendPort.send(result);
    } catch (e) {
      params.sendPort.send(e.toString());
    }
  }

  // --- Чистая логика (работает и в изоляте, и на вебе) ---

  static List<String> _parsePdfCore(
      Uint8List bytes, void Function(double) onProgress) {
    final List<String> paragraphs = [];
    PdfDocument? document;
    try {
      document = PdfDocument(inputBytes: bytes);
      final extractor = PdfTextExtractor(document);
      final pageCount = document.pages.count;
      final current = StringBuffer();
      for (var i = 0; i < pageCount; i++) {
        final pageText = extractor.extractText(
          startPageIndex: i,
          endPageIndex: i,
          layoutText: true,
        );
        for (final line in pageText.split('\n')) {
          final clean = line.trim();
          if (clean.isEmpty) {
            if (current.isNotEmpty) {
              paragraphs.add(current.toString());
              current.clear();
            }
          } else {
            if (current.isNotEmpty) current.write(' ');
            current.write(clean);
          }
        }
        if (pageCount > 0) onProgress((i + 1) / pageCount);
      }
      if (current.isNotEmpty) paragraphs.add(current.toString());
    } finally {
      document?.dispose();
    }
    if (paragraphs.isEmpty) {
      paragraphs.add('[Пустой документ или отсутствует текстовый слой]');
    }
    return _splitLong(paragraphs);
  }

  static List<String> _parseDocxCore(
      Uint8List bytes, void Function(double) onProgress) {
    final List<String> paragraphs = [];
    onProgress(0.1);
    final archive = ZipDecoder().decodeBytes(bytes);
    final file = archive.findFile('word/document.xml');
    if (file == null) {
      return ['[Ошибка: Файл word/document.xml не найден в DOCX]'];
    }
    onProgress(0.3);
    final xmlString = utf8.decode(file.content as List<int>);
    onProgress(0.5);
    final xmlDocument = xml.XmlDocument.parse(xmlString);
    final pElements = xmlDocument.findAllElements('w:p').toList();
    final total = pElements.length;
    for (var i = 0; i < total; i++) {
      final p = pElements[i];
      final buffer = StringBuffer();
      for (final r in p.findAllElements('w:r')) {
        for (final t in r.findAllElements('w:t')) {
          buffer.write(t.innerText);
        }
      }
      final pText = buffer.toString().trim();
      if (pText.isNotEmpty) paragraphs.add(pText);
      if (total > 0 && (i % 50 == 0 || i == total - 1)) {
        onProgress(0.5 + (i / total) * 0.45);
      }
    }
    if (paragraphs.isEmpty) {
      paragraphs.add('[Пустой DOCX документ]');
    }
    return _splitLong(paragraphs);
  }

  static Future<List<String>> _parsePdfCoreWeb(
      Uint8List bytes, void Function(double) onProgress) async {
    final List<String> paragraphs = [];
    PdfDocument? document;
    try {
      document = PdfDocument(inputBytes: bytes);
      final extractor = PdfTextExtractor(document);
      final pageCount = document.pages.count;
      final current = StringBuffer();
      for (var i = 0; i < pageCount; i++) {
        // Уступаем поток браузеру каждые 2 страницы, чтобы обновить UI и не зависнуть
        if (i % 2 == 0) {
          await Future.delayed(Duration.zero);
        }
        final pageText = extractor.extractText(
          startPageIndex: i,
          endPageIndex: i,
          layoutText: true,
        );
        for (final line in pageText.split('\n')) {
          final clean = line.trim();
          if (clean.isEmpty) {
            if (current.isNotEmpty) {
              paragraphs.add(current.toString());
              current.clear();
            }
          } else {
            if (current.isNotEmpty) current.write(' ');
            current.write(clean);
          }
        }
        if (pageCount > 0) onProgress((i + 1) / pageCount);
      }
      if (current.isNotEmpty) paragraphs.add(current.toString());
    } finally {
      document?.dispose();
    }
    if (paragraphs.isEmpty) {
      paragraphs.add('[Пустой документ или отсутствует текстовый слой]');
    }
    return _splitLong(paragraphs);
  }

  static Future<List<String>> _parseDocxCoreWeb(
      Uint8List bytes, void Function(double) onProgress) async {
    final List<String> paragraphs = [];
    onProgress(0.1);
    await Future.delayed(Duration.zero);
    final archive = ZipDecoder().decodeBytes(bytes);
    final file = archive.findFile('word/document.xml');
    if (file == null) {
      return ['[Ошибка: Файл word/document.xml не найден в DOCX]'];
    }
    onProgress(0.3);
    await Future.delayed(Duration.zero);
    // На вебе `file.content` дёргает inflateBuffer, который через условный импорт
    // требует dart:io ИЛИ dart:html (в WASM нет ни того, ни другого —
    // «inflateBuffer requires html or io»). Распаковываем сами через чистый
    // Dart-Inflate по сырым байтам записи zip — так же, как это делает html-ветка
    // самого пакета (Inflate(data).getBytes()). Работает и в JS, и в WASM.
    // (decompress(OutputStream) тут не годится: если _content уже выставлен, он
    // молча пишет 0 байт → XmlParserException «single root element at 1:1».)
    final raw = file.rawContent!.toUint8List();
    final content = file.compressionType == ArchiveFile.DEFLATE
        ? Inflate(raw).getBytes()
        : raw;
    final xmlString = utf8.decode(content);
    onProgress(0.5);
    await Future.delayed(Duration.zero);
    final xmlDocument = xml.XmlDocument.parse(xmlString);
    final pElements = xmlDocument.findAllElements('w:p').toList();
    final total = pElements.length;
    for (var i = 0; i < total; i++) {
      // Периодически уступаем поток браузеру на больших файлах
      if (i % 100 == 0) {
        await Future.delayed(Duration.zero);
      }
      final p = pElements[i];
      final buffer = StringBuffer();
      for (final r in p.findAllElements('w:r')) {
        for (final t in r.findAllElements('w:t')) {
          buffer.write(t.innerText);
        }
      }
      final pText = buffer.toString().trim();
      if (pText.isNotEmpty) paragraphs.add(pText);
      if (total > 0 && (i % 50 == 0 || i == total - 1)) {
        onProgress(0.5 + (i / total) * 0.45);
      }
    }
    if (paragraphs.isEmpty) {
      paragraphs.add('[Пустой DOCX документ]');
    }
    return _splitLong(paragraphs);
  }

  static List<String> _splitLong(List<String> paragraphs) {
    final out = <String>[];
    final sentenceEnd = RegExp(r'(?<=[.!?…»”"])\s+');
    for (final p in paragraphs) {
      if (p.length <= 500) {
        out.add(p);
        continue;
      }
      final buf = StringBuffer();
      for (final sentence in p.split(sentenceEnd)) {
        if (buf.isNotEmpty) buf.write(' ');
        buf.write(sentence);
        if (buf.length >= 240) {
          out.add(buf.toString());
          buf.clear();
        }
      }
      if (buf.isNotEmpty) out.add(buf.toString());
    }
    return out;
  }
}
