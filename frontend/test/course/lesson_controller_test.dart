import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/models/answer.dart';
import 'package:srbski_read/course/models/course.dart';
import 'package:srbski_read/course/models/exercise.dart';
import 'package:srbski_read/course/services/answer_evaluator.dart';
import 'package:srbski_read/course/state/lesson_controller.dart';

Map<String, dynamic> get _sourceRef => {
      'sourceBook': 'Просвирина О. А. и др. Сербский язык. — М.: ВКН, 2018',
      'sourceHeading': '5.2.3. Падежи',
      'sourceAnchor': 'md:838-922',
      'sourceEditionOrFileHash': 'sha256:test',
      'contentVersion': '1.0.0',
      'reviewStatus': 'machine_checked',
    };

/// Упражнение с двумя вариантами: 'o1' правильный, 'o2' нет.
Map<String, dynamic> _mc(String id, {String objective = 'obj_a'}) => {
      'id': id,
      'type': 'multiple_choice',
      'unitId': 'u_test',
      'skillId': 'sk_test',
      'lessonId': 'l_test',
      'learningObjectiveIds': [objective],
      'difficulty': 1,
      'prompt': 'Вопрос $id',
      'instructionLanguage': 'ru',
      'serbianScript': 'latin',
      'explanation': 'Объяснение $id',
      'sourceRef': _sourceRef,
      'contentReviewStatus': 'machine_checked',
      'options': [
        {'id': 'o1', 'text': 'верно', 'correct': true},
        {'id': 'o2', 'text': 'неверно', 'correct': false},
      ],
    };

Lesson _lesson({int count = 3, bool withIntro = false}) => Lesson.fromJson({
      'id': 'l_test',
      'title': 'Тестовый урок',
      'prerequisites': <String>[],
      if (withIntro) 'intro': {'text': 'Вступление', 'sourceRef': _sourceRef},
      'exercises': [
        for (var i = 1; i <= count; i++)
          _mc('ex_$i', objective: i == 2 ? 'obj_b' : 'obj_a'),
      ],
    });

const _evaluator = AnswerEvaluator(CourseConfig(
  defaultScript: SerbianScript.latin,
  acceptBothScripts: false,
  showTransliterationHint: true,
  passThreshold: 0.8,
  allowDraftContent: false,
));

LessonController _controller({int count = 3, bool withIntro = false}) =>
    LessonController(
      lesson: _lesson(count: count, withIntro: withIntro),
      evaluator: _evaluator,
      courseVersion: '1.0.0',
      contentChecksum: 'sha256:abc',
    );

/// Отвечает на текущее упражнение и переходит дальше.
void _answer(LessonController c, {required bool correct}) {
  c.setAnswer(ChoiceAnswer({correct ? 'o1' : 'o2'}));
  c.check();
  c.next();
}

