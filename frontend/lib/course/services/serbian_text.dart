/// Текстовые утилиты курса: нормализация ответов и разбиение на буквы.
///
/// Правила взяты из master-prompt §8.1. Ключевое ограничение: `č`/`ć` и
/// `dž`/`đ` — **разные** буквы, их нельзя схлопывать при нормализации, иначе
/// упражнение перестанет проверять то, ради чего создано.
library;

/// Комбинирующие диакритики, которые встречаются в сербской латинице.
const int _combiningCaron = 0x030C; // č, š, ž
const int _combiningAcute = 0x0301; // ć

/// Основа + диакритик → предсоставленный символ.
///
/// Dart SDK не содержит Unicode-нормализации, а тянуть пакет ради пяти букв
/// нерационально. Поэтому нормализация **точечная**: покрывает ровно тот
/// набор, который используется в сербской латинице. `đ` (U+0111) канонического
/// разложения не имеет и здесь не нужен.
const Map<int, Map<int, String>> _precomposed = {
  _combiningCaron: {
    0x63: 'č', 0x43: 'Č', // c C
    0x73: 'š', 0x53: 'Š', // s S
    0x7A: 'ž', 0x5A: 'Ž', // z Z
  },
  _combiningAcute: {
    0x63: 'ć', 0x43: 'Ć', // c C
  },
};

/// Диграфы сербской латиницы.
const List<String> serbianDigraphs = ['lj', 'nj', 'dž'];

/// Приводит разложенные последовательности (`c` + U+030C) к предсоставленным
/// (`č`). Остальной текст не меняет.
String toPrecomposed(String input) {
  if (input.isEmpty) return input;
  final units = input.runes.toList();
  final out = StringBuffer();
  for (var i = 0; i < units.length; i++) {
    final next = i + 1 < units.length ? units[i + 1] : -1;
    final table = _precomposed[next];
    final replacement = table?[units[i]];
    if (replacement != null) {
      out.write(replacement);
      i++; // диакритик поглощён
      continue;
    }
    out.writeCharCode(units[i]);
  }
  return out.toString();
}

/// Терминальная пунктуация, которую допустимо игнорировать, если урок её
/// не проверяет.
final RegExp _terminalPunctuation = RegExp(r'[.!?]+$');
final RegExp _whitespaceRun = RegExp(r'\s+');

/// Нормализует ответ пользователя перед сравнением.
///
/// Всегда: предсоставленные диакритики, обрезка краёв, схлопывание пробелов,
/// унификация кавычек и апострофов.
///
/// Опционально:
/// - [caseSensitive] — если false, регистр игнорируется;
/// - [keepTerminalPunctuation] — если false, финальные `.`/`!`/`?` отбрасываются.
///
/// Письменность (латиница/кириллица) здесь **не** конвертируется: это решение
/// принимает evaluator по конфигурации урока.
String normalizeAnswer(
  String input, {
  bool caseSensitive = false,
  bool keepTerminalPunctuation = false,
}) {
  var s = toPrecomposed(input);
  s = s
      .replaceAll('‘', "'")
      .replaceAll('’', "'")
      .replaceAll('“', '"')
      .replaceAll('”', '"')
      .replaceAll('«', '"')
      .replaceAll('»', '"');
  s = s.replaceAll(_whitespaceRun, ' ').trim();
  if (!keepTerminalPunctuation) {
    s = s.replaceFirst(_terminalPunctuation, '').trimRight();
  }
  if (!caseSensitive) {
    s = s.toLowerCase();
  }
  return s;
}

/// Разбивает словоформу на буквы для упражнения «собери слово».
///
/// Диакритические `č ć š ž đ` — единые буквы (они и так отдельные руны).
/// Диграфы `lj nj dž` по умолчанию остаются двумя символами и становятся одной
/// плиткой только при [digraphsAsUnits] (master-prompt §6.5).
///
/// Поведение обязано совпадать с `splitLetters` в `tools/course_build`:
/// расхождение сделало бы валидатор и клиент несогласованными.
List<String> splitLetters(String input, {bool digraphsAsUnits = false}) {
  final runes = toPrecomposed(input).runes.toList();
  final out = <String>[];
  for (var i = 0; i < runes.length;) {
    if (i + 1 < runes.length) {
      final pair = String.fromCharCodes([runes[i], runes[i + 1]]).toLowerCase();
      if (serbianDigraphs.contains(pair)) {
        if (digraphsAsUnits) {
          out.add(String.fromCharCodes([runes[i], runes[i + 1]]));
        } else {
          out.add(String.fromCharCode(runes[i]));
          out.add(String.fromCharCode(runes[i + 1]));
        }
        i += 2;
        continue;
      }
    }
    out.add(String.fromCharCode(runes[i]));
    i++;
  }
  return out;
}

/// Индекс первой позиции, где строки расходятся (в буквах, не в кодовых
/// единицах). Возвращает -1, если строки совпадают.
///
/// Используется, чтобы подсветить именно различающуюся часть ответа, а не
/// красить целиком (master-prompt §8.3).
int firstDivergence(String a, String b) {
  final la = splitLetters(a);
  final lb = splitLetters(b);
  final shorter = la.length < lb.length ? la.length : lb.length;
  for (var i = 0; i < shorter; i++) {
    if (la[i] != lb[i]) return i;
  }
  if (la.length != lb.length) return shorter;
  return -1;
}
