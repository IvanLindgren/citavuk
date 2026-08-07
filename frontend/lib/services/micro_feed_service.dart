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
///
/// Вошедший узнаётся по токену сессии, и это не мелочь. Раньше запросы ленты
/// уходили вовсе без него: приложение всегда было для сервера гостем, анкета
/// хранилась при устройстве, и один и тот же человек выбирал темы заново в
/// приложении, в браузере и после переустановки. Комментировать он тоже не мог
/// — обсуждение требует входа, а войти в него было нечем.
class MicroFeedService {
  MicroFeedService._();
  static final MicroFeedService instance = MicroFeedService._();

  static const _tokenKey = 'citavuk-micro-feed-visitor-token';

  /// Ключ, под которым AuthService хранит токен сессии.
  ///
  /// Читается напрямую, а не через AuthService: лента — самостоятельный клиент
  /// с собственным http, и тащить сюда весь слой аккаунтов ради одного
  /// заголовка значило бы связать их накрепко.
  static const _sessionKey = 'citavuk_session_token';

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

  /// Заголовки запроса. Токен сессии кладётся, если человек вошёл.
  ///
  /// Не кешируется: между двумя запросами можно и войти, и выйти, а лента с
  /// заголовком от прошлого аккаунта — худший из возможных исходов.
  Future<Map<String, String>> _headers({bool json = false}) async {
    final prefs = await SharedPreferences.getInstance();
    final session = prefs.getString(_sessionKey) ?? '';
    return {
      if (json) 'Content-Type': 'application/json',
      if (session.isNotEmpty) 'Authorization': 'Bearer $session',
    };
  }

  /// Вошёл ли человек. По этому решается, показывать ли поле ответа в
  /// обсуждении: писать может только вошедший.
  Future<bool> signedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getString(_sessionKey) ?? '').isNotEmpty;
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
    final resp = await http
        .get(uri, headers: await _headers())
        .timeout(const Duration(seconds: 30));
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
    final resp = await http
        .get(uri, headers: await _headers())
        .timeout(const Duration(seconds: 25));
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
          headers: await _headers(json: true),
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

  /// Обсуждение карточки. Читать может кто угодно, писать — только вошедший.
  Future<List<MicroFeedComment>> comments(String itemId) async {
    final resp = await http
        .get(
          Uri.parse('$_base/v1/micro-feed/$itemId/comments'),
          headers: await _headers(),
        )
        .timeout(const Duration(seconds: 25));
    if (resp.statusCode != 200) {
      throw Exception('Обсуждение недоступно (${resp.statusCode})');
    }
    final data = jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
    return [
      for (final raw in (data['items'] as List?) ?? const [])
        MicroFeedComment.fromJson(raw as Map<String, dynamic>),
    ];
  }

  /// Добавляет реплику.
  ///
  /// Сообщение сервера показывается как есть: там написано по-русски и по делу
  /// — «войдите», «слишком часто», «длиннее 600 символов». Подменять его общим
  /// «не удалось» значит скрыть от человека единственное, что ему нужно знать.
  Future<MicroFeedComment> addComment(String itemId, String body) async {
    final resp = await http
        .post(
          Uri.parse('$_base/v1/micro-feed/$itemId/comments'),
          headers: await _headers(json: true),
          body: jsonEncode({'body': body}),
        )
        .timeout(const Duration(seconds: 25));
    final data = jsonDecode(utf8.decode(resp.bodyBytes));
    if (resp.statusCode != 201) {
      final message = data is Map ? (data['message'] as String?) : null;
      throw Exception(message ?? 'Не удалось отправить комментарий');
    }
    return MicroFeedComment.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteComment(String commentId) async {
    final resp = await http
        .delete(
          Uri.parse('$_base/v1/micro-feed/comments/$commentId'),
          headers: await _headers(),
        )
        .timeout(const Duration(seconds: 25));
    if (resp.statusCode != 204) {
      throw Exception('Не удалось удалить комментарий');
    }
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
            headers: await _headers(json: true),
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
