import '../models/garden.dart';
import 'api_client.dart';

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

  Future<GardenState> saveProfile(String nickname, bool isPublic) async {
    final raw = await api.put('/v1/garden/profile', {
      'nickname': nickname,
      'public': isPublic,
    });
    return GardenState.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  Future<List<GardenerCard>> search({String query = '', String species = ''}) async {
    final raw = await api.get('/v1/garden/search', query: {
      if (query.isNotEmpty) 'q': query,
      if (species.isNotEmpty) 'species': species,
    });
    return ((raw as Map?)?['gardeners'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => GardenerCard.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<int> help(String nickname) async {
    final raw = await api.post('/v1/garden/$nickname/water', null);
    return ((raw as Map?)?['reward'] as num?)?.toInt() ?? 0;
  }
}
