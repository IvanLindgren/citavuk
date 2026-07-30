import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/models/answer.dart';
import 'package:srbski_read/course/models/exercise.dart';
import 'package:srbski_read/course/services/answer_evaluator.dart';
import 'package:srbski_read/course/widgets/exercise_host.dart';
import 'package:srbski_read/course/widgets/feedback_panel.dart';
import 'package:srbski_read/theme/app_theme.dart';

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
      'learningObjectiveIds': ['obj_a'],
      'difficulty': 2,
      'prompt': 'Соберите предложение',
      'instructionLanguage': 'ru',
      'serbianScript': 'latin',
      'explanation': 'Объяснение.',
      'sourceRef': _sourceRef,
      'contentReviewStatus': 'machine_checked',
    };

/// Обёртка, которая держит ответ в состоянии — как это делает экран урока.
class _Harness extends StatefulWidget {
  const _Harness({required this.exercise, this.onAnswer});

  final Exercise exercise;
  final ValueChanged<Answer?>? onAnswer;

  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  Answer? _answer;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: SingleChildScrollView(
          child: ExerciseHost(
            exercise: widget.exercise,
            answer: _answer,
            onChanged: (a) {
              setState(() => _answer = a);
              widget.onAnswer?.call(a);
            },
          ),
        ),
      ),
    );
  }
}

