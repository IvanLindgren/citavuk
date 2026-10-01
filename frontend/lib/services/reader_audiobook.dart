import '../models/book_block.dart';
import '../utils/pages.dart';
import '../utils/tokenizer.dart';

/// Реплика привязана к тому фрагменту, который действительно показан читателю.
class ReaderAudioCue {
  const ReaderAudioCue._(
      {required this.text,
      required this.page,
      required this.paragraph,
      required this.start,
      required this.sourceParagraph,
      required this.sourceOffset,
      required String fragment,
      required _AudioTokenCache cache})
      : _fragment = fragment,
        _cache = cache;

  final String text;
  final int page, paragraph, start, sourceParagraph, sourceOffset;
  final String _fragment;
  final _AudioTokenCache _cache;
  List<Token> get tokens => _cache.get(_fragment);

  int tokenAt(double ratio) {
    final character = start + (text.length * ratio.clamp(0.0, 0.999)).floor();
    return tokens.indexWhere((token) =>
        token.isWord && character >= token.start && character < token.end);
  }
}

// Не удерживаем токены всей книги в памяти телефона: нужны текущие фрагменты.
class _AudioTokenCache {
  final _items = <String, List<Token>>{};
  List<Token> get(String text) {
    final tokens = _items.remove(text) ?? SerbianTokenizer.tokenize(text);
    _items[text] = tokens;
    if (_items.length > 4) {
      _items.remove(_items.keys.first);
    }
    return tokens;
  }
}

List<ReaderAudioCue> buildReaderAudioCues(
    List<String> source, List<BookPage> pages) {
  final cues = <ReaderAudioCue>[];
  final cache = _AudioTokenCache();
  final sentences = RegExp(r'[^.!?…]+[.!?…]*');
  for (var page = 0; page < pages.length; page++) {
    var original = pages[page].start;
    var offset = pages[page].offset;
    for (var paragraph = 0; paragraph < pages[page].texts.length; paragraph++) {
      final piece = pages[page].texts[paragraph];
      final block = parseBookBlock(piece);
      if (block.isText) {
        for (final match in sentences.allMatches(block.text)) {
          final raw = match.group(0)!;
          final text = raw.trim();
          if (text.isEmpty) continue;
          final start = match.start + raw.length - raw.trimLeft().length;
          cues.add(ReaderAudioCue._(
              text: text,
              page: page,
              paragraph: paragraph,
              start: start,
              sourceParagraph: original,
              sourceOffset: offset + start,
              fragment: block.text,
              cache: cache));
        }
      }
      offset += piece.length;
      while (original < source.length && offset >= source[original].length) {
        offset -= source[original].length;
        original++;
      }
    }
  }
  return cues;
}

int audioCueForPage(List<ReaderAudioCue> cues, int page) {
  final index = cues.indexWhere((cue) => cue.page >= page);
  return index < 0 ? (cues.isEmpty ? 0 : cues.length - 1) : index;
}

int audioCueForPosition(List<ReaderAudioCue> cues, int paragraph, int offset) {
  for (var index = cues.length - 1; index >= 0; index--) {
    final cue = cues[index];
    if (cue.sourceParagraph < paragraph ||
        (cue.sourceParagraph == paragraph && cue.sourceOffset <= offset)) {
      return index;
    }
  }
  return 0;
}
