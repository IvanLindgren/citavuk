/// Что находится в точке, куда ткнули на карте, и что вокруг.
///
/// Спрашивается Overpass — поисковый API поверх данных OpenStreetMap. Своего
/// прокси с кешем пока нет, и до него это единственный способ узнать про место.
///
/// Зеркал два: overpass-api.de регулярно отвечает 429 в часы пик, и молчание
/// карты в ответ на нажатие выглядит как поломка приложения.
///
/// На сайте знакомые места узнаются прямо в векторном тайле и подписываются
/// без единого запроса. Во Flutter карта растровая — в картинке тегов нет, —
/// поэтому подписи собираются здесь: тем же справочником и теми же правилами,
/// чтобы аптека называлась «апотека» одинаково в браузере и в приложении.
library;

import 'dart:convert';
import 'dart:math' as math;

import 'package:http/http.dart' as http;

import 'content.dart';

const List<String> _mirrors = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/// Радиус поиска вокруг нажатия. Больше — и в ответ попадает соседний квартал.
const int _radiusM = 40;

const Duration _timeout = Duration(seconds: 12);

/// Сколько мест берётся из ответа. Больше — и карта превращается в стену
/// подписей, на которой не разобрать ничего.
const int maxPlaces = 90;

class FoundPlace {
  const FoundPlace({
    required this.kind,
    required this.name,
    required this.lat,
    required this.lon,
    required this.tags,
  });

  /// Тип из справочника или пусто, если такого Читавук пока не знает.
  final String kind;
  final String name;
  final double lat;
  final double lon;
  final Map<String, String> tags;
}

/// Имя места: сербское важнее международного.
String placeName(Map<String, String> tags) =>
    tags['name:sr'] ?? tags['name'] ?? tags['name:en'] ?? '';

/// Расстояние в метрах, плоское приближение: на сорока метрах кривизна не
/// видна.
double _distance(double lat1, double lon1, double lat2, double lon2) {
  final scale = math.cos(lat1 * math.pi / 180);
  final dx = (lon2 - lon1) * scale * 111320;
  final dy = (lat2 - lat1) * 110540;
  return math.sqrt(dx * dx + dy * dy);
}

/// Лучшее место среди найденного.
///
/// Знакомый тип важнее всего, но названное заведение неизвестного типа тоже
/// годится: молчание в ответ на нажатие выглядит как поломка, а слова, нужные
/// в любом месте, пригодятся и в адвокатской конторе.
FoundPlace? pickPlace(
  List<dynamic> elements,
  double lat,
  double lon,
  List<PlaceKind> kinds,
) {
  FoundPlace? best;
  var bestScore = -1e9;

  for (final raw in elements) {
    if (raw is! Map) continue;
    final element = Map<String, dynamic>.from(raw);
    final tagsRaw = element['tags'];
    if (tagsRaw is! Map) continue;
    final tags = {
      for (final entry in tagsRaw.entries) '${entry.key}': '${entry.value}',
    };

    double? itemLat;
    double? itemLon;
    if (element['lat'] is num && element['lon'] is num) {
      itemLat = (element['lat'] as num).toDouble();
      itemLon = (element['lon'] as num).toDouble();
    } else if (element['center'] is Map) {
      final centre = Map<String, dynamic>.from(element['center'] as Map);
      itemLat = (centre['lat'] as num?)?.toDouble();
      itemLon = (centre['lon'] as num?)?.toDouble();
    }
    if (itemLat == null || itemLon == null) continue;

    final kind = matchKind(tags, kinds) ?? '';
    final name = placeName(tags);
    if (kind.isEmpty && name.isEmpty) continue;

    // Знакомый тип весит больше названия, а близкое — больше далёкого.
    final score = (kind.isEmpty ? 0 : 1000) +
        (name.isEmpty ? 0 : 100) -
        _distance(lat, lon, itemLat, itemLon);
    if (score <= bestScore) continue;
    bestScore = score;
    best = FoundPlace(
      kind: kind,
      name: name,
      lat: itemLat,
      lon: itemLon,
      tags: tags,
    );
  }
  return best;
}

/// Спросить, что в этой точке. Пусто — значит там ничего названного нет.
Future<FoundPlace?> askOverpass(
  double lat,
  double lon,
  List<PlaceKind> kinds, {
  http.Client? client,
}) async {
  final own = client == null;
  final http.Client web = client ?? http.Client();
  final query = '[out:json][timeout:10];'
      'nwr(around:$_radiusM,${lat.toStringAsFixed(6)},${lon.toStringAsFixed(6)});'
      'out tags center 40;';

  try {
    for (final mirror in _mirrors) {
      try {
        final response = await web
            .post(Uri.parse(mirror), body: {'data': query}).timeout(_timeout);
        if (response.statusCode != 200) continue;
        final parsed = jsonDecode(response.body);
        if (parsed is! Map) continue;
        final elements = (parsed['elements'] as List?) ?? const [];
        return pickPlace(elements, lat, lon, kinds);
      } catch (_) {
        // Зеркало молчит — пробуем следующее.
      }
    }
    throw const TravelUnavailable();
  } finally {
    if (own) web.close();
  }
}

