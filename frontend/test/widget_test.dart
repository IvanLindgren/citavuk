/// Smoke-тест Citavuk: карта курса грамматики — основной новый пользовательский
/// поток.
///
/// Полная загрузка `ChitavukApp` здесь не выполняется намеренно: дашборд
/// инициализирует SQLite и уведомления, что требует платформенных каналов и
/// делает smoke-тест хрупким. Проверяется экран, который пользователь видит
/// после нажатия «Грамматика».
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:srbski_read/course/models/course.dart';
import 'package:srbski_read/course/models/progress.dart';
import 'package:srbski_read/course/screens/course_path_screen.dart';
import 'package:srbski_read/course/services/course_content_loader.dart';
import 'package:srbski_read/course/services/course_progress_store.dart';
import 'package:srbski_read/course/state/course_controller.dart';
import 'package:srbski_read/course/widgets/course_button.dart';
import 'package:srbski_read/course/widgets/path_node.dart';
import 'package:srbski_read/state/app_settings.dart';
import 'package:srbski_read/theme/app_theme.dart';

const String _bundle = '''
{
  "courseId": "c_smoke",
  "courseVersion": "1.0.0",
  "title": "Сербская грамматика",
  "config": {
    "defaultScript": "latin",
    "acceptBothScripts": false,
    "showTransliterationHint": true,
    "passThreshold": 0.8,
    "allowDraftContent": false
  },
  "units": [
    {
      "id": "u_smoke",
      "title": "Падежи",
      "description": "Падежная система сербского языка",
      "skills": [
        {
          "id": "sk_smoke",
          "title": "Система падежей",
          "objectives": [{"id": "obj_1", "title": "Цель"}],
          "lessons": [
            {
              "id": "l_first",
              "title": "Семь падежей",
              "prerequisites": [],
              "exercises": [
                {
                  "id": "ex_1",
                  "type": "multiple_choice",
                  "unitId": "u_smoke",
                  "skillId": "sk_smoke",
                  "lessonId": "l_first",
                  "learningObjectiveIds": ["obj_1"],
                  "difficulty": 1,
                  "prompt": "Сколько падежей в сербском языке?",
                  "instructionLanguage": "ru",
                  "serbianScript": "latin",
                  "explanation": "В сербском семь падежей.",
                  "sourceRef": {
                    "sourceBook": "Просвирина О. А. и др. Сербский язык. — М.: ВКН, 2018",
                    "sourceHeading": "5.2.3. Падежи",
                    "sourceAnchor": "md:838-922",
                    "sourceEditionOrFileHash": "sha256:test",
                    "contentVersion": "1.0.0",
                    "reviewStatus": "machine_checked"
                  },
                  "contentReviewStatus": "machine_checked",
                  "options": [
                    {"id": "o1", "text": "семь", "correct": true},
                    {"id": "o2", "text": "шесть", "correct": false}
                  ]
                }
              ]
            },
            {
              "id": "l_second",
              "title": "Вокатив",
              "prerequisites": ["l_first"],
              "exercises": [
                {
                  "id": "ex_2",
                  "type": "multiple_choice",
                  "unitId": "u_smoke",
                  "skillId": "sk_smoke",
                  "lessonId": "l_second",
                  "learningObjectiveIds": ["obj_1"],
                  "difficulty": 2,
                  "prompt": "Что такое вокатив?",
                  "instructionLanguage": "ru",
                  "serbianScript": "latin",
                  "explanation": "Звательный падеж.",
                  "sourceRef": {
                    "sourceBook": "Просвирина О. А. и др. Сербский язык. — М.: ВКН, 2018",
                    "sourceHeading": "5.2.3. Падежи",
                    "sourceAnchor": "md:838-922",
                    "sourceEditionOrFileHash": "sha256:test",
                    "contentVersion": "1.0.0",
                    "reviewStatus": "machine_checked"
                  },
                  "contentReviewStatus": "machine_checked",
                  "options": [
                    {"id": "o1", "text": "звательный", "correct": true},
                    {"id": "o2", "text": "предложный", "correct": false}
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "contentChecksum": "sha256:smoke"
}
''';

class _FakeLoader extends CourseContentLoader {
  Course? _parsed;

  @override
  Future<Course> load() async =>
      _parsed ??= CourseContentLoader.parseBundle(_bundle);
}

class _MemoryStore implements CourseProgressStore {
  CourseProgress? saved;

  @override
  Future<CourseProgress?> load(String courseId) async => saved;

  @override
  Future<void> save(CourseProgress progress) async => saved = progress;

  @override
  Future<void> clear() async => saved = null;
}

/// Оборачивает экран в провайдер настроек — курс читает из них состояние
/// звука.
///
/// Анимации отключены через `disableAnimations`: бесконечный FloatingBob
/// иначе не даёт завершиться `pumpAndSettle`, а заодно проверяется
/// reduce-motion fallback.
Widget _wrap(Widget child, {ThemeData? theme, double textScale = 1.0}) =>
    ChangeNotifierProvider<AppSettings>(
      create: (_) => AppSettings(),
      child: MaterialApp(
        theme: theme ?? AppTheme.light(),
        builder: (context, c) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            disableAnimations: true,
            textScaler: TextScaler.linear(textScale),
          ),
          child: c!,
        ),
        home: child,
      ),
    );

Widget _app({ThemeData? theme, CourseController? controller}) => _wrap(
      CoursePathScreen(
        controller: controller ??
            CourseController(loader: _FakeLoader(), store: _MemoryStore()),
      ),
      theme: theme,
    );

