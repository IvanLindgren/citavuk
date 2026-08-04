import '../models/book_block.dart';

/// Разбиение книги на страницы.
///
/// Зеркало `web/src/lib/pages.ts`: одна и та же книга должна листаться
/// одинаково в приложении и в браузере, иначе «страница 12» значит разное на
/// разных устройствах.
///
/// Раньше страница всегда кончалась на границе абзаца, а абзац никогда не
/// разрывался. Правило выглядело безобидно ровно до тех пор, пока не встретился
/// абзац больше самой страницы — а в книгах из публичной библиотеки такие
/// абзацы обычное дело, там целая глава нередко идёт одним куском. Тогда
/// получалось худшее из возможных: недобранная страница выталкивалась досрочно
/// (вот откуда «одна страница совсем маленькая»), а следом шла страница на
/// десятки тысяч знаков, на которой телефон заметно тормозил.
///
/// Поэтому длинный абзац теперь режется — но только по границам предложений.
/// Исходное опасение («предложение окажется на двух страницах и перевод слова
/// потеряет контекст») остаётся в силе и именно поэтому соблюдается: разрыв
/// проходит между предложениями, а не внутри них.

/// Сколько знаков помещается на страницу.
const int pageChars = 1500;

/// Страница книги.
class BookPage {
  const BookPage(this.texts, this.start);

  /// Куски текста страницы: целый абзац либо часть длинного абзаца.
  final List<String> texts;

  /// Абзац, с которого страница начинается. Прогресс чтения хранится в
  /// абзацах, а не в страницах: разбиение зависит от экрана, а место, где
  /// человек остановился, — нет.
  final int start;
}

/// Собирает страницы примерно равной длины.
List<BookPage> paginate(List<String> paragraphs, {int budget = pageChars}) {
  final pages = <BookPage>[];
  var texts = <String>[];
  var start = 0;
  var filled = 0;

  void flush() {
    if (texts.isEmpty) return;
    pages.add(BookPage(texts, start));
    texts = <String>[];
    filled = 0;
  }

  for (var index = 0; index < paragraphs.length; index++) {
    for (final piece in splitParagraph(paragraphs[index], budget: budget)) {
      final weight = pageWeight(piece);
      if (filled > 0 && filled + weight > budget) flush();
      // Страница получает номер абзаца, с которого началась. При разрыве
      // длинного абзаца несколько страниц подряд ссылаются на один и тот же
      // абзац — это верно: прогресс в него и указывает.
      if (texts.isEmpty) start = index;
      texts.add(piece);
      filled += weight;
    }
  }
  flush();

  return pages;
}

/// Сколько места кусок занимает на странице, в единицах «знак текста».
///
/// Картинку и таблицу считать по длине их разметки бессмысленно: адрес
/// картинки бывает длиннее абзаца, а занимает она полэкрана независимо от
/// длины адреса.
int pageWeight(String paragraph) {
  final block = parseBookBlock(paragraph);
  switch (block.kind) {
    case BookBlockKind.text:
      return block.text.length;
    case BookBlockKind.image:
      return (pageChars * 0.6).round();
    case BookBlockKind.table:
      return block.rows.fold<int>(
        0,
        (sum, row) => sum + 40 + row.fold<int>(0, (c, cell) => c + cell.length),
      );
  }
}

/// Режет слишком длинный абзац на куски не больше страницы.
///
/// Куски склеиваются обратно в исходный абзац знак в знак: читалка показывает
/// их подряд, и потеря хотя бы пробела была бы порчей книги.
List<String> splitParagraph(String paragraph, {int budget = pageChars}) {
  // Картинку и таблицу резать нечем и незачем: это цельные объекты.
  if (parseBookBlock(paragraph).kind != BookBlockKind.text) return [paragraph];
  if (paragraph.length <= budget) return [paragraph];

  return _balance(_atoms(paragraph, budget), budget);
}

