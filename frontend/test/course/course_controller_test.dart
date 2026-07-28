import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/models/course.dart';
import 'package:srbski_read/course/models/progress.dart';
import 'package:srbski_read/course/services/course_content_loader.dart';
import 'package:srbski_read/course/services/course_progress_store.dart';
import 'package:srbski_read/course/services/mastery_engine.dart';
import 'package:srbski_read/course/state/course_controller.dart';
import 'package:srbski_read/course/state/lesson_controller.dart';

Map<String, dynamic> get _sourceRef => {
      'sourceBook': 'Просвирина О. А. и др. Сербский язык. — М.: ВКН, 2018',
      'sourceHeading': '5.2.3. Падежи',
      'sourceAnchor': 'md:838-922',
      'sourceEditionOrFileHash': 'sha256:test',
      'contentVersion': '1.0.0',
      'reviewStatus': 'machine_checked',
    };

Map<String, dynamic> _exercise(String id, String lessonId, String objective) =>
    {
      'id': id,
      'type': 'multiple_choice',
      'unitId': 'u_test',
      'skillId': 'sk_test',
      'lessonId': lessonId,
      'learningObjectiveIds': [objective],
      'difficulty': 1,
      'prompt': 'Вопрос',
      'instructionLanguage': 'ru',
      'serbianScript': 'latin',
      'explanation': 'Объяснение',
      'sourceRef': _sourceRef,
      'contentReviewStatus': 'machine_checked',
      'options': [
        {'id': 'o1', 'text': 'верно', 'correct': true},
        {'id': 'o2', 'text': 'неверно', 'correct': false},
      ],
    };

/// Курс из трёх уроков цепочкой: l1 → l2 → l3.
String _bundleJson({String checksum = 'sha256:abc'}) {
  final course = {
    'courseId': 'c_test',
    'courseVersion': '1.0.0',
    'title': 'Тестовый курс',
    'config': {
      'defaultScript': 'latin',
      'acceptBothScripts': false,
      'showTransliterationHint': true,
      'passThreshold': 0.8,
      'allowDraftContent': false,
    },
    'units': [
      {
        'id': 'u_test',
        'title': 'Раздел',
        'description': '',
        'skills': [
          {
            'id': 'sk_test',
            'title': 'Тема',
            'objectives': [
              {'id': 'obj_1', 'title': 'Цель 1'},
              {'id': 'obj_2', 'title': 'Цель 2'},
              {'id': 'obj_3', 'title': 'Цель 3'},
            ],
            'lessons': [
              {
                'id': 'l1',
                'title': 'Урок 1',
                'prerequisites': <String>[],
                'exercises': [_exercise('e1', 'l1', 'obj_1')],
              },
              {
                'id': 'l2',
                'title': 'Урок 2',
                'prerequisites': ['l1'],
                'exercises': [_exercise('e2', 'l2', 'obj_2')],
              },
              {
                'id': 'l3',
                'title': 'Урок 3',
                'prerequisites': ['l2'],
                'exercises': [_exercise('e3', 'l3', 'obj_3')],
              },
            ],
          }
        ],
      }
    ],
    'contentChecksum': checksum,
  };
  return _encode(course);
}

String _encode(Object value) {
  // Локальный jsonEncode без импорта dart:convert в тесте.
  return const _JsonEncoder().convert(value);
}

class _JsonEncoder {
  const _JsonEncoder();
  String convert(Object value) => _write(value);

  String _write(Object? v) => switch (v) {
        null => 'null',
        bool b => '$b',
        num n => '$n',
        String s => '"${s.replaceAll(r'\', r'\\').replaceAll('"', r'\"')}"',
        List l => '[${l.map(_write).join(',')}]',
        Map m =>
          '{${m.entries.map((e) => '${_write('${e.key}')}:${_write(e.value)}').join(',')}}',
        _ => throw ArgumentError('Неподдерживаемый тип: $v'),
      };
}

