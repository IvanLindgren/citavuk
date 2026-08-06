import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/micro_feed.dart';
import 'analysis_repository.dart';

/// Клиент Вукотока — ленты коротких сербских текстов.
///
/// Идентификатор гостя выдаёт СЕРВЕР и подписывает своим ключом: приложение
/// только хранит выданный токен. Самодельный идентификатор не принимается —
/// пока его придумывал клиент, лайки накручивались сменой строки в запросе.
class MicroFeedService {
  MicroFeedService._();
  static final MicroFeedService instance = MicroFeedService._();

  static const _tokenKey = 'citavuk-micro-feed-visitor-token';

  String get _base => AnalysisRepository.translationUrl;
  String _token = '';
  bool _tokenLoaded = false;

  Future<String> _visitorToken() async {
    if (_tokenLoaded) return _token;
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey) ?? '';
    _tokenLoaded = true;
    return _token;
  }

  Future<void> _rememberToken(String? token) async {
    if (token == null || token.isEmpty || token == _token) return;
    _token = token;
    _tokenLoaded = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  /// Порция ленты. [exclude] — уже показанные карточки: без них сервер выдал бы
  /// те же самые.
  Future<MicroFeedPage> load({List<String> exclude = const []}) async {
    final token = await _visitorToken();
    final query = <String, String>{'limit': '8'};
    if (token.isNotEmpty) query['visitorToken'] = token;
    if (exclude.isNotEmpty) {
      query['exclude'] = exclude.length > 80
          ? exclude.sublist(exclude.length - 80).join(',')
          : exclude.join(',');
    }

    final uri = Uri.parse('$_base/v1/micro-feed').replace(queryParameters: query);
    final resp = await http.get(uri).timeout(const Duration(seconds: 30));
    if (resp.statusCode != 200) {
      throw Exception('Лента недоступна (${resp.statusCode})');
    }
    final data = jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
    await _rememberToken(data['visitorToken'] as String?);
    return MicroFeedPage.fromJson(data, imageBase: _base);
  }

  /// Карточки, отмеченные лайком: лайк работает ещё и закладкой.
  Future<List<MicroFeedItem>> liked() async {
    final token = await _visitorToken();
    if (token.isEmpty) return const [];
    final uri = Uri.parse('$_base/v1/micro-feed/liked')
        .replace(queryParameters: {'visitorToken': token});
    final resp = await http.get(uri).timeout(const Duration(seconds: 25));
    if (resp.statusCode != 200) return const [];
    final data = jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
    return [
      for (final raw in (data['items'] as List?) ?? const [])
        MicroFeedItem.fromJson(raw as Map<String, dynamic>, imageBase: _base),
    ];
  }

  Future<MicroFeedPreferences?> savePreferences(
      List<String> categories, String cefr) async {
    final token = await _visitorToken();
    if (token.isEmpty) return null;
    final resp = await http
        .put(
          Uri.parse('$_base/v1/micro-feed/preferences'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'visitorToken': token,
            'categories': categories,
            'cefr': cefr,
          }),
        )
        .timeout(const Duration(seconds: 25));
    if (resp.statusCode != 200) return null;
    return MicroFeedPreferences.fromJson(
        jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>);
  }

  /// Действие читателя. Ошибки глотаются намеренно: подбор ленты — не то, ради
  /// чего стоит показывать человеку сообщение об ошибке.
  Future<void> record(String itemId, String event, {int dwellMs = 0}) async {
    final token = await _visitorToken();
    if (token.isEmpty) return;
    try {
      await http
          .post(
            Uri.parse('$_base/v1/micro-feed/$itemId/interactions'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'visitorToken': token,
              'event': event,
              'dwellMs': dwellMs < 0 ? 0 : dwellMs,
            }),
          )
          .timeout(const Duration(seconds: 15));
    } catch (_) {
      // Не мешаем чтению.
    }
  }
}
