/// Разбор книжных форматов, кроме PDF и DOCX: FB2, EPUB, TXT, HTML.
///
/// Все они дают текст напрямую, поэтому геометрия глифов и склейка строк, как
/// в PDF, здесь не нужны — достаточно вытащить абзацы в порядке чтения.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:xml/xml.dart' as xml;

import '../utils/legacy_encodings.dart';
import '../utils/reflow.dart';

class EbookParser {
  /// FB2 — XML с телом из секций. Внутри `.fb2.zip` лежит тот же XML.
  static List<String> parseFb2(Uint8List bytes,
      [void Function(double)? onProgress]) {
    onProgress?.call(0.1);
    final source = _looksLikeZip(bytes) ? _firstZipEntry(bytes) : bytes;
    final text = decodeXmlBytes(source);
    onProgress?.call(0.4);

    final document = xml.XmlDocument.parse(text);
    final bodies = document.findAllElements('body').toList();
    if (bodies.isEmpty) return ['[В FB2 нет тела книги]'];

    final paragraphs = <String>[];
    for (final body in bodies) {
      // Сноски идут отдельным body с name="notes" — в конец, после текста.
      if (body.getAttribute('name') == 'notes' && bodies.length > 1) continue;
      _collectFb2(body, paragraphs);
    }
    onProgress?.call(0.9);
    if (paragraphs.isEmpty) return ['[Пустой FB2]'];
    return splitLongParagraphs(paragraphs);
  }

  static void _collectFb2(xml.XmlElement node, List<String> out) {
    for (final child in node.children.whereType<xml.XmlElement>()) {
      switch (child.name.local) {
        case 'p':
        case 'v': // строка стиха
        case 'subtitle':
        case 'text-author':
          final text = _flatten(child);
          if (text.isNotEmpty) out.add(text);
        case 'empty-line':
          break;
        case 'binary':
        case 'image':
          break;
        case 'title':
          final text = _flatten(child);
          if (text.isNotEmpty) out.add(text);
        default:
          _collectFb2(child, out);
      }
    }
  }

  /// EPUB — zip с XHTML-главами; порядок чтения задаёт spine в OPF.
  static List<String> parseEpub(Uint8List bytes,
      [void Function(double)? onProgress]) {
    onProgress?.call(0.05);
    final archive = ZipDecoder().decodeBytes(bytes);
    final files = {for (final f in archive.files) f.name: f};

    final opfPath = _opfPath(files);
    if (opfPath == null) return ['[В EPUB не найден OPF-файл]'];
    final opf = xml.XmlDocument.parse(_text(files[opfPath]!));
    final base = opfPath.contains('/')
        ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
        : '';

    final hrefById = <String, String>{};
    for (final item in opf.findAllElements('item')) {
      final id = item.getAttribute('id');
      final href = item.getAttribute('href');
      if (id != null && href != null) hrefById[id] = href;
    }
    final chapters = [
      for (final ref in opf.findAllElements('itemref'))
        if (hrefById[ref.getAttribute('idref')] != null)
          hrefById[ref.getAttribute('idref')]!,
    ];

    final paragraphs = <String>[];
    for (var i = 0; i < chapters.length; i++) {
      final path = _resolve(base, chapters[i]);
      final file = files[path] ?? files[Uri.decodeFull(path)];
      if (file == null) continue;
      paragraphs.addAll(_htmlParagraphs(_text(file)));
      onProgress?.call(0.05 + 0.9 * (i + 1) / chapters.length);
    }
    if (paragraphs.isEmpty) return ['[Пустой EPUB]'];
    return splitLongParagraphs(paragraphs);
  }

  /// Простой текст: абзацы разделены пустой строкой либо переводом строки.
  static List<String> parseTxt(Uint8List bytes,
      [void Function(double)? onProgress]) {
    onProgress?.call(0.2);
    final text = _decodeText(bytes);
    final blocks = text.split(RegExp(r'\n[ \t]*\n'));
    final paragraphs = <String>[];
    for (final block in blocks) {
      // Внутри абзаца переводы строк — это вёрстка по 60–80 знаков, а не
      // границы абзацев.
      final joined = block.replaceAll(RegExp(r'\s*\n\s*'), ' ').trim();
      if (joined.isNotEmpty) paragraphs.add(joined);
    }
    onProgress?.call(0.9);
    if (paragraphs.isEmpty) return ['[Пустой файл]'];
    return splitLongParagraphs(paragraphs);
  }

  static List<String> parseHtml(Uint8List bytes,
      [void Function(double)? onProgress]) {
    onProgress?.call(0.2);
    final paragraphs = _htmlParagraphs(_decodeText(bytes));
    onProgress?.call(0.9);
    if (paragraphs.isEmpty) return ['[Пустая страница]'];
    return splitLongParagraphs(paragraphs);
  }

  // ---------------------------------------------------------------------------

  static bool _looksLikeZip(Uint8List bytes) =>
      bytes.length > 4 && bytes[0] == 0x50 && bytes[1] == 0x4B;

