import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/utils/seasonal_greetings.dart';

void main() {
  test('обычный день молчит', () {
    expect(seasonalGreeting(DateTime(2026, 3, 14)), isNull);
    expect(seasonalGreeting(DateTime(2026, 10, 2)), isNull);
  });

  test('фиксированные праздники находятся', () {
    expect(seasonalGreeting(DateTime(2026, 1, 1))?.id, 'new-year');
    expect(seasonalGreeting(DateTime(2026, 1, 7))?.id, 'christmas');
    expect(seasonalGreeting(DateTime(2026, 2, 15))?.id, 'sretenje');
    expect(seasonalGreeting(DateTime(2026, 4, 23))?.id, 'book-day');
    expect(seasonalGreeting(DateTime(2026, 5, 6))?.id, 'djurdjevdan');
    expect(seasonalGreeting(DateTime(2026, 9, 1))?.id, 'knowledge-day');
  });

  test('праздник побеждает 1-е число', () {
    expect(seasonalGreeting(DateTime(2026, 1, 1))?.id, 'new-year');
    expect(seasonalGreeting(DateTime(2026, 9, 1))?.id, 'knowledge-day');
  });

  test('1-е число зовёт сербский месяц', () {
    final greeting = seasonalGreeting(DateTime(2026, 3, 1));
    expect(greeting?.id, 'month-start');
    expect(greeting?.title, contains('март'));
  });

  test('православная Пасхалия: 2024–2026', () {
    expect(orthodoxEaster(2024), DateTime(2024, 5, 5));
    expect(orthodoxEaster(2025), DateTime(2025, 4, 20));
    expect(orthodoxEaster(2026), DateTime(2026, 4, 12));
    expect(seasonalGreeting(DateTime(2026, 4, 12))?.id, 'easter');
    expect(seasonalGreeting(DateTime(2025, 4, 20))?.id, 'easter');
  });

  test('все позы приветствий существуют как константы', () {
    for (final month in List.generate(12, (i) => i + 1)) {
      final greeting = seasonalGreeting(DateTime(2026, month, 1));
      expect(greeting, isNotNull, reason: 'month=$month');
      expect(greeting!.asset, startsWith('assets/imgs/'));
    }
  });
}
