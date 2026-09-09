import 'package:shared_preferences/shared_preferences.dart';

import '../models/micro_feed.dart';
import 'analysis_repository.dart';
import 'api_client.dart';

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
  MicroFeedService({required ApiClient api}) : _api = api;
  final ApiClient _api;
  static MicroFeedService? _instance;
  static MicroFeedService get instance => _instance ??= MicroFeedService(
      api: ApiClient(baseUrl: AnalysisRepository.translationUrl));

  static void configure({required ApiClient api}) {
    _instance = MicroFeedService(api: api);
  }

  static const _tokenKey = 'citavuk-micro-feed-visitor-token';

  String get _base => _api.baseUrl;
  String _token = '';
  bool _tokenLoaded = false;

  Future<String> _visitorToken() async {
    if (_tokenLoaded) return _token;
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey) ?? '';
    _tokenLoaded = true;
    return _token;
  }

  /// Вошёл ли человек. По этому решается, показывать ли поле ответа в
  /// обсуждении: писать может только вошедший.
  Future<bool> signedIn() async => (_api.token ?? '').isNotEmpty;

  Future<void> _rememberToken(String? token) async {
    if (token == null || token.isEmpty || token == _token) return;
    _token = token;
    _tokenLoaded = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  /// Порция ленты. [exclude] — уже показанные карточки: без них сервер выдал бы
  /// те же самые.
  Future<MicroFeedPage> load(
      {List<String> exclude = const [], bool video = false}) async {
    final token = await _visitorToken();
    final query = <String, String>{'limit': '8'};
    query['mode'] = video ? 'video' : 'text';
    if (token.isNotEmpty) query['visitorToken'] = token;
    if (exclude.isNotEmpty) {
      query['exclude'] = exclude.length > 80
          ? exclude.sublist(exclude.length - 80).join(',')
          : exclude.join(',');
    }

    final data =
        await _api.get('/v1/micro-feed', query: query) as Map<String, dynamic>;
    await _rememberToken(data['visitorToken'] as String?);
    return MicroFeedPage.fromJson(data, imageBase: _base);
  }

  /// Карточки, отмеченные лайком: лайк работает ещё и закладкой.
  Future<List<MicroFeedItem>> liked({bool video = false}) async {
    final token = await _visitorToken();
    if (token.isEmpty && !await signedIn()) return const [];
    final data = await _api.get('/v1/micro-feed/liked', query: {
      'mode': video ? 'video' : 'text',
      if (token.isNotEmpty) 'visitorToken': token,
    }) as Map<String, dynamic>;
    return [
      for (final raw in (data['items'] as List?) ?? const [])
        MicroFeedItem.fromJson(raw as Map<String, dynamic>, imageBase: _base),
    ];
  }

  Future<MicroFeedPreferences?> savePreferences(
      List<String> categories, String cefr) async {
    final token = await _visitorToken();
    if (token.isEmpty && !await signedIn()) return null;
    final data = await _api.put('/v1/micro-feed/preferences', {
      'visitorToken': token,
      'categories': categories,
      'cefr': cefr,
    }) as Map<String, dynamic>;
    return MicroFeedPreferences.fromJson(data);
  }

  /// Обсуждение карточки. Читать может кто угодно, писать — только вошедший.
  Future<List<MicroFeedComment>> comments(String itemId) async {
    final data = await _api.get('/v1/micro-feed/$itemId/comments')
        as Map<String, dynamic>;
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
    final data =
        await _api.post('/v1/micro-feed/$itemId/comments', {'body': body});
    return MicroFeedComment.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteComment(String commentId) async {
    await _api.delete('/v1/micro-feed/comments/$commentId');
  }

  /// Действие читателя. Ошибки глотаются намеренно: подбор ленты — не то, ради
  /// чего стоит показывать человеку сообщение об ошибке.
  Future<void> record(String itemId, String event, {int dwellMs = 0}) async {
    try {
      final token = await _visitorToken();
      if (token.isEmpty && !await signedIn()) return;
      await _api.post(
          '/v1/micro-feed/$itemId/interactions',
          {
            'visitorToken': token,
            'event': event,
            'dwellMs': dwellMs < 0 ? 0 : dwellMs,
          },
          timeout: const Duration(seconds: 15));
    } catch (_) {
      // Не мешаем чтению.
    }
  }
}
