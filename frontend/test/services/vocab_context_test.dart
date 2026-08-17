import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/vocab_context.dart';

void main() {
  const book = [
    'Ovo je prvi pasus. Kuća je bila velika i tiha.',
    'Radost je ispunila grad, a rad se nastavio.',
    'Последња реченица помиње кућу поново.',
  ];

  group('пример из книги', () {
    test('находит предложение со словом', () {
      expect(findSentence(book, 'kuća'), 'Kuća je bila velika i tiha.');
    });

    // «rad» иначе нашёлся бы в «radost» и «gradu», и пример встал бы к чужому
    // слову — это хуже, чем никакого примера.
    test('не принимает слово внутри другого слова', () {
      expect(findSentence(['Radost je ispunila grad.'], 'rad'), isNull);
    });

    test('находит слово, записанное другим письмом', () {
      expect(findSentence(['Кућа је велика.'], 'kuća'), 'Кућа је велика.');
    });

    test('первое предложение, а не первое вхождение в абзаце', () {
      expect(findSentence(book, 'rad'), 'Radost je ispunila grad, a rad se nastavio.');
    });

    test('у фразы примера не ищет', () {
      expect(findSentence(book, 'mala kuća'), isNull);
    });

    test('слова нет в книге — примера нет', () {
      expect(findSentence(book, 'квазимодогенез'), isNull);
    });

    test('пустой запрос и пустая книга не ломают поиск', () {
      expect(findSentence([], 'kuća'), isNull);
      expect(findSentence(book, '   '), isNull);
    });

    // Обрывать предложение на полуслове значит спрятать как раз то место, ради
    // которого его искали.
    test('слишком длинное предложение не берётся', () {
      final long = '${'reč ' * 80}kuća.';
      expect(findSentence([long], 'kuća'), isNull);
    });

    test('за длинным предложением ищет дальше', () {
      final long = '${'reč ' * 80}kuća.';
      expect(findSentence([long, 'Kuća je tu.'], 'kuća'), 'Kuća je tu.');
    });
  });

  group('примеры для многих слов', () {
    test('находит каждому слову своё предложение', () {
      final found = findSentences(book, ['kuća', 'rad']);
      expect(found['kuća'], 'Kuća je bila velika i tiha.');
      expect(found['rad'], 'Radost je ispunila grad, a rad se nastavio.');
    });

    test('слова без примера в ответе не появляются', () {
      final found =
          findSentences(book, ['kuća', 'квазимодогенез', 'mala kuća', '']);
      expect(found.keys, ['kuća']);
    });

    test('ключ ответа — слово в том виде, в каком его дали', () {
      expect(findSentences(book, ['  KUĆA  ']).keys, ['KUĆA']);
    });
  });
}
