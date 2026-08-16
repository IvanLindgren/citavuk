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
    this.wateredAt,
  });

  final int slot;
  final String species;
  final double growth;
  final double speed;

  /// Когда цветок полили в последний раз. Пусто — не поливали ни разу.
  final DateTime? wateredAt;

  factory GardenPlant.fromJson(Map<String, dynamic> json) => GardenPlant(
        slot: (json['slot'] as num?)?.toInt() ?? 0,
        species: json['species'] as String? ?? '',
        growth: (json['growth'] as num?)?.toDouble() ?? 0,
        speed: (json['speed'] as num?)?.toDouble() ?? 1,
        wateredAt: DateTime.tryParse(json['wateredAt'] as String? ?? '')
            ?.toLocal(),
      );
}

/// Украшение двора или комнаты.
class GardenDecoration {
  const GardenDecoration({
    required this.id,
    required this.serbian,
    required this.russian,
    required this.price,
    required this.place,
  });

  final String id;
  final String serbian;
  final String russian;
  final int price;

  /// `garden` — во дворе, `house` — в комнате.
  final String place;

  bool get inHouse => place == 'house';

  factory GardenDecoration.fromJson(Map<String, dynamic> json) =>
      GardenDecoration(
        id: json['id'] as String? ?? '',
        serbian: json['serbian'] as String? ?? '',
        russian: json['russian'] as String? ?? '',
        price: (json['price'] as num?)?.toInt() ?? 0,
        place: json['place'] as String? ?? 'garden',
      );
}

/// Строка гербария: срезанный вид и сколько раз он попадался.
class GardenHerbariumItem {
  const GardenHerbariumItem({
    required this.species,
    required this.count,
    required this.firstAt,
  });

  final String species;
  final int count;
  final DateTime? firstAt;

  factory GardenHerbariumItem.fromJson(Map<String, dynamic> json) =>
      GardenHerbariumItem(
        species: json['species'] as String? ?? '',
        count: (json['count'] as num?)?.toInt() ?? 0,
        firstAt: DateTime.tryParse(json['firstAt'] as String? ?? '')?.toLocal(),
      );
}

/// Задание дня.
class GardenTask {
  const GardenTask({
    required this.kind,
    required this.target,
    required this.progress,
    required this.reward,
    required this.done,
  });

  final String kind;
  final int target;
  final int progress;
  final int reward;
  final bool done;

  factory GardenTask.fromJson(Map<String, dynamic> json) => GardenTask(
        kind: json['kind'] as String? ?? '',
        target: (json['target'] as num?)?.toInt() ?? 0,
        progress: (json['progress'] as num?)?.toInt() ?? 0,
        reward: (json['reward'] as num?)?.toInt() ?? 0,
        done: json['done'] as bool? ?? false,
      );
}

/// Что дал срез цветка. Приходит только в ответе на `/v1/garden/cut`.
class GardenCut {
  const GardenCut({
    required this.species,
    required this.coins,
    required this.first,
  });

  final String species;
  final int coins;

  /// Этот вид попал в гербарий впервые.
  final bool first;

