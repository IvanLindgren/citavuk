import 'package:flutter_test/flutter_test.dart';

import 'package:srbski_read/models/garden.dart';

/// Счёт роста продублирован в трёх местах: Go, TypeScript и Dart. Эти проверки
/// повторяют `web/src/garden/scene.test.ts` — разойдись значения, приложение и
/// сайт показывали бы один сад по-разному.
void main() {
  const plant = GardenPlant(slot: 0, species: 'suncokret', growth: 1, speed: 1);

  test('рост досчитывается между ответами сервера', () {
    expect(projectedGrowth(plant, Duration.zero), 1);
    expect(
      projectedGrowth(plant, const Duration(hours: 4)),
      closeTo(2, 0.0001),
    );
    expect(
      projectedGrowth(
        const GardenPlant(slot: 0, species: 'x', growth: 1, speed: 2),
        const Duration(hours: 4),
      ),
      closeTo(3, 0.0001),
    );
  });

  test('рост не выходит за последнюю стадию и не отматывается назад', () {
    expect(
      projectedGrowth(
        const GardenPlant(slot: 0, species: 'x', growth: 4.9, speed: 2),
        const Duration(hours: 100),
      ),
      gardenStages,
    );
    // Часы устройства могут отставать от серверных.
    expect(
      projectedGrowth(
        const GardenPlant(slot: 0, species: 'x', growth: 2, speed: 1),
        const Duration(hours: -3),
      ),
      2,
    );
  });

  test('высота растёт непрерывно', () {
    var previous = -1.0;
    for (var growth = 0.0; growth <= gardenStages; growth += 0.25) {
      final height = growthHeight(growth);
      expect(height, greaterThan(previous));
      expect(height, lessThanOrEqualTo(100));
      previous = height;
    }
    expect(growthHeight(gardenStages.toDouble()), 100);
    expect(growthHeight(-5), growthHeight(0));
    expect(growthHeight(99), 100);
  });

  test('стадия, цветение и семя', () {
    expect(stageOf(0), 0);
    expect(stageOf(2.9), 2);
    expect(stageOf(gardenStages.toDouble()), gardenStages - 1);
    expect(isBlooming(4.99), isFalse);
    expect(isBlooming(gardenStages.toDouble()), isTrue);
    expect(showsSeed(0.2), isTrue);
    expect(showsSeed(0.9), isFalse);
  });

  test('покачивание постоянно для грядки и разное у соседей', () {
    expect(swayFor(3), swayFor(3));
    expect(swayFor(3) == swayFor(4), isFalse);
    for (var slot = 0; slot < 12; slot++) {
      final sway = swayFor(slot);
      expect(sway.seconds, greaterThan(3));
      expect(sway.seconds, lessThan(6));
      expect(sway.tilt, greaterThan(1));
      expect(sway.phase, inInclusiveRange(0, 1));
    }
  });

  test('грядки раскладываются рядами', () {
    expect(bedRows(6, 3), [
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(bedRows(5, 3), [
      [0, 1, 2],
      [3, 4],
    ]);
    expect(bedRows(3, 0), [
      [0],
      [1],
      [2],
    ]);
  });

  test('сад разбирается из ответа сервера', () {
    final state = GardenState.fromJson({
      'nickname': 'vuk',
      'public': true,
      'coins': 42,
      'slots': 12,
      'speed': 1.5,
      'bloomed': 1,
      'plants': [
        {'slot': 0, 'species': 'suncokret', 'growth': 2.5, 'speed': 1.5},
      ],
      'earnings': [
        {'source': 'reading', 'title': 'Чтение книг', 'today': 3, 'cap': 30},
      ],
      'catalog': [
        {
          'id': 'suncokret',
          'serbian': 'сунцокрет',
          'russian': 'подсолнух',
          'price': 20,
          'topic': 'grammar-a1-08',
          'theme': 'винительный падеж',
          'phrase': 'Волим сунцокрет.',
        },
      ],
    });

    expect(state.coins, 42);
    expect(state.isPublic, isTrue);
    expect(state.plants.single.growth, 2.5);
    expect(state.speciesOf('suncokret')?.serbian, 'сунцокрет');
    expect(state.speciesOf('нет-такого'), isNull);
  });

  test('пустой ответ не роняет разбор', () {
    final state = GardenState.fromJson({});
    expect(state.coins, 0);
    expect(state.slots, 12);
    expect(state.plants, isEmpty);
    expect(state.catalog, isEmpty);
  });
}
