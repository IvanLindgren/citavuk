import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/screens/vukotok_screen.dart';
import 'package:srbski_read/theme/app_theme.dart';

/// Абзац карточки и его замер обязаны исходить из одних настроек: разойдись
/// шрифт или интервал — решение «влезло или нет» станет случайным, и кнопка
/// «Читать целиком» будет появляться не там, где текст правда обрезан.
void main() {
  for (final appDark in [false, true]) {
    testWidgets('Вукоток следует теме приложения dark=$appDark',
        (tester) async {
      final expected = appDark ? AppTheme.dark() : AppTheme.light();
      late ThemeData inner;
      await tester.pumpWidget(MaterialApp(
        theme: appDark ? AppTheme.dark() : AppTheme.light(),
        home: vukotokTheme(
          child: Builder(builder: (context) {
            inner = Theme.of(context);
            return const TextButton(onPressed: null, child: Text('Обсудить'));
          }),
        ),
      ));
      expect(inner.brightness, expected.brightness);
      expect(inner.colorScheme.primary, expected.colorScheme.primary);
      final material = tester.widgetList<Material>(find.byType(Material))
          .firstWhere((value) => value.color == expected.scaffoldBackgroundColor);
      expect(material.color, expected.scaffoldBackgroundColor);
      final foreground = inner.colorScheme.onSurface.computeLuminance();
      final background = expected.scaffoldBackgroundColor.computeLuminance();
      final ratio = foreground > background ? (foreground + .05) / (background + .05) : (background + .05) / (foreground + .05);
      expect(ratio, greaterThan(4.5));
    });
  }
  test('настройки абзаца карточки без красной строки и отбивки', () {
    final s = cardTextSettings(16.5);
    expect(s.fontSize, 16.5);
    expect(s.lineHeight, 1.4);
    expect(s.firstLineIndent, 0);
    expect(s.paragraphSpacing, 0);
  });

  testWidgets('светлая тема не заменяется принудительно тёмной',
      (tester) async {
    late ThemeData inner;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: vukotokTheme(
          child: Builder(builder: (context) {
            inner = Theme.of(context);
            return const SizedBox();
          }),
        ),
      ),
    );
    expect(inner.brightness, Brightness.light);
    expect(inner.colorScheme.surface, AppTheme.light().colorScheme.surface);
  });
}
