/// Картинки и таблицы внутри книги.
///
/// Книга хранится списком абзацев-строк, и трогать эту модель нельзя. Её адрес
/// при синхронизации считается от абзацев байт в байт тремя реализациями сразу
/// (см. §8a AGENTS.md), а сам протокол синхронизации знает только список строк.
/// Замена списка строк на список типизированных блоков означала бы новую
/// версию протокола, новый расчёт адреса и разъезд трёх клиентов — ради двух
/// видов содержимого, которые прекрасно укладываются в строку.
///
/// Поэтому картинка и таблица остаются абзацами, но с меткой в начале. Метка
/// начинается с U+0000: этого символа в тексте книги не бывает никогда — ни
/// один разборщик документов его не выдаёт, а если бы и выдал, читалка всё
/// равно показала бы пустое место.
///
/// **Формат обязан совпадать с `web/src/lib/blocks.ts`.** Книга с картинкой,
/// добавленная в браузере, открывается в приложении и наоборот; разойдись
/// разбор — и вместо иллюстрации читатель увидит строку со служебной меткой.
library;

/// Начало любой метки блока. В обычном тексте не встречается.
const String _marker = '\u0000citavuk:';

const String _imageMarker = '${_marker}image\n';
const String _tableMarker = '${_marker}table\n';

enum BookBlockKind { text, image, table }

class BookBlock {
  final BookBlockKind kind;

  /// Текст абзаца. Для картинки — подпись, для таблицы пусто.
  final String text;

  /// Адрес картинки.
  final String url;

  /// Ряды таблицы. Первый ряд — заголовок.
  final List<List<String>> rows;

  const BookBlock.text(this.text)
      : kind = BookBlockKind.text,
        url = '',
        rows = const [];

  const BookBlock.image({required this.url, this.text = ''})
      : kind = BookBlockKind.image,
        rows = const [];

  const BookBlock.table(this.rows)
      : kind = BookBlockKind.table,
        text = '',
        url = '';

  bool get isText => kind == BookBlockKind.text;
}

/// Есть ли в абзаце метка блока.
bool isBookBlock(String paragraph) => paragraph.startsWith(_marker);

/// Разбирает абзац.
///
/// Разбор обязан быть устойчивым: абзац приходит из базы и с другого
/// устройства, и книга должна открыться при любом его содержимом. Всё, что не
/// разобралось, показывается обычным текстом — так читатель хотя бы увидит,
/// что там было.
BookBlock parseBookBlock(String paragraph) {
  if (paragraph.startsWith(_imageMarker)) {
    final parts = paragraph.substring(_imageMarker.length).split('\n');
    final url = parts.isEmpty ? '' : parts.first;
    if (url.isEmpty) return const BookBlock.text('');
    return BookBlock.image(
      url: url,
      text: parts.skip(1).join(' ').trim(),
    );
  }

  if (paragraph.startsWith(_tableMarker)) {
    final rows = paragraph
        .substring(_tableMarker.length)
        .split('\n')
        .map((row) => row.split('\t'))
        .toList();
    // Таблица без ячеек — не таблица. Пустая рамка в читалке выглядит как сбой
    // вёрстки, поэтому такой абзац лучше просто пропустить.
    final empty = rows.every(
      (row) => row.every((cell) => cell.trim().isEmpty),
    );
    if (rows.isEmpty || empty) return const BookBlock.text('');
    return BookBlock.table(rows);
  }

  return BookBlock.text(paragraph);
}

/// Приводит ячейку к виду, пригодному для хранения.
///
/// Табуляция и перевод строки разделяют ячейки и ряды, поэтому внутри ячейки
/// их быть не может. Экранирование здесь было бы лишней сложностью: в ячейке
/// книжной таблицы перенос строки — это вёрстка, а не смысл.
String _cleanCell(String value) => value
    .replaceAll(RegExp(r'[\t\n\r]+'), ' ')
    .replaceAll(RegExp(r'\s{2,}'), ' ')
    .trim();

/// Собирает абзац-картинку.
String imageParagraph(String url, [String alt = '']) =>
    '$_imageMarker${_cleanCell(url)}\n${_cleanCell(alt)}';

/// Собирает абзац-таблицу.
String tableParagraph(List<List<String>> rows) =>
    _tableMarker +
    rows.map((row) => row.map(_cleanCell).join('\t')).join('\n');

/// Строки блока, которые имеет смысл переводить.
///
/// Адрес картинки переводить нельзя — получилась бы битая ссылка. Ячейки
/// таблицы переводить нужно: таблица в учебнике обычно и есть самое ценное.
List<String> translatableText(BookBlock block) {
  switch (block.kind) {
    case BookBlockKind.text:
      return [block.text];
    case BookBlockKind.image:
      return [block.text];
    case BookBlockKind.table:
      return block.rows.expand((row) => row).toList();
  }
}

/// Собирает абзац обратно, подставив перевод.
String withTranslation(BookBlock block, List<String> texts) {
  String at(int index, String fallback) =>
      index < texts.length ? texts[index] : fallback;

  switch (block.kind) {
    case BookBlockKind.text:
      return at(0, block.text);
    case BookBlockKind.image:
      return imageParagraph(block.url, at(0, block.text));
    case BookBlockKind.table:
      var cursor = 0;
      final rows = block.rows
          .map((row) => row.map((cell) => at(cursor++, cell)).toList())
          .toList();
      return tableParagraph(rows);
  }
}

/// Текст книги без служебной разметки.
///
/// Нужен определению языка и подсчёту объёма: метка и адрес картинки — это не
/// слова документа, и считать их за текст значит занизить долю сербского и
/// завысить объём перевода.
List<String> plainParagraphs(List<String> paragraphs) {
  final out = <String>[];
  for (final paragraph in paragraphs) {
    for (final text in translatableText(parseBookBlock(paragraph))) {
      if (text.trim().isNotEmpty) out.add(text);
    }
  }
  return out;
}

/// Сколько знаков в книге без учёта служебной разметки.
int countBookChars(List<String> paragraphs) =>
    plainParagraphs(paragraphs).fold(0, (sum, text) => sum + text.length);
