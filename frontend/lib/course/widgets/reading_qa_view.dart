/// Текст на сербском и вопросы к нему.
///
/// Текст остаётся на экране, пока ученик отвечает: задание проверяет
/// понимание прочитанного, а не память о прочитанном. Перевод спрятан за
/// кнопку — открытый, он превратил бы упражнение в чтение по-русски.
library;

import 'package:flutter/material.dart';

import '../models/answer.dart';
import '../models/exercise.dart';
import 'course_chip.dart';

class ReadingQaView extends StatefulWidget {
  const ReadingQaView({
    super.key,
    required this.exercise,
    required this.onChanged,
    this.answer,
    this.enabled = true,
  });

  final ReadingQaExercise exercise;
  final ValueChanged<Answer?> onChanged;
  final Answer? answer;
  final bool enabled;

  @override
  State<ReadingQaView> createState() => _ReadingQaViewState();
}

class _ReadingQaViewState extends State<ReadingQaView> {
  bool _showTranslation = false;

  /// Выбранные варианты. Хранятся здесь, а не выводятся из [widget.answer].
  ///
  /// Наверх ответ уходит только когда отвечены все вопросы — иначе кнопка
  /// «Проверить» разблокировалась бы на половине задания. Пока задание не
  /// закончено, наверху лежит null, и выводить из него отметки нельзя: первое
  /// же нажатие возвращалось бы обратно пустым, кружки не загорались, а
  /// «Проверить» не включалась никогда. Задания с двумя вопросами — а такие
  /// все — из-за этого нельзя было пройти вовсе.
  late Map<String, String> _chosen;

  @override
  void initState() {
    super.initState();
    _chosen = {...?(widget.answer as PairsAnswer?)?.assignments};
  }

  @override
  void didUpdateWidget(ReadingQaView oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Ответ сбросили снаружи — например, задание предложили пройти заново.
    if (widget.answer == null && oldWidget.answer != null) {
      _chosen = {};
    }
  }

  void _pick(String questionId, String optionId) {
    final next = Map<String, String>.of(_chosen)..[questionId] = optionId;
    final complete = next.length == widget.exercise.questions.length;
    widget.onChanged(complete ? PairsAnswer(next) : null);
    setState(() => _chosen = next);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final chosen = _chosen;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: scheme.primary.withValues(alpha: 0.2)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SelectableText(
                widget.exercise.text,
                style: const TextStyle(fontSize: 17, height: 1.55),
              ),
              if (widget.exercise.translation.isNotEmpty) ...[
                const SizedBox(height: 10),
                if (_showTranslation)
                  Text(
                    widget.exercise.translation,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.45,
                      fontStyle: FontStyle.italic,
                      color: scheme.onSurface.withValues(alpha: 0.7),
                    ),
                  )
                else
                  TextButton.icon(
                    onPressed: () => setState(() => _showTranslation = true),
                    icon: const Icon(Icons.translate, size: 18),
                    label: const Text('Показать перевод'),
                  ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 18),
        for (var i = 0; i < widget.exercise.questions.length; i++) ...[
          if (i > 0) const SizedBox(height: 18),
          _QuestionBlock(
            index: i + 1,
            question: widget.exercise.questions[i],
            selectedId: chosen[widget.exercise.questions[i].id],
            enabled: widget.enabled,
            onPick: (optionId) =>
                _pick(widget.exercise.questions[i].id, optionId),
          ),
        ],
      ],
    );
  }
}

class _QuestionBlock extends StatelessWidget {
  const _QuestionBlock({
    required this.index,
    required this.question,
    required this.selectedId,
    required this.enabled,
    required this.onPick,
  });

  final int index;
  final ReadingQuestion question;
  final String? selectedId;
  final bool enabled;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$index. ${question.prompt}',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        for (final option in question.options)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: enabled ? () => onPick(option.id) : null,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  constraints:
                      const BoxConstraints(minHeight: kMinTouchTarget),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: selectedId == option.id
                        ? scheme.primary.withValues(alpha: 0.14)
                        : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selectedId == option.id
                          ? scheme.primary
                          : scheme.primary.withValues(alpha: 0.2),
                      width: selectedId == option.id ? 1.8 : 1.2,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        selectedId == option.id
                            ? Icons.radio_button_checked
                            : Icons.radio_button_unchecked,
                        size: 20,
                        color: selectedId == option.id
                            ? scheme.primary
                            : scheme.onSurface.withValues(alpha: 0.45),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          option.text,
                          style: const TextStyle(fontSize: 15, height: 1.35),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
