/// Сборка предложения из банка слов (master-prompt §6.1).
library;

import 'package:flutter/material.dart';

import '../models/answer.dart';
import '../models/exercise.dart';
import '../services/exercise_shuffle.dart';
import 'course_chip.dart';

class SentenceBuilderView extends StatefulWidget {
  const SentenceBuilderView({
    super.key,
    required this.exercise,
    required this.onChanged,
    this.answer,
    this.enabled = true,
  });

  final SentenceBuilderExercise exercise;
  final ValueChanged<Answer?> onChanged;
  final Answer? answer;
  final bool enabled;

  @override
  State<SentenceBuilderView> createState() => _SentenceBuilderViewState();
}

class _SentenceBuilderViewState extends State<SentenceBuilderView> {
  /// Порядок плиток в банке. Детерминирован по ID упражнения, поэтому
  /// одинаков при восстановлении урока.
  late List<Token> _bankOrder;

  List<String> get _selected =>
      (widget.answer as OrderAnswer?)?.tokenIds ?? const [];

  @override
  void initState() {
    super.initState();
    _bankOrder = shuffleAvoidingOriginal(
      widget.exercise.allTokens,
      widget.exercise.tokens,
      seedFromString(widget.exercise.id),
      equals: (a, b) => a.id == b.id,
    );
  }

  @override
  void didUpdateWidget(SentenceBuilderView old) {
    super.didUpdateWidget(old);
    if (old.exercise.id != widget.exercise.id) {
      _bankOrder = shuffleAvoidingOriginal(
        widget.exercise.allTokens,
        widget.exercise.tokens,
        seedFromString(widget.exercise.id),
        equals: (a, b) => a.id == b.id,
      );
    }
  }

  void _emit(List<String> ids) =>
      widget.onChanged(ids.isEmpty ? null : OrderAnswer(ids));

  void _add(String id) => _emit([..._selected, id]);

  void _removeAt(int index) {
    final next = [..._selected]..removeAt(index);
    _emit(next);
  }

  void _reset() => widget.onChanged(null);

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    final byId = {for (final t in widget.exercise.allTokens) t.id: t};
    final used = selected.toSet();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ExerciseSectionLabel('ВАШ ОТВЕТ'),
        AnswerDropArea(
          child: selected.isEmpty
              ? Text(
                  'Нажимай слова ниже, чтобы собрать предложение',
                  style: TextStyle(
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.55),
                  ),
                )
              : Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (var i = 0; i < selected.length; i++)
                      CourseChip(
                        label: byId[selected[i]]?.text ?? '?',
                        enabled: widget.enabled,
                        selected: true,
                        semanticLabel:
                            '${byId[selected[i]]?.text}, позиция ${i + 1}. Нажмите, чтобы убрать',
                        onTap: () => _removeAt(i),
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            const Expanded(child: ExerciseSectionLabel('БАНК СЛОВ')),
            if (selected.isNotEmpty && widget.enabled)
              TextButton.icon(
                onPressed: _reset,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Сбросить'),
              ),
          ],
        ),
        // Банк не меняет высоту при переносе слов в ответ: занятые плитки
        // остаются на месте в неактивном виде.
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final token in _bankOrder)
              CourseChip(
                label: token.text,
                enabled: widget.enabled && !used.contains(token.id),
                semanticLabel: used.contains(token.id)
                    ? '${token.text}, уже использовано'
                    : '${token.text}. Нажмите, чтобы добавить в ответ',
                onTap: () => _add(token.id),
              ),
          ],
        ),
      ],
    );
  }
}
