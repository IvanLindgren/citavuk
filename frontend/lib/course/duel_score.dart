/// Боевая математика игры «Ты против переводчика».
///
/// Копия правил из web/src/lib/duelScore.ts. Копия, а не общий код: у сайта и
/// приложения нет общего слоя логики, а расходиться правилам нельзя — бой на
/// телефоне и в браузере обязан считать одинаково.
///
/// Главное разделение. Полоски здоровья — это счёт и ничего кроме: выигранная
/// фраза снимает с соперника фиксированные двадцать, проигранная столько же с
/// вас, ничья задевает обоих поровну. Пять фраз по двадцать — ровно сто, то
/// есть чистая победа кладёт соперника, а любой другой расклад повторяет счёт
/// один в один.
///
/// Разгон от быстрого набора идёт в отдельную величину — «стиль». Он решает
/// ранг и признак критического удара, но до полосок не дотягивается. Иначе
/// зрелище начинает спорить с итогом: при быстром наборе две выигранные фразы
/// из пяти отдавали бы раунд человеку, который его проиграл.
library;

import 'dart:math' as math;

/// Здоровье на раунд. Раунд — пять предложений, потом полоски полны снова.
const int roundHp = 100;

/// Сколько секунд даётся на одно предложение.
const int sentenceSeconds = 40;

/// Что остаётся от разгона, когда время вышло.
const double clockDrain = 0.35;

/// Урон за фразу. Пять таких — ровно [roundHp], то есть чистый разгром.
const int winDamage = 20;

/// Ничья: качнулись оба и поровну.
const int tieDamage = 8;

/// Сила, начиная с которой удар считается критическим.
const double critPower = 82;

const double _powerFloor = 0.6;
const double _powerCeiling = 1.5;

enum DuelSide { hero, foe }

enum DuelWinner { user, translator, tie }

class Blow {
  /// Урон переводчику.
  final int toFoe;

  /// Урон вам.
  final int toHero;

  /// Очки стиля: разгон уходит сюда, а не в полоски.
  final int style;
  final bool crit;

  const Blow({
    required this.toFoe,
    required this.toHero,
    required this.style,
    required this.crit,
  });
}

/// Множитель разгона.
///
/// Пол не нулевой намеренно: перевод, обдуманный медленно, — всё равно
/// выигранный перевод, и оставлять его совсем без счёта значило бы наказывать
/// за раздумье в игре, которая учит языку.
double powerFactor(double power) {
  if (power.isNaN) return _powerFloor;
  final share = math.min(1.0, math.max(0.0, power / 100));
  return _powerFloor + (_powerCeiling - _powerFloor) * share;
}

/// Удар по итогам одного предложения.
Blow blowFor(DuelWinner winner, double power) => switch (winner) {
      DuelWinner.user => Blow(
          toFoe: winDamage,
          toHero: 0,
          style: (winDamage * powerFactor(power)).round(),
          crit: power >= critPower,
        ),
      DuelWinner.translator =>
        const Blow(toFoe: 0, toHero: winDamage, style: 0, crit: false),
      DuelWinner.tie => Blow(
          toFoe: tieDamage,
          toHero: tieDamage,
          style: (tieDamage * powerFactor(power)).round(),
          crit: false,
        ),
    };

/// Кто взял раунд по остатку здоровья.
DuelWinner roundOutcome(int heroHp, int foeHp) {
  if (heroHp == foeHp) return DuelWinner.tie;
  return heroHp > foeHp ? DuelWinner.user : DuelWinner.translator;
}

/// Ранг за раунд — по очкам стиля. Счёт он не заменяет.
String rankOf(int style) {
  if (style >= 130) return 'S';
  if (style >= 100) return 'A';
  if (style >= 60) return 'B';
  return 'C';
}

/// Ступень серии, 0..7 — под восемь файлов клика.
///
/// Логарифм, а не деление: первые удары серии слышны как рост, дальше разгон
/// замедляется, иначе к сотому символу звук упирается в потолок.
int comboStep(int streak) {
  if (streak <= 1) return 0;
  return math.min(7, (math.log(streak) / math.ln2).floor());
}

/// Отметки серии, на которых стоит крикнуть.
bool isComboMilestone(int streak) => streak > 0 && streak % 8 == 0;
