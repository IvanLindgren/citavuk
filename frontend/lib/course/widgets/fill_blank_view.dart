/// Заполнение пропусков в предложении.
library;

import 'package:flutter/material.dart';

import '../models/answer.dart';
import '../models/exercise.dart';
import 'course_chip.dart';

class FillBlankView extends StatefulWidget {
  const FillBlankView({
    super.key,
    required this.exercise,
    required this.onChanged,
    this.answer,
    this.enabled = true,
  });

  final FillBlankExercise exercise;
  final ValueChanged<Answer?> onChanged;
  final Answer? answer;
  final bool enabled;

  @override
  State<FillBlankView> createState() => _FillBlankViewState();
}

class _FillBlankViewState extends State<FillBlankView> {
  late Map<String, TextEditingController> _controllers;
  final Map<String, FocusNode> _focusNodes = {};
  String? _activeBlank;

  @override
  void initState() {
    super.initState();
    _createControllers();
  }

  @override
  void didUpdateWidget(FillBlankView old) {
    super.didUpdateWidget(old);
    if (old.exercise.id != widget.exercise.id) {
      for (final c in _controllers.values) {
        c.dispose();
      }
      for (final node in _focusNodes.values) {
        node.dispose();
      }
      _focusNodes.clear();
      _createControllers();
    }
  }

  void _createControllers() {
    final existing = (widget.answer as BlanksAnswer?)?.values ?? const {};
    _controllers = {
      for (final b in widget.exercise.blanks)
        b.id: TextEditingController(text: existing[b.id] ?? ''),
    };
    for (final blank in widget.exercise.blanks) {
      final node = FocusNode();
      node.addListener(() {
        if (node.hasFocus) _activeBlank = blank.id;
      });
      _focusNodes[blank.id] = node;
    }
    _activeBlank = widget.exercise.blanks.firstOrNull?.id;
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    for (final node in _focusNodes.values) {
      node.dispose();
    }
    super.dispose();
  }

  void _emit() {
    final values = {
      for (final entry in _controllers.entries) entry.key: entry.value.text,
    };
    final anyFilled = values.values.any((v) => v.trim().isNotEmpty);
    widget.onChanged(anyFilled ? BlanksAnswer(values) : null);
  }

  void _insert(String letter) {
    if (!widget.enabled) return;
    final controller = _controllers[_activeBlank];
    if (controller == null) return;
    final selection = controller.selection;
    final start = selection.isValid ? selection.start : controller.text.length;
    final end = selection.isValid ? selection.end : start;
    controller.value = TextEditingValue(
      text: controller.text.replaceRange(start, end, letter),
      selection: TextSelection.collapsed(offset: start + letter.length),
    );
    _focusNodes[_activeBlank]?.requestFocus();
    _emit();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ExerciseSectionLabel('ЗАПОЛНИ ПРОПУСКИ'),
        // Номер связывает место в тексте с просторным полем ниже.
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 4,
          runSpacing: 10,
          children: [
            for (final segment in widget.exercise.segments)
              if (segment.isBlank)
                OutlinedButton(
                  onPressed: widget.enabled
                      ? () => _focusNodes[segment.blankId]?.requestFocus()
                      : null,
                  child: Text(
                      '${widget.exercise.blanks.indexWhere((b) => b.id == segment.blankId) + 1}'),
                )
              else
                Text(
                  segment.text,
                  style: const TextStyle(fontSize: 17, height: 1.5),
                ),
          ],
        ),
        const SizedBox(height: 18),
        for (var i = 0; i < widget.exercise.blanks.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: TextField(
              controller: _controllers[widget.exercise.blanks[i].id],
              focusNode: _focusNodes[widget.exercise.blanks[i].id],
              enabled: widget.enabled,
              autocorrect: false,
              enableSuggestions: false,
              minLines: 1,
              maxLines: 3,
              scrollPadding: const EdgeInsets.all(80),
              textInputAction: i + 1 < widget.exercise.blanks.length
                  ? TextInputAction.next
                  : TextInputAction.done,
              onTap: () => _activeBlank = widget.exercise.blanks[i].id,
              onChanged: (_) {
                _activeBlank = widget.exercise.blanks[i].id;
                _emit();
              },
              onSubmitted: (_) {
                if (i + 1 < widget.exercise.blanks.length) {
                  _activeBlank = widget.exercise.blanks[i + 1].id;
                  _focusNodes[_activeBlank]?.requestFocus();
                }
              },
              style: const TextStyle(fontSize: 17, height: 1.5),
              decoration: InputDecoration(
                labelText: 'Пропуск ${i + 1}',
                hintText: 'Впиши слово или выражение',
                alignLabelWithHint: true,
              ),
            ),
          ),
        Text('Сербские буквы',
            style: TextStyle(color: scheme.onSurfaceVariant)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final letter in [
              'č',
              'ć',
              'š',
              'ž',
              'đ',
              'ј',
              'љ',
              'њ',
              'ћ',
              'ђ',
              'џ'
            ])
              TextButton(
                onPressed: widget.enabled ? () => _insert(letter) : null,
                style: TextButton.styleFrom(minimumSize: const Size(44, 48)),
                child: Text(letter, style: const TextStyle(fontSize: 20)),
              ),
          ],
        ),
      ],
    );
  }
}
