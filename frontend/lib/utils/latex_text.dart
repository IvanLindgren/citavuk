/// Починка текста из PDF, свёрстанных в LaTeX.
///
/// В таких файлах текст лежит не так, как в книгах из Word: буква с диакритикой
/// рисуется двумя глифами (галочка отдельно, буква отдельно), «fi» и «fl» — это
/// один глиф-лигатура, а между абзацами попадаются формулы, которые в текст
/// книги превращаются в мусор.
library;

import 'reflow.dart' show LayoutLine;

/// Лигатуры, которые LaTeX ставит вместо пар букв.
const _ligatures = {
  'ﬀ': 'ff',
  'ﬁ': 'fi',
  'ﬂ': 'fl',
  'ﬃ': 'ffi',
  'ﬄ': 'ffl',
  'ﬅ': 'st',
  'ﬆ': 'st',
};

/// Отдельно стоящие знаки диакритики и их комбинирующие двойники.
const _accents = {
  'ˇ': 'caron', // ˇ
  '̌': 'caron',
  '´': 'acute', // ´
  '́': 'acute',
  'ˊ': 'acute',
  '`': 'grave', // `
  '̀': 'grave',
  '¨': 'diaeresis', // ¨
  '̈': 'diaeresis',
  '^': 'circumflex', // ^
  '̂': 'circumflex',
  '˚': 'ring', // ˚
  '̊': 'ring',
  '~': 'tilde', // ~
  '̃': 'tilde',
  '¯': 'macron', // ¯
  '̄': 'macron',
  '˝': 'doubleacute',
  '̋': 'doubleacute',
};

/// Что получается из буквы под знаком. Набор — славянская латиница: сербская,
/// хорватская, чешская, польская; их достаточно для книг, которые читают в
/// приложении.
const _composed = {
  'caron': {
    'c': 'č', 'C': 'Č', 's': 'š', 'S': 'Š', 'z': 'ž', 'Z': 'Ž',
    'd': 'ď', 'D': 'Ď', 't': 'ť', 'T': 'Ť', 'n': 'ň', 'N': 'Ň',
    'r': 'ř', 'R': 'Ř', 'e': 'ě', 'E': 'Ě', 'g': 'ǧ', 'G': 'Ǧ',
  },
  'acute': {
    'c': 'ć', 'C': 'Ć', 's': 'ś', 'S': 'Ś', 'z': 'ź', 'Z': 'Ź',
    'n': 'ń', 'N': 'Ń', 'a': 'á', 'A': 'Á', 'e': 'é', 'E': 'É',
    'i': 'í', 'I': 'Í', 'o': 'ó', 'O': 'Ó', 'u': 'ú', 'U': 'Ú',
    'y': 'ý', 'Y': 'Ý', 'l': 'ĺ', 'L': 'Ĺ', 'r': 'ŕ', 'R': 'Ŕ',
  },
  'grave': {
    'a': 'à', 'A': 'À', 'e': 'è', 'E': 'È', 'i': 'ì', 'I': 'Ì',
    'o': 'ò', 'O': 'Ò', 'u': 'ù', 'U': 'Ù',
  },
  'diaeresis': {
    'a': 'ä', 'A': 'Ä', 'e': 'ë', 'E': 'Ë', 'i': 'ï', 'I': 'Ï',
    'o': 'ö', 'O': 'Ö', 'u': 'ü', 'U': 'Ü',
  },
  'circumflex': {
    'a': 'â', 'A': 'Â', 'e': 'ê', 'E': 'Ê', 'i': 'î', 'I': 'Î',
    'o': 'ô', 'O': 'Ô', 'u': 'û', 'U': 'Û',
  },
  'ring': {'u': 'ů', 'U': 'Ů', 'a': 'å', 'A': 'Å'},
  'tilde': {'a': 'ã', 'A': 'Ã', 'n': 'ñ', 'N': 'Ñ', 'o': 'õ', 'O': 'Õ'},
  'macron': {'a': 'ā', 'A': 'Ā', 'e': 'ē', 'E': 'Ē', 'i': 'ī', 'I': 'Ī',
    'o': 'ō', 'O': 'Ō', 'u': 'ū', 'U': 'Ū'},
  'doubleacute': {'o': 'ő', 'O': 'Ő', 'u': 'ű', 'U': 'Ű'},
};

