/// Сборка словоформы из перемешанных букв (master-prompt §6.5).
///
/// Каждая буква — отдельная плитка с уникальным ID, поэтому повторяющиеся
/// буквы не конфликтуют. Перестановка работает нажатием: чистый drag
/// недоступен части пользователей (§20).
library;

import 'package:flutter/material.dart';

import '../models/answer.dart';
import '../models/exercise.dart';
import '../services/exercise_shuffle.dart';
import '../services/serbian_text.dart';
import 'course_chip.dart';

/// Плитка буквы: текст плюс уникальный ID, чтобы две одинаковые буквы
/// были разными объектами.
class _LetterTile {
  final String id;
  final String text;

  const _LetterTile(this.id, this.text);
}

class LetterUnscrambleView extends StatefulWidget {
  const LetterUnscrambleView({
    super.key,
    required this.exercise,
    required this.onChanged,
    this.answer,
    this.enabled = true,
  });

  final LetterUnscrambleExercise exercise;
  final ValueChanged<Answer?> onChanged;
  final Answer? answer;
  final bool enabled;

  @override
  State<LetterUnscrambleView> createState() => _LetterUnscrambleViewState();
}

class _LetterUnscrambleViewState extends State<LetterUnscrambleView> {
  late List<_LetterTile> _pool;

  /// ID выбранных плиток в порядке сборки.
  List<String> _picked = [];

  @override
  void initState() {
    super.initState();
    _buildPool();
  }

  @override
  void didUpdateWidget(LetterUnscrambleView old) {
    super.didUpdateWidget(old);
    if (old.exercise.id != widget.exercise.id) {
      _picked = [];
      _buildPool();
    }
  }

  void _buildPool() {
    final e = widget.exercise;
    final answerLetters =
        splitLetters(e.answer, digraphsAsUnits: e.digraphsAsUnits);
    final all = <_LetterTile>[
      for (var i = 0; i < answerLetters.length; i++)
        _LetterTile('a$i', answerLetters[i]),
      for (var i = 0; i < e.extraLetters.length; i++)
        _LetterTile('x$i', e.extraLetters[i]),
    ];
    final correctOrder = all.take(answerLetters.length).toList();
    _pool = shuffleAvoidingOriginal(
      all,
      correctOrder,
      seedFromString(e.id),
      equals: (a, b) => a.text == b.text,
    );
  }

  String get _assembled {
    final byId = {for (final t in _pool) t.id: t.text};
    return _picked.map((id) => byId[id] ?? '').join();
  }

  void _emit() {
    final text = _assembled;
    widget.onChanged(text.isEmpty ? null : TextAnswer(text));
  }

  void _pick(String id) {
    setState(() => _picked = [..._picked, id]);
    _emit();
  }

  void _unpickAt(int index) {
    setState(() => _picked = [..._picked]..removeAt(index));
    _emit();
  }

  void _reset() {
    setState(() => _picked = []);
    widget.onChanged(null);
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.exercise;
    final scheme = Theme.of(context).colorScheme;
    final byId = {for (final t in _pool) t.id: t.text};
    final used = _picked.toSet();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (e.context.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              e.context,
              style: TextStyle(
                fontSize: 16,
                color: scheme.onSurface.withValues(alpha: 0.85),
              ),
            ),
          ),
        if (e.showLemma && e.lemma.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                Text(
                  'Начальная форма: ',
                  style:
                      TextStyle(color: scheme.onSurface.withValues(alpha: 0.6)),
                ),
                Text(
                  e.lemma,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 16),
                ),
              ],
            ),
          ),
        const ExerciseSectionLabel('СОБРАННАЯ ФОРМА'),
        AnswerDropArea(
          minHeight: 64,
          child: _picked.isEmpty
              ? Text(
                  'Нажимай буквы, чтобы собрать слово',
                  style: TextStyle(
                      color: scheme.onSurface.withValues(alpha: 0.55)),
                )
              : Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (var i = 0; i < _picked.length; i++)
                      CourseChip(
                        label: byId[_picked[i]] ?? '',
                        selected: true,
                        enabled: widget.enabled,
                        semanticLabel:
                            'Буква ${byId[_picked[i]]}, позиция ${i + 1}. Нажмите, чтобы убрать',
                        onTap: () => _unpickAt(i),
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            const Expanded(child: ExerciseSectionLabel('БУКВЫ')),
            if (_picked.isNotEmpty && widget.enabled)
              TextButton.icon(
                onPressed: _reset,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Сбросить'),
              ),
          ],
        ),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final tile in _pool)
              CourseChip(
                label: tile.text,
                enabled: widget.enabled && !used.contains(tile.id),
                semanticLabel: used.contains(tile.id)
                    ? 'Буква ${tile.text}, уже использована'
                    : 'Буква ${tile.text}. Нажмите, чтобы добавить',
                onTap: () => _pick(tile.id),
              ),
          ],
        ),
      ],
    );
  }
}
