import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/roadmap.dart';
import '../services/auth_service.dart';
import '../services/roadmap_service.dart';
import '../widgets/clickable_serbian_text.dart';
import '../widgets/exercise_player.dart';
import '../course/screens/trainer_screen.dart';
import '../course/services/course_content_loader.dart';

/// Содержимое одной клетки карты: уровень × раздел.
///
/// Грузится по открытию, а не вместе с картой: клеток двадцать четыре, и
/// словарь на полторы тысячи слов не должен приезжать к тому, кто просто
/// посмотрел на тропу.
class RoadmapSectionScreen extends StatefulWidget {
  const RoadmapSectionScreen({
    super.key,
    required this.level,
    required this.category,
  });

  final String level;
  final RoadmapCategory category;

  @override
  State<RoadmapSectionScreen> createState() => _RoadmapSectionScreenState();
}

class _RoadmapSectionScreenState extends State<RoadmapSectionScreen> {
  RoadmapSection? _section;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final section = await context
          .read<RoadmapService>()
          .section(widget.level, widget.category.key);
      if (!mounted) return;
      setState(() {
        _section = section;
        _error = '';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Раздел не загрузился. $e');
    }
  }

  Future<void> _mark(String kind, String id, bool done,
      {double score = 1}) async {
    try {
      await context
          .read<RoadmapService>()
          .mark(kind, id, done: done, score: score);
      await _load();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить отметку.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final section = _section;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.level} · ${widget.category.title}'),
      ),
      body: _error.isNotEmpty
          ? Center(
              child: Padding(
                  padding: const EdgeInsets.all(24), child: Text(_error)))
          : section == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                  children: [
                    Text(widget.category.about,
                        style:
                            theme.textTheme.bodyMedium?.copyWith(height: 1.5)),
                    if (section.intro.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(section.intro,
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(height: 1.5)),
                    ],
                    if (widget.category.planned) ...[
                      const SizedBox(height: 16),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Text(
                            'Пока планируется — упражнения на написание '
                            'предложений и игра против переводчика. '
                            'Ускоро ће бити.',
                            style: theme.textTheme.bodyMedium,
                          ),
                        ),
                      ),
                    ],
                    if (section.isEmpty && !widget.category.planned) ...[
                      const SizedBox(height: 16),
                      Row(children: [
                        Icon(Icons.auto_awesome_outlined,
                            size: 20, color: theme.colorScheme.primary),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Увы, тут пока пусто — но скоро что-то появится.',
                            style: theme.textTheme.bodyMedium?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant),
                          ),
                        ),
                      ]),
                    ],
                    if (section.items.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      for (final item in section.items)
                        _ItemCard(
                          item: item,
                          onToggle: () => _mark('item', item.id, !item.done),
                        ),
                    ],
                    if (section.exercises.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      Text('Упражнения', style: theme.textTheme.titleLarge),
                      const SizedBox(height: 8),
                      for (final set in section.exercises)
                        _ExerciseCard(
                          set: set,
                          onFinished: (score) =>
                              _mark('exercise', set.id, true, score: score),
                        ),
                    ],
                    if (section.words.isNotEmpty)
                      _Words(
                        words: section.words,
                        onToggle: (word) => _mark('word', word.id, !word.known),
                      ),
                  ],
                ),
    );
  }
}

const _kindIcons = <String, IconData>{
  'book': Icons.menu_book_outlined,
  'link': Icons.link,
  'feed_card': Icons.bolt_outlined,
  'text': Icons.article_outlined,
  'grammar_topic': Icons.school_outlined,
  'lesson': Icons.cast_for_education_outlined,
};

class _ItemCard extends StatefulWidget {
  const _ItemCard({required this.item, required this.onToggle});

  final RoadmapItem item;
  final Future<void> Function() onToggle;

  @override
  State<_ItemCard> createState() => _ItemCardState();
}

class _ItemCardState extends State<_ItemCard> {
  bool _open = false;
  bool _openingTrainer = false;