void main() {
  group('порядок вариантов ответа', () {
    /// В материалах курса верный ответ записан первым во всех заданиях с
    /// выбором — так их удобнее вычитывать. Значит показывать варианты в
    /// исходном порядке нельзя: курс проходился нажатием на первую строку.
    Exercise choice(String id) => Exercise.fromJson(_base(id, 'multiple_choice')
      ..addAll({
        'prompt': 'Выберите верную форму',
        'multi': false,
        'options': [
          {'id': 'a', 'text': 'верно', 'correct': true},
          {'id': 'b', 'text': 'мимо один'},
          {'id': 'c', 'text': 'мимо два'},
          {'id': 'd', 'text': 'мимо три'},
        ],
      }));

    testWidgets('верный вариант не всегда первый', (tester) async {
      // Одного упражнения мало: перемешивание детерминировано по ID, и у
      // какого-то одного верный ответ мог остаться на первом месте случайно.
      var firstIsCorrect = 0;
      const total = 12;
      for (var i = 0; i < total; i++) {
        await tester.pumpWidget(_Harness(exercise: choice('ex_choice_$i')));
        final texts = tester
            .widgetList<Text>(find.descendant(
              of: find.byType(InkWell),
              matching: find.byType(Text),
            ))
            .map((widget) => widget.data)
            .whereType<String>()
            .toList();
        expect(texts.length, 4, reason: 'должны показываться все варианты');
        if (texts.first == 'верно') firstIsCorrect++;
      }
      expect(firstIsCorrect, lessThan(total),
          reason: 'верный ответ оказался первым во всех заданиях');
    });

    testWidgets('порядок не меняется между перерисовками', (tester) async {
      await tester.pumpWidget(_Harness(exercise: choice('ex_stable')));
      List<String?> shown() => tester
          .widgetList<Text>(find.descendant(
            of: find.byType(InkWell),
            matching: find.byType(Text),
          ))
          .map((widget) => widget.data)
          .toList();

      final before = shown();
      await tester.tap(find.text('мимо один'));
      await tester.pumpAndSettle();
      expect(shown(), before,
          reason: 'после ответа варианты не должны перескакивать');
    });
  });

  group('reading_qa', () {
    final exercise = Exercise.fromJson(_base('ex_rq', 'reading_qa')
      ..addAll({
        'prompt': 'Прочитайте и ответьте на вопросы',
        'text': 'Zdravo! Ja sam Ana. Nisam iz Beograda, ja sam iz Niša.',
        'translation': 'Здравствуйте! Я Ана. Я не из Белграда, я из Ниша.',
        'questions': [
          {
            'id': 'q1',
            'prompt': 'Odakle je Ana?',
            'options': [
              {'id': 'a', 'text': 'Iz Niša.', 'correct': true},
              {'id': 'b', 'text': 'Iz Beograda.'},
            ],
          },
          {
            'id': 'q2',
            'prompt': 'Ko je Ana?',
            'options': [
              {'id': 'a', 'text': 'Lekar.', 'correct': true},
              {'id': 'b', 'text': 'Student.'},
            ],
          },
        ],
      }));

    testWidgets('выбор первого варианта виден до ответа на все вопросы',
        (tester) async {
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));

      await tester.tap(find.text('Iz Niša.'));
      await tester.pumpAndSettle();

      // Наверх ответ ещё не уходит: задание не закончено.
      expect(last, isNull);
      // Но отметка обязана остаться на экране. Раньше выбор выводился из
      // ответа, лежащего наверху, и первое нажатие пропадало бесследно —
      // задание нельзя было пройти вовсе.
      expect(find.byIcon(Icons.radio_button_checked), findsOneWidget);
    });

    testWidgets('после ответа на все вопросы ответ уходит наверх',
        (tester) async {
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));

      await tester.tap(find.text('Iz Niša.'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Lekar.'));
      await tester.pumpAndSettle();

      expect((last as PairsAnswer).assignments, {'q1': 'a', 'q2': 'a'});
      expect(find.byIcon(Icons.radio_button_checked), findsNWidgets(2));
    });

    testWidgets('выбор можно поменять', (tester) async {
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));

      await tester.tap(find.text('Iz Niša.'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Iz Beograda.'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Lekar.'));
      await tester.pumpAndSettle();

      expect((last as PairsAnswer).assignments, {'q1': 'b', 'q2': 'a'});
    });
  });

  group('sentence_builder', () {
    final exercise = Exercise.fromJson(_base('ex_sb', 'sentence_builder')
      ..addAll({
        'tokens': [
          {'id': 't1', 'text': 'Profesor'},
          {'id': 't2', 'text': 'pita'},
          {'id': 't3', 'text': 'studenta'},
        ],
        'acceptedOrders': [
          ['t1', 't2', 't3']
        ],
      }));

    testWidgets('нажатие переносит слово в ответ и обратно', (tester) async {
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));

      expect(find.text('Нажимайте слова ниже, чтобы собрать предложение'),
          findsOneWidget);

      await tester.tap(find.text('Profesor').first);
      await tester.pumpAndSettle();
      expect((last as OrderAnswer).tokenIds, ['t1']);

      // Теперь слово есть и в ответе, и в банке (в банке — неактивное).
      await tester.tap(find.text('Profesor').first);
      await tester.pumpAndSettle();
      expect(last, isNull, reason: 'пустой ответ снимается');
    });

    testWidgets('собирает полный ответ по нажатиям, без drag', (tester) async {
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));

      for (final word in ['Profesor', 'pita', 'studenta']) {
        await tester.tap(find.widgetWithText(InkWell, word).last);
        await tester.pumpAndSettle();
      }
      expect((last as OrderAnswer).tokenIds, ['t1', 't2', 't3']);
    });

    testWidgets('кнопка сброса очищает ответ', (tester) async {
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));
      await tester.tap(find.text('pita').first);
      await tester.pumpAndSettle();
      expect(last, isNotNull);

      await tester.tap(find.text('Сбросить'));
      await tester.pumpAndSettle();
      expect(last, isNull);
    });
  });

  group('ending_picker', () {
    final exercise = Exercise.fromJson(_base('ex_ep', 'ending_picker')
      ..addAll({
        'prompt': 'Выберите окончание',
        'wordClass': 'noun',
        'contextSentence': 'Profesor traži odgovor od ___.',
        'stem': 'student',
        'fullForm': 'studenta',
        'preposition': 'od',
        'target': {'lemma': 'student', 'case': 'gen'},
        'options': [
          {'id': 'e1', 'text': 'a', 'correct': true},
          {'id': 'e2', 'text': 'u', 'correct': false},
        ],
      }));

    testWidgets('показывает основу отдельно от слота окончания',
        (tester) async {
      await tester.pumpWidget(_Harness(exercise: exercise));
      expect(find.text('student'), findsOneWidget);
      expect(find.text('…'), findsOneWidget, reason: 'слот пуст до выбора');
      expect(find.text('od'), findsOneWidget, reason: 'предлог виден');
    });

    testWidgets('выбор окончания подставляется в слот', (tester) async {
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));
      await tester.tap(find.text('a').last);
      await tester.pumpAndSettle();

      expect((last as ChoiceAnswer).optionIds, {'e1'});
      expect(find.text('…'), findsNothing);
    });
  });

  group('letter_unscramble', () {
    final exercise = Exercise.fromJson(_base('ex_lu', 'letter_unscramble')
      ..addAll({
        'prompt': 'Соберите слово',
        'lemma': 'student',
        'answer': 'sto',
        'targetFeats': 'Case=Nom',
      }));

    testWidgets('буквы собираются нажатием и снимаются повторным',
        (tester) async {
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));

      // Три буквы в банке: s, t, o (в перемешанном порядке).
      await tester.tap(find.text('s').last);
      await tester.pumpAndSettle();
      expect((last as TextAnswer).text, 's');

      await tester.tap(find.text('t').last);
      await tester.pumpAndSettle();
      expect((last as TextAnswer).text, 'st');

      await tester.tap(find.text('o').last);
      await tester.pumpAndSettle();
      expect((last as TextAnswer).text, 'sto');
    });

    testWidgets('перемешивание не оставляет готовый ответ', (tester) async {
      // Плитки в банке идут не в порядке правильного ответа.
      await tester.pumpWidget(_Harness(exercise: exercise));
      final tiles = tester
          .widgetList<Text>(find.descendant(
            of: find.byType(Wrap).last,
            matching: find.byType(Text),
          ))
          .map((t) => t.data)
          .join();
      expect(tiles, isNot('sto'));
    });

    testWidgets('показывает начальную форму', (tester) async {
      await tester.pumpWidget(_Harness(exercise: exercise));
      expect(find.text('student'), findsOneWidget);
    });
  });

  group('multiple_choice', () {
    testWidgets('одиночный выбор заменяет предыдущий', (tester) async {
      final exercise = Exercise.fromJson(_base('ex_mc', 'multiple_choice')
        ..addAll({
          'prompt': 'Сколько падежей?',
          'options': [
            {'id': 'o1', 'text': 'семь', 'correct': true},
            {'id': 'o2', 'text': 'шесть', 'correct': false},
          ],
        }));
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));

      await tester.tap(find.text('шесть'));
      await tester.pumpAndSettle();
      expect((last as ChoiceAnswer).optionIds, {'o2'});

      await tester.tap(find.text('семь'));
      await tester.pumpAndSettle();
      expect((last as ChoiceAnswer).optionIds, {'o1'});
    });

    testWidgets('множественный выбор накапливает варианты', (tester) async {
      final exercise = Exercise.fromJson(_base('ex_mcm', 'multiple_choice')
        ..addAll({
          'prompt': 'Отметьте все падежи',
          'multi': true,
          'options': [
            {'id': 'o1', 'text': 'genitiv', 'correct': true},
            {'id': 'o2', 'text': 'dativ', 'correct': true},
            {'id': 'o3', 'text': 'предложный', 'correct': false},
          ],
        }));
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));

      await tester.tap(find.text('genitiv'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('dativ'));
      await tester.pumpAndSettle();
      expect((last as ChoiceAnswer).optionIds, {'o1', 'o2'});

      await tester.tap(find.text('dativ'));
      await tester.pumpAndSettle();
      expect((last as ChoiceAnswer).optionIds, {'o1'});
    });
  });

  group('matching', () {
    testWidgets('сопоставление выполняется в два нажатия', (tester) async {
      final exercise = Exercise.fromJson(_base('ex_m', 'matching')
        ..addAll({
          'prompt': 'Сопоставьте падеж и вопросы',
          'leftLabel': 'Падеж',
          'rightLabel': 'Вопросы',
          'pairs': [
            {'left': 'nominativ', 'right': 'ko, šta'},
            {'left': 'genitiv', 'right': 'koga, čega'},
          ],
        }));
      Answer? last;
      await tester
          .pumpWidget(_Harness(exercise: exercise, onAnswer: (a) => last = a));

      await tester.tap(find.text('nominativ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('ko, šta').last);
      await tester.pumpAndSettle();

      expect((last as PairsAnswer).assignments, {'nominativ': 'ko, šta'});
    });
  });

  group('FeedbackPanel', () {
    testWidgets('на ошибке показывает оба ответа, иконку и текст',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light(),
        home: const Scaffold(
          body: FeedbackPanel(
            result: EvaluationResult(
              correct: false,
              userDisplay: 'studentu',
              correctDisplay: 'studenta',
              divergenceIndex: 7,
              explanation: 'После «od» нужен родительный падеж.',
            ),
          ),
        ),
      ));

      // Результат читается без различения цветов: есть иконка и слово.
      expect(find.text('Неверно'), findsOneWidget);
      expect(find.byIcon(Icons.cancel), findsOneWidget);
      expect(find.text('studentu'), findsOneWidget);
      expect(find.text('После «od» нужен родительный падеж.'), findsOneWidget);
    });

    testWidgets('на правильном ответе не показывает разбор', (tester) async {
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light(),
        home: const Scaffold(
          body: FeedbackPanel(
            result: EvaluationResult(
              correct: true,
              correctDisplay: 'studenta',
              explanation: 'Верно: после «od» родительный падеж.',
            ),
          ),
        ),
      ));

      expect(find.text('Верно'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
      expect(find.text('Ваш ответ'), findsNothing);
    });
  });
}
