/// Восстановление абзацев из строк PDF.
///
/// PDF не хранит абзацев — только строки на странице. Наивный разбор давал одну
/// из двух крайностей: либо каждая зрительная строка становилась абзацем, либо
/// целая страница склеивалась в один кирпич текста. Читать нельзя ни то, ни
/// другое, а в читалке абзац — ещё и единица перевода и закладки.
///
/// Здесь строки собираются обратно в абзацы по признакам, которые в вёрстке
/// действительно есть: короткая последняя строка, конец предложения, маркер
/// списка, заголовок, перенос по слогам. Плюс убирается то, что повторяется на
/// каждой странице, — колонтитулы и номера страниц.
///
/// Правила совпадают с web/src/lib/reflow.ts. Совпадать они обязаны: адрес
/// книги при синхронизации считается от списка абзацев, и разное разбиение
/// означает две разные книги на двух устройствах вместо одной.
library;

/// Строка-номер страницы: «12», «— 12 —», «стр. 12», «страна 12».
final _pageNumber = RegExp(
  r'^(?:[-–—]\s*)?(?:стр\.?|страна|page)?\s*\d{1,4}\s*(?:[-–—]\s*)?$',
  caseSensitive: false,
);

/// Маркер списка или пункта: «•», «—», «1.», «2)», «а)».
final _listItem = RegExp(
  r'^(?:[•·▪◦*]|[-–—]\s|\d{1,3}[.)]\s|[a-zа-яђјљњћџš][.)]\s)',
  caseSensitive: false,
  unicode: true,
);

/// Конец предложения. Кавычки и скобки могут стоять после точки.
final _sentenceEnd = RegExp(r'[.!?…](?:["»”’' r"'" r')\]]|\s)*$', unicode: true);

/// Перенос по слогам: дефис в конце строки сразу после буквы.
///
/// Только ASCII-дефис. Тире «—» в конце строки — это прямая речь, и склеивать
/// такую строку со следующей нельзя.
final _hyphenated = RegExp(r'\p{L}-$', unicode: true);

final _lowerStart = RegExp(r'^\p{Ll}', unicode: true);
final _letter = RegExp(r'\p{L}', unicode: true);
final _whitespace = RegExp(r'\s+', unicode: true);
final _afterSentence = RegExp(r'(?<=[.!?…])\s+', unicode: true);

/// Насколько строка должна быть короче обычной, чтобы считаться концом абзаца.
const _shortLineRatio = 0.78;

/// Доля страниц, на которых строка должна повторяться, чтобы счесть её колонтитулом.
const _runningHeadShare = 0.6;

/// Минимум страниц, при котором вообще имеет смысл искать колонтитулы.
const _minPagesForHeads = 4;

/// Длиннее этого абзац принудительно делится по предложениям.
const _maxParagraph = 2400;

/// Целевой размер куска при делении длинного абзаца.
const _targetChunk = 1200;

/// Собирает абзацы из строк документа, разбитых по страницам.
///
/// Разбиение по страницам нужно не для вывода, а чтобы найти колонтитулы:
/// строку, повторяющуюся на большинстве страниц, невозможно отличить от текста,
/// пока не видишь остальные страницы.
List<String> reflowDocument(List<List<String>> pages) {
  final cleanedPages = [
    for (final page in pages)
      [
        for (final line in page.map(_normalize))
          if (line.isNotEmpty && !_pageNumber.hasMatch(line)) line,
      ],
  ];

  final running = _runningHeads(cleanedPages);
  final lines = <String>[];
  for (final page in cleanedPages) {
    final body = [
      for (final line in page)
        if (!running.contains(line)) line,
    ];
    if (body.isEmpty) continue;
    // Между страницами вставляется пустая строка: абзац крайне редко
    // продолжается через разрыв, а склейка соседних страниц заметно хуже
    // читается, чем лишний разрыв.
    if (lines.isNotEmpty) lines.add('');
    lines.addAll(body);
  }

  return splitLongParagraphs(reflowLines(lines));
}

/// Строка страницы вместе с её границами по горизонтали.
typedef LayoutLine = ({String text, double left, double right});

/// Насколько строка должна отступить вправо, чтобы счесть её красной строкой.
///
/// Доля ширины колонки: в вёрстке абзацный отступ — это 1–2 кегля, то есть
/// проценты от ширины, а не фиксированные пункты.
const _indentShare = 0.012;

/// Насколько строка должна не дойти до правого края, чтобы закрыть абзац.
const _shortTailShare = 0.06;

/// Собирает абзацы, зная, где строки начинаются и заканчиваются.
///
/// Разбор по одному тексту не видит красной строки, а в книгах именно она —
/// главный признак абзаца: строки выровнены по ширине и по длине не отличаются.
List<String> reflowDocumentWithLayout(List<List<LayoutLine>> pages) {
  final lines = <String>[];

  for (final page in pages) {
    final visible = [
      for (final line in page)
        if (_normalize(line.text).isNotEmpty &&
            !_pageNumber.hasMatch(_normalize(line.text)))
          line,
    ];
    if (visible.isEmpty) continue;

    final lefts = [for (final l in visible) l.left]..sort();
    final rights = [for (final l in visible) l.right]..sort();
    final baseLeft = lefts[lefts.length ~/ 2];
    final maxRight = rights.last;
    final width = maxRight - baseLeft;
    if (width <= 0) {
      lines.addAll([for (final l in visible) _normalize(l.text)]);
      continue;
    }

    if (lines.isNotEmpty) lines.add('');
    for (var i = 0; i < visible.length; i++) {
      final line = visible[i];
      final text = _normalize(line.text);
      final indented = line.left > baseLeft + width * _indentShare;
      final previousShort = i > 0 &&
          visible[i - 1].right < maxRight - width * _shortTailShare;

      // Пустая строка — это разрыв для reflowLines: дальше он сам решит, как
      // склеивать остальное.
      if (i > 0 && (indented || previousShort)) lines.add('');
      lines.add(text);
    }
  }

  final withoutHeads = _withoutRunningHeads(lines);
  return splitLongParagraphs(reflowLines(withoutHeads));
}

