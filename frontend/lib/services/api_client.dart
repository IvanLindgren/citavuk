import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Ошибка обращения к серверу Citavuk.
///
/// Разделена на «сеть недоступна» и «сервер ответил ошибкой»: приложение
/// работает офлайн, и отсутствие сети — обычное состояние, а не сбой, о котором
/// нужно кричать пользователю.
class ApiException implements Exception {
  ApiException(this.message, {this.status = 0, this.code = ''});

  /// Сеть недоступна: нет подключения, таймаут, сервер не отвечает.
  ApiException.offline([String? message])
      : message = message ?? 'Нет связи с сервером.',
        status = 0,
        code = 'offline';

  final String message;
  final int status;
  final String code;

  /// Запрос не дошёл до сервера — синхронизацию нужно просто повторить позже.
  bool get isOffline => status == 0;

  /// Сессия недействительна: нужно войти заново.
  bool get isUnauthorized => status == 401;

  @override
  String toString() => 'ApiException($status $code): $message';
}

/// HTTP-клиент сервера Citavuk.
///
/// Знает только про транспорт и авторизацию. Разбор предметных данных лежит на
/// вызывающих сервисах.
class ApiClient {
  ApiClient({required this.baseUrl, http.Client? client, this.token})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  /// Токен сессии. Пустая строка — запросы уходят без авторизации.
  String? token;

  static const _timeout = Duration(seconds: 30);

  /// Выгрузка книги может быть долгой на медленной сети.
  static const _uploadTimeout = Duration(minutes: 3);

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return Uri.parse('$base$path').replace(queryParameters: query);
  }

  Map<String, String> _headers({bool json = true}) => {
        if (json) 'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
        if (token != null && token!.isNotEmpty)
          'Authorization': 'Bearer $token',
      };

  Future<dynamic> get(String path,
          {Map<String, String>? query, Duration? timeout}) =>
      _send(
        () => _client.get(_uri(path, query), headers: _headers(json: false)),
        timeout: timeout,
      );

  Future<dynamic> post(String path, Object? body, {Duration? timeout}) => _send(
        () => _client.post(_uri(path),
            headers: _headers(), body: body == null ? null : jsonEncode(body)),
        timeout: timeout,
      );

  Future<dynamic> put(String path, Object? body, {Duration? timeout}) => _send(
        () => _client.put(_uri(path),
            headers: _headers(), body: body == null ? null : jsonEncode(body)),
        timeout: timeout,
      );

  /// Загружает двоичный ответ: PDF или DOCX из прокси документов.
  ///
  /// Отдельно от [get], потому что тот разбирает тело как JSON. Разбирать
  /// многомегабайтный PDF как текст — способ получить бессмысленную ошибку
  /// вместо файла.
  Future<Uint8List> getBytes(
    String path, {
    Map<String, String>? query,
    Duration? timeout,
  }) async {
    http.Response response;
    try {
      response = await _client
          .get(_uri(path, query), headers: _headers(json: false))
          .timeout(timeout ?? _uploadTimeout);
    } on http.ClientException {
      throw ApiException.offline();
    } on TimeoutException {
      throw ApiException.offline('Сервер не ответил вовремя.');
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException.offline();
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _errorFrom(response);
    }
    return response.bodyBytes;
  }

  /// Выполняет запрос и разбирает ответ.
  ///
  /// Тело ошибки сервера имеет вид `{"code": "...", "message": "..."}`, и
  /// message написан по-русски специально для показа пользователю.
  Future<dynamic> _send(Future<http.Response> Function() run,
      {Duration? timeout}) async {
    http.Response response;
    try {
      response = await run().timeout(timeout ?? _timeout);
    } on http.ClientException {
      throw ApiException.offline();
    } on TimeoutException {
      throw ApiException.offline('Сервер не ответил вовремя.');
    } catch (e) {
      // Сюда попадают SocketException на native и ошибки XHR на вебе. Общего
      // типа у них нет, а dart:io нельзя импортировать в код, который
      // компилируется и под веб. Для вызывающего смысл один: до сервера не
      // достучались.
      if (e is ApiException) rethrow;
      throw ApiException.offline();
    }

    final body = response.body;
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (body.isEmpty) return null;
      try {
        return jsonDecode(body);
      } catch (_) {
        throw ApiException('Сервер вернул неразбираемый ответ.',
            status: response.statusCode);
      }
    }

    throw _errorFrom(response);
  }

  /// Превращает ответ сервера с ошибкой в исключение с текстом для человека.
  ApiException _errorFrom(http.Response response) {
    var message = 'Ошибка сервера (${response.statusCode}).';
    var code = '';
    try {
      final parsed = jsonDecode(response.body);
      if (parsed is Map) {
        message = (parsed['message'] as String?)?.trim().isNotEmpty == true
            ? parsed['message'] as String
            : message;
        code = (parsed['code'] as String?) ?? '';
      }
    } catch (_) {
      // Тело не JSON — оставляем общее сообщение.
    }
    if (kDebugMode) {
      debugPrint('API ${response.statusCode} $code: $message');
    }
    return ApiException(message, status: response.statusCode, code: code);
  }

  /// Загружает текст книги. Отдельный метод из-за увеличенного таймаута.
  Future<dynamic> putContent(String sha, List<String> paragraphs) =>
      put('/v1/sync/content/$sha', paragraphs, timeout: _uploadTimeout);

  void close() => _client.close();
}
