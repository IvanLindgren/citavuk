/// Панель обратной связи после проверки ответа (master-prompt §8.3).
///
/// Результат передаётся иконкой, текстом и цветом одновременно — различение
/// красного и зелёного не требуется (§20).
library;

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../services/answer_evaluator.dart';
import '../services/serbian_text.dart';

class FeedbackPanel extends StatelessWidget {
  const FeedbackPanel({
    super.key,
    required this.result,
    this.onShowRule,
  });

  final EvaluationResult result;

  /// Показать подробное правило. null — кнопка не выводится.
  final VoidCallback? onShowRule;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final correct = result.correct;
    final accent = correct ? scheme.success : scheme.error;

    return Semantics(
      liveRegion: true,
      label: correct ? 'Верно' : 'Ошибка. Правильно: ${result.correctDisplay}',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: accent.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: accent.withValues(alpha: 0.65), width: 1.4),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  correct ? Icons.check_circle : Icons.cancel,
                  color: accent,
                  size: 24,
                ),
                const SizedBox(width: 10),
                Text(
                  correct ? 'Верно' : 'Неверно',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: accent,
                  ),
                ),
              ],
            ),
            if (!correct) ...[
              const SizedBox(height: 12),
              _AnswerRow(
                label: 'Ваш ответ',
                value: result.userDisplay,
                strikethrough: true,
              ),
              const SizedBox(height: 6),
              _CorrectAnswerRow(
                correctAnswer: result.correctDisplay,
                userAnswer: result.userDisplay,
                divergenceIndex: result.divergenceIndex,
              ),
            ],
            if (result.explanation.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                result.explanation,
                style: const TextStyle(fontSize: 15, height: 1.45),
              ),
            ],
            if (!correct && onShowRule != null) ...[
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: onShowRule,
                  icon: const Icon(Icons.menu_book_outlined, size: 18),
                  label: const Text('Показать правило'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AnswerRow extends StatelessWidget {
  const _AnswerRow({
    required this.label,
    required this.value,
    this.strikethrough = false,
  });

  final String label;
  final String value;
  final bool strikethrough;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 108,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              color: scheme.onSurface.withValues(alpha: 0.65),
            ),
          ),
        ),
        Expanded(
          child: Text(
            value.isEmpty ? '—' : value,
            style: TextStyle(
              fontSize: 16,
              decoration: strikethrough ? TextDecoration.lineThrough : null,
              decorationColor: scheme.error,
              color: scheme.onSurface.withValues(alpha: 0.8),
            ),
          ),
        ),
      ],
    );
  }
}

/// Правильный ответ с подсветкой расходящейся части.
class _CorrectAnswerRow extends StatelessWidget {
  const _CorrectAnswerRow({
    required this.correctAnswer,
    required this.userAnswer,
    required this.divergenceIndex,
  });

  final String correctAnswer;
  final String userAnswer;
  final int divergenceIndex;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final letters = splitLetters(correctAnswer);
    final showHighlight =
        divergenceIndex >= 0 && divergenceIndex < letters.length;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 108,
          child: Text(
            'Правильно',
            style: TextStyle(
              fontSize: 13,
              color: scheme.onSurface.withValues(alpha: 0.65),
            ),
          ),
        ),
        Expanded(
          child: showHighlight
              // Различающийся хвост выделяется весом и подчёркиванием,
              // а не только цветом.
              ? RichText(
                  text: TextSpan(
                    style: TextStyle(fontSize: 16, color: scheme.onSurface),
                    children: [
                      TextSpan(text: letters.take(divergenceIndex).join()),
                      TextSpan(
                        text: letters.skip(divergenceIndex).join(),
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: scheme.success,
                          decoration: TextDecoration.underline,
                          decorationColor: scheme.success,
                          decorationThickness: 2,
                        ),
                      ),
                    ],
                  ),
                )
              : Text(
                  correctAnswer,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: scheme.onSurface,
                  ),
                ),
        ),
      ],
    );
  }
}