/// Хранилище в памяти — тесты не трогают SharedPreferences.
class _MemoryStore implements CourseProgressStore {
  CourseProgress? saved;

  @override
  Future<CourseProgress?> load(String courseId) async =>
      saved?.courseId == courseId ? saved : null;

  @override
  Future<void> save(CourseProgress progress) async => saved = progress;

  @override
  Future<void> clear() async => saved = null;
}

/// Загрузчик, отдающий заранее заданный bundle.
class _FakeLoader extends CourseContentLoader {
  _FakeLoader(this.raw);

  final String raw;
  Course? _parsed;

  @override
  Future<Course> load() async =>
      _parsed ??= CourseContentLoader.parseBundle(raw);
}

LessonSummary _summary(
  String lessonId, {
  required double score,
  List<String> objectives = const ['obj_1'],
  bool correct = true,
}) =>
    LessonSummary(
      lessonId: lessonId,
      firstTryCorrect: score >= 1 ? 1 : 0,
      total: 1,
      elapsed: const Duration(minutes: 2),
      weakObjectiveIds: correct ? {} : objectives.toSet(),
      attempts: [
        AttemptRecord(
          exerciseId: 'e_$lessonId',
          objectiveIds: objectives,
          answerPayload: const {'kind': 'choice'},
          isCorrect: correct,
          firstTry: true,
          hintUsed: false,
          durationMs: 1000,
          attemptedAt: DateTime.now(),
        ),
      ],
    );

