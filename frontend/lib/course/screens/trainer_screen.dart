/// Тренажёрка: упражнения по выбранной теме грамматики вне порядка курса.
///
/// Зачем отдельно от карты курса
/// -----------------------------
/// Курс ведёт по программе: следующий урок открывается после предыдущего.
/// Тренажёрка нужна в обратной ситуации — человек уже знает, что у него
/// хромает винительный падеж, и хочет добить именно его. Поэтому темы здесь
/// открыты все сразу.
///
/// Прогресс уроков тренажёрка **не трогает**: иначе «пройденный» урок означал
/// бы то разобранную теорию, то удачную серию ответов. Экран прохождения
/// используется тот же ([LessonScreen]) — своя копия разошлась бы с курсом на
/// первой же правке.
library;

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/course.dart';
import '../models/exercise.dart';
import '../models/trainer_catalog.dart';
import '../../services/announcements_controller.dart';
import '../../services/auth_service.dart';
import '../../services/roadmap_service.dart';
import 'lesson_screen.dart';
import 'translation_duel_screen.dart';

/// Сколько заданий в одном заходе. Больше двенадцати уже утомляет.
const int _roundSize = 10;

class TrainerScreen extends StatefulWidget {
  const TrainerScreen({
    super.key,
    required this.course,
    this.initialTopicId = '',
  });

  final Course course;
  final String initialTopicId;

  @override
  State<TrainerScreen> createState() => _TrainerScreenState();
}

class _TrainerScreenState extends State<TrainerScreen> {
  List<TrainerTopic>? _topics;
  TrainerDomain _domain = TrainerDomain.grammar;
  String _error = '';
  bool _openedInitial = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final catalog = await loadTrainerCatalog();
      if (!mounted) return;
      final topics = buildTrainerTopics(widget.course, catalog);
      setState(() {
        _topics = topics;
        _error = '';
      });
      final initial = widget.initialTopicId;
      if (initial.isNotEmpty && !_openedInitial) {
        for (final topic in topics) {
          if (topic.id != initial) continue;
          _openedInitial = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _start(context, topic);
          });
          break;
        }
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось загрузить упражнения. $error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final allTopics = _topics;
    if (_error.isNotEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Тренажёрка')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(_error, textAlign: TextAlign.center),
          ),
        ),
      );
    }
    if (allTopics == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    final topics = allTopics.where((topic) => topic.domain == _domain).toList();
    final total = topics.fold<int>(0, (sum, t) => sum + t.exercises.length);

    return Scaffold(
      appBar: AppBar(title: const Text('Тренажёрка')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Text(
            'Практика собрана по уровню и навыку. Полностью правильный заход '
            'сразу отмечает тему в дорожной карте. Сейчас '
            'доступно $total упражнений выбранного раздела.',
            style: TextStyle(
              fontSize: 15,
              height: 1.45,
              color: scheme.onSurface.withValues(alpha: 0.75),
            ),
          ),
          const SizedBox(height: 18),
          _DomainPicker(
            selected: _domain,
            onChanged: (value) => setState(() => _domain = value),
          ),
          const SizedBox(height: 18),
          _TranslationDuelTile(
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const TranslationDuelScreen(),
              ),
            ),
          ),
          const SizedBox(height: 18),
          _TopicTile(
            title: 'Всё вперемешку',
            subtitle: 'Задания из всех тем в случайном порядке',
            onTap: () => _start(
              context,
              TrainerTopic(
                id: 'all-${_domain.name}',
                domain: _domain,
                level: '',
                title: 'Всё вперемешку',
                summary: '',
                roadmapItemId: '',
                exercises: topics.expand((t) => t.exercises).toList(),
              ),
            ),
          ),
          for (final group in _groupByLevel(topics)) ...[
            const SizedBox(height: 22),
            Text(
              group.key.toUpperCase(),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
                color: scheme.onSurface.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 8),
            for (final topic in group.value)
              _TopicTile(
                title: topic.title,
                subtitle: '${topic.summary}\n${topic.exercises.length} '
                    '${_plural(topic.exercises.length)}',
                onTap: () => _start(context, topic),
              ),
          ],
        ],
      ),
    );
  }

  void _start(BuildContext context, TrainerTopic topic) {
    final round = _pickRound(topic.exercises);
    if (round.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => LessonScreen(
          // Синтетический урок: экран прохождения не знает и не должен знать,
          // что задания пришли не из программы. onFinished не передаём —
          // результат никуда не записывается.
          lesson: Lesson(
            id: 'trainer_${topic.id}',
            title: topic.title,
            exercises: round,
          ),
          course: widget.course,
          onFinished: (summary) {
            if (summary.score != 1 ||
                topic.roadmapItemId.isEmpty ||
                !context.read<AuthService>().isSignedIn) {
              return;
            }
            unawaited(_recordPerfect(context, topic));
          },
        ),
      ),
    );
  }

  Future<void> _recordPerfect(BuildContext context, TrainerTopic topic) async {
    final roadmap = context.read<RoadmapService>();
    final announcements = context.read<AnnouncementsController>();
    try {
      await roadmap.mark('item', topic.roadmapItemId,
          done: true, source: 'trainer');
      await announcements.refresh();
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Тема отмечена в дорожной карте.')),
      );
    } catch (_) {
      // Результат самой тренировки не теряется из-за временной ошибки сети.
    }
  }
}

