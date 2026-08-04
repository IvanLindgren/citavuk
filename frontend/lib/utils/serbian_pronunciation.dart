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
}
