import 'dart:async';
import 'dart:convert';
import 'dart:isolate';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:archive/archive.dart';
import 'package:xml/xml.dart' as xml;
import 'package:syncfusion_flutter_pdf/pdf.dart';

import '../utils/latex_text.dart';
import '../utils/serbian_encoding_fix.dart';
import '../utils/reflow.dart';
import 'cpu_count.dart';
import 'djvu_parser.dart';
import 'ebook_parser.dart';

/// Границы глифа по горизонтали.
typedef GlyphBox = ({String text, double left, double right});

class _IsolateParams {
  final Uint8List bytes;
  final SendPort sendPort;
  _IsolateParams({required this.bytes, required this.sendPort});
}

class _PageWorkerParams {
  final Uint8List bytes;
  final int index;
  final int total;
  final SendPort sendPort;
  _PageWorkerParams({
    required this.bytes,
    required this.index,
    required this.total,
    required this.sendPort,
  });
}

/// Строки страниц, разобранных одним изолятом. Отдельный класс, а не голая
/// Map: по типу сообщения из порта его отличают от прогресса и ошибки.
class _PageChunk {
  final Map<int, List<LayoutLine>> pages;
  const _PageChunk(this.pages);
}

/// Извлечение текста из PDF/DOCX с прогрессом.
///
/// Нативно разбор идёт в отдельном изоляте (UI не фризится). На вебе изолятов
/// нет (dart:isolate не поддерживается), поэтому там разбираем в основном
/// потоке — та же чистая логика, просто без Isolate.
class DocumentParser {
  /// Расширения, которые приложение берётся открыть.
  static const supportedExtensions = [
    'pdf',
    'docx',
    'fb2',
    'epub',
    'djvu',
    'djv',
    'txt',
    'md',
    'html',
    'htm',
  ];

  /// Понимаем ли мы такой файл по имени.
  static bool isSupported(String fileName) =>
      supportedExtensions.contains(_extension(fileName));

  static String _extension(String fileName) {
    final lower = fileName.toLowerCase();
    // «книга.fb2.zip» — тот же FB2, просто в архиве.
    if (lower.endsWith('.fb2.zip')) return 'fb2';
    final dot = lower.lastIndexOf('.');
    return dot < 0 ? '' : lower.substring(dot + 1);
  }

  /// Разбирает файл, выбирая разбор по расширению.
  static Future<List<String>> parseAny(
    String fileName,
    Uint8List bytes,
    void Function(double progress) onProgress,
  ) async {
    switch (_extension(fileName)) {
      case 'pdf':
        return parsePdfWithProgress(bytes, onProgress);
      case 'docx':
        return parseDocxWithProgress(bytes, onProgress);
      case 'fb2':
        return EbookParser.parseFb2(bytes, onProgress);
      case 'epub':
        return EbookParser.parseEpub(bytes, onProgress);
      case 'djvu':
      case 'djv':
        return DjvuParser.parse(bytes, onProgress);
      case 'txt':
      case 'md':
        return EbookParser.parseTxt(bytes, onProgress);
      case 'html':
      case 'htm':
        return EbookParser.parseHtml(bytes, onProgress);
      default:
        throw Exception(
            'Неподдерживаемый формат. Открываются: ${supportedExtensions.join(', ')}');
    }
  }

  static Future<List<String>> parsePdf(Uint8List bytes) =>
      parsePdfWithProgress(bytes, (_) {});

  static Future<List<String>> parseDocx(Uint8List bytes) =>
      parseDocxWithProgress(bytes, (_) {});

  /// Сколько изолятов разбирают PDF одновременно.
  ///
  /// Извлечение текста целиком лежит в Syncfusion и занимает ~130 мс на
  /// страницу; на книге в 600 страниц это больше минуты в один поток. Страницы
  /// независимы, поэтому раздаём их через одну по номеру — так каждый изолят
  /// сам считает свой набор и главному потоку не нужно открывать документ.
  ///
  /// Потолок в 8 — из-за памяти: каждый изолят держит свою копию файла и свой
  /// разобранный документ.
  static int get _pdfWorkers => cpuCount.clamp(2, 8);

