import 'package:srbski_read/course/duel_score.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('удар за предложение', () {
    test('выигранное предложение бьёт по машине и не задевает вас', () {
      final blow = blowFor(DuelWinner.user, 60);
      expect(blow.toFoe, winDamage);
      expect(blow.toHero, 0);
    });

    test('проигранное бьёт по вам и не задевает машину', () {
      final blow = blowFor(DuelWinner.translator, 100);
      expect(blow.toHero, winDamage);
      expect(blow.toFoe, 0);
    });

    test('ничья задевает обоих поровну', () {
      final blow = blowFor(DuelWinner.tie, 50);
      expect(blow.toFoe, blow.toHero);
      expect(blow.toFoe, greaterThan(0));
    });

    // Самое важное свойство всей математики: разгон не имеет доступа к
    // полоскам. Пока он их двигал, быстрый набор отдавал раунд человеку,
    // проигравшему по счёту три предложения из пяти.
    test('разгон не двигает полоски здоровья', () {
      for (final winner in DuelWinner.values) {
        final slow = blowFor(winner, 0);
        final fast = blowFor(winner, 100);
        expect(fast.toFoe, slow.toFoe);
        expect(fast.toHero, slow.toHero);
      }
    });

    test('разгон поднимает очки стиля', () {
      expect(blowFor(DuelWinner.user, 100).style,
          greaterThan(blowFor(DuelWinner.user, 0).style));
    });

    test('даже без разгона выигранное предложение даёт стиль', () {
      expect(blowFor(DuelWinner.user, 0).style, greaterThan(0));
    });

    test('проигранное предложение стиля не даёт', () {
      expect(blowFor(DuelWinner.translator, 100).style, 0);
    });

    test('критом считается только удар с полным разгоном', () {
      expect(blowFor(DuelWinner.user, critPower - 1).crit, isFalse);
      expect(blowFor(DuelWinner.user, critPower).crit, isTrue);
    });

    test('множитель разгона зажат между полом и потолком', () {
      expect(powerFactor(-50), powerFactor(0));
      expect(powerFactor(500), powerFactor(100));
      expect(powerFactor(double.nan), powerFactor(0));
    });
  });

  // Полоски — это счёт. Ниже перебираются все расклады раунда из пяти фраз и
  // проверяется, что итог по полоскам совпадает с итогом по числу побед: те же
  // 243 сочетания, что и в веб-тесте (web/src/lib/duelScore.test.ts).
  group('итог раунда повторяет счёт', () {
    DuelWinner play(List<DuelWinner> winners, double power) {
      var hero = roundHp;
      var foe = roundHp;
      for (final winner in winners) {
        final blow = blowFor(winner, power);
        hero = (hero - blow.toHero).clamp(0, roundHp);
        foe = (foe - blow.toFoe).clamp(0, roundHp);
      }
      return roundOutcome(hero, foe);
    }

    DuelWinner byCount(List<DuelWinner> winners) {
      final wins = winners.where((item) => item == DuelWinner.user).length;
      final losses =
          winners.where((item) => item == DuelWinner.translator).length;
      if (wins == losses) return DuelWinner.tie;
      return wins > losses ? DuelWinner.user : DuelWinner.translator;
    }

    test('во всех 243 раскладах и при любом разгоне', () {
      final every = <List<DuelWinner>>[];
      void build(List<DuelWinner> prefix) {
        if (prefix.length == 5) {
          every.add(prefix);
          return;
        }
        for (final winner in DuelWinner.values) {
          build([...prefix, winner]);
        }
      }

      build([]);
      expect(every.length, 243);

      for (final winners in every) {
        for (final power in [0.0, 50.0, 100.0]) {
          expect(play(winners, power), byCount(winners),
              reason: '${winners.join(',')} при разгоне $power');
        }
      }
    });

    test('чистая победа кладёт машину в ноль', () {
      var foe = roundHp;
      for (var i = 0; i < 5; i++) {
        foe -= blowFor(DuelWinner.user, 0).toFoe;
      }
      expect(foe, 0);
    });
  });

  group('серия', () {
    test('ступень растёт с серией и упирается в число файлов клика', () {
      expect(comboStep(0), 0);
      expect(comboStep(1), 0);
      expect(comboStep(4), 2);
      expect(comboStep(64), 6);
      expect(comboStep(100000), 7);
    });

    test('кричит каждые восемь символов', () {
      expect(isComboMilestone(8), isTrue);
      expect(isComboMilestone(16), isTrue);
      expect(isComboMilestone(9), isFalse);
      expect(isComboMilestone(0), isFalse);
    });
  });

  group('ранг', () {
    test('раздаётся по очкам стиля', () {
      expect(rankOf(140), 'S');
      expect(rankOf(110), 'A');
      expect(rankOf(70), 'B');
      expect(rankOf(20), 'C');
    });

    test('пять выигранных фраз без пауз дают высший ранг, с раздумьями — нет', () {
      expect(rankOf(5 * blowFor(DuelWinner.user, 100).style), 'S');
      expect(rankOf(5 * blowFor(DuelWinner.user, 0).style), 'B');
    });
  });
}
