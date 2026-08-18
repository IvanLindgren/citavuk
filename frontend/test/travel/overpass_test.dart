import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/travel/content.dart';
import 'package:srbski_read/travel/overpass.dart';

/// Подписи заведений на карте приложения. На сайте их считает векторный тайл,
/// здесь — эти функции, и справочник у них общий.
PlaceKind _kind(
  String id, {
  String group = 'place',
  int rank = 1,
  List<String> osm = const [],
}) =>
    PlaceKind(
      id: id,
      group: group,
      sr: id,
      ru: id,
      icon: id,
      rank: rank,
      osm: osm,
      omt: const [],
    );

Map<String, dynamic> _node(double lat, double lon, Map<String, String> tags) =>
    {'type': 'node', 'lat': lat, 'lon': lon, 'tags': tags};

void main() {
  final kinds = [
    _kind('bakery', osm: ['shop=bakery']),
    _kind('pharmacy', osm: ['healthcare=pharmacy', 'amenity=pharmacy']),
    _kind('locksmith', rank: 3, osm: ['shop=locksmith']),
    _kind('train_station',
        osm: ['railway=station', 'building=train_station']),
    _kind('street', group: 'road', osm: ['highway=residential']),
  ];

  group('ключи поиска', () {
    test('собираются из справочника без повторов', () {
      expect(placeKeys(kinds), ['amenity', 'healthcare', 'railway', 'shop']);
    });

    // Под building попадает каждый дом квартала, а нужен он одному правилу.
    test('building не спрашивается', () {
      expect(placeKeys(kinds), isNot(contains('building')));
    });

    // Улицы и мосты ищутся нажатием: подписывать каждую линию нечем.
    test('дорожные типы не спрашиваются', () {
      expect(placeKeys(kinds), isNot(contains('highway')));
    });
  });

  group('места в границах экрана', () {
    test('узнаются по тегам, имя берётся сербское', () {
      final found = pickPlaces([
        _node(44.8, 20.45, {'shop': 'bakery', 'name': 'Trpkovic', 'name:sr': 'Трпковић'}),
      ], kinds);

      expect(found, hasLength(1));
      expect(found.first.kind, 'bakery');
      expect(found.first.name, 'Трпковић');
    });

    test('незнакомое пропускается: подписать его нечем', () {
      final found = pickPlaces([
        _node(44.8, 20.45, {'office': 'lawyer', 'name': 'Адвокат'}),
        _node(44.8, 20.46, {'shop': 'bakery'}),
      ], kinds);

      expect(found.map((place) => place.kind), ['bakery']);
    });

    // Одно заведение приезжает и точкой, и контуром здания.
    test('совпадающие по типу и точке считаются одним', () {
      final found = pickPlaces([
        _node(44.81234, 20.45678, {'shop': 'bakery'}),
        {
          'type': 'way',
          'center': {'lat': 44.81234, 'lon': 20.45678},
          'tags': {'shop': 'bakery'},
        },
      ], kinds);

      expect(found, hasLength(1));
    });

    test('соседняя пекарня остаётся отдельной', () {
      final found = pickPlaces([
        _node(44.81234, 20.45678, {'shop': 'bakery'}),
        _node(44.81501, 20.45678, {'shop': 'bakery'}),
      ], kinds);

      expect(found, hasLength(2));
    });

    test('важные типы идут первыми — их и покажут, если места мало', () {
      final found = pickPlaces([
        _node(44.80, 20.45, {'shop': 'locksmith'}),
        _node(44.81, 20.46, {'shop': 'bakery'}),
      ], kinds);

      expect(found.map((place) => place.kind), ['bakery', 'locksmith']);
    });

    test('больше сотни подписей на экран не выпускается', () {
      final elements = [
        for (var i = 0; i < maxPlaces + 40; i++)
          _node(44.8 + i / 1000, 20.45, {'shop': 'bakery'}),
      ];

      expect(pickPlaces(elements, kinds), hasLength(maxPlaces));
    });

    test('объект без координат пропускается', () {
      final found = pickPlaces([
        {'type': 'way', 'tags': {'shop': 'bakery'}},
        'мусор',
      ], kinds);

      expect(found, isEmpty);
    });
  });
}
