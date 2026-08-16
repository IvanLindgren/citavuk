/// Карточка места: подсказка, слова, фразы и разговор.
///
/// Содержимое привязано к типу места, а не к конкретному адресу: пекарен в
/// Белграде тысячи, и слова в них одни и те же. Название конкретного заведения
/// идёт только в заголовке.
library;

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'content.dart';

class PlaceSheet extends StatefulWidget {
  const PlaceSheet({
    super.key,
    required this.kind,
    required this.content,
    required this.title,
    required this.script,
  });

  final PlaceKind kind;
  final PlaceContent content;

  /// Название конкретного места. Пусто — заголовком идёт название типа.
  final String title;
  final TravelScript script;

  @override
  State<PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends State<PlaceSheet> {
  /// Узел разговора, на котором стоим. Пусто — разговор ещё не начат.
  String _node = '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final content = widget.content;
    final title = widget.title.isNotEmpty
        ? widget.title
        : inScript(widget.kind.sr, widget.script);

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.3,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: theme.colorScheme.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Text(title,
              style: theme.textTheme.headlineSmall
                  ?.copyWith(fontWeight: FontWeight.w800)),
          Text(
            '${inScript(widget.kind.sr, widget.script)} · ${widget.kind.ru}',
            style: theme.textTheme.bodySmall,
          ),
          if (content.hint.isNotEmpty) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(content.hint, style: const TextStyle(height: 1.45)),
            ),
          ],
          if (content.words.isNotEmpty) ...[
            const SizedBox(height: 22),
            _Heading(sr: 'Речи', ru: 'слова', script: widget.script),
            const SizedBox(height: 10),
            for (final word in content.words)
              _Line(phrase: word, script: widget.script),
          ],
          if (content.phrases.isNotEmpty) ...[
            const SizedBox(height: 22),
            _Heading(sr: 'Фразе', ru: 'фразы', script: widget.script),
            const SizedBox(height: 10),
            for (final phrase in content.phrases)
              _Line(phrase: phrase, script: widget.script, big: true),
          ],
          if (content.dialogue != null) ...[
            const SizedBox(height: 22),
            _Heading(sr: 'Разговор', ru: 'разговор', script: widget.script),
            const SizedBox(height: 10),
            _dialogue(content.dialogue!),
          ],
        ],
      ),
    );
  }

  /// Разговор идёт по узлам, как диалоги курса: выбрал ответ — пошёл дальше.
  Widget _dialogue(PlaceDialogue dialogue) {
    final id = _node.isEmpty ? dialogue.startNodeId : _node;
    final node = dialogue.nodeById(id);
    if (node == null) {
      return const Text('Разговор потерялся. Открой карточку заново.');
    }
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                node.speaker,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.8,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                inScript(node.text, widget.script),
                style: const TextStyle(
                    fontFamily: 'NotoSerif', fontSize: 17, height: 1.45),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        for (final choice in node.choices)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(46),
                alignment: Alignment.centerLeft,
              ),
              onPressed: () => setState(() => _node = choice.next),
              child: Text(inScript(choice.label, widget.script)),
            ),
          ),
        if (node.end)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _node = ''),
              icon: const Icon(Icons.refresh),
              label: const Text('Ещё раз'),
            ),
          ),
      ],
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading({required this.sr, required this.ru, required this.script});

  final String sr;
  final String ru;
  final TravelScript script;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(inScript(sr, script),
            style: const TextStyle(
                fontFamily: 'Lora', fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(width: 8),
        Text(ru, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({
    required this.phrase,
    required this.script,
    this.big = false,
  });

  final TravelPhrase phrase;
  final TravelScript script;
  final bool big;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 3,
            height: big ? 34 : 26,
            margin: const EdgeInsets.only(right: 10, top: 2),
            color: SerbColors.serbRed.withValues(alpha: 0.5),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SelectableText(
                  inScript(phrase.sr, script),
                  style: TextStyle(
                    fontFamily: 'NotoSerif',
                    fontSize: big ? 17 : 16,
                    height: 1.35,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(phrase.ru,
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
