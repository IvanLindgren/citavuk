/// Общие элементы упражнений: плитка-чип и подпись поля.
library;

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// Минимальный размер зоны нажатия (master-prompt §20).
const double kMinTouchTarget = 44;

/// Плитка со словом, буквой или окончанием.
///
/// Нажатие — основной способ взаимодействия во всех упражнениях: drag
/// остаётся дополнением, потому что доступен не всем пользователям (§20).
class CourseChip extends StatelessWidget {
  const CourseChip({
    super.key,
    required this.label,
    this.onTap,
    this.selected = false,
    this.enabled = true,
    this.semanticLabel,
    this.emphasis = ChipEmphasis.normal,
  });

  final String label;
  final VoidCallback? onTap;
  final bool selected;
  final bool enabled;
  final String? semanticLabel;
  final ChipEmphasis emphasis;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (background, foreground, border) = switch (emphasis) {
      ChipEmphasis.correct => (
          scheme.success.withValues(alpha: 0.22),
          scheme.onSurface,
          scheme.success,
        ),
      ChipEmphasis.wrong => (
          scheme.error.withValues(alpha: 0.14),
          scheme.onSurface,
          scheme.error,
        ),
      ChipEmphasis.normal => selected
          ? (scheme.primary, scheme.onPrimary, scheme.primary)
          : (
              scheme.surfaceContainerHighest,
              scheme.onSurface,
              scheme.primary.withValues(alpha: 0.3),
            ),
    };

    return Semantics(
      button: true,
      selected: selected,
      enabled: enabled,
      label: semanticLabel ?? label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(10),
          child: Opacity(
            opacity: enabled ? 1 : 0.45,
            child: Container(
              constraints: const BoxConstraints(
                minHeight: kMinTouchTarget,
                minWidth: kMinTouchTarget,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: background,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: border, width: 1.4),
              ),
              // Align с коэффициентами, а не Container.alignment: последний
              // растягивал плитку на всю ширину строки.
              child: Align(
                widthFactor: 1,
                heightFactor: 1,
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: foreground,
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Визуальный акцент плитки.
enum ChipEmphasis { normal, correct, wrong }

/// Заголовок над областью упражнения.
class ExerciseSectionLabel extends StatelessWidget {
  const ExerciseSectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
          color: scheme.onSurface.withValues(alpha: 0.65),
        ),
      ),
    );
  }
}

/// Пунктирная область, куда собирается ответ. Держит стабильную высоту,
/// чтобы layout не прыгал при добавлении слов (§6.1).
class AnswerDropArea extends StatelessWidget {
  const AnswerDropArea({
    super.key,
    required this.child,
    this.minHeight = 76,
  });

  final Widget child;
  final double minHeight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      constraints: BoxConstraints(minHeight: minHeight),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.35)),
      ),
      child: child,
    );
  }
}