  factory GardenCut.fromJson(Map<String, dynamic> json) => GardenCut(
        species: json['species'] as String? ?? '',
        coins: (json['coins'] as num?)?.toInt() ?? 0,
        first: json['first'] as bool? ?? false,
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
    required this.earnedTotal,
    required this.slots,
    required this.plants,
    required this.decorations,
    required this.bloomed,
    required this.earnings,
    required this.todayCoins,
    required this.speed,
    required this.helpedToday,
    required this.helpLimit,
    required this.catalog,
    required this.decorationCatalog,
    required this.water,
    required this.waterCap,
    required this.filledToday,
    required this.fillLimit,
    required this.river,
    required this.weather,
    required this.herbarium,
    required this.task,
    required this.cut,
    required this.fetchedAt,
  });

  final String nickname;
  final bool isPublic;
  final int coins;
  final int earnedTotal;
  final int slots;
  final List<GardenPlant> plants;

  /// Купленные украшения: идентификаторы из `decorationCatalog`.
  final List<String> decorations;
  final int bloomed;
  final List<GardenEarning> earnings;
  final int todayCoins;
  final double speed;
  final int helpedToday;
  final int helpLimit;
  final List<GardenSpecies> catalog;
  final List<GardenDecoration> decorationCatalog;

  /// Поливов в лейке и сколько раз сегодня уже набирали из реки.
  final int water;
  final int waterCap;
  final int filledToday;
  final int fillLimit;

  /// Река течёт в тот день, когда были занятия.
  final bool river;

  /// `clear` или `rain`. В дождь поливать не нужно.
  final String weather;
  final List<GardenHerbariumItem> herbarium;
  final GardenTask? task;

  /// Итог последнего среза: приходит только с `/v1/garden/cut`.
  final GardenCut? cut;

  /// Когда пришёл ответ: от него отсчитывается живой рост.
  final DateTime fetchedAt;

  bool get raining => weather == 'rain';

  /// Набрать воду можно, пока река течёт, лейка неполна и заходов хватает.
  bool get canFill => river && water < waterCap && filledToday < fillLimit;

  factory GardenState.fromJson(Map<String, dynamic> json) => GardenState(
        nickname: json['nickname'] as String? ?? '',
        isPublic: json['public'] as bool? ?? false,
        coins: (json['coins'] as num?)?.toInt() ?? 0,
        earnedTotal: (json['earnedTotal'] as num?)?.toInt() ?? 0,
        slots: (json['slots'] as num?)?.toInt() ?? 12,
        plants: ((json['plants'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => GardenPlant.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        decorations:
            ((json['decorations'] as List?) ?? const []).whereType<String>().toList(),
        bloomed: (json['bloomed'] as num?)?.toInt() ?? 0,
        earnings: ((json['earnings'] as List?) ?? const [])
            .whereType<Map>()
            .map(
                (item) => GardenEarning.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        todayCoins: (json['todayCoins'] as num?)?.toInt() ?? 0,
        speed: (json['speed'] as num?)?.toDouble() ?? 1,
        helpedToday: (json['helpedToday'] as num?)?.toInt() ?? 0,
        helpLimit: (json['helpLimit'] as num?)?.toInt() ?? 0,
        catalog: ((json['catalog'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => GardenSpecies.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        decorationCatalog: ((json['decorationCatalog'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) =>
                GardenDecoration.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        water: (json['water'] as num?)?.toInt() ?? 0,
        waterCap: (json['waterCap'] as num?)?.toInt() ?? 3,
        filledToday: (json['filledToday'] as num?)?.toInt() ?? 0,
        fillLimit: (json['fillLimit'] as num?)?.toInt() ?? 0,
        river: json['river'] as bool? ?? false,
        weather: json['weather'] as String? ?? 'clear',
        herbarium: ((json['herbarium'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) =>
                GardenHerbariumItem.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        task: json['task'] is Map
            ? GardenTask.fromJson(Map<String, dynamic>.from(json['task'] as Map))
            : null,
        cut: json['cut'] is Map
            ? GardenCut.fromJson(Map<String, dynamic>.from(json['cut'] as Map))
            : null,
        fetchedAt: DateTime.now(),
      );

  GardenSpecies? speciesOf(String id) {
    for (final species in catalog) {
      if (species.id == id) return species;
    }
    return null;
  }

  GardenPlant? plantAt(int slot) {
    for (final plant in plants) {
      if (plant.slot == slot) return plant;
    }
    return null;
  }

  bool owns(String decoration) => decorations.contains(decoration);
}

/// Строка таблицы садоводов и карточка соседа — это одно и то же.
class GardenerCard {
  const GardenerCard({
    required this.nickname,
    required this.bloomed,
    required this.plants,
    required this.species,
    required this.growing,
  });

  final String nickname;
  final int bloomed;
  final int plants;

  /// Сколько разных видов вырастил.
  final int species;
  final List<String> growing;

  factory GardenerCard.fromJson(Map<String, dynamic> json) => GardenerCard(
        nickname: json['nickname'] as String? ?? '',
        bloomed: (json['bloomed'] as num?)?.toInt() ?? 0,
        plants: (json['plants'] as num?)?.toInt() ?? 0,
        species: (json['species'] as num?)?.toInt() ?? 0,
        growing: ((json['growing'] as List?) ?? const [])
            .whereType<String>()
            .toList(),
      );
}

/// Чужой сад: видно то же поле, но действие одно — полить.
class PublicGarden {
  const PublicGarden({
    required this.nickname,
    required this.slots,
    required this.plants,
    required this.decorations,
    required this.bloomed,
    required this.canWater,
    required this.catalog,
    required this.fetchedAt,
  });

  final String nickname;
  final int slots;
  final List<GardenPlant> plants;
  final List<String> decorations;
  final int bloomed;
  final bool canWater;
  final List<GardenSpecies> catalog;
  final DateTime fetchedAt;

  factory PublicGarden.fromJson(Map<String, dynamic> json) {
    final garden = Map<String, dynamic>.from(json['garden'] as Map? ?? {});
    return PublicGarden(
      nickname: garden['nickname'] as String? ?? '',
      slots: (garden['slots'] as num?)?.toInt() ?? 12,
      plants: ((garden['plants'] as List?) ?? const [])
          .whereType<Map>()
          .map((item) => GardenPlant.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
      decorations:
          ((garden['decorations'] as List?) ?? const []).whereType<String>().toList(),
      bloomed: (garden['bloomed'] as num?)?.toInt() ?? 0,
      canWater: garden['canWater'] as bool? ?? false,
      catalog: ((json['catalog'] as List?) ?? const [])
          .whereType<Map>()
          .map((item) => GardenSpecies.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
      fetchedAt: DateTime.now(),
    );
  }

  GardenSpecies? speciesOf(String id) {
    for (final species in catalog) {
      if (species.id == id) return species;
    }
    return null;
  }

  GardenPlant? plantAt(int slot) {
    for (final plant in plants) {
      if (plant.slot == slot) return plant;
    }
    return null;
  }
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
