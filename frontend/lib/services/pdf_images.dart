import 'package:flutter/foundation.dart';

import '../models/book_block.dart';
import '../utils/reflow.dart';
import 'api_client.dart';

/// Картинки из PDF.
///
/// Отрисовщика PDF в приложении нет, поэтому картинки достаёт Go-сервер
/// (`POST /v1/books/pdf-images`) и сразу кладёт в хранилище; сюда приходят
/// адреса и место: страница и высота середины от верха страницы.
///
/// Встают они двумя способами:
///   * текст разобран здесь — по высоте строк, точно между ними;
///   * текст разобрал сервер — высот строк у него нет, и картинка ставится по
///     доле книги. Для романа с иллюстрациями этого хватает, в учебнике она
///     может сдвинуться на абзац.
///
/// Метка картинки — символы частной области Unicode, без букв и цифр: иначе
/// сборка абзацев приняла бы её за номер страницы и выбросила. Тот же приём,
/// что на сайте (web/src/lib/pdfImages.ts).
class PdfPlacedImage {
  const PdfPlacedImage({
    required this.page,
    required this.centerY,
    required this.pageHeight,
    required this.url,
  });

  /// Номер страницы с единицы.
  final int page;
  final double centerY;
  final double pageHeight;
  final String url;
}

class PdfImages {
  const PdfImages(this.images, this.pages);
  static const empty = PdfImages([], 0);

  final List<PdfPlacedImage> images;
  final int pages;
}

/// Спрашивает сервер. Неудача — книга без картинок, а не ошибка импорта:
/// текст важнее иллюстраций. Без аккаунта не спрашивает вовсе — сохранить
/// картинки некуда.
Future<PdfImages> fetchPdfImages(ApiClient api, Uint8List bytes, String name) async {
  if (api.token == null) return PdfImages.empty;
  try {
    final result = await api.postFile('/v1/books/pdf-images',
        field: 'file',
        bytes: bytes,
        filename: name,
        mime: 'application/pdf',
        timeout: const Duration(minutes: 3));
    if (result is! Map) return PdfImages.empty;
    return _parse(result['images'], result['pages']);
  } catch (e) {
    debugPrint('картинки из PDF не достались: $e');
    return PdfImages.empty;
  }
}

const _mark = '';
const _markBase = 0xE100;
final _markPattern = RegExp('([-])');

String _markOf(int index) => '$_mark${String.fromCharCode(_markBase + index)}$_mark';

/// Вставляет метки картинок между строками страниц по высоте.
///
/// [tops] — высота каждой строки от верха страницы, в том же порядке, что
/// строки в [pages].
List<List<LayoutLine>> insertPdfImageMarks(
  List<List<LayoutLine>> pages,
  List<List<double>> tops,
  List<PdfPlacedImage> images,
) {
  if (images.isEmpty) return pages;
  final out = <List<LayoutLine>>[];
  for (var p = 0; p < pages.length; p++) {
    final page = pages[p];
    final pageTops = p < tops.length ? tops[p] : const <double>[];
    final mine = [
      for (var i = 0; i < images.length; i++)
        if (images[i].page == p + 1) i,
    ]..sort((a, b) => images[a].centerY.compareTo(images[b].centerY));
    if (mine.isEmpty) {
      out.add(page);
      continue;
    }
    final lefts = [for (final line in page) line.left]..sort();
    final left = lefts.isEmpty ? 0.0 : lefts[lefts.length ~/ 2];
    LayoutLine markLine(int index) => (text: _markOf(index), left: left, right: left);

    final lines = <LayoutLine>[];
    var next = 0;
    for (var i = 0; i < page.length; i++) {
      final top = i < pageTops.length ? pageTops[i] : 0.0;
      // Картинка встаёт перед первой строкой, что ниже её середины.
      while (next < mine.length && top > images[mine[next]].centerY) {
        lines.add(markLine(mine[next++]));
      }
      lines.add(page[i]);
    }
    while (next < mine.length) {
      lines.add(markLine(mine[next++]));
    }
    out.add(lines);
  }
  return out;
}

/// Режет абзацы по меткам: «текст ⟨метка⟩ текст» — три абзаца, средний картинка.
List<String> splitPdfImageMarks(List<String> paragraphs, List<PdfPlacedImage> images) {
  final out = <String>[];
  for (final paragraph in paragraphs) {
    if (!paragraph.contains(_mark)) {
      out.add(paragraph);
      continue;
    }
    var last = 0;
    for (final match in _markPattern.allMatches(paragraph)) {
      final before = paragraph.substring(last, match.start).trim();
      if (before.isNotEmpty) out.add(before);
      final index = match.group(1)!.codeUnitAt(0) - _markBase;
      if (index >= 0 && index < images.length) out.add(imageParagraph(images[index].url));
      last = match.end;
    }
    final rest = paragraph.substring(last).replaceAll(_mark, '').trim();
    if (rest.isNotEmpty) out.add(rest);
  }
  return out;
}

/// Ставит картинки по доле книги, когда высот строк нет (текст разобрал сервер).
List<String> placePdfImagesByShare(List<String> paragraphs, PdfImages found) {
  if (found.images.isEmpty || found.pages <= 0 || paragraphs.isEmpty) return paragraphs;
  final at = <int, List<String>>{};
  for (final image in found.images) {
    final within = image.pageHeight > 0 ? (image.centerY / image.pageHeight).clamp(0.0, 1.0) : 0.5;
    final share = ((image.page - 1) + within) / found.pages;
    final index = (share * paragraphs.length).round().clamp(0, paragraphs.length);
    (at[index] ??= []).add(imageParagraph(image.url));
  }
  return [
    for (var i = 0; i <= paragraphs.length; i++) ...[
      ...?at[i],
      if (i < paragraphs.length) paragraphs[i],
    ],
  ];
}

/// Картинки из ответа /v1/books/pdf-import (там число страниц — imagePages:
/// поле pages занято ответом бэкенда о тексте).
PdfImages pdfImagesFrom(Object? result) =>
    result is Map ? _parse(result['images'], result['imagePages']) : PdfImages.empty;

PdfImages _parse(Object? list, Object? pages) => PdfImages([
      if (list is List)
        for (final item in list)
          if (item is Map && (item['url'] as String? ?? '').isNotEmpty)
            PdfPlacedImage(
              page: (item['page'] as num?)?.toInt() ?? 0,
              centerY: (item['centerY'] as num?)?.toDouble() ?? 0,
              pageHeight: (item['pageHeight'] as num?)?.toDouble() ?? 0,
              url: item['url'] as String,
            ),
    ], (pages as num?)?.toInt() ?? 0);
