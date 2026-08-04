import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/utils/serbian_pronunciation.dart';

void main() {
  test('distinguishes Serbian Latin phonemes', () {
    expect(SerbianPronunciation.ipa('Čitač'), '/tʃitatʃ/');
    expect(SerbianPronunciation.ipa('đak'), '/dʑak/');
    expect(SerbianPronunciation.ipa('ljubav'), '/ʎubaʋ/');
    expect(SerbianPronunciation.ipa('džem'), '/dʒem/');
  });

  test('supports Serbian Cyrillic', () {
    expect(SerbianPronunciation.ipa('читање'), '/tʃitaɲe/');
    expect(SerbianPronunciation.ipa('љубав'), '/ʎubaʋ/');
  });
}
