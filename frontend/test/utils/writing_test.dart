import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/utils/writing.dart';

/// Правила отбора слов обязаны совпадать с `web/src/lib/writing.ts`: карточки
/// синхронизируются, и слово, доступное для письма на телефоне, должно быть
/// доступно и в браузере. Примеры здесь намеренно те же.
void main() {
  group('повторение письмом', () {
    test('берёт отдельные слова', () {
      for (final word in ['kuća', 'књига', 'razumeti', 'ђак']) {
        expect(writable(word), isTrue, reason: word);
      }
    });

    // Фразы отсеиваются намеренно: писать рукой предложение долго, и
    // вспоминается оно не так, как слово.
    test('не берёт фразы', () {
      for (final phrase in [
        'dobar dan',
        'како сте',
        'ja sam student',
        '  ',
        '',
      ]) {
        expect(writable(phrase), isFalse, reason: phrase);
      }
    });

    test('не берёт слишком короткое и слишком длинное', () {
      expect(writable('a'), isFalse);
      expect(writable('a' * 25), isFalse);
      expect(writable('a' * 24), isTrue);
    });

    // Сербская диакритика — одна кодовая точка, но обычный split по индексу
    // разрубил бы суррогатную пару.
    test('делит слово по видимым буквам', () {
      expect(wordLetters('kuća'), ['k', 'u', 'ć', 'a']);
      expect(wordLetters('ђак'), ['ђ', 'а', 'к']);
      expect(wordLetters('čas'), ['č', 'a', 's']);
    });
  });
}
