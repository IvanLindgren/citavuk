import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/book_block.dart';
import 'package:srbski_read/utils/pages.dart';

/// Разбиение обязано совпадать с `web/src/lib/pages.ts`: книга, открытая на
/// телефоне и в браузере, должна листаться одинаково, иначе «я остановился на
/// двенадцатой странице» значит на разных устройствах разное.
///
/// Примеры здесь намеренно те же, что в `web/src/lib/pages.test.ts`.

/// Абзац из [count] предложений примерно по 100 знаков.
String longParagraph(int count) {
  const sentence =
      'Ovo je duga rečenica o kući sa baštom koja se nalazi na kraju sela pored reke. ';
  return (sentence * count).trimRight();
}

void main() {
  group('разбиение на страницы', () {
    test('склеивается обратно знак в знак', () {
      final paragraph = longParagraph(60);
      expect(splitParagraph(paragraph).join(), paragraph);
    });

    test('ни одна страница не выходит за предел', () {
      // Одна глава одним абзацем — так приходят книги из публичной библиотеки.
      final pages = paginate([longParagraph(400)]);
      expect(pages.length, greaterThan(10));
      for (final page in pages) {
        expect(page.texts.join().length, lessThanOrEqualTo(pageChars));
      }
    });

    // Прежнее поведение: длинный абзац выталкивал недобранную страницу и сам
    // становился страницей на десятки тысяч знаков.
    test('короткий абзац рядом с огромным не остаётся один на странице', () {
      final pages = paginate(['Kratak uvod.', longParagraph(200)]);
      expect(pages.first.texts.length, greaterThan(1));
    });

    test('страницы помнят, с какого абзаца начались', () {
      final pages =
          paginate(['Prvi.', 'Drugi.', longParagraph(100), 'Poslednji.']);
      final starts = pages.map((page) => page.start).toList();

      expect(starts.first, 0);
      // Курсор не пятится: иначе «продолжить чтение» отправляло бы назад.
      expect(starts, orderedEquals(([...starts]..sort())));
      // Разрыв внутри одного абзаца — несколько страниц ссылаются на него.
      expect(starts.where((start) => start == 2).length, greaterThan(1));
      // Последний абзац дописан к последней странице, а не выброшен.
      expect(pages.last.texts.last, contains('Poslednji.'));
    });

    test('разрыв проходит между предложениями, а не внутри них', () {
      for (final piece in splitParagraph(longParagraph(60))) {
        expect(piece.trimRight(), matches(RegExp(r'[.!?…]$')));
      }
    });

    test('текст без единого знака конца всё равно режется', () {
      final wall = ('reč ' * 2000).trimRight();
      final pieces = splitParagraph(wall);
      expect(pieces.length, greaterThan(1));
      expect(pieces.join(), wall);
      for (final piece in pieces) {
        expect(piece.length, lessThanOrEqualTo(pageChars));
      }
    });

    // Слово длиннее страницы разорвать больше нечем, но зациклиться нельзя.
    test('слово длиннее страницы не подвешивает разбиение', () {
      final word = 'a' * (pageChars * 3);
      final pieces = splitParagraph(word);
      expect(pieces.join(), word);
      for (final piece in pieces) {
        expect(piece.length, lessThanOrEqualTo(pageChars));
      }
    });

    // Картинка и таблица — цельные объекты: разрезать их значит показать
    // половину адреса файла вместо иллюстрации.
    test('картинка и таблица не режутся', () {
      final image = imageParagraph(
          'https://cdn/${'x' * (pageChars * 2)}.webp', 'Мапа');
      expect(splitParagraph(image), [image]);

      final table = tableParagraph([
        ['a' * pageChars, 'b'],
      ]);
      expect(splitParagraph(table), [table]);
    });

    test('пустая книга даёт ноль страниц', () {
      expect(paginate([]), isEmpty);
    });
  });
}
