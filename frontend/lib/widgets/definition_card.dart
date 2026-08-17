import 'package:flutter/material.dart';

import '../models/definition.dart';

/// Значения слова по-сербски — отдельной карточкой под переводом.
///
/// Словарь чужой, и назвать его обязательно: статья показана как цитата с
/// указанием источника, а не как наш собственный текст. Сочинённое нейросетью
/// толкование подписывается иначе — выдать его за статью Матице српске нельзя,
/// и ссылаться там не на что.
class DefinitionCard extends StatelessWidget {
  const DefinitionCard(this.definition, {super.key});

  final Definition definition;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.65);
    final many = definition.senses.length > 1;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('ЗНАЧЕНИЕ ПО-СЕРБСКИ',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.6,
                        color: muted)),
                const SizedBox(height: 4),
                Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: definition.headword,
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          fontFamily: 'NotoSerif',
                          color: scheme.onSurface),
                    ),
                    if (definition.grammar.isNotEmpty)
                      TextSpan(
                        text: '  ${definition.grammar}',
                        style: TextStyle(
                            fontSize: 13,
                            fontStyle: FontStyle.italic,
                            color: muted),
                      ),
                  ]),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: scheme.outlineVariant),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < definition.senses.length; i++)
                  _sense(scheme, muted, definition.senses[i], i, many),
                const SizedBox(height: 8),
                Divider(height: 1, color: scheme.outlineVariant),
                const SizedBox(height: 8),
                Text(
                  _source(),
                  style: TextStyle(
                      fontSize: 11.5,
                      height: 1.35,
                      fontStyle: definition.generated
                          ? FontStyle.italic
                          : FontStyle.normal,
                      color: muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _source() {
    if (definition.generated) return definition.sourceTitle;
    final parts = <String>[definition.sourceTitle];
    if (definition.volume > 0) parts.add('том ${definition.volume}');
    if (definition.page > 0) parts.add('с. ${definition.page}');
    return parts.join(', ');
  }

  Widget _sense(ColorScheme scheme, Color muted, DefinitionSense sense,
      int index, bool many) {
    final number = sense.number.isNotEmpty
        ? sense.number
        : (many ? '${index + 1}' : '');
    final marks = [sense.domain, sense.register]
        .where((value) => value.isNotEmpty)
        .join(', ');

    return Padding(
      padding: EdgeInsets.only(bottom: index == definition.senses.length - 1 ? 0 : 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              style: TextStyle(
                  fontSize: 14, height: 1.45, color: scheme.onSurface),
              children: [
                if (number.isNotEmpty)
                  TextSpan(
                      text: '$number. ',
                      style:
                          TextStyle(fontWeight: FontWeight.bold, color: muted)),
                if (marks.isNotEmpty)
                  TextSpan(
                      text: '$marks ',
                      style: TextStyle(
                          fontStyle: FontStyle.italic, color: muted)),
                TextSpan(text: sense.definition),
              ],
            ),
          ),
          // Цитаты набраны мельче: они иллюстрация, а не толкование, и
          // читающему по слогам не должны мешать искать главное.
          for (final example in sense.examples)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 2),
              child: Container(
                padding: const EdgeInsets.only(left: 8),
                decoration: BoxDecoration(
                  border: Border(
                    left: BorderSide(color: scheme.outlineVariant, width: 2),
                  ),
                ),
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: example.text,
                      style: TextStyle(
                          fontSize: 12,
                          height: 1.4,
                          fontStyle: FontStyle.italic,
                          color: muted),
                    ),
                    if (example.source.isNotEmpty)
                      TextSpan(
                        text: ' — ${example.source}',
                        style: TextStyle(fontSize: 12, color: muted),
                      ),
                  ]),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
