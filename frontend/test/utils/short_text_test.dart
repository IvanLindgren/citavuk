import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/utils/short_text.dart';

void main() {
  group('короткая подпись', () {
    test('снимает тире и кавычки, с которых начинается реплика', () {
      expect(shortPhrase('- Molim vas'), 'Molim vas');
      expect(shortPhrase('«Niko od nas»', words: 3), 'Niko od nas»');
      expect(shortPhrase('— Dobar dan'), 'Dobar dan');
    });

    test('обрезает длинное по словам', () {
      expect(shortPhrase('jedan dva tri'), 'jedan dva…');
      expect(shortPhrase('jedan dva'), 'jedan dva');
    });

    test('пустой текст и одни знаки дают пустую строку', () {
      expect(shortPhrase('   '), '');
      expect(shortPhrase('—'), '');
    });
  });

  group('одиночное слово', () {
    test('слово с ведущим знаком всё равно слово', () {
      expect(isSingleWord('dosadnog'), isTrue);
      expect(isSingleWord('- Molim'), isTrue);
    });

    test('фраза словом не считается', () {
      expect(isSingleWord('- Molim vas'), isFalse);
      expect(isSingleWord('Niko od nas'), isFalse);
    });

    test('пустое не считается', () {
      expect(isSingleWord('  '), isFalse);
      expect(isSingleWord('«»'), isFalse);
    });
  });
}
