class SerbianPronunciation {
  const SerbianPronunciation._();

  static const _single = <String, String>{
    'a': 'a',
    'b': 'b',
    'c': 'ts',
    'č': 'tʃ',
    'ć': 'tɕ',
    'd': 'd',
    'đ': 'dʑ',
    'e': 'e',
    'f': 'f',
    'g': 'ɡ',
    'h': 'x',
    'i': 'i',
    'j': 'j',
    'k': 'k',
    'l': 'l',
    'm': 'm',
    'n': 'n',
    'o': 'o',
    'p': 'p',
    'r': 'r',
    's': 's',
    'š': 'ʃ',
    't': 't',
    'u': 'u',
    'v': 'ʋ',
    'z': 'z',
    'ž': 'ʒ',
    'а': 'a',
    'б': 'b',
    'в': 'ʋ',
    'г': 'ɡ',
    'д': 'd',
    'ђ': 'dʑ',
    'е': 'e',
    'ж': 'ʒ',
    'з': 'z',
    'и': 'i',
    'ј': 'j',
    'к': 'k',
    'л': 'l',
    'љ': 'ʎ',
    'м': 'm',
    'н': 'n',
    'њ': 'ɲ',
    'о': 'o',
    'п': 'p',
    'р': 'r',
    'с': 's',
    'т': 't',
    'ћ': 'tɕ',
    'у': 'u',
    'ф': 'f',
    'х': 'x',
    'ц': 'ts',
    'ч': 'tʃ',
    'џ': 'dʒ',
    'ш': 'ʃ',
  };

  static String ipa(String word) {
    final value = word.trim().toLowerCase();
    if (value.isEmpty) return '';
    final out = StringBuffer();
    for (var i = 0; i < value.length; i++) {
      if (i + 1 < value.length) {
        final pair = value.substring(i, i + 2);
        if (pair == 'dž') {
          out.write('dʒ');
          i++;
          continue;
        }
        if (pair == 'lj') {
          out.write('ʎ');
          i++;
          continue;
        }
        if (pair == 'nj') {
          out.write('ɲ');
          i++;
          continue;
        }
      }
      out.write(_single[value[i]] ?? value[i]);
    }
    return '/$out/';
  }

  static const _ipaVowels = 'aeiou';

  /// Звуки транскрипции: где вершины слогов, там и может стоять ударение.
  ///
  /// Слоговое «r» между согласными («prst», «krv») тоже вершина — без этого
  /// такие слова выходили бы вовсе без слогов.
  static List<(String, bool)> _sounds(String word) {
    final value = word.trim().toLowerCase();
    final out = <String>[];
    for (var i = 0; i < value.length; i++) {
      if (i + 1 < value.length) {
        final pair = value.substring(i, i + 2);
        const digraphs = {'dž': 'dʒ', 'lj': 'ʎ', 'nj': 'ɲ'};
        final mapped = digraphs[pair];
        if (mapped != null) {
          out.add(mapped);
          i++;
          continue;
        }
      }
      out.add(_single[value[i]] ?? value[i]);
    }

    bool isVowel(int index) {
      if (index < 0 || index >= out.length) return false;
      return out[index].length == 1 && _ipaVowels.contains(out[index]);
    }

    return [
      for (var i = 0; i < out.length; i++)
        (
          out[i],
          isVowel(i) || (out[i] == 'r' && !isVowel(i - 1) && !isVowel(i + 1)),
        ),
    ];
  }

  static int syllables(String word) =>
      _sounds(word).where((sound) => sound.$2).length;

  /// Транскрипция, разрезанная на ударном звуке: до, ударный, после.
  ///
  /// Место ударения в сербском по написанию не восстанавливается: ударений
  /// четыре (краткое и долгое, восходящее и нисходящее), словаря ударений в
  /// проекте нет, а поставить знак наугад значит учить неправильному
  /// произношению.
  ///
  /// Но в коротких словах место определяется однозначно и без словаря: ударение
  /// никогда не падает на последний слог — твёрдая норма литературного
  /// сербского, — поэтому в одно- и двусложном слове ударен первый. В словах
  /// длиннее ударный слог может быть любым, кроме последнего, и транскрипция
  /// остаётся без пометы: пустое место честнее уверенной ошибки.
  // Знаки сербского ударения. Макрон (U+0304) сюда не входит: он обозначает
  // долготу безударного слога, и выделять по нему значит показать ударение не
  // там.
  static const _stressMarks = '̏̑̀́';
  static const _accentable = 'aeiouraeiourАЕИОУРаеиоур';

  /// Разрезает ударное написание словаря на части вокруг ударной буквы.
  ///
  /// «knjȉga» → knj / ȉ / ga. Ударный слог несёт диакритику, и это единственное
  /// надёжное указание на место ударения — по буквам его не восстановить.
  ///
  /// Знак засчитывается только на гласной или слоговом «r»: в разложенном виде
  /// «ć» — это «c» плюс акут, то есть ровно тот же знак, что и долгое
  /// восходящее ударение.
  static (String, String, String) splitAccented(String written) {
    final units = written.runes.toList();
    var base = -1;
    for (var i = 1; i < units.length; i++) {
      if (!_stressMarks.contains(String.fromCharCode(units[i]))) continue;
      final letter = String.fromCharCode(units[i - 1]);
      if (!_accentable.contains(letter)) continue;
      base = i - 1;
      break;
    }
    if (base < 0) return (written, '', '');

    var end = base + 1;
    while (end < units.length &&
        RegExp(r'\p{M}', unicode: true)
            .hasMatch(String.fromCharCode(units[end]))) {
      end++;
    }
    String slice(int from, int to) =>
        String.fromCharCodes(units.sublist(from, to));
    return (slice(0, base), slice(base, end), slice(end, units.length));
  }

  static (String, String, String) ipaParts(String word) {
    final all = _sounds(word);
    if (all.isEmpty) return ('', '', '');

    final nuclei = [
      for (var i = 0; i < all.length; i++)
        if (all[i].$2) i,
    ];
    String join(int from, [int? to]) =>
        all.sublist(from, to ?? all.length).map((s) => s.$1).join();

    if (nuclei.isEmpty || nuclei.length > 2) return ('/${join(0)}/', '', '');
    final at = nuclei.first;
    return ('/${join(0, at)}', all[at].$1, '${join(at + 1)}/');
  }
}