/// Разворачивает лигатуры и собирает буквы с диакритикой.
///
/// Знак может стоять и перед буквой, и после неё: порядок зависит от того, как
/// его поставил TeX и в каком порядке глифы попали в файл.
String composeAccents(String line) {
  var text = line;
  for (final entry in _ligatures.entries) {
    if (text.contains(entry.key)) text = text.replaceAll(entry.key, entry.value);
  }
  if (!_accents.keys.any(text.contains)) return text;

  final out = <String>[];
  final chars = text.split('');
  for (var i = 0; i < chars.length; i++) {
    final accent = _accents[chars[i]];
    if (accent == null) {
      out.add(chars[i]);
      continue;
    }
    final table = _composed[accent]!;

    // Знак после буквы: «cˇ».
    if (out.isNotEmpty && table.containsKey(out.last)) {
      out[out.length - 1] = table[out.last]!;
      continue;
    }
    // Знак перед буквой: «ˇc».
    final next = i + 1 < chars.length ? chars[i + 1] : '';
    if (table.containsKey(next)) {
      out.add(table[next]!);
      i++;
      continue;
    }
    out.add(chars[i]);
  }
  return out.join();
}

/// Символы, которые встречаются в формулах и почти не встречаются в прозе.
final _mathSigns = RegExp(r'[=∑∏∫√≈≤≥≠∞±×÷⊂∈∀∃∇∂→←↔⇒⇔αβγδθλμσφψω]');

/// Номер формулы в конце строки: «(3.14)», «(2)».
final _formulaNumber = RegExp(r'\s*\(\d+(?:\.\d+)*\)\s*$');

final _letters = RegExp(r'\p{L}', unicode: true);

/// Похожа ли строка на формулу, а не на текст.
///
/// Формулы в PDF из LaTeX распадаются на отдельные буквы и знаки, и в книге
/// такая строка выглядит мусором. Признак — мало букв на длину строки при
/// наличии математических знаков.
bool looksLikeFormula(String line) {
  final text = line.trim();
  if (text.isEmpty) return false;
  if (text.length > 200) return false;

  final letters = _letters.allMatches(text).length;
  final ratio = letters / text.length;
  if (!_mathSigns.hasMatch(text)) {
    // Без знаков формулой считаем только совсем беспросветное: «x i j k n».
    return ratio < 0.25 && text.length > 6;
  }
  return ratio < 0.55;
}

/// Чистит строку из LaTeX-PDF. Возвращает пустую строку, если строку нужно
/// выбросить целиком.
String cleanLatexLine(String line) {
  final composed = composeAccents(line);
  if (looksLikeFormula(composed)) return '';
  return composed.replaceFirst(_formulaNumber, '').trimRight();
}

/// Доля строк с математикой, начиная с которой документ считается техническим.
const _formulaShare = 0.03;

/// Готовит строки PDF к сборке абзацев.
///
/// Диакритика собирается всегда — отдельно стоящая галочка над буквой в обычной
/// книге не встречается, портить нечего. А формулы выбрасываются только в
/// техническом тексте: в художественной книге строка без букв — это скорее
/// дата, номер главы или реплика, и терять её нельзя.
List<List<String>> cleanLatexDocument(List<List<String>> pages) {
  var total = 0;
  var mathy = 0;
  for (final page in pages) {
    for (final line in page) {
      total++;
      if (_mathSigns.hasMatch(line)) mathy++;
    }
  }
  final technical = total > 0 && mathy / total >= _formulaShare;

  return [
    for (final page in pages)
      [
        for (final line in page)
          if (technical) cleanLatexLine(line) else composeAccents(line),
      ]..removeWhere((line) => line.isEmpty),
  ];
}

/// То же, но для строк с координатами: чистка не должна терять геометрию,
/// по которой дальше собираются абзацы.
List<List<LayoutLine>> cleanLatexLayout(List<List<LayoutLine>> pages) {
  var total = 0;
  var mathy = 0;
  for (final page in pages) {
    for (final line in page) {
      total++;
      if (_mathSigns.hasMatch(line.text)) mathy++;
    }
  }
  final technical = total > 0 && mathy / total >= _formulaShare;

  final result = <List<LayoutLine>>[];
  for (final page in pages) {
    final cleaned = <LayoutLine>[];
    for (final line in page) {
      final text =
          technical ? cleanLatexLine(line.text) : composeAccents(line.text);
      if (text.isEmpty) continue;
      cleaned.add((text: text, left: line.left, right: line.right));
    }
    result.add(cleaned);
  }
  return result;
}
