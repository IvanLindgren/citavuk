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

import 'dart:math';

import 'package:flutter/material.dart';

import '../models/course.dart';
import '../models/exercise.dart';
import 'lesson_screen.dart';

/// Сколько заданий в одном заходе. Больше двенадцати уже утомляет.
const int _roundSize = 10;

class TrainerScreen extends StatelessWidget {
  const TrainerScreen({super.key, required this.course});

  final Course course;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final topics = _collectTopics(course);
    final total = topics.fold<int>(0, (sum, t) => sum + t.exercises.length);

    return Scaffold(
      appBar: AppBar(title: const Text('Тренажёрка')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Text(
            'Выберите тему и решайте задания по ней подряд. Порядок уроков '
            'здесь не действует: любая тема открыта сразу, даже если до неё в '
            'курсе вы ещё не дошли. Всего $total упражнений.',
            style: TextStyle(
              fontSize: 15,
              height: 1.45,
              color: scheme.onSurface.withValues(alpha: 0.75),
            ),
          ),
          const SizedBox(height: 18),
          _TopicTile(
            title: 'Всё вперемешку',
            subtitle: 'Задания из всех тем в случайном порядке',
            onTap: () => _start(
              context,
              _Topic(
                id: 'all',
                title: 'Всё вперемешку',
                unitTitle: '',
                exercises: topics.expand((t) => t.exercises).toList(),
              ),
            ),
          ),
          for (final group in _groupByUnit(topics)) ...[
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
                subtitle: '${topic.exercises.length} '
                    '${_plural(topic.exercises.length)}',
                onTap: () => _start(context, topic),
              ),
          ],
        ],
      ),
    );
  }

  void _start(BuildContext context, _Topic topic) {
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
          course: course,
        ),
      ),
    );
  }
}

/// Тема — это раздел курса (skill), а не урок: «Винительный падеж» полезнее
/// как одна тема, чем как три урока о разных сторонах одного правила.
class _Topic {
  final String id;
  final String title;
  final String unitTitle;
  final List<Exercise> exercises;

  const _Topic({
    required this.id,
    required this.title,
    required this.unitTitle,
    required this.exercises,
  });
}

List<_Topic> _collectTopics(Course course) {
  final topics = <_Topic>[];
  for (final unit in course.units) {
    for (final skill in unit.skills) {
      final exercises = [
        for (final lesson in skill.lessons) ...lesson.exercises,
      ];
      if (exercises.isEmpty) continue;
      topics.add(_Topic(
        id: skill.id,
        title: skill.title,
        unitTitle: unit.title,
        exercises: exercises,
      ));
    }
  }
  return topics;
}

List<MapEntry<String, List<_Topic>>> _groupByUnit(List<_Topic> topics) {
  final groups = <String, List<_Topic>>{};
  for (final topic in topics) {
    groups.putIfAbsent(topic.unitTitle, () => []).add(topic);
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
