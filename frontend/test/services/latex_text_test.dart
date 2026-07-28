import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/utils/latex_text.dart';

void main() {
  group('composeAccents', () {
    test('знак после буквы собирается в одну букву', () {
      expect(composeAccents('cˇovek'), 'čovek');
      expect(composeAccents('nasˇ'), 'naš');
    });

    test('знак перед буквой тоже собирается', () {
      expect(composeAccents('ˇcovek'), 'čovek');
    });

    test('лигатуры разворачиваются', () {
      expect(composeAccents('ﬁnale'), 'finale');
      expect(composeAccents('aﬄuent'), 'affluent');
    });

    test('обычный текст не меняется', () {
      expect(composeAccents('Читав сам књигу'), 'Читав сам књигу');
      expect(composeAccents('već pročitano'), 'već pročitano');
    });
  });

  group('looksLikeFormula', () {
    test('формула распознаётся', () {
      expect(looksLikeFormula(r'x = ∑ a i b i + 1'), isTrue);
      expect(looksLikeFormula('f (x) = √ x 2 + 1'), isTrue);
    });

    test('обычное предложение — не формула', () {
      expect(looksLikeFormula('Ово је реченица на српском језику.'), isFalse);
      expect(looksLikeFormula('Vrednost je jednaka nuli.'), isFalse);
    });

    test('предложение со знаком равенства остаётся текстом', () {
      expect(
          looksLikeFormula('Тако добијамо да је број x = 5 решење задатка.'),
          isFalse);
    });
  });

  group('cleanLatexDocument', () {
    test('в художественном тексте строки не выбрасываются', () {
      final pages = [
        ['— Здраво! — рече он.', '1918', 'Пошли смо кући.'],
      ];
      expect(cleanLatexDocument(pages).first.length, 3);
    });

    test('в техническом тексте формулы уходят, а текст остаётся', () {
      final pages = [
        [
          r'Neka je x = ∑ i a i',
          'Ovo je obična rečenica koja objašnjava formulu.',
          r'y = √ x 2 ≈ z',
          r'∫ f (x) d x = F (x) (3.14)',
        ],
      ];
      final cleaned = cleanLatexDocument(pages).first;
      expect(cleaned, ['Ovo je obična rečenica koja objašnjava formulu.']);
    });

    test('диакритика собирается в обоих режимах', () {
      final pages = [
        ['nasˇ tekst', 'cˇovek']
      ];
      expect(cleanLatexDocument(pages).first, ['naš tekst', 'čovek']);
    });
  });
}