/// Оба зеркала не ответили. Отдельный тип, чтобы экран сказал «попробуй через
/// минуту», а не «ничего не нашлось».
class TravelUnavailable implements Exception {
  const TravelUnavailable();

  @override
  String toString() => 'Overpass недоступен';
}

/// Ключи OSM, с которых начинаются правила знакомых заведений.
///
/// Спрашивать в границах экрана всё подряд нельзя: в центре Белграда это
/// тысячи объектов, из которых знакомых — сотня. Ключи собираются из самого
/// справочника, поэтому новый тип места ищется без правки этого файла.
///
/// `building` выброшен намеренно: под него попадает каждый дом квартала, а
/// нужен он ровно одному правилу — `building=train_station`. Станцию всё равно
/// найдут `railway=station` и `railway=halt`.
List<String> placeKeys(List<PlaceKind> kinds) {
  final keys = <String>{};
  for (final kind in kinds) {
    if (kind.group != 'place') continue;
    for (final rule in kind.osm) {
      final key = rule.split(';').first.split('=').first.trim();
      if (key.isEmpty || key == 'building') continue;
      keys.add(key);
    }
  }
  return keys.toList()..sort();
}

/// Знакомые места из ответа: по одному на точку, важные — первыми.
///
/// Одно и то же заведение приезжает и точкой, и контуром здания, а у большого
/// магазина ещё и вторым входом. Совпадающие по типу в пределах десятка метров
/// считаются одним: две подписи «пекара» друг на друге читаются как ошибка.
List<FoundPlace> pickPlaces(List<dynamic> elements, List<PlaceKind> kinds) {
  final ranks = {for (final kind in kinds) kind.id: kind.rank};
  final seen = <String>{};
  final found = <FoundPlace>[];

  for (final raw in elements) {
    if (raw is! Map) continue;
    final element = Map<String, dynamic>.from(raw);
    final tagsRaw = element['tags'];
    if (tagsRaw is! Map) continue;
    final tags = {
      for (final entry in tagsRaw.entries) '${entry.key}': '${entry.value}',
    };

    double? lat;
    double? lon;
    if (element['lat'] is num && element['lon'] is num) {
      lat = (element['lat'] as num).toDouble();
      lon = (element['lon'] as num).toDouble();
    } else if (element['center'] is Map) {
      final centre = Map<String, dynamic>.from(element['center'] as Map);
      lat = (centre['lat'] as num?)?.toDouble();
      lon = (centre['lon'] as num?)?.toDouble();
    }
    if (lat == null || lon == null) continue;

    // Незнакомый тип на карте подписать нечем: у него нет сербского слова.
    // По нажатию он по-прежнему откроется — это делает askOverpass.
    final kind = matchKind(tags, kinds);
    if (kind == null || kind.isEmpty) continue;

    final key = '$kind|${lat.toStringAsFixed(4)}|${lon.toStringAsFixed(4)}';
    if (!seen.add(key)) continue;

    found.add(FoundPlace(
      kind: kind,
      name: placeName(tags),
      lat: lat,
      lon: lon,
      tags: tags,
    ));
  }

  found.sort((a, b) => (ranks[a.kind] ?? 3).compareTo(ranks[b.kind] ?? 3));
  return found.length > maxPlaces ? found.sublist(0, maxPlaces) : found;
}

/// Знакомые места в показанном куске города.
///
/// Пустой список — законный ответ: в спальном квартале заведений и правда нет.
Future<List<FoundPlace>> findPlaces(
  double south,
  double west,
  double north,
  double east,
  List<PlaceKind> kinds, {
  http.Client? client,
}) async {
  final keys = placeKeys(kinds);
  if (keys.isEmpty) return const [];

  final own = client == null;
  final http.Client web = client ?? http.Client();
  final box = '${south.toStringAsFixed(5)},${west.toStringAsFixed(5)},'
      '${north.toStringAsFixed(5)},${east.toStringAsFixed(5)}';
  // `out ... 400` — предохранитель на стороне сервера: в центре города ответ
  // без него уходит в мегабайты, а на телефоне это заметная пауза.
  final query = '[out:json][timeout:20];('
      '${keys.map((key) => 'nwr["$key"]($box);').join()}'
      ');out tags center 400;';

  try {
    for (final mirror in _mirrors) {
      try {
        final response = await web
            .post(Uri.parse(mirror), body: {'data': query}).timeout(_timeout);
        if (response.statusCode != 200) continue;
        final parsed = jsonDecode(response.body);
        if (parsed is! Map) continue;
        final elements = (parsed['elements'] as List?) ?? const [];
        return pickPlaces(elements, kinds);
      } catch (_) {
        // Зеркало молчит — пробуем следующее.
      }
    }
    throw const TravelUnavailable();
  } finally {
    if (own) web.close();
  }
}
