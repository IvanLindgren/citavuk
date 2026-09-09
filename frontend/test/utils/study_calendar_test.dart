import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/utils/study_calendar.dart';

void main() {
  test('месяц следует серверной дате и учитывает високосный год', () {
    final month = studyMonth('2024-02-28')!;
    expect(month.dayCount, 29);
    expect(month.padding, 3);
    expect(month.date(29), '2024-02-29');
    expect(studyMonth('2026-01-01', -1)!.date(1), '2025-12-01');
    expect(studyMonth('2026-02-31'), null);
  });
  test('старый кеш не заменяет новый снимок статистики', () {
    final initial = {'asOf': '2026-09-09T12:00:00Z', 'current': 5};
    final old = {'asOf': '2026-09-08T12:00:00Z', 'current': 4};
    expect(latestStudyData(initial, old), initial);
    expect(latestStudyData(null, old), old);
  });
}