void main() {
  late _MemoryStore store;

  Future<CourseController> ready({String checksum = 'sha256:abc'}) async {
    final c = CourseController(
      loader: _FakeLoader(_bundleJson(checksum: checksum)),
      store: store,
    );
    await c.load();
    return c;
  }

  setUp(() => store = _MemoryStore());

  group('загрузка', () {
    test('курс и пустой прогресс готовы', () async {
      final c = await ready();
      expect(c.state, CourseLoadState.ready);
      expect(c.course!.allLessons.length, 3);
      expect(c.progress!.xp, 0);
    });
  });

  group('unlock logic', () {
    test('первый урок доступен, остальные закрыты', () async {
      final c = await ready();
      final lessons = c.course!.allLessons;
      expect(c.statusOf(lessons[0]), LessonStatus.available);
      expect(c.statusOf(lessons[1]), LessonStatus.locked);
      expect(c.statusOf(lessons[2]), LessonStatus.locked);
    });

    test('успешный урок открывает следующий', () async {
      final c = await ready();
      await c.completeLesson(_summary('l1', score: 1.0));
      final lessons = c.course!.allLessons;
      expect(c.statusOf(lessons[1]), LessonStatus.available);
      expect(c.statusOf(lessons[2]), LessonStatus.locked,
          reason: 'через один урок перепрыгнуть нельзя');
    });

    test('слабый результат не открывает следующий урок', () async {
      final c = await ready();
      await c.completeLesson(_summary('l1', score: 0.0, correct: false));
      expect(c.statusOf(c.course!.allLessons[1]), LessonStatus.locked);
    });

    test('пройденный урок всегда можно открыть заново', () async {
      final c = await ready();
      await c.completeLesson(_summary('l1', score: 1.0));
      expect(c.canOpen(c.course!.allLessons[0]), isTrue);
    });

    test('nextLesson указывает на первый непройденный', () async {
      final c = await ready();
      expect(c.nextLesson?.id, 'l1');
      await c.completeLesson(_summary('l1', score: 1.0));
      expect(c.nextLesson?.id, 'l2');
    });

    test('доля прохождения курса считается по урокам', () async {
      final c = await ready();
      expect(c.completionRatio, 0);
      await c.completeLesson(_summary('l1', score: 1.0));
      expect(c.completionRatio, closeTo(1 / 3, 0.001));
    });
  });

  group('завершение урока', () {
    test('начисляет XP и отмечает учебный день', () async {
      final c = await ready();
      await c.completeLesson(_summary('l1', score: 1.0));
      expect(c.progress!.xp, 10);
      expect(c.progress!.streak.currentDays, 1);
    });

    test('повторное прохождение даёт меньше XP', () async {
      final c = await ready();
      await c.completeLesson(_summary('l1', score: 1.0));
      final afterFirst = c.progress!.xp;
      await c.completeLesson(_summary('l1', score: 1.0));
      expect(c.progress!.xp - afterFirst, lessThan(afterFirst),
          reason: 'реплей не должен фармить прогресс наравне с первым разом');
    });

    test('сохраняет лучший результат, а не последний', () async {
      final c = await ready();
      await c.completeLesson(_summary('l1', score: 1.0));
      await c.completeLesson(_summary('l1', score: 0.0, correct: false));
      expect(c.progress!.lessons['l1']!.bestScore, 1.0);
      expect(c.progress!.lessons['l1']!.attemptsCount, 2);
    });

    test('прогресс попадает в хранилище', () async {
      final c = await ready();
      await c.completeLesson(_summary('l1', score: 1.0));
      expect(store.saved!.lessons.containsKey('l1'), isTrue);
    });
  });

  group('совместимость с обновлением контента', () {
    test('прогресс переживает смену версии курса', () async {
      final c = await ready();
      await c.completeLesson(_summary('l1', score: 1.0));

      final c2 = await ready();
      expect(c2.progress!.lessons.containsKey('l1'), isTrue,
          reason: 'обновление контента не должно стирать прогресс');
    });

    test('незавершённый урок снимается при смене checksum', () async {
      final c = await ready();
      await c.saveActiveLesson({
        'lessonId': 'l1',
        'contentChecksum': 'sha256:abc',
      });
      expect(c.progress!.activeLesson, isNotNull);

      final c2 = await ready(checksum: 'sha256:ДРУГОЙ');
      expect(c2.progress!.activeLesson, isNull,
          reason: 'продолжать попытку на другом контенте небезопасно');
    });

    test('записи об исчезнувших уроках отбрасываются', () async {
      store.saved = const CourseProgress(
        courseId: 'c_test',
        courseVersion: '0.9.0',
        lessons: {
          'l_removed': LessonProgress(
            lessonId: 'l_removed',
            status: LessonStatus.completed,
            bestScore: 1,
          ),
        },
      );
      final c = await ready();
      expect(c.progress!.lessons.containsKey('l_removed'), isFalse);
    });
  });

  group('незавершённый урок', () {
    test('сохраняется и отражается статусом inProgress', () async {
      final c = await ready();
      await c.saveActiveLesson({
        'lessonId': 'l1',
        'contentChecksum': 'sha256:abc',
      });
      expect(c.statusOf(c.course!.allLessons[0]), LessonStatus.inProgress);
    });

    test('снимается после завершения урока', () async {
      final c = await ready();
      await c.saveActiveLesson({
        'lessonId': 'l1',
        'contentChecksum': 'sha256:abc',
      });
      await c.completeLesson(_summary('l1', score: 1.0));
      expect(c.progress!.activeLesson, isNull);
    });
  });

  group('сброс', () {
    test('очищает уроки, mastery и опыт', () async {
      final c = await ready();
      await c.completeLesson(_summary('l1', score: 1.0));
      await c.reset();
      expect(c.progress!.lessons, isEmpty);
      expect(c.progress!.xp, 0);
      expect(c.statusOf(c.course!.allLessons[1]), LessonStatus.locked);
    });
  });

  group('MasteryEngine', () {
    const engine = MasteryEngine();
    final now = DateTime(2026, 7, 24, 12);

    test('новая цель начинается с нуля', () {
      const m = ObjectiveMastery(objectiveId: 'obj_1');
      expect(m.score, 0);
      expect(engine.isMastered(m), isFalse);
    });

    test('верный ответ с первой попытки поднимает сильнее', () {
      const start = ObjectiveMastery(objectiveId: 'obj_1');
      final first = engine.applyAttempt(start,
          isCorrect: true, firstTry: true, hintUsed: false, now: now);
      final assisted = engine.applyAttempt(start,
          isCorrect: true, firstTry: false, hintUsed: false, now: now);
      expect(first.score, greaterThan(assisted.score));
    });

    test('подсказка снижает прирост', () {
      const start = ObjectiveMastery(objectiveId: 'obj_1');
      final withHint = engine.applyAttempt(start,
          isCorrect: true, firstTry: true, hintUsed: true, now: now);
      final without = engine.applyAttempt(start,
          isCorrect: true, firstTry: true, hintUsed: false, now: now);
      expect(withHint.score, lessThan(without.score));
    });

    test('ошибка снижает оценку и приближает повторение', () {
      const start = ObjectiveMastery(objectiveId: 'obj_1', score: 0.6);
      final after = engine.applyAttempt(start,
          isCorrect: false, firstTry: true, hintUsed: false, now: now);
      expect(after.score, lessThan(0.6));
      expect(after.nextReviewAt!.isBefore(now.add(const Duration(days: 1))),
          isTrue);
    });

    test('оценка не выходит за границы 0..1', () {
      var m = const ObjectiveMastery(objectiveId: 'obj_1');
      for (var i = 0; i < 20; i++) {
        m = engine.applyAttempt(m,
            isCorrect: true, firstTry: true, hintUsed: false, now: now);
      }
      expect(m.score, 1.0);
      for (var i = 0; i < 20; i++) {
        m = engine.applyAttempt(m,
            isCorrect: false, firstTry: true, hintUsed: false, now: now);
      }
      expect(m.score, 0.0);
    });

    test('освоенность требует и оценки, и подтверждений', () {
      var m = const ObjectiveMastery(objectiveId: 'obj_1');
      m = engine.applyAttempt(m,
          isCorrect: true, firstTry: true, hintUsed: false, now: now);
      m = engine.applyAttempt(m,
          isCorrect: true, firstTry: true, hintUsed: false, now: now);
      expect(engine.isMastered(m), isFalse, reason: 'мало подтверждений');

      for (var i = 0; i < 3; i++) {
        m = engine.applyAttempt(m,
            isCorrect: true, firstTry: true, hintUsed: false, now: now);
      }
      expect(engine.isMastered(m), isTrue);
    });

    test('интервал повторения растёт с уверенностью', () {
      var m = const ObjectiveMastery(objectiveId: 'obj_1');
      Duration? previous;
      for (var i = 0; i < 6; i++) {
        m = engine.applyAttempt(m,
            isCorrect: true, firstTry: true, hintUsed: false, now: now);
        if (engine.isMastered(m)) {
          final interval = m.nextReviewAt!.difference(now);
          if (previous != null) {
            expect(interval >= previous, isTrue);
          }
          previous = interval;
        }
      }
      expect(previous, isNotNull);
    });
  });

  group('Streak', () {
    test('второй раз за день не удваивает серию', () {
      final day = DateTime(2026, 7, 24, 9);
      var s = const Streak().markStudied(day);
      expect(s.currentDays, 1);
      s = s.markStudied(DateTime(2026, 7, 24, 21));
      expect(s.currentDays, 1);
    });

    test('следующий день продолжает серию', () {
      var s = const Streak().markStudied(DateTime(2026, 7, 24));
      s = s.markStudied(DateTime(2026, 7, 25));
      expect(s.currentDays, 2);
      expect(s.longestDays, 2);
    });

    test('пропуск дня обнуляет текущую серию, но не рекорд', () {
      var s = const Streak().markStudied(DateTime(2026, 7, 24));
      s = s.markStudied(DateTime(2026, 7, 25));
      s = s.markStudied(DateTime(2026, 7, 28));
      expect(s.currentDays, 1);
      expect(s.longestDays, 2);
    });
  });
}
