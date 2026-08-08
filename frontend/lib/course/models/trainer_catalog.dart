import 'dart:convert';

import 'package:flutter/services.dart';

import 'course.dart';
import 'exercise.dart';

enum TrainerDomain { grammar, reading, writing }

extension TrainerDomainLabel on TrainerDomain {
  String get label => switch (this) {
        TrainerDomain.grammar => 'Gramatika',
        TrainerDomain.reading => 'Čitanje',
        TrainerDomain.writing => 'Pisanje',
      };
}

class TrainerTopicSpec {
  const TrainerTopicSpec({
    required this.id,
    required this.domain,
    required this.level,
    required this.title,
    required this.summary,
    required this.roadmapItemId,
    required this.skillIds,
    required this.supplementalExercises,
  });

  final String id;
  final TrainerDomain domain;
  final String level;
  final String title;
  final String summary;
  final String roadmapItemId;
  final List<String> skillIds;
  final List<Exercise> supplementalExercises;

  factory TrainerTopicSpec.fromJson(Map<String, dynamic> json) =>
      TrainerTopicSpec(
        id: (json['id'] ?? '').toString(),
        domain: switch ((json['domain'] ?? '').toString()) {
          'grammar' => TrainerDomain.grammar,
          'reading' => TrainerDomain.reading,
          'writing' => TrainerDomain.writing,
          final value =>
            throw FormatException('Неизвестный раздел Тренажёрки: $value'),
        },
        level: (json['level'] ?? '').toString(),
        title: (json['title'] ?? '').toString(),
        summary: (json['summary'] ?? '').toString(),
        roadmapItemId: (json['roadmapItemId'] ?? '').toString(),
        skillIds: (json['skillIds'] as List? ?? const [])
            .map((item) => item.toString())
            .toList(),
        supplementalExercises:
            (json['supplementalExercises'] as List? ?? const [])
                .whereType<Map>()
                .map((item) => Exercise.fromJson(item.cast<String, dynamic>()))
                .toList(),
      );
}

class TrainerTopic {
  const TrainerTopic({
    required this.id,
    required this.domain,
    required this.level,
    required this.title,
    required this.summary,
    required this.roadmapItemId,
    required this.exercises,
  });

  final String id;
  final TrainerDomain domain;
  final String level;
  final String title;
  final String summary;
  final String roadmapItemId;
  final List<Exercise> exercises;
}

Future<List<TrainerTopicSpec>> loadTrainerCatalog() async {
  final raw = await rootBundle.loadString('assets/course/trainer_catalog.json',
      cache: true);
  final json = (jsonDecode(raw) as Map).cast<String, dynamic>();
  if (json['version'] != 1) {
    throw const FormatException('Неизвестная версия каталога Тренажёрки.');
  }
  return (json['topics'] as List? ?? const [])
      .whereType<Map>()
      .map((item) => TrainerTopicSpec.fromJson(item.cast<String, dynamic>()))
      .toList();
}

List<TrainerTopic> buildTrainerTopics(
  Course course,
  List<TrainerTopicSpec> catalog,
) {
  final bySkill = <String, List<Exercise>>{};
  for (final unit in course.units) {
    for (final skill in unit.skills) {
      bySkill[skill.id] = [
        for (final lesson in skill.lessons) ...lesson.exercises,
      ];
    }
  }

  final result = <TrainerTopic>[];
  for (final spec in catalog) {
    final courseExercises = _unique([
      for (final skillId in spec.skillIds) ...bySkill[skillId] ?? const [],
    ]);
    final exercises = _unique([
      ...spec.supplementalExercises,
      ...courseExercises,
    ]);
    if (exercises.isNotEmpty) {
      result.add(TrainerTopic(
        id: spec.id,
        domain: spec.domain,
        level: spec.level,
        title: spec.title,
        summary: spec.summary,
        roadmapItemId: spec.roadmapItemId,
        exercises: exercises,
      ));
    }
  }
  return result;
}

List<Exercise> _unique(Iterable<Exercise> exercises) {
  final seen = <String>{};
  return [
    for (final item in exercises)
      if (seen.add(item.id)) item
  ];
}