  static Future<List<String>> parsePdfWithProgress(
    Uint8List bytes,
    void Function(double progress) onProgress,
  ) async {
    if (kIsWeb) {
      return _parsePdfCoreWeb(bytes, onProgress); // веб — асинхронный разбор
    }

    final workers = _pdfWorkers;
    final progress = List<double>.filled(workers, 0);
    final chunks = await Future.wait([
      for (var i = 0; i < workers; i++)
        _spawnPageWorker(bytes, i, workers, (value) {
          progress[i] = value;
          onProgress(progress.reduce((a, b) => a + b) / workers);
        }),
    ]);

    final byPage = <int, List<LayoutLine>>{};
    for (final chunk in chunks) {
      byPage.addAll(chunk.pages);
    }
    final pageLines = [
      for (var i = 0; i < byPage.length; i++) byPage[i] ?? const <LayoutLine>[],
    ];
    final paragraphs = _assemble(pageLines);
    return paragraphs.isEmpty
        ? ['[Пустой документ или отсутствует текстовый слой]']
        : paragraphs;
  }

  static Future<_PageChunk> _spawnPageWorker(
    Uint8List bytes,
    int index,
    int total,
    void Function(double) onProgress,
  ) async {
    final receivePort = ReceivePort();
    final isolate = await Isolate.spawn(
      _pageWorker,
      _PageWorkerParams(
        bytes: bytes,
        index: index,
        total: total,
        sendPort: receivePort.sendPort,
      ),
    );
    final completer = Completer<_PageChunk>();
    receivePort.listen((message) {
      if (message is double) {
        onProgress(message);
      } else if (message is _PageChunk) {
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

  static void _pageWorker(_PageWorkerParams params) {
    PdfDocument? document;
    try {
      document = PdfDocument(inputBytes: params.bytes);
      final extractor = PdfTextExtractor(document);
      final pageCount = document.pages.count;
      final mine = (pageCount - params.index + params.total - 1) ~/ params.total;
      if (mine <= 0) {
        params.sendPort.send(1.0);
        params.sendPort.send(const _PageChunk({}));
        return;
      }
      final pages = <int, List<LayoutLine>>{};
      for (var i = params.index; i < pageCount; i += params.total) {
        pages[i] = _linesOfPage(extractor, i);
        params.sendPort.send(pages.length / mine);
      }
      params.sendPort.send(_PageChunk(pages));
    } catch (e) {
      params.sendPort.send(e.toString());
    } finally {
      document?.dispose();
    }
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

  static List<LayoutLine> _linesOfPage(PdfTextExtractor extractor, int index) {
    final lines = extractor.extractTextLines(
      startPageIndex: index,
      endPageIndex: index,
    );
    return [
      for (final line in lines)
        (
          text: _joinLine(line),
          left: line.bounds.left,
          right: line.bounds.right,
        ),
    ];
  }

  static String _joinLine(TextLine line) {
    final boxes = <GlyphBox>[];
    for (final word in line.wordCollection) {
      for (final glyph in word.glyphs) {
        boxes.add((
          text: glyph.text,
          left: glyph.bounds.left,
          right: glyph.bounds.right,
        ));
      }
    }
    final joined = joinGlyphs(boxes);
    return joined.isEmpty ? line.text.trim() : joined;
  }

  /// Доля ширины буквы, начиная с которой просвет считается пробелом.
  static const _spaceWidthRatio = 0.28;

  /// Собирает строку по геометрии глифов.
  ///
  /// Ни `word.text`, ни `line.text` доверять нельзя: в одних книгах каждая
  /// буква приходит отдельным «словом», в других пробелы стоят посреди слова
  /// («satim a»), а в третьих их нет вовсе. Просвет между соседними буквами —
  /// единственный признак, который в разобранных книгах не врал.
  @visibleForTesting
  static String joinGlyphs(List<GlyphBox> glyphs) {
    final visible = [
      for (final g in glyphs)
        if (g.text.trim().isNotEmpty) g,
    ];
    if (visible.isEmpty) return '';

    // Кегль строки брать нельзя: TextLine.fontSize в Библии равен единице при
    // тех же координатах. Меряем строку ей самой.
    final widths = [for (final g in visible) g.right - g.left]..sort();
    final median = widths[widths.length ~/ 2];
    if (median <= 0) return visible.map((g) => g.text).join();
    final threshold = median * _spaceWidthRatio;

    final ordered = _deduplicate(visible, median * _sameSpotRatio);
    final buffer = StringBuffer(ordered.first.text);
    for (var i = 1; i < ordered.length; i++) {
      if (ordered[i].left - ordered[i - 1].right > threshold) buffer.write(' ');
      buffer.write(ordered[i].text);
    }
    return buffer.toString();
  }

  /// Насколько близко должны стоять одинаковые буквы, чтобы счесть их дублем.
  static const _sameSpotRatio = 0.3;

  /// Убирает повторную отрисовку строки поверх себя же (встречается в Библии:
  /// «дана.šnjega dana.»). Заодно расставляет глифы слева направо — порядок
  /// отрисовки в PDF не обязан совпадать с порядком чтения.
  static List<GlyphBox> _deduplicate(List<GlyphBox> visible, double sameSpot) {
    final ordered = [...visible]
      ..sort((a, b) => a.left.compareTo(b.left));
    final result = <GlyphBox>[ordered.first];
    for (final g in ordered.skip(1)) {
      final previous = result.last;
      final samePlace = (g.left - previous.left).abs() <= sameSpot;
      if (samePlace && g.text == previous.text) continue;
      result.add(g);
    }
    return result;
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
    return splitLongParagraphs(paragraphs);
  }

  static Future<List<String>> _parsePdfCoreWeb(
      Uint8List bytes, void Function(double) onProgress) async {
    final List<String> paragraphs = [];
    PdfDocument? document;
    try {
      document = PdfDocument(inputBytes: bytes);
      final extractor = PdfTextExtractor(document);
      final pageCount = document.pages.count;
      // Строки хранятся по страницам: только так видно колонтитулы — строку,
      // повторяющуюся на каждой странице, внутри одной страницы от текста не
      // отличить.
      final pageLines = <List<LayoutLine>>[];
      for (var i = 0; i < pageCount; i++) {
        // Уступаем поток браузеру каждые 2 страницы, чтобы обновить UI и не зависнуть
        if (i % 2 == 0) {
          await Future.delayed(Duration.zero);
        }
        pageLines.add(_linesOfPage(extractor, i));
        if (pageCount > 0) onProgress((i + 1) / pageCount);
      }
      // Абзацы восстанавливаются из строк, а не берутся как есть: PDF хранит
      // разбиение на строки страницы, а не на абзацы, и без сборки читалка
      // показывала целую страницу одним кирпичом текста.
      paragraphs.addAll(_assemble(pageLines));
    } finally {
      document?.dispose();
    }
    if (paragraphs.isEmpty) {
      paragraphs.add('[Пустой документ или отсутствует текстовый слой]');
    }
    return paragraphs;
  }

  /// Общий финал разбора PDF: чистка LaTeX-мусора, сборка абзацев по
  /// геометрии и починка сербских букв, испорченных шрифтом.
  static List<String> _assemble(List<List<LayoutLine>> pages) {
    final cleaned = cleanLatexLayout(pages);
    return fixSerbianDocument(reflowDocumentWithLayout(cleaned));
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
    return splitLongParagraphs(paragraphs);
  }

}