class _TranslationDuelTile extends StatelessWidget {
  const _TranslationDuelTile({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.primaryContainer.withValues(alpha: 0.55),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: scheme.primary,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.sports_martial_arts, color: scheme.onPrimary),
              ),
              const SizedBox(width: 13),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Ты против переводчика',
                        style: TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w800)),
                    SizedBox(height: 3),
                    Text('Победите DeepL или Google. Судья — вы или Gemma 4.'),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}

List<MapEntry<String, List<TrainerTopic>>> _groupByLevel(
    List<TrainerTopic> topics) {
  final groups = <String, List<TrainerTopic>>{};
  for (final topic in topics) {
    groups.putIfAbsent(topic.level, () => []).add(topic);
  }
  return groups.entries.toList();
}

/// Отбирает задания на один заход: случайные, но от простых к сложным.
List<Exercise> _pickRound(List<Exercise> exercises) {
  final pool = List<Exercise>.of(exercises)..shuffle(Random());
  final round = pool.take(_roundSize).toList()
    ..sort((a, b) => a.difficulty.compareTo(b.difficulty));
  return round;
}

String _plural(int count) {
  final mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'упражнений';
  switch (count % 10) {
    case 1:
      return 'упражнение';
    case 2:
    case 3:
    case 4:
      return 'упражнения';
    default:
      return 'упражнений';
  }
}

class _DomainPicker extends StatelessWidget {
  const _DomainPicker({required this.selected, required this.onChanged});

  final TrainerDomain selected;
  final ValueChanged<TrainerDomain> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          for (final domain in TrainerDomain.values)
            Expanded(
              child: Tooltip(
                message: domain.label,
                child: InkWell(
                  onTap: () => onChanged(domain),
                  borderRadius: BorderRadius.circular(9),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    constraints: const BoxConstraints(minHeight: 46),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: selected == domain ? scheme.surface : null,
                      borderRadius: BorderRadius.circular(9),
                      boxShadow: selected == domain
                          ? const [
                              BoxShadow(
                                blurRadius: 5,
                                color: Color(0x16000000),
                              ),
                            ]
                          : null,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          switch (domain) {
                            TrainerDomain.grammar => Icons.translate,
                            TrainerDomain.reading => Icons.menu_book_outlined,
                            TrainerDomain.writing => Icons.edit_outlined,
                          },
                          size: 18,
                          color: selected == domain
                              ? scheme.primary
                              : scheme.onSurfaceVariant,
                        ),
                        const SizedBox(width: 5),
                        Flexible(
                          child: Text(
                            domain.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: selected == domain
                                  ? scheme.primary
                                  : scheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TopicTile extends StatelessWidget {
  const _TopicTile({
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 16.5,
                          fontWeight: FontWeight.w700,
                          height: 1.25,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 13,
                          color: scheme.onSurface.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Icon(Icons.chevron_right,
                    color: scheme.onSurface.withValues(alpha: 0.45)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
