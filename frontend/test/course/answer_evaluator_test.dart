import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/models/answer.dart';
import 'package:srbski_read/course/models/course.dart';
import 'package:srbski_read/course/models/exercise.dart';
import 'package:srbski_read/course/services/answer_evaluator.dart';

/// Минимальный валидный sourceRef — provenance обязателен для любого контента.
Map<String, dynamic> get _sourceRef => {
      'sourceBook': 'Просвирина О. А. и др. Сербский язык. — М.: ВКН, 2018',
      'sourceHeading': '5.2.3. Падежи',
      'sourceAnchor': 'md:838-922',
      'sourceEditionOrFileHash': 'sha256:test',
      'contentVersion': '1.0.0',
      'reviewStatus': 'machine_checked',
    };

Map<String, dynamic> _base(String id, String type) => {
      'id': id,
      'type': type,
      'unitId': 'u_test',
      'skillId': 'sk_test',
      'lessonId': 'l_test',
      'learningObjectiveIds': <String>['obj_test'],
      'difficulty': 2,
      'prompt': 'Тестовое задание',
      'instructionLanguage': 'ru',
      'serbianScript': 'latin',
      'explanation': 'Объяснение правила.',
      'sourceRef': _sourceRef,
      'contentReviewStatus': 'machine_checked',
    };

const _config = CourseConfig(
  defaultScript: SerbianScript.latin,
  acceptBothScripts: false,
  showTransliterationHint: true,
  passThreshold: 0.8,
  allowDraftContent: false,
);

const _evaluator = AnswerEvaluator(_config);

