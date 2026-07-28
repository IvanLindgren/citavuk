import 'package:flutter/foundation.dart';

import 'api_client.dart';

/// Заглушка для веба: там нет ни dart:io, ни нужды в локальном сервере —
/// браузер возвращается на обычную страницу сайта.
@immutable
class PkcePair {
  const PkcePair({required this.verifier, required this.challenge});

  factory PkcePair.generate() =>
      throw ApiException('Такой вход в браузере не используется.');

  final String verifier;
  final String challenge;
}

String randomState() =>
    throw ApiException('Такой вход в браузере не используется.');

abstract final class DesktopOAuth {
  static bool get supported => false;

  static Future<Uri> authorize({
    required Future<Uri> Function(Uri redirectUri) buildAuthorizationUrl,
  }) =>
      throw ApiException('Такой вход в браузере не используется.');
}
