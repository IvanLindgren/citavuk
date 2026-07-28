/// Чтение текстового слоя DjVu.
///
/// DjVu — контейнер IFF: «AT&T», дальше FORM с вложенными чанками. Текст
/// страницы лежит в TXTa (как есть) или TXTz (сжатый BZZ); картинку страницы
/// приложение не рисует — читалке нужен только текст.
///
/// Скан без OCR текстового слоя не содержит вовсе, и честный ответ здесь —
/// сказать об этом, а не показать пустую книгу.
library;

import 'dart:convert';
import 'dart:typed_data';

import '../utils/reflow.dart';
import 'djvu/bzz.dart';

class DjvuParser {
  static List<String> parse(Uint8List bytes,
      [void Function(double)? onProgress]) {
    onProgress?.call(0.1);
    if (!_hasSignature(bytes)) {
      throw const FormatException('Это не DjVu-файл');
    }

    final texts = <String>[];
    _walk(bytes, 4, bytes.length, texts);
    onProgress?.call(0.8);

    if (texts.isEmpty) {
      throw const FormatException(
          'В этом DjVu нет текстового слоя — только картинки страниц. '
          'Такой файл нужно сначала распознать (OCR).');
    }

    final paragraphs = <String>[];
    for (final page in texts) {
      paragraphs.addAll(_pageParagraphs(page));
    }
    onProgress?.call(0.95);
    return paragraphs.isEmpty ? ['[Пустой DjVu]'] : paragraphs;
  }

  static bool _hasSignature(Uint8List bytes) =>
      bytes.length > 12 &&
      bytes[0] == 0x41 && // A
      bytes[1] == 0x54 && // T
      bytes[2] == 0x26 && // &
      bytes[3] == 0x54; // T

  /// Обходит чанки, спускаясь внутрь FORM.
  static void _walk(Uint8List bytes, int start, int end, List<String> out) {
    var offset = start;
    while (offset + 8 <= end) {
      final id = _ascii(bytes, offset, 4);
      final size = _uint32(bytes, offset + 4);
      final body = offset + 8;
      if (size < 0 || body + size > end) return;

      if (id == 'FORM') {
        // Первые 4 байта FORM — его подтип (DJVU, DJVM, DJVI).
        _walk(bytes, body + 4, body + size, out);
      } else if (id == 'TXTa') {
        out.add(_decodeText(Uint8List.sublistView(bytes, body, body + size)));
      } else if (id == 'TXTz') {
        try {
          final raw = bzzDecode(
              Uint8List.sublistView(bytes, body, body + size));
          out.add(_decodeText(raw));
        } on FormatException {
          // Одна битая страница не должна ронять всю книгу.
        }
      }

      // Чанки выравниваются по чётному смещению.
      offset = body + size + (size.isOdd ? 1 : 0);
    }
  }

  /// Тело текстового чанка: 24-битная длина, сам текст, дальше разметка зон.
  static String _decodeText(Uint8List body) {
    if (body.length < 3) return '';
    final length = (body[0] << 16) | (body[1] << 8) | body[2];
    final end = 3 + length <= body.length ? 3 + length : body.length;
    return utf8.decode(body.sublist(3, end), allowMalformed: true);
  }

  /// Мягкий перенос вместе с пробелами вокруг: «zdra­ vých» — это одно слово,
  /// разорванное вёрсткой страницы.
  static final _softHyphen = RegExp('\\s*\u00AD\\s*');

  static List<String> _pageParagraphs(String page) {
    final paragraphs = <String>[];
    for (final block in page.split(RegExp(r'\n[ \t]*\n'))) {
      // Внутри абзаца перевод строки — это конец строки на странице.
      final joined = block
          .replaceAll(_softHyphen, '')
          .replaceAll(RegExp(r'\s*\n\s*'), ' ')
          .trim();
      if (joined.isNotEmpty) paragraphs.add(joined);
    }
    return splitLongParagraphs(paragraphs);
  }

  static String _ascii(Uint8List bytes, int offset, int length) =>
      String.fromCharCodes(bytes.sublist(offset, offset + length));

  static int _uint32(Uint8List bytes, int offset) =>
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
}