void main() {
  group('поток урока', () {
    test('без вступления сразу начинается с упражнения', () {
      final c = _controller();
      expect(c.phase, LessonPhase.answering);
      expect(c.current?.id, 'ex_1');
    });

    test('со вступлением ждёт явного старта', () {
      final c = _controller(withIntro: true);
      expect(c.phase, LessonPhase.intro);
      c.startExercises();
      expect(c.phase, LessonPhase.answering);
    });

    test('«Проверить» неактивна без ответа', () {
      final c = _controller();
      expect(c.canCheck, isFalse);
      c.setAnswer(const ChoiceAnswer({}));
      expect(c.canCheck, isFalse, reason: 'пустой ответ не считается ответом');
      c.setAnswer(const ChoiceAnswer({'o1'}));
      expect(c.canCheck, isTrue);
    });

    test('проверка переводит в фазу обратной связи', () {
      final c = _controller();
      c.setAnswer(const ChoiceAnswer({'o1'}));
      c.check();
      expect(c.phase, LessonPhase.checked);
      expect(c.result?.correct, isTrue);
      expect(c.result?.explanation, 'Объяснение ex_1');
    });

    test('все верные ответы завершают урок', () {
      final c = _controller();
      for (var i = 0; i < 3; i++) {
        _answer(c, correct: true);
      }
      expect(c.phase, LessonPhase.finished);
      expect(c.summary.score, 1.0);
    });
  });

  group('очередь повторения ошибок', () {
    test('ошибочное упражнение возвращается в конец урока', () {
      final c = _controller();
      _answer(c, correct: false); // ex_1 — ошибка
      _answer(c, correct: true); // ex_2
      _answer(c, correct: true); // ex_3
      expect(c.phase, LessonPhase.answering,
          reason: 'урок не должен закончиться, пока ошибка не повторена');
      expect(c.current?.id, 'ex_1');
      _answer(c, correct: true);
      expect(c.phase, LessonPhase.finished);
    });

    test('одно упражнение не ставится в очередь дважды', () {
      final c = _controller(count: 1);
      _answer(c, correct: false);
      expect(c.totalSteps, 2);
      _answer(c, correct: false); // ошибка повторно
      expect(c.totalSteps, 2, reason: 'повторная ошибка не удлиняет очередь');
      expect(c.phase, LessonPhase.finished);
    });

    test('ошибка исключает упражнение из зачёта «с первой попытки»', () {
      final c = _controller(count: 1);
      _answer(c, correct: false);
      _answer(c, correct: true);
      expect(c.summary.firstTryCorrect, 0);
      expect(c.summary.score, 0.0);
    });

    test('подсказка снимает зачёт «с первой попытки»', () {
      final c = _controller(count: 1);
      c.showHint();
      _answer(c, correct: true);
      expect(c.summary.firstTryCorrect, 0);
    });

    test('слабые цели собираются из ошибок', () {
      final c = _controller();
      _answer(c, correct: true); // ex_1 → obj_a
      _answer(c, correct: false); // ex_2 → obj_b
      _answer(c, correct: true); // ex_3
      _answer(c, correct: true); // повтор ex_2
      expect(c.summary.weakObjectiveIds, {'obj_b'});
    });
  });

  group('маскот', () {
    test('реагирует на правильный и неправильный ответ', () {
      final c = _controller();
      expect(c.mascot, MascotState.idle);
      c.setAnswer(const ChoiceAnswer({'o1'}));
      expect(c.mascot, MascotState.thinking);
      c.check();
      expect(c.mascot, MascotState.correct);
      c.next();
      c.setAnswer(const ChoiceAnswer({'o2'}));
      c.check();
      expect(c.mascot, MascotState.incorrect);
    });

    test('на финале показывает завершение урока', () {
      final c = _controller(count: 1);
      _answer(c, correct: true);
      expect(c.mascot, MascotState.lessonComplete);
    });
  });

  group('попытки', () {
    test('фиксируются с признаком первой попытки и подсказки', () {
      final c = _controller(count: 1);
      c.showHint();
      c.setAnswer(const ChoiceAnswer({'o2'}));
      c.check();
      final a = c.attempts.single;
      expect(a.exerciseId, 'ex_1');
      expect(a.isCorrect, isFalse);
      expect(a.firstTry, isTrue);
      expect(a.hintUsed, isTrue);
      expect(a.objectiveIds, ['obj_a']);
      expect(a.answerPayload['kind'], 'choice');
    });

    test('вторая попытка помечается как неперво́начальная', () {
      final c = _controller(count: 1);
      _answer(c, correct: false);
      c.setAnswer(const ChoiceAnswer({'o1'}));
      c.check();
      expect(c.attempts.last.firstTry, isFalse);
    });
  });

  group('восстановление незавершённого урока', () {
    test('сохраняет позицию, ответы и очередь', () {
      final c = _controller();
      _answer(c, correct: false); // ex_1 уходит в очередь повтора
      c.setAnswer(const ChoiceAnswer({'o1'}));
      final snapshot = c.toSnapshot();

      final restored = LessonController.restore(
        snapshot,
        lesson: _lesson(),
        evaluator: _evaluator,
        courseVersion: '1.0.0',
        contentChecksum: 'sha256:abc',
      );

      expect(restored, isNotNull);
      expect(restored!.current?.id, 'ex_2');
      expect(restored.totalSteps, 4, reason: 'очередь повтора сохранена');
      expect((restored.draft as ChoiceAnswer).optionIds, {'o1'});
      expect(restored.attempts.length, 1);
      expect(restored.phase, LessonPhase.answering);
    });

    test('отказывается восстанавливать при смене контента', () {
      final c = _controller();
      _answer(c, correct: true);
      final restored = LessonController.restore(
        c.toSnapshot(),
        lesson: _lesson(),
        evaluator: _evaluator,
        courseVersion: '1.1.0',
        contentChecksum: 'sha256:ДРУГОЙ',
      );
      expect(restored, isNull,
          reason: 'несовместимый контент нельзя продолжать молча');
    });

    test('отказывается восстанавливать снимок другого урока', () {
      final c = _controller();
      final snapshot = c.toSnapshot()..['lessonId'] = 'l_other';
      final restored = LessonController.restore(
        snapshot,
        lesson: _lesson(),
        evaluator: _evaluator,
        courseVersion: '1.0.0',
        contentChecksum: 'sha256:abc',
      );
      expect(restored, isNull);
    });

    test('отказывается восстанавливать очередь с неизвестным упражнением', () {
      final c = _controller();
      final snapshot = c.toSnapshot()..['queue'] = ['ex_1', 'ex_removed'];
      final restored = LessonController.restore(
        snapshot,
        lesson: _lesson(),
        evaluator: _evaluator,
        courseVersion: '1.0.0',
        contentChecksum: 'sha256:abc',
      );
      expect(restored, isNull);
    });

    test('восстановленный урок доигрывается до конца', () {
      final c = _controller(count: 2);
      _answer(c, correct: true);
      final restored = LessonController.restore(
        c.toSnapshot(),
        lesson: _lesson(count: 2),
        evaluator: _evaluator,
        courseVersion: '1.0.0',
        contentChecksum: 'sha256:abc',
      )!;
      _answer(restored, correct: true);
      expect(restored.phase, LessonPhase.finished);
      expect(restored.summary.score, 1.0);
    });
  });
}
