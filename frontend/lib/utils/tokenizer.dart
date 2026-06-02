class Token {
  final String text;
  final int start;
  final int end;
  final bool isWord;

  Token({
    required this.text,
    required this.start,
    required this.end,
    required this.isWord,
  });
}

class SerbianTokenizer {
  static final RegExp _wordRegExp = RegExp(
    r'[a-zA-ZžćčđšŽĆČĐŠа-яА-ЯёЁђјљњћџЂЈЉЊЋЏ]+'
  );

  static List<Token> tokenize(String text) {
    final List<Token> tokens = [];
    if (text.isEmpty) return tokens;
    int lastIndex = 0;

    for (final match in _wordRegExp.allMatches(text)) {
      if (match.start > lastIndex) {
        final nonWordText = text.substring(lastIndex, match.start);
        tokens.add(Token(
          text: nonWordText,
          start: lastIndex,
          end: match.start,
          isWord: false,
        ));
      }
      
      tokens.add(Token(
        text: match.group(0)!,
        start: match.start,
        end: match.end,
        isWord: true,
      ));
      
      lastIndex = match.end;
    }

    if (lastIndex < text.length) {
      final nonWordText = text.substring(lastIndex);
      tokens.add(Token(
        text: nonWordText,
        start: lastIndex,
        end: text.length,
        isWord: false,
      ));
    }

    return tokens;
  }
}