  Future<void> _openTrainer(String topicId) async {
    if (_openingTrainer) return;
    setState(() => _openingTrainer = true);
    try {
      final course = await CourseContentLoader().load();
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => TrainerScreen(
            course: course,
            initialTopicId: topicId,
          ),
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не удалось открыть Тренажёрку.')),
        );
      }
    } finally {
      if (mounted) setState(() => _openingTrainer = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        children: [
          ListTile(
            leading: Icon(_kindIcons[item.kind] ?? Icons.menu_book_outlined),
            title: Text(item.title),
            subtitle: item.summary.isEmpty ? null : Text(item.summary),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (item.url.isNotEmpty)
                  IconButton(
                    tooltip: 'Открыть',
                    icon: const Icon(Icons.open_in_new),
                    onPressed: () => launchUrl(
                      Uri.parse(item.url),
                      mode: LaunchMode.externalApplication,
                    ),
                  ),
                if (item.trainerTopicId.isNotEmpty)
                  IconButton(
                    tooltip: 'Практиковаться',
                    icon: _openingTrainer
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.fitness_center_outlined),
                    onPressed: _openingTrainer
                        ? null
                        : () => _openTrainer(item.trainerTopicId),
                  ),
                IconButton(
                  tooltip: item.done ? 'Снять отметку' : 'Отметить пройденным',
                  icon: Icon(
                    item.done ? Icons.check_circle : Icons.check_circle_outline,
                    color: item.done ? Colors.green.shade700 : scheme.outline,
                  ),
                  onPressed: () => widget.onToggle(),
                ),
              ],
            ),
            onTap:
                item.body.isEmpty ? null : () => setState(() => _open = !_open),
          ),
          if (_open && item.body.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              // Свой текст и объяснение темы читаются как в читалке: слово
              // разбирается по нажатию, ради этого Читавук и существует.
              child: ClickableSerbianText(item.body),
            ),
        ],
      ),
    );
  }
}

/// Набор упражнений.
///
/// Засчитывается долей верных ответов, а не фактом открытия: иначе «пройдено»
/// означало бы «развернул и закрыл».
class _ExerciseCard extends StatefulWidget {
  const _ExerciseCard({required this.set, required this.onFinished});

  final RoadmapExerciseSet set;
  final Future<void> Function(double score) onFinished;

  @override
  State<_ExerciseCard> createState() => _ExerciseCardState();
}

class _ExerciseCardState extends State<_ExerciseCard> {
  final ExerciseAnswers _answers = ExerciseAnswers();
  int _right = 0;
  int _index = 0;
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final set = widget.set;
    final total = set.exercises.length;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.checklist_outlined),
            title: Text(set.title),
            subtitle: Text(
              '$total заданий'
              '${set.done ? ' · пройдено на ${(set.score * 100).round()}%' : ''}',
            ),
            trailing: Icon(_open ? Icons.expand_less : Icons.expand_more),
            onTap: () => setState(() => _open = !_open),
          ),
          if (_open && total > 0) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: ExerciseView(
                key: ValueKey(set.exercises[_index]['id'] ?? _index),
                exercise: set.exercises[_index],
                index: _index,
                answers: _answers,
                onChecked: (correct) {
                  if (correct) setState(() => _right += 1);
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Row(
                children: [
                  Text('${_index + 1} из $total · верных $_right'),
                  const Spacer(),
                  if (_index + 1 < total)
                    FilledButton(
                      onPressed: () => setState(() => _index += 1),
                      child: const Text('Дальше'),
                    )
                  else
                    FilledButton(
                      onPressed: () async {
                        await widget
                            .onFinished(total == 0 ? 1 : _right / total);
                        if (mounted) setState(() => _open = false);
                      },
                      child: const Text('Завершить'),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Словарь уровня: слова по темам, каждое отмечается выученным.
class _Words extends StatelessWidget {
  const _Words({required this.words, required this.onToggle});

  final List<RoadmapWord> words;
  final Future<void> Function(RoadmapWord word) onToggle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final signedIn = context.watch<AuthService>().account != null;
    final themes = <String, List<RoadmapWord>>{};
    for (final word in words) {
      themes.putIfAbsent(word.theme, () => []).add(word);
    }
    final known = words.where((word) => word.known).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 18),
        Text('Слова уровня', style: theme.textTheme.titleLarge),
        Text('выучено $known из ${words.length}',
            style: theme.textTheme.bodySmall),
        if (!signedIn)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              'Войдите, чтобы отмечать выученные слова — отметки хранятся '
              'в аккаунте.',
              style: theme.textTheme.bodySmall,
            ),
          ),
        const SizedBox(height: 10),
        for (final entry in themes.entries)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ExpansionTile(
              title: Text(entry.key),
              subtitle: Text(
                  '${entry.value.where((word) => word.known).length} из ${entry.value.length}'),
              children: [
                for (final word in entry.value)
                  CheckboxListTile(
                    value: word.known,
                    onChanged: (_) => onToggle(word),
                    title: Text(
                      word.note.isEmpty
                          ? word.lemma
                          : '${word.lemma}  ${word.note}',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(word.translation),
                    controlAffinity: ListTileControlAffinity.leading,
                    dense: true,
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
