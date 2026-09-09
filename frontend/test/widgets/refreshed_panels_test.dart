import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/theme/app_theme.dart';
import 'package:srbski_read/widgets/study_calendar_panel.dart';
import 'package:srbski_read/widgets/personal_lesson_design.dart';
import 'package:srbski_read/services/study_service.dart';

void main() {
  for (final width in [360.0, 1000.0]) {
    for (final scale in [1.0, 1.5]) {
      testWidgets('новые панели помещаются на $width при шрифте $scale',
          (tester) async {
        tester.view.physicalSize = Size(width, 1100);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        StudyService.instance.snapshot = null;
        await tester.pumpWidget(MaterialApp(
            theme: AppTheme.light(),
            home: MediaQuery(
                data: MediaQueryData(textScaler: TextScaler.linear(scale)),
                child: Scaffold(
                    body: SingleChildScrollView(
                        child: Column(children: [
                  const StudyCalendarPanel(data: {
                    'asOf': '2026-09-09T12:00:00Z',
                    'today': '2026-09-09',
                    'timezone': 'Europe/Belgrade',
                    'current': 12,
                    'longest': 18,
                    'activeDays': 30,
                    'freezes': 2,
                    'days': [
                      {'date': '2026-09-02', 'kind': 'active'},
                      {'date': '2026-09-03', 'kind': 'frozen'}
                    ]
                  }),
                  const PersonalLessonHero(
                      day: 1,
                      kind: 'Грамматика',
                      title: 'Падежи: именительный и родительный',
                      theme:
                          'Как назвать предмет и рассказать, кому он принадлежит'),
                  const LessonRuleNote(
                      index: 1,
                      text:
                          'Именительный падеж отвечает на вопросы ко? и шта?'),
                ]))))));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Сентябрь 2026'), findsOneWidget);
        await tester.tap(find.byTooltip('Предыдущий месяц'));
        await tester.pumpAndSettle();
        expect(find.text('Август 2026'), findsOneWidget);
        expect(tester.binding.hasScheduledFrame, isFalse,
            reason: 'Нет бесконечных фоновых анимаций');
      });
    }
  }
}
