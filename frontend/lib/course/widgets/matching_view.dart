/// Сопоставление «левое → правое» (предлог → падеж, местоимение → форма).
///
/// Работает нажатием: выбирается левый элемент, затем правый. Drag не
/// требуется (§20).
library;

import 'package:flutter/material.dart';

import '../models/answer.dart';
import '../models/exercise.dart';
import '../services/exercise_shuffle.dart';
import 'course_chip.dart';

class MatchingView extends StatefulWidget {
  const MatchingView({
    super.key,
    required this.exercise,
    required this.onChanged,
    this.answer,
    this.enabled = true,
  });

  final MatchingExercise exercise;
  final ValueChanged<Answer?> onChanged;
  final Answer? answer;
  final bool enabled;

  @override
  State<MatchingView> createState() => _MatchingViewState();
}

class _MatchingViewState extends State<MatchingView> {
  String? _activeLeft;
  late List<String> _rightOptions;

  /// Один вариант подходит нескольким элементам: «iz», «bez» и «kod» все
  /// требуют родительного. Тогда список справа не расходуется, а сами падежи
  /// не дублируются в нём по числу предлогов.
  late bool _reusable;

  Map<String, String> get _assignments =>
      (widget.answer as PairsAnswer?)?.assignments ?? const {};

  @override
  void initState() {
    super.initState();
    _buildOptions();
  }

  @override
  void didUpdateWidget(MatchingView old) {
    super.didUpdateWidget(old);
    if (old.exercise.id != widget.exercise.id) {
      _activeLeft = null;
      _buildOptions();
    }
  }

  void _buildOptions() {
    final rights = [for (final p in widget.exercise.pairs) p.right];
    _reusable = rights.toSet().length != rights.length;
    final all = _reusable
        ? <String>{...rights, ...widget.exercise.distractorsRight}.toList()
        : [...rights, ...widget.exercise.distractorsRight];
    _rightOptions = seededShuffle(all, seedFromString(widget.exercise.id));
  }

  void _selectRight(String right) {
    final left = _activeLeft;
    if (left == null) return;
    final next = Map<String, String>.of(_assignments);
    // При соответствии один к одному правый вариант занят только одним левым.
    if (!_reusable) next.removeWhere((_, value) => value == right);
    next[left] = right;
    setState(() => _activeLeft = null);
    widget.onChanged(next.isEmpty ? null : PairsAnswer(next));
  }

  void _tapLeft(String left) {
    if (_assignments.containsKey(left)) {
      final next = Map<String, String>.of(_assignments)..remove(left);
      widget.onChanged(next.isEmpty ? null : PairsAnswer(next));
      setState(() => _activeLeft = left);
      return;
    }
    setState(() => _activeLeft = _activeLeft == left ? null : left);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final assignments = _assignments;
    final usedRight = assignments.values.toSet();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ExerciseSectionLabel(
          widget.exercise.leftLabel.isEmpty
              ? 'ВЫБЕРИТЕ ЭЛЕМЕНТ'
              : widget.exercise.leftLabel.toUpperCase(),
        ),
        Column(
          children: [
            for (final pair in widget.exercise.pairs)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _LeftRow(
                  left: pair.left,
                  assigned: assignments[pair.left],
                  active: _activeLeft == pair.left,
                  enabled: widget.enabled,
                  onTap: () => _tapLeft(pair.left),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        ExerciseSectionLabel(
          widget.exercise.rightLabel.isEmpty
              ? 'ВАРИАНТЫ'
              : widget.exercise.rightLabel.toUpperCase(),
        ),
        if (_activeLeft == null &&
            assignments.length < widget.exercise.pairs.length)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'Сначала выберите элемент из списка выше',
              style: TextStyle(
                fontSize: 13,
                color: scheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
          ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final right in _rightOptions)
              CourseChip(
                label: right,
                enabled: widget.enabled &&
                    _activeLeft != null &&
                    (_reusable || !usedRight.contains(right)),
                semanticLabel: !_reusable && usedRight.contains(right)
                    ? '$right, уже сопоставлено'
                    : right,
                onTap: () => _selectRight(right),
              ),
          ],
        ),
      ],
    );
  }
}

class _LeftRow extends StatelessWidget {
  const _LeftRow({
    required this.left,
    required this.assigned,
    required this.active,
    required this.enabled,
    required this.onTap,
  });

  final String left;
  final String? assigned;
  final bool active;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      selected: active,
      label: assigned == null
          ? '$left, не сопоставлено. Нажмите, чтобы выбрать'
          : '$left сопоставлено с $assigned. Нажмите, чтобы изменить',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: const BoxConstraints(minHeight: kMinTouchTarget + 4),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: active
                  ? scheme.primary.withValues(alpha: 0.16)
                  : scheme.surfaceContainerHighest.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: active
                    ? scheme.primary
                    : scheme.primary.withValues(alpha: 0.25),
                width: active ? 1.8 : 1.2,
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    left,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                ),
                Icon(
                  Icons.arrow_forward,
                  size: 18,
                  color: scheme.onSurface.withValues(alpha: 0.4),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    assigned ?? '—',
                    style: TextStyle(
                      fontSize: 16,
                      color: assigned == null
                          ? scheme.onSurface.withValues(alpha: 0.4)
                          : scheme.primary,
                      fontWeight:
                          assigned == null ? FontWeight.w400 : FontWeight.w600,
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
