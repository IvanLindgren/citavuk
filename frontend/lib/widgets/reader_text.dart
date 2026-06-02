import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import '../models/reader_settings.dart';
import '../utils/tokenizer.dart';

/// Рендер одного абзаца для чтения.
///
/// Ключевое отличие от старой версии: слова — это обычные [TextSpan] с
/// [TapGestureRecognizer], а НЕ [WidgetSpan]. Поэтому работает нормальная
/// типографика (перенос строк, кернинг, интервалы) и слова не слипаются.
/// Recognizers создаются один раз на абзац и переиспользуются между
/// перерисовками (подсветка/настройки меняют только стиль).
class ReaderParagraph extends StatefulWidget {
  final String text;
  final ReaderSettings settings;
  final Color textColor;
  final Color highlightColor;
  final Color highlightTextColor;

  /// Индексы токенов (включительно), которые надо подсветить — для выделения
  /// слова/фразы. null, если в этом абзаце ничего не выделено.
  final int? selStart;
  final int? selEnd;

  /// Выравнивание по ширине и отступ красной строки.
  final bool justify;
  final double firstLineIndent;

  final void Function(int tokenIndex, Token token, List<Token> tokens) onTapWord;

  const ReaderParagraph({
    super.key,
    required this.text,
    required this.settings,
    required this.textColor,
    required this.highlightColor,
    required this.highlightTextColor,
    required this.onTapWord,
    this.selStart,
    this.selEnd,
    this.justify = false,
    this.firstLineIndent = 0,
  });

  @override
  State<ReaderParagraph> createState() => _ReaderParagraphState();
}

class _ReaderParagraphState extends State<ReaderParagraph> {
  late List<Token> _tokens;
  final Map<int, TapGestureRecognizer> _recognizers = {};

  @override
  void initState() {
    super.initState();
    _rebuildTokens();
  }

  @override
  void didUpdateWidget(covariant ReaderParagraph old) {
    super.didUpdateWidget(old);
    if (old.text != widget.text) _rebuildTokens();
  }

  void _rebuildTokens() {
    _tokens = SerbianTokenizer.tokenize(widget.text);
    _disposeRecognizers();
    for (var i = 0; i < _tokens.length; i++) {
      if (_tokens[i].isWord) {
        final idx = i;
        _recognizers[idx] = TapGestureRecognizer()
          ..onTap = () => widget.onTapWord(idx, _tokens[idx], _tokens);
      }
    }
  }

  void _disposeRecognizers() {
    for (final r in _recognizers.values) {
      r.dispose();
    }
    _recognizers.clear();
  }

  @override
  void dispose() {
    _disposeRecognizers();
    super.dispose();
  }

  bool _isSelected(int i) =>
      widget.selStart != null &&
      widget.selEnd != null &&
      i >= widget.selStart! &&
      i <= widget.selEnd!;

  @override
  Widget build(BuildContext context) {
    final s = widget.settings;
    final base = TextStyle(
      fontFamily: s.font.family,
      fontSize: s.fontSize,
      height: s.lineHeight,
      letterSpacing: s.letterSpacing,
      color: widget.textColor,
    );
    final ratio = s.bionic.ratio;

    final spans = <InlineSpan>[];
    if (widget.firstLineIndent > 0) {
      spans.add(WidgetSpan(child: SizedBox(width: widget.firstLineIndent)));
    }
    for (var i = 0; i < _tokens.length; i++) {
      final t = _tokens[i];
      final selected = _isSelected(i);

      if (!t.isWord) {
        spans.add(TextSpan(
          text: t.text,
          style: selected
              ? base.copyWith(
                  color: widget.highlightTextColor,
                  backgroundColor: widget.highlightColor)
              : null,
        ));
        continue;
      }

      final rec = _recognizers[i];
      final wordStyle = selected
          ? base.copyWith(
              color: widget.highlightTextColor,
              backgroundColor: widget.highlightColor)
          : base;

      if (ratio > 0 && t.text.length > 1) {
        final headLen =
            (t.text.length * ratio).ceil().clamp(1, t.text.length);
        spans.add(TextSpan(
          text: t.text.substring(0, headLen),
          recognizer: rec,
          style: wordStyle.copyWith(fontWeight: FontWeight.w700),
        ));
        if (headLen < t.text.length) {
          spans.add(TextSpan(
            text: t.text.substring(headLen),
            recognizer: rec,
            style: wordStyle,
          ));
        }
      } else {
        spans.add(TextSpan(text: t.text, recognizer: rec, style: wordStyle));
      }
    }

    return Text.rich(
      TextSpan(children: spans),
      textAlign: widget.justify ? TextAlign.justify : TextAlign.left,
    );
  }
}
