import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:window_to_front/window_to_front.dart';

import 'api_client.dart';

/// Пара PKCE: проверочная строка и её хеш.
///
/// Наружу, в адрес авторизации, уходит только хеш. Сама строка остаётся в
/// памяти приложения и предъявляется при обмене кода. Без этого перехваченный
/// код обменял бы кто угодно: он приходит на локальный сокет по открытому HTTP,
/// и любая программа на этой же машине может успеть первой.
@immutable
class PkcePair {
  const PkcePair({required this.verifier, required this.challenge});

  /// 32 случайных байта дают 43 символа base64url — минимум по RFC 7636.
  factory PkcePair.generate() {
    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    final verifier = _base64Url(bytes);
    return PkcePair(
      verifier: verifier,
      challenge: _base64Url(sha256.convert(utf8.encode(verifier)).bytes),
    );
  }

  final String verifier;
  final String challenge;
}

/// base64url без выравнивающих «=»: символ «=» в параметрах адреса пришлось бы
/// экранировать, а спецификация PKCE его прямо запрещает.
String _base64Url(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');

/// Случайная строка для параметра state.
String randomState() {
  final random = Random.secure();
  return _base64Url(List<int>.generate(24, (_) => random.nextInt(256)));
}

/// Вход через системный браузер с возвратом на 127.0.0.1.
abstract final class DesktopOAuth {
  /// Сколько ждать возвращения из браузера.
  static const _timeout = Duration(minutes: 5);

  /// Настольные системы возвращаются на случайный локальный порт. Такой
  /// loopback redirect разрешён OAuth для установленных приложений и не
  /// требует регистрировать отдельную системную URL-схему.
  static bool get supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.windows ||
          defaultTargetPlatform == TargetPlatform.linux ||
          defaultTargetPlatform == TargetPlatform.macOS);

  /// Проводит вход и возвращает адрес, на который вернулся браузер.
  ///
  /// [buildAuthorizationUrl] получает готовый адрес возврата (порт уже выбран)
  /// и возвращает адрес страницы согласия провайдера. Такой порядок нужен
  /// потому, что порт становится известен только здесь, а провайдеру его надо
  /// передать в самом запросе авторизации.
  ///
  /// Сервер поднимается свой, а не берётся из flutter_web_auth_2. Тот вешает
  /// наблюдатель за жизненным циклом и на событии `resumed` принудительно
  /// закрывает сокет. На телефоне это правильно: приложение вернулось на
  /// передний план — значит вход завершён. На Windows `resumed` приходит просто
  /// при возврате фокуса окну, то есть почти сразу после открытия браузера, и
  /// ответ провайдера прилетал уже в закрытый порт: пользователь видел в
  /// браузере голый адрес возврата, а в приложении — «вход отменён».
  static Future<Uri> authorize({
    required Future<Uri> Function(Uri redirectUri) buildAuthorizationUrl,
    @visibleForTesting Future<bool> Function(Uri url)? openUrl,
    @visibleForTesting bool checkPlatform = true,
  }) async {
    if (checkPlatform && !supported) {
      throw ApiException('Такой вход недоступен на этой системе.');
    }

    // Нулевой порт означает «любой свободный»: фиксированный отвалился бы при
    // втором запущенном экземпляре и при занятости порта чужой программой.
    final HttpServer server;
    try {
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    } on SocketException {
      throw ApiException(
        'Не удалось открыть локальный порт для входа. '
        'Проверь, не блокирует ли его брандмауэр.',
      );
    }

    try {
      final redirectUri = Uri.parse('http://127.0.0.1:${server.port}/auth/callback');
      final authorizationUrl = await buildAuthorizationUrl(redirectUri);

      final open = openUrl ??
          (Uri url) => launchUrl(url, mode: LaunchMode.externalApplication);
      if (!await open(authorizationUrl)) {
        throw ApiException('Не удалось открыть браузер для входа.');
      }

      final callback = await _awaitCallback(server);
      // Браузер остался поверх приложения, а результат уже здесь.
      if (openUrl == null) await _bringToFront();
      return callback;
    } finally {
      await server.close(force: true);
    }
  }

  /// Ждёт запрос, который действительно является ответом провайдера.
  ///
  /// Браузер стучится на тот же порт и за посторонним — favicon.ico, проверка
  /// доступности. Принять первый попавшийся запрос значило бы закрыть сервер
  /// раньше настоящего ответа.
  static Future<Uri> _awaitCallback(HttpServer server) async {
    final completer = Completer<Uri>();

    final subscription = server.listen(
      (request) async {
        final uri = request.requestedUri;
        final answered = uri.queryParameters.containsKey('code') ||
            uri.queryParameters.containsKey('error');

        request.response.statusCode = answered ? 200 : 404;
        request.response.headers.contentType =
            ContentType('text', 'html', charset: 'utf-8');
        request.response.write(answered ? _landingPage : '');
        // Ответ дописывается до конца прежде, чем сервер будет закрыт: иначе
        // человек увидит оборванное соединение вместо страницы.
        await request.response.close();

        if (answered && !completer.isCompleted) completer.complete(uri);
      },
      onError: (Object error) {
        if (!completer.isCompleted) completer.completeError(error);
      },
    );

    try {
      return await completer.future.timeout(
        _timeout,
        onTimeout: () => throw ApiException('Вход не был завершён вовремя.'),
      );
    } finally {
      await subscription.cancel();
    }
  }

  /// Возврат окна приложения на передний план — необязательная любезность.
  /// Если плагин почему-то недоступен, вход от этого не должен срываться.
  static Future<void> _bringToFront() async {
    try {
      await WindowToFront.activate();
    } catch (_) {}
  }
}

/// Страница, которую видит человек в браузере после входа.
const _landingPage = '''
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Читавук — вход выполнен</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: #f3e9d2; color: #2b2118;
    font-family: Segoe UI, system-ui, -apple-system, sans-serif;
  }
  .card {
    max-width: 26rem; margin: 1.5rem; padding: 2.5rem 2rem;
    text-align: center; background: #fffaf0; border-radius: 1.5rem;
    box-shadow: 0 1.5rem 3rem rgba(43, 33, 24, .12);
  }
  h1 { margin: 0 0 .75rem; font-size: 1.5rem; color: #9e2b25; }
  p { margin: 0; line-height: 1.6; opacity: .75; }
  @media (prefers-color-scheme: dark) {
    body { background: #1c1712; color: #f3e9d2; }
    .card { background: #262019; box-shadow: none; }
    h1 { color: #e0a458; }
  }
</style>
</head>
<body>
  <div class="card">
    <h1>Вход выполнен</h1>
    <p>Можно закрыть эту вкладку и вернуться в Читавук.</p>
  </div>
</body>
</html>
''';