/// Убирает колонтитулы из плоского списка строк.
List<String> _withoutRunningHeads(List<String> lines) {
  final counts = <String, int>{};
  for (final line in lines) {
    if (line.isEmpty) continue;
    counts.update(line, (n) => n + 1, ifAbsent: () => 1);
  }
  // Колонтитул повторяется столько же раз, сколько страниц; порог берём
  // консервативно, чтобы не выкинуть повторяющуюся реплику диалога.
  final repeated = {
    for (final entry in counts.entries)
      if (entry.value >= 4 && entry.key.length < 90) entry.key,
  };
  if (repeated.isEmpty) return lines;
  return [
    for (final line in lines)
      if (!repeated.contains(line)) line,
  ];
}

/// Собирает абзацы из плоского списка строк. Пустая строка — явный разрыв.
List<String> reflowLines(List<String> rawLines) {
  final lines = rawLines.map(_normalize).toList(growable: false);
  final typical = _typicalLength(lines);

  final paragraphs = <String>[];
  var current = '';
  var previous = '';

  void flush() {
    final text = current.trim();
    if (text.isNotEmpty) paragraphs.add(text);
    current = '';
    previous = '';
  }

  for (final line in lines) {
    if (line.isEmpty) {
      flush();
      continue;
    }
    if (current.isEmpty) {
      current = line;
      previous = line;
      continue;
    }

    if (_startsNewParagraph(previous, line, typical)) {
      flush();
      current = line;
      previous = line;
      continue;
    }

    if (_hyphenated.hasMatch(previous) && _lowerStart.hasMatch(line)) {
      // Слово разорвано переносом: дефис принадлежит вёрстке, не слову.
      current = current.substring(0, current.length - 1) + line;
    } else {
      current = '$current $line';
    }
    previous = line;
  }
  flush();

  return paragraphs;
}

bool _startsNewParagraph(String previous, String line, int typical) {
  if (_listItem.hasMatch(line)) return true;
  if (_isHeading(previous) || _isHeading(line)) return true;

  // Главный признак: предыдущая строка закончила предложение и при этом не
  // дотянула до правого края. Полная строка с точкой — обычная середина
  // абзаца, а недобранная означает, что дальше вёрстка начала новый.
  if (_sentenceEnd.hasMatch(previous)) {
    if (typical == 0) return true;
    return previous.length < typical * _shortLineRatio;
  }
  return false;
}

/// Заголовок: строка из прописных букв без конечной точки.
///
/// Признак узкий намеренно. Более вольные правила (короткая строка с большой
/// буквы) уводят в отдельный абзац каждую строку диалога.
bool _isHeading(String line) {
  if (line.isEmpty || line.length > 90) return false;
  if (_sentenceEnd.hasMatch(line)) return false;

  var letters = 0;
  for (final ch in line.split('')) {
    if (!_letter.hasMatch(ch)) continue;
    letters++;
    if (ch != ch.toUpperCase()) return false;
  }
  return letters >= 3;
}

/// Характерная длина строки — 70-й процентиль.
///
/// Не среднее: последние строки абзацев и заголовки занижают его настолько, что
/// «короткая строка» перестаёт что-либо значить.
int _typicalLength(List<String> lines) {
  final lengths = [
    for (final line in lines)
      if (line.isNotEmpty) line.length,
  ]..sort();
  // Двух строк для оценки мало: там 0 означает «сравнивать не с чем», и разрыв
  // ставится по одному лишь концу предложения.
  if (lengths.length < 3) return 0;
  return lengths[(lengths.length * 0.7).floor()];
}

/// Строки, повторяющиеся на большинстве страниц, — колонтитулы.
Set<String> _runningHeads(List<List<String>> pages) {
  if (pages.length < _minPagesForHeads) return const {};

  final counts = <String, int>{};
  for (final page in pages) {
    // На одной странице строка учитывается один раз: повтор внутри страницы
    // (например, в таблице) колонтитулом не делает.
    for (final line in page.toSet()) {
      counts.update(line, (n) => n + 1, ifAbsent: () => 1);
    }
  }

  final threshold = (pages.length * _runningHeadShare).ceil();
  return {
    for (final entry in counts.entries)
      if (entry.value >= threshold) entry.key,
  };
}

String _normalize(String line) => line.replaceAll(_whitespace, ' ').trim();

/// Делит абзацы, которые всё равно вышли огромными.
///
/// Такое остаётся после документов совсем без вёрстки. Абзац на десять экранов
/// неудобно читать и нечем переводить целиком, поэтому режется по границам
/// предложений — но с большим запасом, чтобы обычный длинный абзац уцелел.
List<String> splitLongParagraphs(List<String> paragraphs) {
  final out = <String>[];
  for (final paragraph in paragraphs) {
    if (paragraph.length <= _maxParagraph) {
      out.add(paragraph);
      continue;
    }
    var chunk = '';
    for (final sentence in paragraph.split(_afterSentence)) {
      chunk = chunk.isEmpty ? sentence : '$chunk $sentence';
      if (chunk.length >= _targetChunk) {
        out.add(chunk);
        chunk = '';
      }
    }
    if (chunk.isNotEmpty) out.add(chunk);
  }
  return out;
}
