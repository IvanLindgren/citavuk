/// Отрисовка структурированного вступления к уроку.
///
/// Вместо сплошного абзаца — абзацы, подсказки, таблицы терминов и примеры,
/// появляющиеся каскадом. Сербские термины внутри текста выделяются, чтобы
/// глаз цеплялся за форму, а не за поток русского текста.
library;

import 'package:flutter/material.dart';

import '../../widgets/animated_widgets.dart';
import '../models/course.dart';

class IntroBlocksView extends StatelessWidget {
  const IntroBlocksView({super.key, required this.blocks});

  final List<IntroBlock> blocks;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < blocks.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: reduceMotion
                ? _IntroBlockView(block: blocks[i])
                : FadeSlideIn(
                    // Каскад: блоки проявляются друг за другом.
                    delay: Duration(milliseconds: 90 * i),
                    child: _IntroBlockView(block: blocks[i]),
                  ),
          ),
      ],
    );
  }
}

class _IntroBlockView extends StatelessWidget {
  const _IntroBlockView({required this.block});

  final IntroBlock block;

  @override
  Widget build(BuildContext context) => switch (block.kind) {
        IntroBlockKind.paragraph => _Paragraph(text: block.text),
        IntroBlockKind.tip => _Tip(text: block.text),
        IntroBlockKind.terms =>
          _TermsCard(title: block.title, rows: block.rows),
        IntroBlockKind.example => _ExampleCard(
            serbian: block.serbian,
            russian: block.russian,
            highlight: block.highlight,
          ),
      };
}

/// Разбирает разметку `*термин*` на обычные и выделенные фрагменты.
///
/// Держится нарочно простой: полноценный Markdown вступлению не нужен, а
/// одна парная звёздочка проверяется валидатором контента.
List<TextSpan> buildTermSpans(
  String text, {
  required TextStyle base,
  required TextStyle term,
}) {
  final spans = <TextSpan>[];
  var plain = true;
  for (final part in text.split('*')) {
    if (part.isNotEmpty) {
      spans.add(TextSpan(text: part, style: plain ? base : term));
    }
    plain = !plain;
  }
  return spans;
}

class _Paragraph extends StatelessWidget {
  const _Paragraph({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final base = TextStyle(fontSize: 17, height: 1.55, color: scheme.onSurface);
    return RichText(
      text: TextSpan(
        children: buildTermSpans(
          text,
          base: base,
          term: base.copyWith(
            fontWeight: FontWeight.w700,
            color: scheme.primary,
          ),
        ),
      ),
    );
  }
}

class _Tip extends StatelessWidget {
  const _Tip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final base = TextStyle(fontSize: 16, height: 1.5, color: scheme.onSurface);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.tertiary.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(14),
        border: Border(
          left: BorderSide(color: scheme.tertiary, width: 4),
          top: BorderSide(color: scheme.tertiary.withValues(alpha: 0.35)),
          right: BorderSide(color: scheme.tertiary.withValues(alpha: 0.35)),
          bottom: BorderSide(color: scheme.tertiary.withValues(alpha: 0.35)),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.emoji_objects_outlined, size: 22, color: scheme.tertiary),
          const SizedBox(width: 12),
          Expanded(
            child: RichText(
              text: TextSpan(
                children: buildTermSpans(
                  text,
                  base: base,
                  term: base.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Таблица «термин → значение». Строки переносятся на узком экране.
class _TermsCard extends StatelessWidget {
  const _TermsCard({required this.title, required this.rows});

  final String title;
  final List<TermRow> rows;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                  color: scheme.secondary,
                ),
              ),
            ),
          for (var i = 0; i < rows.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
              decoration: BoxDecoration(
                border: i == 0
                    ? null
                    : Border(
                        top: BorderSide(
                          color: scheme.primary.withValues(alpha: 0.15),
                        ),
                      ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 116,
                    child: Text(
                      rows[i].term,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: scheme.primary,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          rows[i].gloss,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600),
                        ),
                        if (rows[i].note.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              rows[i].note,
                              style: TextStyle(
                                fontSize: 13,
                                color: scheme.onSurface.withValues(alpha: 0.65),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 6),
        ],
      ),
    );
  }
}

/// Пример: сербская фраза с подсветкой нужной формы и перевод.
class _ExampleCard extends StatelessWidget {
  const _ExampleCard({
    required this.serbian,
    required this.russian,
    required this.highlight,
  });

  final String serbian;
  final String russian;
  final String highlight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.secondary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.secondary.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _HighlightedSentence(text: serbian, highlight: highlight),
          if (russian.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              russian,
              style: TextStyle(
                fontSize: 15,
                height: 1.4,
                color: scheme.onSurface.withValues(alpha: 0.75),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HighlightedSentence extends StatelessWidget {
  const _HighlightedSentence({required this.text, required this.highlight});

  final String text;
  final String highlight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final base = TextStyle(
      fontSize: 18,
      height: 1.4,
      fontWeight: FontWeight.w600,
      color: scheme.onSurface,
    );
    if (highlight.isEmpty) {
      return Text(text, style: base);
    }
    final index = text.indexOf(highlight);
    if (index < 0) {
      return Text(text, style: base);
    }
    return RichText(
      text: TextSpan(
        style: base,
        children: [
          TextSpan(text: text.substring(0, index)),
          TextSpan(
            text: highlight,
            style: base.copyWith(
              color: scheme.primary,
              fontWeight: FontWeight.w800,
              decoration: TextDecoration.underline,
              decorationColor: scheme.primary.withValues(alpha: 0.5),
              decorationThickness: 2,
            ),
          ),
          TextSpan(text: text.substring(index + highlight.length)),
        ],
      ),
    );
  }
}
