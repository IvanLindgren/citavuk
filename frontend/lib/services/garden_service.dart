import '../models/garden.dart';
import 'api_client.dart';

/// Башта: все действия идут на сервер, он же считает деньги и воду.
///
/// Каждое действие возвращает полное состояние сада — так клиент не гадает,
/// что изменилось, и не расходится с сервером после отказа.
class GardenService {
  GardenService(this.api);

  final ApiClient api;

  Future<GardenState> load() async {
    final raw = await api.get('/v1/garden');
    return GardenState.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  Future<GardenState> plant(int slot, String species) async {
    final raw = await api.post('/v1/garden/plant', {
      'slot': slot,
      'species': species,
    });
    return GardenState.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  Future<GardenState> water(int slot) async {
    final raw = await api.post('/v1/garden/water', {'slot': slot});
    return GardenState.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  /// Набрать воду из реки. Река течёт в тот день, когда были занятия.
  Future<GardenState> fill() async {
    final raw = await api.post('/v1/garden/fill', null);
    return GardenState.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  /// Срезать распустившийся цветок: грядка освобождается, вид идёт в гербарий.
  Future<GardenState> cut(int slot) async {
    final raw = await api.post('/v1/garden/cut', {'slot': slot});
    return GardenState.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  Future<GardenState> buyDecoration(String decoration) async {
    final raw = await api.post('/v1/garden/decorations/buy', {
      'decoration': decoration,
    });
    return GardenState.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  Future<GardenState> saveProfile(String nickname, bool isPublic) async {
    final raw = await api.put('/v1/garden/profile', {
      'nickname': nickname,
      'public': isPublic,
    });
    return GardenState.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  Future<List<GardenerCard>> leaderboard() async {
    final raw = await api.get('/v1/garden/leaderboard');
    return _cards((raw as Map?)?['board']);
  }

  Future<List<GardenerCard>> search({String query = '', String species = ''}) async {
    final raw = await api.get('/v1/garden/search', query: {
      if (query.isNotEmpty) 'q': query,
      if (species.isNotEmpty) 'species': species,
    });
    return _cards((raw as Map?)?['gardeners']);
  }

  Future<PublicGarden> openGarden(String nickname) async {
    final raw = await api.get('/v1/garden/${Uri.encodeComponent(nickname)}');
    return PublicGarden.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  Future<int> help(String nickname) async {
    final raw = await api.post(
      '/v1/garden/${Uri.encodeComponent(nickname)}/water',
      null,
    );
    return ((raw as Map?)?['reward'] as num?)?.toInt() ?? 0;
  }

  List<GardenerCard> _cards(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((item) => GardenerCard.fromJson(Map<String, dynamic>.from(item)))
      .toList();
}
