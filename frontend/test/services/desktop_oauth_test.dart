import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/desktop_oauth_io.dart';

/// Вход с настольной системы держится на локальном сервере, который принимает
/// ответ провайдера на 127.0.0.1. Ровно здесь уже была поломка: чужая
/// реализация закрывала сокет по событию жизненного цикла окна, и ответ
/// прилетал в никуда — в браузере оставался голый адрес возврата.
///
/// Поэтому проверяется именно поведение сервера, а не только PKCE.
void main() {
  group('PKCE', () {
    test('верификатор и его хеш различаются и годятся для адреса', () {
      final pair = PkcePair.generate();

      expect(pair.verifier.length, greaterThanOrEqualTo(43));
      expect(pair.challenge, isNot(pair.verifier));
      // base64url без «=»: спецификация запрещает выравнивание, а «+» и «/»
      // пришлось бы экранировать в строке запроса.
      for (final value in [pair.verifier, pair.challenge]) {
        expect(value, matches(RegExp(r'^[A-Za-z0-9_-]+$')));
      }
    });

    test('каждый вызов даёт новую пару', () {
      final first = PkcePair.generate();
      final second = PkcePair.generate();
      expect(first.verifier, isNot(second.verifier));
      expect(randomState(), isNot(randomState()));
    });
  });

  group('локальный сервер входа', () {
    /// Изображает браузер: ходит по адресу, который приложение отдало провайдеру.
    Future<HttpClientResponse> visit(Uri url) async {
      final client = HttpClient();
      try {
        final request = await client.getUrl(url);
        return await request.close();
      } finally {
        client.close(force: false);
      }
    }

    test('принимает ответ с кодом и возвращает его целиком', () async {
      late Uri redirect;
      final result = DesktopOAuth.authorize(
        checkPlatform: false,
        buildAuthorizationUrl: (uri) async {
          redirect = uri;
          return Uri.parse('https://provider.example/authorize');
        },
        openUrl: (_) async => true,
      );

      // Ответ приходит после того, как «браузер» открылся.
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final response = await visit(
        redirect.replace(queryParameters: {'code': 'abc', 'state': 'xyz'}),
      );
      await response.drain<void>();

      final callback = await result;
      expect(callback.queryParameters['code'], 'abc');
      expect(callback.queryParameters['state'], 'xyz');
      expect(response.statusCode, 200);
      expect(response.headers.contentType?.mimeType, 'text/html');
    });

    test('ошибка провайдера тоже считается ответом', () async {
      late Uri redirect;
      final result = DesktopOAuth.authorize(
        checkPlatform: false,
        buildAuthorizationUrl: (uri) async {
          redirect = uri;
          return Uri.parse('https://provider.example/authorize');
        },
        openUrl: (_) async => true,
      );

      await Future<void>.delayed(const Duration(milliseconds: 50));
      final response = await visit(
        redirect.replace(queryParameters: {'error': 'access_denied'}),
      );
      await response.drain<void>();

      final callback = await result;
      expect(callback.queryParameters['error'], 'access_denied');
    });

    test('посторонний запрос браузера не завершает вход', () async {
      late Uri redirect;
      final result = DesktopOAuth.authorize(
        checkPlatform: false,
        buildAuthorizationUrl: (uri) async {
          redirect = uri;
          return Uri.parse('https://provider.example/authorize');
        },
        openUrl: (_) async => true,
      );

      await Future<void>.delayed(const Duration(milliseconds: 50));

      // Браузер сам ходит за значком вкладки. Если принять первый попавшийся
      // запрос, сервер закроется до настоящего ответа провайдера.
      final favicon = await visit(redirect.replace(path: '/favicon.ico'));
      await favicon.drain<void>();
      expect(favicon.statusCode, 404);

      final response = await visit(
        redirect.replace(queryParameters: {'code': 'после-значка'}),
      );
      await response.drain<void>();

      final callback = await result;
      expect(callback.queryParameters['code'], 'после-значка');
    });

    test('адрес возврата ведёт на петлевой интерфейс со свободным портом',
        () async {
      late Uri redirect;
      final result = DesktopOAuth.authorize(
        checkPlatform: false,
        buildAuthorizationUrl: (uri) async {
          redirect = uri;
          return Uri.parse('https://provider.example/authorize');
        },
        openUrl: (_) async => true,
      );

      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(redirect.scheme, 'http');
      expect(redirect.host, '127.0.0.1');
      expect(redirect.port, greaterThan(1023));
      expect(redirect.path, '/auth/callback');

      final response = await visit(
        redirect.replace(queryParameters: {'code': 'x'}),
      );
      await response.drain<void>();
      await result;
    });

    test('порт освобождается после входа', () async {
      late Uri redirect;
      final result = DesktopOAuth.authorize(
        checkPlatform: false,
        buildAuthorizationUrl: (uri) async {
          redirect = uri;
          return Uri.parse('https://provider.example/authorize');
        },
        openUrl: (_) async => true,
      );

      await Future<void>.delayed(const Duration(milliseconds: 50));
      final response = await visit(
        redirect.replace(queryParameters: {'code': 'x'}),
      );
      await response.drain<void>();
      await result;

      // Занятый порт после каждого входа означал бы утечку: приложение живёт
      // долго, а входов за сессию бывает несколько.
      final again = await HttpServer.bind(
        InternetAddress.loopbackIPv4,
        redirect.port,
      );
      await again.close(force: true);
    });

    test('если браузер не открылся, вход завершается ошибкой', () async {
      await expectLater(
        DesktopOAuth.authorize(
          checkPlatform: false,
          buildAuthorizationUrl: (_) async =>
              Uri.parse('https://provider.example/authorize'),
          openUrl: (_) async => false,
        ),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            contains('браузер'),
          ),
        ),
      );
    });
  });
}
