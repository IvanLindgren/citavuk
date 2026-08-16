/// Что находится в точке, куда ткнули на карте.
///
/// Спрашивается Overpass — поисковый API поверх данных OpenStreetMap. Своего
/// прокси с кешем пока нет, и до него это единственный способ узнать про место.
///
/// Зеркал два: overpass-api.de регулярно отвечает 429 в часы пик, и молчание
/// карты в ответ на нажатие выглядит как поломка приложения.
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
