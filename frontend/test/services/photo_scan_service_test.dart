import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/photo_scan_service.dart';

void main() {
  group('название книги со снимка', () {
    test('берётся первая строка первого абзаца', () {
      expect(
        photoBookTitle(
            ['OBAVEŠTENJE\nSutra nema vode', 'Hvala na razumevanju']),
        'OBAVEŠTENJE',
      );
    });

    test('пустой абзац пропускается', () {
      expect(photoBookTitle(['   ', '\n', 'Radno vreme']), 'Radno vreme');
    });

    // «Снимок 17» в библиотеке не говорит ничего, но и полстраницы вместо
    // названия в список не влезут.
    test('длинная строка обрезается', () {
      final title = photoBookTitle(['а' * 200]);
      expect(title.length, lessThanOrEqualTo(61));
      expect(title, endsWith('…'));
    });

    test('брать нечего — остаётся запасное', () {
      expect(photoBookTitle(const []), 'Снимок');
      expect(photoBookTitle(['  ', ''], fallback: 'Кадр'), 'Кадр');
    });
  });
}
