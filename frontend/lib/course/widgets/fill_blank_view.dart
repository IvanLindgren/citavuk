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
      _createControllers();
    }
  }

  void _createControllers() {
    final existing = (widget.answer as BlanksAnswer?)?.values ?? const {};
    _controllers = {
      for (final b in widget.exercise.blanks)
        b.id: TextEditingController(text: existing[b.id] ?? ''),
    };
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
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

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ExerciseSectionLabel('ЗАПОЛНИТЕ ПРОПУСК'),
        // Текст переносится по строкам вместе с полями ввода: длинное
        // предложение не выходит за границы экрана.
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 4,
          runSpacing: 10,
          children: [
            for (final segment in widget.exercise.segments)
              if (segment.isBlank)
                SizedBox(
                  width: 128,
                  child: Semantics(
                    textField: true,
                    label: 'Пропуск',
                    child: TextField(
                      controller: _controllers[segment.blankId],
                      enabled: widget.enabled,
                      onChanged: (_) => _emit(),
                      textInputAction: TextInputAction.done,
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w600),
                      decoration: InputDecoration(
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 12),
                        constraints:
                            const BoxConstraints(minHeight: kMinTouchTarget),
                        filled: true,
                        fillColor: scheme.surfaceContainerHighest
                            .withValues(alpha: 0.6),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(
                              color: scheme.primary.withValues(alpha: 0.4)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(
                              color: scheme.primary.withValues(alpha: 0.4)),
                        ),
                      ),
                    ),
                  ),
                )
              else
                Text(
                  segment.text,
                  style: const TextStyle(fontSize: 17, height: 1.5),
                ),
          ],
        ),
      ],
    );
  }
}
