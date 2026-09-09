import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/utils/streak_praise.dart';

void main() {
  test('между рубежами тихо', () {
    for (final n in [0, -1, 1, 2, 3, 4, 6, 9, 11, 19, 21, 25]) {
      expect(streakPraise(n), isNull, reason: 'streak=$n');
    }
  });

  test('рубежи 5/10/20 хвалят', () {
    expect(streakPraise(5), contains('Пять'));
    expect(streakPraise(10), contains('Десять'));
    expect(streakPraise(20), contains('Двадцать'));
  });

  test('дальше хвалит каждые 20', () {
    expect(streakPraise(40), contains('40'));
    expect(streakPraise(60), contains('60'));
    expect(streakPraise(30), isNull);
  });
}
