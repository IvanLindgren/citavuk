/// Башта Читавука: модели и счёт роста.
///
/// **Формула роста обязана совпадать с `web/src/garden/scene.ts` и
/// `server/internal/store/garden.go`.** Сервер отдаёт рост на момент ответа,
/// клиент досчитывает его сам, чтобы за цветком было видно, как он растёт.
/// Разойдись счёт — приложение и сайт показывали бы один сад по-разному.
library;

import 'dart:math';

const int gardenStages = 5;
const double gardenStageHours = 4;

class GardenSpecies {
  const GardenSpecies({
    required this.id,
    required this.serbian,
    required this.russian,
    required this.price,
    required this.topic,
    required this.theme,
    required this.phrase,
  });

  final String id;
  final String serbian;
  final String russian;
  final int price;
  final String topic;
  final String theme;
  final String phrase;

  factory GardenSpecies.fromJson(Map<String, dynamic> json) => GardenSpecies(
        id: json['id'] as String? ?? '',
        serbian: json['serbian'] as String? ?? '',
        russian: json['russian'] as String? ?? '',
        price: (json['price'] as num?)?.toInt() ?? 0,
        topic: json['topic'] as String? ?? '',
        theme: json['theme'] as String? ?? '',
        phrase: json['phrase'] as String? ?? '',
      );
}

class GardenPlant {
  const GardenPlant({
    required this.slot,
    required this.species,
    required this.growth,
    required this.speed,
  });

  final int slot;
  final String species;
  final double growth;
  final double speed;

  factory GardenPlant.fromJson(Map<String, dynamic> json) => GardenPlant(
        slot: (json['slot'] as num?)?.toInt() ?? 0,
        species: json['species'] as String? ?? '',
        growth: (json['growth'] as num?)?.toDouble() ?? 0,
        speed: (json['speed'] as num?)?.toDouble() ?? 1,
      );
}

class GardenEarning {
  const GardenEarning({
    required this.source,
    required this.title,
    required this.today,
    required this.cap,
  });

  final String source;
  final String title;
  final int today;
  final int cap;

  factory GardenEarning.fromJson(Map<String, dynamic> json) => GardenEarning(
        source: json['source'] as String? ?? '',
        title: json['title'] as String? ?? '',
        today: (json['today'] as num?)?.toInt() ?? 0,
        cap: (json['cap'] as num?)?.toInt() ?? 0,
      );
}

class GardenState {
  const GardenState({
    required this.nickname,
    required this.isPublic,
    required this.coins,
    required this.slots,
    required this.plants,
    required this.bloomed,
    required this.earnings,
    required this.speed,
    required this.catalog,
    required this.fetchedAt,
  });

  final String nickname;
  final bool isPublic;
  final int coins;
  final int slots;
  final List<GardenPlant> plants;
  final int bloomed;
  final List<GardenEarning> earnings;
  final double speed;
  final List<GardenSpecies> catalog;

  /// Когда пришёл ответ: от него отсчитывается живой рост.
  final DateTime fetchedAt;

  factory GardenState.fromJson(Map<String, dynamic> json) => GardenState(
        nickname: json['nickname'] as String? ?? '',
        isPublic: json['public'] as bool? ?? false,
        coins: (json['coins'] as num?)?.toInt() ?? 0,
        slots: (json['slots'] as num?)?.toInt() ?? 12,
        plants: ((json['plants'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => GardenPlant.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        bloomed: (json['bloomed'] as num?)?.toInt() ?? 0,
        earnings: ((json['earnings'] as List?) ?? const [])
            .whereType<Map>()
            .map(
                (item) => GardenEarning.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        speed: (json['speed'] as num?)?.toDouble() ?? 1,
        catalog: ((json['catalog'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => GardenSpecies.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        fetchedAt: DateTime.now(),
      );

  GardenSpecies? speciesOf(String id) {
    for (final species in catalog) {
      if (species.id == id) return species;
    }
    return null;
  }
}

class GardenerCard {
  const GardenerCard({
    required this.nickname,
    required this.bloomed,
    required this.plants,
    required this.growing,
  });

  final String nickname;
  final int bloomed;
  final int plants;
  final List<String> growing;

  factory GardenerCard.fromJson(Map<String, dynamic> json) => GardenerCard(
        nickname: json['nickname'] as String? ?? '',
        bloomed: (json['bloomed'] as num?)?.toInt() ?? 0,
        plants: (json['plants'] as num?)?.toInt() ?? 0,
        growing: ((json['growing'] as List?) ?? const [])
            .whereType<String>()
            .toList(),
      );
}

/// Рост цветка через [elapsed] после ответа сервера.
double projectedGrowth(GardenPlant plant, Duration elapsed) {
  final hours = elapsed.inMilliseconds <= 0
      ? 0.0
      : elapsed.inMilliseconds / Duration.millisecondsPerHour;
  final grown = plant.growth + hours / gardenStageHours * plant.speed;
  return grown.clamp(0, gardenStages.toDouble()).toDouble();
}

int stageOf(double growth) =>
    growth.floor().clamp(0, gardenStages - 1).toInt();

bool isBlooming(double growth) => growth >= gardenStages;

bool showsSeed(double growth) => growth < 0.5;

// Доля высоты грядки по целым стадиям; между ними считается плавно.
const List<double> _heights = [4, 18, 40, 66, 87, 100];

double growthHeight(double growth) {
  final clamped = growth.clamp(0, gardenStages.toDouble()).toDouble();
  final index = clamped.floor().clamp(0, _heights.length - 2).toInt();
  final lower = _heights[index];
  final upper = _heights[index + 1];
  return lower + (upper - lower) * (clamped - index);
}

/// Покачивание грядки: постоянное для номера, разное у соседей.
({double seconds, double tilt, double phase}) swayFor(int slot) {
  final noise = _fraction(slot);
  return (
    seconds: 3.2 + noise * 2.6,
    tilt: 1.1 + noise * 1.6,
    phase: noise,
  );
}

double _fraction(int slot) {
  // Тот же дешёвый шум, что на сайте: важно только постоянство для грядки.
  final noise = sin((slot + 1) * 12.9898) * 43758.5453;
  return noise - noise.floorToDouble();
}

/// Грядки рядами.
List<List<int>> bedRows(int slots, int perRow) {
  final width = perRow < 1 ? 1 : perRow;
  final rows = <List<int>>[];
  for (var slot = 0; slot < slots; slot++) {
    final row = slot ~/ width;
    while (rows.length <= row) {
      rows.add(<int>[]);
    }
    rows[row].add(slot);
  }
  return rows;
}
