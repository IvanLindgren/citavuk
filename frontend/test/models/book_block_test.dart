import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/book_block.dart';

/// Формат блоков обязан совпадать с `web/src/lib/blocks.ts`: книга с
/// картинкой, добавленная в браузере, открывается в приложении и наоборот.
/// Разойдись разбор — и вместо иллюстрации читатель увидит строку со
/// служебной меткой.
///
/// Примеры здесь намеренно те же, что в `web/src/lib/blocks.test.ts`.
void main() {
  group('блоки книги', () {
    test('картинка переживает запись и разбор', () {
      final block = parseBookBlock(
        imageParagraph('https://cdn/pic.webp', 'Карта Сербии'),
      );
      expect(block.kind, BookBlockKind.image);
      expect(block.url, 'https://cdn/pic.webp');
      expect(block.text, 'Карта Сербии');
    });

    test('таблица переживает запись и разбор', () {
      final rows = [
        ['Падеж', 'Единственное', 'Множественное'],
        ['Номинатив', 'кућа', 'куће'],
      ];
      final block = parseBookBlock(tableParagraph(rows));
      expect(block.kind, BookBlockKind.table);
      expect(block.rows, rows);
    });

    test('обычный текст остаётся текстом', () {
      final block = parseBookBlock('Ово је обичан пасус.');
      expect(block.kind, BookBlockKind.text);
      expect(block.text, 'Ово је обичан пасус.');
      expect(isBookBlock('Ово је обичан пасус.'), isFalse);
    });

    // Абзац приходит из базы и с другого устройства: книга обязана открыться
    // при любом его содержимом, а не показать пустой экран.
    test('битая метка показывается текстом, а не ломает читалку', () {
      const broken = [
        '\u0000citavuk:image\n',
        '\u0000citavuk:image',
        '\u0000citavuk:table\n',
        '\u0000citavuk:table\n\t\t',
        '\u0000citavuk:выдумка\nчто-то',
        '\u0000',
      ];
      for (final paragraph in broken) {
        expect(parseBookBlock(paragraph).kind, BookBlockKind.text,
            reason: paragraph);
      }
    });

    test('таблица не разъезжается от табуляции внутри ячейки', () {
      final block = parseBookBlock(
        tableParagraph([
          ['первая\tвторая', 'третья\nчетвёртая'],
        ]),
      );
      expect(block.rows, [
        ['первая вторая', 'третья четвёртая'],
      ]);
    });

    test('перевод подставляется в ячейки на свои места', () {
      final block = parseBookBlock(tableParagraph([
        ['one', 'two'],
        ['three', 'four'],
      ]));
      final translated = withTranslation(
        block,
        ['jedan', 'dva', 'tri', 'četiri'],
      );
      expect(parseBookBlock(translated).rows, [
        ['jedan', 'dva'],
        ['tri', 'četiri'],
      ]);
    });

    // Адрес картинки — не текст. Отправить его переводчику значит получить
    // битую ссылку вместо иллюстрации.
    test('адрес картинки не уходит в перевод', () {
      final block = parseBookBlock(
        imageParagraph('https://cdn/pic.webp', 'Map of Serbia'),
      );
      expect(translatableText(block), ['Map of Serbia']);

      final translated = parseBookBlock(
        withTranslation(block, ['Карта Србије']),
      );
      expect(translated.url, 'https://cdn/pic.webp');
      expect(translated.text, 'Карта Србије');
    });

    test('служебная разметка не считается текстом документа', () {
      final paragraphs = [
        'Prvi pasus.',
        imageParagraph('https://cdn/очень-длинный-адрес.webp', 'Мапа'),
        tableParagraph([
          ['a', 'b'],
        ]),
      ];
      expect(plainParagraphs(paragraphs), ['Prvi pasus.', 'Мапа', 'a', 'b']);
      expect(countBookChars(paragraphs), 'Prvi pasus.'.length + 4 + 2);
    });
  });
}