  static Uint8List _firstZipEntry(Uint8List bytes) {
    final archive = ZipDecoder().decodeBytes(bytes);
    for (final file in archive.files) {
      if (file.isFile && file.name.toLowerCase().endsWith('.fb2')) {
        return _content(file);
      }
    }
    final first = archive.files.firstWhere((f) => f.isFile);
    return _content(first);
  }

  /// Содержимое записи zip.
  ///
  /// `file.content` на вебе уводит в inflateBuffer, которому нужен dart:io или
  /// dart:html; в WASM нет ни того, ни другого. Распаковываем сами — так же,
  /// как это делает разбор DOCX.
  static Uint8List _content(ArchiveFile file) {
    final raw = file.rawContent;
    if (raw == null) return Uint8List.fromList(file.content as List<int>);
    final bytes = raw.toUint8List();
    return file.compressionType == ArchiveFile.DEFLATE
        ? Uint8List.fromList(Inflate(bytes).getBytes())
        : bytes;
  }

  static String _text(ArchiveFile file) => decodeXmlBytes(_content(file));

  static String _decodeText(Uint8List bytes) {
    if (bytes.length >= 3 &&
        bytes[0] == 0xEF &&
        bytes[1] == 0xBB &&
        bytes[2] == 0xBF) {
      return utf8.decode(bytes.sublist(3), allowMalformed: true);
    }
    // Сначала честный UTF-8; если байты ему не соответствуют, файл почти
    // наверняка в windows-1251 — так до сих пор лежит половина русских txt.
    try {
      return utf8.decode(bytes);
    } on FormatException {
      return decodeBytes(bytes, 'windows-1251');
    }
  }

  static String? _opfPath(Map<String, ArchiveFile> files) {
    final container = files['META-INF/container.xml'];
    if (container != null) {
      final doc = xml.XmlDocument.parse(_text(container));
      final root = doc.findAllElements('rootfile').firstOrNull;
      final path = root?.getAttribute('full-path');
      if (path != null && files.containsKey(path)) return path;
    }
    return files.keys.where((k) => k.toLowerCase().endsWith('.opf')).firstOrNull;
  }

  static String _resolve(String base, String href) {
    final clean = href.split('#').first;
    if (clean.startsWith('/')) return clean.substring(1);
    final joined = '$base$clean';
    // Свернуть «../» — иначе запись в архиве не найдётся.
    final parts = <String>[];
    for (final part in joined.split('/')) {
      if (part == '.' || part.isEmpty) continue;
      if (part == '..') {
        if (parts.isNotEmpty) parts.removeLast();
        continue;
      }
      parts.add(part);
    }
    return parts.join('/');
  }

  static final _blockTags = RegExp(
      r'</?(p|div|br|h[1-6]|li|tr|blockquote|section|article|figcaption)\b[^>]*>',
      caseSensitive: false);
  static final _dropTags = RegExp(
      r'<(script|style|head)\b[^>]*>.*?</\1>',
      caseSensitive: false,
      dotAll: true);
  static final _anyTag = RegExp(r'<[^>]+>');

  /// Метка границы абзаца: делить по пробелу нельзя — распадутся слова.
  static const _break = '\u0000';

  static List<String> _htmlParagraphs(String html) {
    final withoutNoise = html.replaceAll(_dropTags, ' ');
    // Блочные теги становятся границами абзацев, остальные просто снимаются.
    final marked = withoutNoise.replaceAll(_blockTags, _break);
    final stripped = marked.replaceAll(_anyTag, '');
    final out = <String>[];
    for (final chunk in stripped.split(_break)) {
      final text = _unescape(chunk).replaceAll(RegExp(r'\s+'), ' ').trim();
      if (text.isNotEmpty) out.add(text);
    }
    return out;
  }

  static const _entities = {
    'nbsp': ' ',
    'amp': '&',
    'lt': '<',
    'gt': '>',
    'quot': '"',
    'apos': "'",
    'laquo': '«',
    'raquo': '»',
    'mdash': '—',
    'ndash': '–',
    'hellip': '…',
    'shy': '',
  };

  static String _unescape(String text) {
    return text.replaceAllMapped(RegExp(r'&(#x?[0-9a-fA-F]+|\w+);'), (m) {
      final body = m.group(1)!;
      if (body.startsWith('#')) {
        final isHex = body.length > 1 && (body[1] == 'x' || body[1] == 'X');
        final code =
            int.tryParse(isHex ? body.substring(2) : body.substring(1),
                radix: isHex ? 16 : 10);
        return code == null ? m.group(0)! : String.fromCharCode(code);
      }
      return _entities[body.toLowerCase()] ?? m.group(0)!;
    });
  }

  /// Текст элемента вместе с вложенными `<emphasis>`, `<strong>` и ссылками.
  static String _flatten(xml.XmlElement element) =>
      element.innerText.replaceAll(RegExp(r'\s+'), ' ').trim();
}
