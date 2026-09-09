import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/personal_lesson.dart';
import 'package:srbski_read/screens/personal_lessons_screen.dart';

void main() {
  test('множественный выбор и исключающие варианты сохраняют общий контракт',
      () {
    final q = PersonalQuestion.fromJson({
      'id': 'focus',
      'title': 'Упор',
      'multiple': true,
      'exclusive': 'Всё',
      'options': ['Всё', 'Чтение', 'Письмо']
    });
    expect(q.toggle('Чтение', 'Письмо'), 'Чтение\nПисьмо');
    expect(q.toggle('Чтение\nПисьмо', 'Чтение'), 'Письмо');
    expect(q.toggle('Чтение', 'Всё'), 'Всё');
    expect(q.toggle('Всё', 'Письмо'), 'Письмо');
    expect(q.toggle('Письмо', 'Письмо'), '');
  });
  testWidgets('анкета помещается на телефоне и требует ответ перед переходом',
      (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final questions = [
      for (var i = 0; i < 10; i++)
        PersonalQuestion.fromJson({
          'id': 'q$i',
          'title': 'Какие объяснения тебе помогают?',
          'options': ['Подробно с примерами', 'Схемы и сравнения с русским']
        })
    ];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: PersonalQuestionnaire(
                    questions: questions,
                    level: 'B1',
                    disabled: false,
                    onSubmit: (_, zone, answers) async {})))));
    final next = find.widgetWithText(FilledButton, 'Дальше');
    expect(tester.widget<FilledButton>(next).onPressed, isNull);
    await tester.tap(find.text('Подробно с примерами'));
    await tester.pump();
    expect(tester.widget<FilledButton>(next).onPressed, isNotNull);
    await tester.ensureVisible(next);
    await tester.tap(next);
    await tester.pump();
    expect(find.text('Вопрос 2 из 10'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('несколько ответов остаются выбранными после перехода назад',
      (tester) async {
    final questions = [
      PersonalQuestion.fromJson({
        'id': 'goal',
        'title': 'Цели',
        'multiple': true,
        'options': ['Работа', 'Культура']
      }),
      PersonalQuestion.fromJson({
        'id': 'pace',
        'title': 'Темп',
        'options': ['Спокойный', 'Быстрый']
      }),
    ];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child: PersonalQuestionnaire(
                    questions: questions,
                    level: 'A1',
                    disabled: false,
                    onSubmit: (level, zone, answers) async {})))));
    await tester.tap(find.text('Работа'));
    await tester.pump();
    await tester.tap(find.text('Культура'));
    await tester.pump();
    expect(find.byIcon(Icons.check_circle), findsNWidgets(2));
    await tester.tap(find.text('Дальше'));
    await tester.pump();
    await tester.tap(find.text('Назад'));
    await tester.pump();
    expect(find.byIcon(Icons.check_circle), findsNWidgets(2));
    await tester.tap(find.text('Работа'));
    await tester.pump();
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
  });
}