/// Складывает куски как можно ровнее, не увеличивая их числа.
///
/// Набивать каждый кусок под завязку нельзя: в конце неизбежно остаётся
/// огрызок. Абзац на 15 800 знаков давал одиннадцать страниц по 1422 и
/// двенадцатую на 157 — она мелькает при листании и выглядит сбоем вёрстки.
///
/// Поделить длину поровну тоже не выходит: куски набираются целыми
/// предложениями, в цель они не попадают, и накопленный недобор всё равно
/// выливается в лишнюю страницу.
///
/// Поэтому число кусков определяется набивкой под завязку, а затем ищется
/// наименьший предел, при котором кусков остаётся столько же. При нём самый
/// большой кусок минимален — то есть куски настолько равны, насколько это
/// вообще возможно при данных предложениях.
List<String> _balance(List<String> atomList, int budget) {
  final packed = _pack(atomList, budget);
  if (packed.length <= 1) return packed;

  var low = atomList.fold<int>(0, (max, atom) => atom.length > max ? atom.length : max);
  var high = budget;
  while (low < high) {
    final middle = (low + high) ~/ 2;
    if (_pack(atomList, middle).length <= packed.length) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return _pack(atomList, low);
}

/// Жадно набивает куски до предела.
List<String> _pack(List<String> atomList, int limit) {
  final out = <String>[];
  final buffer = StringBuffer();
  for (final atom in atomList) {
    if (buffer.isNotEmpty && buffer.length + atom.length > limit) {
      out.add(buffer.toString());
      buffer.clear();
    }
    buffer.write(atom);
  }
  if (buffer.isNotEmpty) out.add(buffer.toString());
  return out;
}

/// Куски, каждый из которых заведомо помещается на страницу.
List<String> _atoms(String text, int budget) {
  final out = <String>[];
  for (final sentence in _sentences(text)) {
    if (sentence.length <= budget) {
      out.add(sentence);
    } else {
      out.addAll(_byWords(sentence, budget));
    }
  }
  return out;
}

/// Знаки конца предложения.
const String _enders = '.!?…';

/// Делит текст на предложения, сохраняя всё до последнего пробела.
///
/// Разбор нарочно грубый: сокращения вроде «т. н.» дадут лишнюю границу. Для
/// вёрстки это несущественно — страница просто кончится чуть раньше, — а
/// точный разбор сокращений сербского здесь не окупается.
List<String> _sentences(String text) {
  final out = <String>[];
  var from = 0;

  for (var i = 0; i < text.length; i++) {
    final char = text[i];
    if (!_enders.contains(char) && char != '\n') continue;

    var end = i + 1;
    // Многоточие из точек и «?!» — это одна граница, а не три.
    while (end < text.length && _enders.contains(text[end])) {
      end++;
    }
    // Пробел после точки остаётся с левым куском: иначе следующая страница
    // начиналась бы с отступа.
    while (end < text.length && text[end].trim().isEmpty) {
      end++;
    }

    out.add(text.substring(from, end));
    from = end;
    i = end - 1;
  }

  if (from < text.length) out.add(text.substring(from));
  return out;
}

/// Режет по словам то, что не удалось разрезать по предложениям.
///
/// Так выглядит текст вообще без знаков конца — например, распознанный из
/// скана. Место разрыва здесь уже не идеально, но страница на сорок тысяч
/// знаков хуже любого разрыва.
List<String> _byWords(String text, int budget) {
  final out = <String>[];
  var from = 0;

  while (text.length - from > budget) {
    var cut = text.lastIndexOf(' ', from + budget);
    if (cut <= from) {
      // Одно слово длиннее страницы: режем по буквам, иначе цикл не сдвинется.
      cut = from + budget;
    } else {
      cut += 1;
    }
    out.add(text.substring(from, cut));
    from = cut;
  }

  if (from < text.length) out.add(text.substring(from));
  return out;
}
