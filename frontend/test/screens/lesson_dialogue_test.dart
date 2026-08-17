import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/community_lesson.dart';
import 'package:srbski_read/screens/community_lesson_screen.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/community_lessons_service.dart';
import 'package:srbski_read/widgets/dialogue_stage.dart';

/// Диалог урока: разговор, а не карточка с текущей репликой.
///
/// Стерегут ровно то, чего в нём не было: накопленную историю, лицо собеседника
/// из поля `avatar` и отдельную сторону для ответа читателя.

class _FakeLessons extends CommunityLessonsService {
  _FakeLessons(this.lesson) : super(ApiClient(baseUrl: 'http://localhost'));

  final CommunityLesson lesson;

  @override
  Future<CommunityLesson> getPublic(String slug) async => lesson;
}

CommunityLesson lessonWith(List<Map<String, dynamic>> nodes,
        {String cover = ''}) =>
    CommunityLesson(
      id: 'l1',
      authorName: 'Преподаватель',
      slug: 'kafana',
      title: 'В кафане',
      summary: '',
      coverUrl: cover,
      level: 'A2',
      lessonType: 'speaking',
      topic: 'В ресторане',
      tags: const [],
      estimatedMinutes: 10,
      visibility: 'public',
      content: {
        'theory': const [],
        'exercises': const [],
        'dialogue': {'startId': 'd1', 'nodes': nodes},
      },
    );

final _talk = <Map<String, dynamic>>[
  {
    'id': 'd1',
    'speaker': 'Konobar',
    'avatar': 'man',
    'text': 'Dobro veče!',
    'choices': [
      {'label': 'Molim vas jelovnik.', 'nextId': 'd2'},
    ],
  },
  {'id': 'd2', 'speaker': 'Konobar', 'avatar': 'man', 'text': 'Odmah stiže.'},
];

/// Экран открывается сразу на диалоге: теория и задания в этих уроках пусты.
Future<void> openDialogue(WidgetTester tester, CommunityLesson lesson) async {
  await tester.pumpWidget(MaterialApp(
      home: CommunityLessonScreen(service: _FakeLessons(lesson), slug: 'kafana')));
  await tester.pump();
  await tester.tap(find.text('Перейти к диалогу'));
  await tester.pump();
}

List<String> assetsOf(WidgetTester tester) => tester
    .widgetList<Image>(find.byType(Image))
    .map((image) => image.image)
    .whereType<AssetImage>()
    .map((image) => image.assetName)
    .toList();

void main() {
  testWidgets('накапливает разговор, а не подменяет реплику', (tester) async {
    await openDialogue(tester, lessonWith(_talk));
    expect(find.text('Dobro veče!'), findsOneWidget);

    await tester.tap(find.text('Molim vas jelovnik.'));
    await tester.pump();

    // Сказанное осталось на экране вместе с ответом.
    expect(find.text('Dobro veče!'), findsOneWidget);
    expect(find.text('Molim vas jelovnik.'), findsWidgets);
    expect(find.text('Odmah stiže.'), findsOneWidget);
    expect(find.text('Разговор окончен.'), findsOneWidget);
  });

  testWidgets('лицо собеседника берётся из поля avatar', (tester) async {
    await openDialogue(tester, lessonWith(_talk));
    expect(assetsOf(tester), contains('assets/imgs/face_man.png'));
  });

  testWidgets('ответ читателя отмечен своим лицом', (tester) async {
    await openDialogue(tester, lessonWith(_talk));
    await tester.tap(find.text('Molim vas jelovnik.'));
    await tester.pump();
    expect(assetsOf(tester), contains('assets/imgs/citavuk_icon.png'));
  });

  // У уроков, написанных до появления выбора персонажа, поля avatar нет. Лицо
  // тогда берётся по имени — устойчиво, чтобы два собеседника не оказались на
  // вид одним человеком.
  test('без avatar разные говорящие получают разные лица', () {
    final ana = DialogueFace.fromAvatar(null, 'Ana');
    final marko = DialogueFace.fromAvatar(null, 'Marko');
    expect(ana, isNot(marko));
    expect(DialogueFace.fromAvatar(null, 'Ana'), ana);
  });

  test('поле avatar сильнее имени', () {
    expect(DialogueFace.fromAvatar('teacher', 'Ana'), DialogueFace.teacher);
    expect(DialogueFace.fromAvatar('student', 'Ana'), DialogueFace.student);
  });
}
