/// Найти в тексте все формы с заданным признаком.
///
/// Слова — отдельные нажимаемые плитки, собранные в строку через [Wrap].
/// Так текст переносится по словам, а нажатие попадает точно в слово, не
/// задевая точку или запятую после него.
library;

import 'package:flutter/material.dart';

import '../models/answer.dart';
import '../models/exercise.dart';

class FormHuntView extends StatelessWidget {
  const FormHuntView({
    super.key,
    required this.exercise,
    required this.onChanged,
    this.answer,
    this.enabled = true,
  });

  final FormHuntExercise exercise;
  final ValueChanged<Answer?> onChanged;
  final Answer? answer;
  final bool enabled;

  Set<String> get _selected =>
      (answer as ChoiceAnswer?)?.optionIds ?? const <String>{};

  void _toggle(String id) {
    final next = Set<String>.of(_selected);
    if (!next.remove(id)) next.add(id);
    onChanged(next.isEmpty ? null : ChoiceAnswer(next));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final selected = _selected;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: scheme.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.search, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  'Найдите: ${exercise.targetLabel}',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: scheme.primary,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: scheme.primary.withValues(alpha: 0.18)),
          ),
          child: Wrap(
            spacing: 2,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              for (final token in exercise.tokens)
                _WordChip(
                  token: token,
                  selected: selected.contains(token.id),
                  enabled: enabled,
                  onTap: () => _toggle(token.id),
                ),
            ],
          ),
        ),
        if (exercise.translation.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            exercise.translation,
            style: TextStyle(
              fontSize: 14,
              height: 1.4,
              fontStyle: FontStyle.italic,
              color: scheme.onSurface.withValues(alpha: 0.65),
            ),
          ),
        ],
        const SizedBox(height: 10),
        Text(
          selected.isEmpty
              ? 'Нажимайте на слова, которые подходят.'
              : 'Отмечено слов: ${selected.length}',
          style: TextStyle(
            fontSize: 13,
            color: scheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
      ],
    );
  }
}

class _WordChip extends StatelessWidget {
  const _WordChip({
    required this.token,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final HuntToken token;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          button: true,
          selected: selected,
          enabled: enabled,
          label: token.text,
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: enabled ? onTap : null,
              borderRadius: BorderRadius.circular(8),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 140),
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                decoration: BoxDecoration(
                  color: selected
                      ? scheme.primary.withValues(alpha: 0.22)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                  // Отмеченное слово подчёркнуто, а не только подсвечено:
                  // цвет один не должен быть носителем состояния (§20).
                  border: Border(
                    bottom: BorderSide(
                      color: selected ? scheme.primary : Colors.transparent,
                      width: 2,
                    ),
                  ),
                ),
                child: Text(
                  token.text,
                  style: TextStyle(
                    fontSize: 17,
                    height: 1.5,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                    color: scheme.onSurface,
                  ),
                ),
              ),
            ),
          ),
        ),
        if (token.tail.isNotEmpty)
          Text(
            token.tail,
            style: const TextStyle(fontSize: 17, height: 1.5),
          ),
      ],
    );
  }
}
