import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/book_block.dart';
import 'package:srbski_read/services/pdf_images.dart';
import 'package:srbski_read/utils/reflow.dart';

LayoutLine line(String text) => (text: text, left: 50, right: 500);

void main() {
  const picture = PdfPlacedImage(page: 1, centerY: 300, pageHeight: 800, url: 'https://cdn/x.jpg');

  test('картинка встаёт между строками по высоте и режет абзац', () {
    final pages = [
      [line('Prva linija'), line('druga linija'), line('treća linija')],
    ];
    final tops = [
      [100.0, 200.0, 400.0],
    ];
    final marked = insertPdfImageMarks(pages, tops, [picture]);
    expect(marked.first, hasLength(4));
    expect(marked.first[2].text, isNot(contains('treća')));

    // Сборка абзацев склеивает строки — метка оказывается внутри абзаца.
    final glued = [marked.first.map((l) => l.text).join(' ')];
    final out = splitPdfImageMarks(glued, [picture]);
    expect(out, hasLength(3));
    expect(out[0], 'Prva linija druga linija');
    expect(parseBookBlock(out[1]).url, picture.url);
    expect(out[2], 'treća linija');
  });

  test('картинка ниже всех строк встаёт в конец страницы', () {
    final marked = insertPdfImageMarks([
      [line('jedina linija')],
    ], [
      [100.0],
    ], [picture]);
    expect(marked.first.last.text, isNot('jedina linija'));
  });

  test('без высот строк картинка встаёт по доле книги', () {
    final paragraphs = List.generate(10, (i) => 'abzac $i');
    // Вторая страница из двух, середина страницы — три четверти книги.
    final placed = placePdfImagesByShare(
      paragraphs,
      const PdfImages([PdfPlacedImage(page: 2, centerY: 400, pageHeight: 800, url: 'u')], 2),
    );
    expect(placed, hasLength(11));
    expect(placed.indexWhere((p) => !p.startsWith('abzac')), 8);
  });
}
