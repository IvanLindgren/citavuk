import 'api_client.dart';

class SupporterService {
  static List<String> _names = const [];
  static DateTime? _loaded;
  static Future<List<String>>? _pending;
  static Future<List<String>> names(ApiClient api) async {
    if (_loaded != null && DateTime.now().difference(_loaded!) < const Duration(minutes: 5)) return _names;
    return _pending ??= _fetch(api).whenComplete(() => _pending = null);
  }
  static Future<List<String>> _fetch(ApiClient api) async {
    try {
      final data = await api.get('/v1/supporters');
      _names = ((data['supporters'] as List?) ?? const []).whereType<Map>().map((p) => (p['name'] ?? '').toString()).where((n) => n.isNotEmpty).toList();
      _loaded = DateTime.now();
      return _names;
    } catch (_) { return const []; }
  }
}
