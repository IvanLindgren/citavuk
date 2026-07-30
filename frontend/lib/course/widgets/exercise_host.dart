/// Единая точка отрисовки упражнения любого типа.
///
/// Экран урока не содержит `switch` по типам — он живёт здесь, а каждый тип
/// имеет отдельный renderer (master-prompt §6). Тот же host используется в
/// «Тренажёрке», чтобы не появилось два несовместимых движка упражнений.
library;

import 'package:flutter/material.dart';

import '../models/answer.dart';
import '../models/exercise.dart';
import 'choice_view.dart';
import 'ending_picker_view.dart';
import 'fill_blank_view.dart';
import 'form_hunt_view.dart';
import 'image_description_view.dart';
import 'letter_unscramble_view.dart';
import 'matching_view.dart';
import 'reading_qa_view.dart';
import 'sentence_builder_view.dart';

class ExerciseHost extends StatelessWidget {
  const ExerciseHost({
    super.key,
    required this.exercise,
    required this.onChanged,
    this.answer,
    this.enabled = true,
  });

  final Exercise exercise;

  /// Вызывается при изменении черновика ответа. null — ответ снят.
  final ValueChanged<Answer?> onChanged;
  final Answer? answer;

  /// false после проверки: ответ больше нельзя менять.
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Формулировка задания. Служебные поля (exerciseId, sourceAnchor)
        // пользователю не показываются (§10).
        Text(
          exercise.prompt,
          style: const TextStyle(
              fontSize: 19, height: 1.35, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 20),
        switch (exercise) {
          MultipleChoiceExercise e => ChoiceView(
              key: ValueKey(e.id),
              options: e.options,
              multi: e.multi,
              shuffleSeed: e.id,
              answer: answer,
              enabled: enabled,
              onChanged: onChanged,
            ),
          SentenceBuilderExercise e => SentenceBuilderView(
              key: ValueKey(e.id),
              exercise: e,
              answer: answer,
              enabled: enabled,
              onChanged: onChanged,
            ),
          EndingPickerExercise e => EndingPickerView(
              key: ValueKey(e.id),
              exercise: e,
              answer: answer,
              enabled: enabled,
              onChanged: onChanged,
            ),
          LetterUnscrambleExercise e => LetterUnscrambleView(
              key: ValueKey(e.id),
              exercise: e,
              answer: answer,
              enabled: enabled,
              onChanged: onChanged,
            ),
          MatchingExercise e => MatchingView(
              key: ValueKey(e.id),
              exercise: e,
              answer: answer,
              enabled: enabled,
              onChanged: onChanged,
            ),
          FillBlankExercise e => FillBlankView(
              key: ValueKey(e.id),
              exercise: e,
              answer: answer,
              enabled: enabled,
              onChanged: onChanged,
            ),
          ImageDescriptionExercise e => ImageDescriptionView(
              key: ValueKey(e.id),
              exercise: e,
              answer: answer,
              enabled: enabled,
              onChanged: onChanged,
            ),
          ReadingQaExercise e => ReadingQaView(
              key: ValueKey(e.id),
              exercise: e,
              answer: answer,
              enabled: enabled,
              onChanged: onChanged,
            ),
          FormHuntExercise e => FormHuntView(
              key: ValueKey(e.id),
              exercise: e,
              answer: answer,
              enabled: enabled,
              onChanged: onChanged,
            ),
        },
      ],
    );
  }
}
