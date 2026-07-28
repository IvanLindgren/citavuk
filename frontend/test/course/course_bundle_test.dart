import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/models/course.dart';
import 'package:srbski_read/course/models/exercise.dart';
import 'package:srbski_read/course/models/source_ref.dart';
import 'package:srbski_read/course/services/course_content_loader.dart';

/// Контрактный тест между Go-валидатором и Dart-парсером.
///
/// `tools/course_build` собирает bundle, этот тест доказывает, что клиент
/// разбирает его целиком. Расхождение схем ломает тест, а не приложение
/// у пользователя.
void main() {
  late Course course;

  setUpAll(() {
    final file = File('assets/course/course_bundle.json');
    expect(
      file.existsSync(),
      isTrue,
      reason: 'bundle не собран: запусти `go run . -out frontend/assets/course/'
          'course_bundle.json` в tools/course_build',
    );
    course = CourseContentLoader.parseBundle(file.readAsStringSync());
  });

  test('bundle разбирается целиком', () {
    expect(course.courseId, isNotEmpty);
    expect(course.courseVersion, isNotEmpty);
    expect(course.units, isNotEmpty);
    expect(course.contentChecksum, startsWith('sha256:'));
  });

  test('каждый урок содержит упражнения', () {
    for (final lesson in course.allLessons) {
      expect(lesson.exercises, isNotEmpty, reason: 'урок ${lesson.id} пуст');
    }
  });

  test('ID упражнений уникальны в пределах курса', () {
    final seen = <String>{};
    for (final lesson in course.allLessons) {
      for (final e in lesson.exercises) {
        expect(seen.add(e.id), isTrue, reason: 'дубль ID упражнения ${e.id}');
      }
    }
  });

  test('у каждого упражнения есть provenance и объяснение', () {
    for (final lesson in course.allLessons) {
      for (final e in lesson.exercises) {
        expect(e.sourceRef.sourceBook, isNotEmpty, reason: e.id);
        // Якорь указывает на строки книги, кроме авторского материала,
        // которого в книге нет: там честнее 'authored', чем выдуманный
        // диапазон (см. course_content/SCHEMA.md).
        expect(
          e.sourceRef.supplemental
              ? e.sourceRef.sourceAnchor == 'authored' ||
                  e.sourceRef.sourceAnchor.startsWith('md:')
              : e.sourceRef.sourceAnchor.startsWith('md:'),
          isTrue,
          reason: '${e.id}: анкер "${e.sourceRef.sourceAnchor}"',
        );
        expect(e.explanation, isNotEmpty,
            reason: 'у ${e.id} нет объяснения ошибки');
      }
    }
  });

  test('в production-bundle нет draft-контента', () {
    if (course.config.allowDraftContent) return;
    for (final lesson in course.allLessons) {
      for (final e in lesson.exercises) {
        expect(e.contentReviewStatus, isNot(ReviewStatus.draft), reason: e.id);
      }
    }
  });

  test('prerequisites ссылаются на существующие уроки', () {
    final ids = course.allLessons.map((l) => l.id).toSet();
    for (final lesson in course.allLessons) {
      for (final p in lesson.prerequisites) {
        expect(ids, contains(p), reason: 'урок ${lesson.id} → prerequisite $p');
      }
    }
  });

  test('learningObjectiveIds ссылаются на существующие цели', () {
    final objectives = course.allObjectives.map((o) => o.id).toSet();
    for (final lesson in course.allLessons) {
      for (final e in lesson.exercises) {
        for (final o in e.learningObjectiveIds) {
          expect(objectives, contains(o), reason: '${e.id} → objective $o');
        }
      }
    }
  });

  test('первый урок курса доступен без предусловий', () {
    expect(course.allLessons.first.prerequisites, isEmpty);
  });

  test('sentence_builder: acceptedOrders не пусты и валидны', () {
    for (final lesson in course.allLessons) {
      for (final e in lesson.exercises.whereType<SentenceBuilderExercise>()) {
        expect(e.acceptedOrders, isNotEmpty, reason: e.id);
        expect(e.canonicalSentence, isNotEmpty, reason: e.id);
      }
    }
  });

  test('ending_picker: fullForm начинается с основы', () {
    for (final lesson in course.allLessons) {
      for (final e in lesson.exercises.whereType<EndingPickerExercise>()) {
        expect(
          e.fullForm.toLowerCase().startsWith(e.stem.toLowerCase()),
          isTrue,
          reason:
              '${e.id}: fullForm "${e.fullForm}" не начинается с "${e.stem}"',
        );
      }
    }
  });
}
