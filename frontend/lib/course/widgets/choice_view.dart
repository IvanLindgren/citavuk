/// Выбор варианта(ов) ответа.
library;

import 'package:flutter/material.dart';

import '../models/answer.dart';
import '../models/exercise.dart';
import '../services/exercise_shuffle.dart';
import 'course_chip.dart';

class ChoiceView extends StatelessWidget {
  const ChoiceView({
    super.key,
    required this.options,
    required this.multi,
    required this.onChanged,
    required this.shuffleSeed,
    this.answer,
    this.enabled = true,
  });

  final List<ChoiceOption> options;
  final bool multi;
  final ValueChanged<Answer?> onChanged;

  /// Строка, по которой перемешиваются варианты — обычно ID упражнения.
  ///
  /// В материалах курса верный ответ записан первым во всех ста пятидесяти
  /// девяти заданиях с выбором: так их удобнее вычитывать. Без перемешивания
  /// курс проходился нажатием на первую строку, ничего не читая. Порядок
  /// детерминирован по этой же строке, поэтому при возврате к уроку варианты
  /// не перескакивают с места на место.
  final String shuffleSeed;

  final Answer? answer;
  final bool enabled;

  Set<String> get _selected =>
      (answer as ChoiceAnswer?)?.optionIds ?? const <String>{};

  void _toggle(String id) {
    if (!multi) {
      onChanged(ChoiceAnswer({id}));
      return;
    }
    final next = Set<String>.of(_selected);
    if (!next.remove(id)) next.add(id);
    onChanged(next.isEmpty ? null : ChoiceAnswer(next));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final selected = _selected;
    final shown = seededShuffle(options, seedFromString(shuffleSeed));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (multi)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              'Можно выбрать несколько вариантов',
              style: TextStyle(
                fontSize: 13,
                color: scheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
          ),
        for (final option in shown)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _OptionRow(
              option: option,
              selected: selected.contains(option.id),
              multi: multi,
              enabled: enabled,
              onTap: () => _toggle(option.id),
            ),
          ),
      ],
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({
    required this.option,
    required this.selected,
    required this.multi,
    required this.enabled,
    required this.onTap,
  });

  final ChoiceOption option;
  final bool selected;
  final bool multi;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      inMutuallyExclusiveGroup: !multi,
      selected: selected,
      enabled: enabled,
      label: option.text,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: const BoxConstraints(minHeight: kMinTouchTarget + 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: selected
                  ? scheme.primary.withValues(alpha: 0.14)
                  : scheme.surfaceContainerHighest.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected
                    ? scheme.primary
                    : scheme.primary.withValues(alpha: 0.25),
                width: selected ? 1.8 : 1.2,
              ),
            ),
            child: Row(
              children: [
                // Форма значка отличает одиночный выбор от множественного,
                // а состояние передаётся не только цветом (§20).
                Icon(
                  multi
                      ? (selected
                          ? Icons.check_box
                          : Icons.check_box_outline_blank)
                      : (selected
                          ? Icons.radio_button_checked
                          : Icons.radio_button_unchecked),
                  size: 22,
                  color: selected
                      ? scheme.primary
                      : scheme.onSurface.withValues(alpha: 0.45),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    option.text,
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.35,
                      fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                      color: scheme.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