void main() {
  group('парсер', () {
    test('отклоняет неизвестный тип упражнения с указанием ID', () {
      expect(
        () => Exercise.fromJson(_base('ex_bad', 'telepathy')),
        throwsA(isA<CourseFormatException>()
            .having((e) => e.elementId, 'elementId', 'ex_bad')),
      );
    });

    test('отклоняет упражнение без provenance', () {
      final json = _base('ex_np', 'multiple_choice')..remove('sourceRef');
      json['options'] = [
        {'id': 'o1', 'text': 'a', 'correct': true},
        {'id': 'o2', 'text': 'b', 'correct': false},
      ];
      expect(
          () => Exercise.fromJson(json), throwsA(isA<CourseFormatException>()));
    });

    test('отклоняет варианты без правильного ответа', () {
      final json = _base('ex_nc', 'multiple_choice');
      json['options'] = [
        {'id': 'o1', 'text': 'a', 'correct': false},
        {'id': 'o2', 'text': 'b', 'correct': false},
      ];
      expect(
        () => Exercise.fromJson(json),
        throwsA(isA<CourseFormatException>()
            .having((e) => e.message, 'message', contains('нет правильного'))),
      );
    });

    test('отклоняет дублирующиеся ID токенов', () {
      final json = _base('ex_dup', 'sentence_builder');
      json['tokens'] = [
        {'id': 't1', 'text': 'Ja'},
        {'id': 't1', 'text': 'sam'},
      ];
      json['acceptedOrders'] = [
        ['t1', 't1']
      ];
      expect(
        () => Exercise.fromJson(json),
        throwsA(isA<CourseFormatException>()
            .having((e) => e.message, 'message', contains('дублирующийся'))),
      );
    });

    test('одинаковые слова допустимы при разных ID', () {
      final json = _base('ex_same', 'sentence_builder');
      json['tokens'] = [
        {'id': 't1', 'text': 'i'},
        {'id': 't2', 'text': 'i'},
      ];
      json['acceptedOrders'] = [
        ['t1', 't2']
      ];
      expect(Exercise.fromJson(json), isA<SentenceBuilderExercise>());
    });

    test('отклоняет acceptedOrder со ссылкой на несуществующий токен', () {
      final json = _base('ex_ref', 'sentence_builder');
      json['tokens'] = [
        {'id': 't1', 'text': 'Ja'}
      ];
      json['acceptedOrders'] = [
        ['t1', 't9']
      ];
      expect(
          () => Exercise.fromJson(json), throwsA(isA<CourseFormatException>()));
    });

    test('отклоняет fill_blank с пропуском без описания', () {
      final json = _base('ex_fb', 'fill_blank');
      json['segments'] = [
        {'kind': 'text', 'text': 'Idem u '},
        {'kind': 'blank', 'id': 'b1'},
      ];
      json['blanks'] = [
        {
          'id': 'b2',
          'acceptedAnswers': <String>['školu']
        }
      ];
      expect(
          () => Exercise.fromJson(json), throwsA(isA<CourseFormatException>()));
    });

    test('отклоняет letter_unscramble без ответа', () {
      final json = _base('ex_lu', 'letter_unscramble')..['answer'] = '';
      expect(
          () => Exercise.fromJson(json), throwsA(isA<CourseFormatException>()));
    });
  });

  group('multiple_choice', () {
    final exercise = Exercise.fromJson(_base('ex_mc', 'multiple_choice')
      ..['options'] = [
        {'id': 'o1', 'text': 'семь', 'correct': true},
        {
          'id': 'o2',
          'text': 'шесть',
          'correct': false,
          'misconceptionId': 'misc_six_cases_ru',
          'feedbackKey': 'fb_extra_vokativ',
        },
      ]) as MultipleChoiceExercise;

    test('принимает правильный вариант', () {
      final r = _evaluator.evaluate(exercise, const ChoiceAnswer({'o1'}));
      expect(r.correct, isTrue);
      expect(r.correctDisplay, 'семь');
    });

    test('на ошибке возвращает диагноз misconception', () {
      final r = _evaluator.evaluate(exercise, const ChoiceAnswer({'o2'}));
      expect(r.correct, isFalse);
      expect(r.misconceptionId, 'misc_six_cases_ru');
      expect(r.feedbackKey, 'fb_extra_vokativ');
      expect(r.explanation, isNotEmpty);
    });
  });

  group('sentence_builder', () {
    SentenceBuilderExercise build({
      List<List<String>>? orders,
      List<String> optional = const [],
    }) {
      final json = _base('ex_sb', 'sentence_builder');
      json['tokens'] = [
        {'id': 't1', 'text': 'Profesor'},
        {'id': 't2', 'text': 'pita'},
        {'id': 't3', 'text': 'studenta'},
        {'id': 't4', 'text': '.'},
      ];
      json['distractorTokens'] = [
        {'id': 'd1', 'text': 'studentu'}
      ];
      json['acceptedOrders'] = orders ??
          [
            ['t1', 't2', 't3', 't4']
          ];
      json['optionalTokenIds'] = optional;
      return Exercise.fromJson(json) as SentenceBuilderExercise;
    }

    test('принимает правильный порядок', () {
      final r = _evaluator.evaluate(
          build(), const OrderAnswer(['t1', 't2', 't3', 't4']));
      expect(r.correct, isTrue);
      expect(r.userDisplay, 'Profesor pita studenta.');
    });

    test('НЕ принимает произвольный порядок из тех же слов', () {
      final r = _evaluator.evaluate(
          build(), const OrderAnswer(['t3', 't2', 't1', 't4']));
      expect(r.correct, isFalse);
    });

    test('не принимает лишний токен-ловушку', () {
      final r = _evaluator.evaluate(
          build(), const OrderAnswer(['t1', 't2', 'd1', 't4']));
      expect(r.correct, isFalse);
    });

    test('поддерживает несколько допустимых порядков', () {
      final e = build(orders: [
        ['t1', 't2', 't3', 't4'],
        ['t3', 't2', 't1', 't4'],
      ]);
      expect(
          _evaluator
              .evaluate(e, const OrderAnswer(['t3', 't2', 't1', 't4']))
              .correct,
          isTrue);
    });

    test('разрешает опустить необязательный токен', () {
      final e = build(optional: ['t1']);
      expect(
          _evaluator.evaluate(e, const OrderAnswer(['t2', 't3', 't4'])).correct,
          isTrue);
    });

    test('не разрешает опустить обязательный токен', () {
      final r =
          _evaluator.evaluate(build(), const OrderAnswer(['t1', 't2', 't4']));
      expect(r.correct, isFalse);
    });

    test('показывает правильный вариант после ошибки', () {
      final r = _evaluator.evaluate(build(), const OrderAnswer(['t2', 't1']));
      expect(r.correctDisplay, 'Profesor pita studenta.');
    });
  });

  group('ending_picker', () {
    final exercise = Exercise.fromJson(_base('ex_ep', 'ending_picker')
      ..addAll({
        'wordClass': 'noun',
        'contextSentence': 'Profesor traži odgovor od ___.',
        'stem': 'student',
        'fullForm': 'studenta',
        'preposition': 'od',
        'target': {'lemma': 'student', 'case': 'gen', 'number': 'sing'},
        'options': [
          {'id': 'e1', 'text': 'a', 'correct': true},
          {
            'id': 'e2',
            'text': 'u',
            'correct': false,
            'misconceptionId': 'misc_dat_instead_of_gen',
          },
        ],
      })) as EndingPickerExercise;

    test('складывает основу и окончание в полную форму', () {
      final r = _evaluator.evaluate(exercise, const ChoiceAnswer({'e1'}));
      expect(r.correct, isTrue);
      expect(r.correctDisplay, 'studenta');
    });

    test('на ошибке показывает обе формы и место расхождения', () {
      final r = _evaluator.evaluate(exercise, const ChoiceAnswer({'e2'}));
      expect(r.correct, isFalse);
      expect(r.userDisplay, 'studentu');
      expect(r.correctDisplay, 'studenta');
      expect(r.divergenceIndex, 7);
      expect(r.misconceptionId, 'misc_dat_instead_of_gen');
    });
  });

  group('letter_unscramble', () {
    final exercise = Exercise.fromJson(_base('ex_lu', 'letter_unscramble')
      ..addAll({
        'lemma': 'prijatelj',
        'answer': 'prijateljem',
        'targetFeats': 'Case=Ins|Number=Sing',
      })) as LetterUnscrambleExercise;

    test('принимает точную форму', () {
      expect(
          _evaluator
              .evaluate(exercise, const TextAnswer('prijateljem'))
              .correct,
          isTrue);
    });

    test('игнорирует регистр', () {
      expect(
          _evaluator
              .evaluate(exercise, const TextAnswer('Prijateljem'))
              .correct,
          isTrue);
    });

    test('отклоняет другое окончание', () {
      final r = _evaluator.evaluate(exercise, const TextAnswer('prijateljom'));
      expect(r.correct, isFalse);
      expect(r.divergenceIndex, 9);
    });

    test('различает č и ć в ответе', () {
      final e = Exercise.fromJson(
              _base('ex_cc', 'letter_unscramble')..['answer'] = 'čaša')
          as LetterUnscrambleExercise;
      expect(_evaluator.evaluate(e, const TextAnswer('ćaša')).correct, isFalse);
      expect(_evaluator.evaluate(e, const TextAnswer('čaša')).correct, isTrue);
    });
  });

  group('fill_blank', () {
    final exercise = Exercise.fromJson(_base('ex_fb2', 'fill_blank')
      ..addAll({
        'segments': [
          {'kind': 'text', 'text': 'Вопросы винительного падежа: koga, '},
          {'kind': 'blank', 'id': 'b1'},
          {'kind': 'text', 'text': '?'},
        ],
        'blanks': [
          {
            'id': 'b1',
            'acceptedAnswers': ['šta'],
            'caseSensitive': false,
          }
        ],
      })) as FillBlankExercise;

    test('принимает верное заполнение', () {
      expect(
        _evaluator
            .evaluate(exercise, const BlanksAnswer({'b1': 'šta'}))
            .correct,
        isTrue,
      );
    });

    test('терпит лишние пробелы и регистр', () {
      expect(
        _evaluator
            .evaluate(exercise, const BlanksAnswer({'b1': '  Šta '}))
            .correct,
        isTrue,
      );
    });

    test('отклоняет форму без диакритики', () {
      expect(
        _evaluator
            .evaluate(exercise, const BlanksAnswer({'b1': 'sta'}))
            .correct,
        isFalse,
      );
    });

    test('отклоняет пустой ответ', () {
      expect(
        _evaluator.evaluate(exercise, const BlanksAnswer({'b1': ''})).correct,
        isFalse,
      );
    });
  });

  group('matching', () {
    final exercise = Exercise.fromJson(_base('ex_m', 'matching')
      ..addAll({
        'leftLabel': 'Падеж',
        'rightLabel': 'Вопросы',
        'pairs': [
          {'left': 'nominativ', 'right': 'ko, šta'},
          {'left': 'genitiv', 'right': 'koga, čega'},
        ],
        'distractorsRight': ['koga, šta'],
      })) as MatchingExercise;

    test('принимает полное верное сопоставление', () {
      final r = _evaluator.evaluate(
        exercise,
        const PairsAnswer({'nominativ': 'ko, šta', 'genitiv': 'koga, čega'}),
      );
      expect(r.correct, isTrue);
    });

    test('отклоняет перепутанные пары', () {
      final r = _evaluator.evaluate(
        exercise,
        const PairsAnswer({'nominativ': 'koga, čega', 'genitiv': 'ko, šta'}),
      );
      expect(r.correct, isFalse);
    });

    test('отклоняет неполное сопоставление', () {
      final r = _evaluator.evaluate(
        exercise,
        const PairsAnswer({'nominativ': 'ko, šta'}),
      );
      expect(r.correct, isFalse);
    });
  });

  group('письменность', () {
    final json = _base('ex_script', 'letter_unscramble')
      ..['answer'] = 'student';
    final exercise = Exercise.fromJson(json) as LetterUnscrambleExercise;

    test('по умолчанию кириллический ответ не принимается', () {
      expect(_evaluator.evaluate(exercise, const TextAnswer('студент')).correct,
          isFalse);
    });

    test('при acceptBothScripts кириллица засчитывается', () {
      const evaluator = AnswerEvaluator(CourseConfig(
        defaultScript: SerbianScript.latin,
        acceptBothScripts: true,
        showTransliterationHint: true,
        passThreshold: 0.8,
        allowDraftContent: false,
      ));
      expect(evaluator.evaluate(exercise, const TextAnswer('студент')).correct,
          isTrue);
    });
  });
}
