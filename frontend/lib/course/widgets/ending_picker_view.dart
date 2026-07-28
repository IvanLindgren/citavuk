/// Подбор окончания глагола или существительного (master-prompt §6.2, §6.3).
///
/// Основа отделена от слота окончания визуально, поэтому видно, что именно
/// меняется. Варианты — чипы с зоной нажатия не меньше 44×44.
library;

import 'package:flutter/material.dart';

import '../models/answer.dart';
import '../models/exercise.dart';
import 'course_chip.dart';

class EndingPickerView extends StatelessWidget {
  const EndingPickerView({
    super.key,
    required this.exercise,
    required this.onChanged,
    this.answer,
    this.enabled = true,
  });

  final EndingPickerExercise exercise;
  final ValueChanged<Answer?> onChanged;
  final Answer? answer;
  final bool enabled;

  String? get _selectedId {
    final ids = (answer as ChoiceAnswer?)?.optionIds;
    return ids == null || ids.isEmpty ? null : ids.first;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final selected = _selectedId;
    final selectedText = selected == null
        ? null
        : exercise.options.where((o) => o.id == selected).firstOrNull?.text;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (exercise.contextSentence.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              exercise.contextSentence,
              style: const TextStyle(fontSize: 17, height: 1.4),
            ),
          ),
        const ExerciseSectionLabel('ФОРМА'),
        // Основа + слот окончания.
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (exercise.preposition != null &&
                exercise.preposition!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Text(
                  exercise.preposition!,
                  style: TextStyle(
                    fontSize: 22,
                    fontStyle: FontStyle.italic,
                    color: scheme.secondary,
                  ),
                ),
              ),
            Text(
              exercise.stem,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
            ),
            const SizedBox(width: 4),
            Container(
              constraints: const BoxConstraints(
                  minWidth: 62, minHeight: kMinTouchTarget),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: selectedText == null
                    ? scheme.surfaceContainerHighest
                    : scheme.primary.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: scheme.primary.withValues(alpha: 0.5),
                  width: 1.6,
                ),
              ),
              child: Align(
                widthFactor: 1,
                heightFactor: 1,
                child: Text(
                  selectedText ?? '…',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: selectedText == null
                        ? scheme.onSurface.withValues(alpha: 0.4)
                        : scheme.primary,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        const ExerciseSectionLabel('ОКОНЧАНИЕ'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final option in exercise.options)
              CourseChip(
                label: option.text,
                selected: option.id == selected,
                enabled: enabled,
                semanticLabel:
                    'Окончание ${option.text}. Полная форма ${exercise.stem}${option.text}',
                onTap: () => onChanged(ChoiceAnswer({option.id})),
              ),
          ],
        ),
      ],
    );
  }
}