Future<void> _scrollToLesson(WidgetTester tester, String title) async {
  final target = find.text(title);
  if (target.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      target,
      260,
      scrollable: find.byType(Scrollable).first,
    );
  } else {
    await tester.ensureVisible(target);
  }
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('карта курса открывается и показывает разделы и уроки',
      (tester) async {
    await tester.pumpWidget(_app());

    // Пока курс грузится — индикатор, а не пустой экран.
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pumpAndSettle();

    expect(find.text('Курс сербского'), findsOneWidget);
    expect(find.text('БЕТА'), findsOneWidget);
    expect(find.text('Сербская грамматика'), findsOneWidget);
    await _scrollToLesson(tester, 'Падежи');
    expect(find.text('Падежи'), findsOneWidget);
    await _scrollToLesson(tester, 'Семь падежей');
    expect(find.text('Семь падежей'), findsOneWidget);
    await _scrollToLesson(tester, 'Вокатив');
    expect(find.text('Вокатив'), findsOneWidget);
  });

  testWidgets('первый урок доступен, второй закрыт', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    await _scrollToLesson(tester, 'Семь падежей');

    // Пузырь «НАЧАТЬ» над текущим узлом, закрытый узел — с замком.
    expect(find.text('НАЧАТЬ'), findsOneWidget);
    expect(find.byIcon(Icons.lock_rounded), findsOneWidget);
    expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
  });

  testWidgets('закрытый уровень объясняет, почему он недоступен',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await _scrollToLesson(tester, 'Вокатив');
    await tester.tap(find.text('Вокатив'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Уровень пока закрыт'), findsOneWidget);
    // Урок при этом не открылся.
    expect(find.text('Что такое вокатив?'), findsNothing);
  });

  testWidgets('открывается урок и показывает первое задание', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    await _scrollToLesson(tester, 'Семь падежей');

    // Узел → попап уровня → «Начать урок».
    await tester.tap(find.text('Семь падежей'));
    await tester.pumpAndSettle();
    expect(find.text('Начать урок'), findsOneWidget);
    await tester.tap(find.text('Начать урок'));
    await tester.pumpAndSettle();

    expect(find.text('Сколько падежей в сербском языке?'), findsOneWidget);
    expect(find.text('семь'), findsOneWidget);

    // Проверка недоступна, пока нет ответа.
    final check = tester.widget<CourseButton>(
      find.widgetWithText(CourseButton, 'Проверить'),
    );
    expect(check.onPressed, isNull);
  });

  testWidgets('ответ проверяется и показывает обратную связь', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    await _scrollToLesson(tester, 'Семь падежей');
    await tester.tap(find.text('Семь падежей'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать урок'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('семь'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(CourseButton, 'Проверить'));
    await tester.pumpAndSettle();

    expect(find.text('Верно'), findsOneWidget);
    expect(find.text('В сербском семь падежей.'), findsOneWidget);
    expect(find.widgetWithText(CourseButton, 'Продолжить'), findsOneWidget);
  });

  testWidgets('ошибка объясняется и показывает правильный ответ',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    await _scrollToLesson(tester, 'Семь падежей');
    await tester.tap(find.text('Семь падежей'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать урок'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('шесть'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(CourseButton, 'Проверить'));
    await tester.pumpAndSettle();

    expect(find.text('Неверно'), findsOneWidget);
    expect(find.text('Ваш ответ'), findsOneWidget);
    expect(find.text('Правильно'), findsOneWidget);
  });

  // Регрессия: внутри Stack с маскотом колонка тропы сжималась по содержимому
  // и прижималась к левому краю, а отрицательные смещения волны уносили узлы
  // за границу экрана — подписи обрезались.
  for (final size in const [Size(1280, 900), Size(800, 900), Size(360, 800)]) {
    testWidgets('узлы тропы не уходят за края при ${size.width.toInt()}dp',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(_app());
      await tester.pumpAndSettle();
      await _scrollToLesson(tester, 'Семь падежей');

      final nodes = find.byType(PathNode);
      expect(nodes, findsWidgets);

      for (var i = 0; i < tester.widgetList(nodes).length; i++) {
        final rect = tester.getRect(nodes.at(i));
        expect(rect.left, greaterThanOrEqualTo(0.0),
            reason: 'узел #$i вылез за левый край при ${size.width}dp');
        expect(rect.right, lessThanOrEqualTo(size.width),
            reason: 'узел #$i вылез за правый край при ${size.width}dp');
      }

      // Тропа держится вокруг центра, а не липнет к краю.
      final first = tester.getRect(nodes.first);
      expect(first.center.dx, closeTo(size.width / 2, size.width * 0.12));
    });
  }

  testWidgets('карта строится в тёмной теме', (tester) async {
    await tester.pumpWidget(_app(theme: AppTheme.dark()));
    await tester.pumpAndSettle();
    await _scrollToLesson(tester, 'Семь падежей');
    expect(find.text('Семь падежей'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('карта строится на узком экране 360dp', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    await _scrollToLesson(tester, 'Семь падежей');

    expect(find.text('Семь падежей'), findsOneWidget);
    expect(tester.takeException(), isNull, reason: 'нет overflow на 360dp');
  });

  testWidgets('карта выдерживает увеличенный системный шрифт', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_wrap(
      CoursePathScreen(
        controller:
            CourseController(loader: _FakeLoader(), store: _MemoryStore()),
      ),
      textScale: 1.5,
    ));
    await tester.pumpAndSettle();
    await _scrollToLesson(tester, 'Семь падежей');

    expect(find.text('Семь падежей'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('справочник правил остаётся доступен из курса', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.menu_book_outlined), findsOneWidget);
  });
}
