import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../utils/uuid.dart';
import 'api_client.dart';
import 'desktop_oauth.dart';
import 'user_db.dart';

/// Учётная запись пользователя на сервере Citavuk.
@immutable
class Account {
  const Account({
    required this.id,
    required this.email,
    required this.displayName,
    this.hasPassword = true,
    this.emailVerified = true,
    this.serbianLevel = '',
    this.supporterSince,
    this.isAdmin = false,
  });

  factory Account.fromJson(Map<String, dynamic> json) => Account(
        id: json['id'] as String? ?? '',
        email: json['email'] as String? ?? '',
        displayName: json['displayName'] as String? ?? '',
        hasPassword: json['hasPassword'] as bool? ?? true,
        emailVerified: json['emailVerified'] as bool? ?? true,
        serbianLevel: json['serbianLevel'] as String? ?? '',
        isAdmin: json['isAdmin'] == true,
        supporterSince:
            DateTime.tryParse(json['supporterSince'] as String? ?? ''),
      );

  final String id;
  final String email;
  final String displayName;

  /// Аккаунт создан через Google и пароля не имеет.
  final bool hasPassword;
  final bool emailVerified;

  /// Уровень сербского: A1…C1 либо пусто, если ещё не спрашивали. Живёт на
  /// аккаунте, а не в разделе: спросили один раз — знают везде.
  final String serbianLevel;

  /// С какого дня у аккаунта значок «Друг Читавука»; null — не поддерживал.
  final DateTime? supporterSince;
  final bool isAdmin;

  Account withLevel(String level) => Account(
        id: id,
        email: email,
        displayName: displayName,
        hasPassword: hasPassword,
        emailVerified: emailVerified,
        serbianLevel: level,
        supporterSince: supporterSince,
        isAdmin: isAdmin,
      );

  /// Что показать в интерфейсе: имя, а если его нет — почту.
  String get label => displayName.isNotEmpty ? displayName : email;

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'displayName': displayName,
        'hasPassword': hasPassword,
        'emailVerified': emailVerified,
        'serbianLevel': serbianLevel,
        if (isAdmin) 'isAdmin': true,
        if (supporterSince != null)
          'supporterSince': supporterSince!.toUtc().toIso8601String(),
      };
}

@immutable
class RegistrationResult {
  const RegistrationResult({
    required this.verificationRequired,
    required this.email,
  });

  factory RegistrationResult.fromJson(Map<String, dynamic> json) =>
      RegistrationResult(
        verificationRequired:
            json['verificationRequired'] as bool? ?? false,
        email: json['email'] as String? ?? '',
      );

  final bool verificationRequired;
  final String email;
}

/// Состояние входа в аккаунт.
///
/// Хранит токен сессии и данные пользователя, переживает перезапуск приложения.
/// Сам по себе ничего не синхронизирует — этим занимается SyncService.
class AuthService extends ChangeNotifier {
  AuthService({required this.api});

  final ApiClient api;

  static const _kToken = 'citavuk_session_token';
  static const _secureStorage = FlutterSecureStorage();
  static const _kAccount = 'citavuk_account';
  static const _kDeviceId = 'citavuk_device_id';

  Account? _account;
  Account? get account => _account;
  bool get isSignedIn => _account != null && (api.token ?? '').isNotEmpty;

  String _deviceId = '';

  bool _busy = false;
  bool get busy => _busy;
  Future<Map<String, dynamic>>? _providerConfig;
  Future<void>? _googleInitialization;

  /// Восстанавливает сессию из локального хранилища.
  ///
  /// Сервер намеренно не опрашивается: приложение обязано открываться офлайн.
  /// Недействительность токена выяснится при первом же запросе, и тогда
  /// сработает [handleUnauthorized].
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _deviceId = prefs.getString(_kDeviceId) ?? '';
      if (_deviceId.isEmpty) {
        _deviceId = newUuid();
        await prefs.setString(_kDeviceId, _deviceId);
      }

      String? token;
      try {
        token = await _secureStorage.read(key: _kToken);
      } catch (_) {}
      final legacyToken = prefs.getString(_kToken);
      if (token == null && legacyToken != null) {
        token = legacyToken;
        try {
          await _secureStorage.write(key: _kToken, value: legacyToken);
          await prefs.remove(_kToken);
        } catch (_) {}
      }
      final raw = prefs.getString(_kAccount);
      if (token != null && token.isNotEmpty && raw != null) {
        api.token = token;
        _account = Account.fromJson(jsonDecode(raw) as Map<String, dynamic>);
        await UserDb.instance.activateAccount(_account!.id);
      }
    } catch (_) {
      // Повреждённое хранилище: считаем, что пользователь не вошёл.
    }
    notifyListeners();
  }

  Map<String, String> _device() => {
        'id': _deviceId,
        'name': _deviceName(),
        'platform': _platformName(),
      };

  String _platformName() {
    if (kIsWeb) return 'web';
    return defaultTargetPlatform.name;
  }

  String _deviceName() {
    if (kIsWeb) return 'Браузер';
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'Android',
      TargetPlatform.iOS => 'iPhone',
      TargetPlatform.windows => 'Windows',
      TargetPlatform.macOS => 'Mac',
      TargetPlatform.linux => 'Linux',
      TargetPlatform.fuchsia => 'Fuchsia',
    };
  }

  Future<RegistrationResult> register({
    required String email,
    required String password,
    String displayName = '',
  }) async {
    _busy = true;
    notifyListeners();
    try {
      final response = await api.post('/v1/auth/register', {
        'email': email.trim(),
        'password': password,
        'displayName': displayName.trim(),
        'device': _device(),
      }) as Map<String, dynamic>;
      return RegistrationResult.fromJson(response);
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> login({required String email, required String password}) =>
      _authenticate('/v1/auth/login', {
        'email': email.trim(),
        'password': password,
        'device': _device(),
      });

  /// Вход по ID token, полученному приложением от Google.
  Future<void> loginWithGoogle(String idToken) =>
      _authenticate('/v1/auth/google', {
        'idToken': idToken,
        'device': _device(),
      });

  /// Интерактивный вход через Google.
  ///
  /// На Android и iPhone работает нативный SDK, на Windows и Linux — системный
  /// браузер с возвратом на локальный сокет: настольного SDK у Google нет.
  Future<void> loginWithGoogleInteractive() async {
    if (kIsWeb) {
      throw ApiException('В браузере вход выполняется на самом сайте.');
    }
    if (_nativeMobile) return _loginWithGoogleNative();
    if (DesktopOAuth.supported) {
      return _loginWithGoogleOnDesktop();
    }
    throw ApiException('Вход через Google на этой системе недоступен.');
  }

  /// Публичный Web Client ID берётся с API, поэтому его не нужно дублировать в
  /// APK или GitHub Secrets.
  /// Телефон, где вход идёт через системный SDK и окно браузера, а не через
  /// локальный сокет.
  bool get _nativeMobile =>
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;

  /// На iPhone клиент Google берётся из Info.plist (GIDClientID, см.
  /// ios/Flutter/Google.xcconfig), серверный — с API, как и на Android.
  Future<void> _loginWithGoogleNative() async {
    final providers = await _providers();
    final google = providers['google'] as Map<String, dynamic>? ?? const {};
    final clientId = (google['serverClientId'] as String? ?? '').trim();
    if (google['enabled'] != true || clientId.isEmpty) {
      throw ApiException('Вход через Google на сервере не настроен.');
    }

    _googleInitialization ??=
        GoogleSignIn.instance.initialize(serverClientId: clientId);
    try {
      await _googleInitialization;
    } catch (e) {
      // Без GIDClientID в Info.plist iOS-SDK падает ещё на инициализации.
      _googleInitialization = null;
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        throw ApiException('Вход через Google на iPhone пока не настроен.');
      }
      rethrow;
    }
    if (!GoogleSignIn.instance.supportsAuthenticate()) {
      throw ApiException('Это устройство не поддерживает вход через Google.');
    }

    try {
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw ApiException('Google не вернул токен входа.');
      }
      await loginWithGoogle(idToken);
    } on GoogleSignInException catch (e) {
      throw ApiException(_googleFailure(e));
    }
  }

  /// Причина отказа Google — фразой, но с кодом.
  ///
  /// Код в скобках оставлен намеренно. Пока сообщение было просто «Не удалось
  /// войти через Google», сломанный релиз выглядел как проблема с ключами
  /// подписи, и искали её неделю; настоящая причина (`providerConfigurationError`
  /// — R8 вырезал провайдера Credential Manager) читалась в одном слове.
  /// Разбираться приходится по чужому телефону, где ни логов, ни отладчика нет.
  String _googleFailure(GoogleSignInException e) {
    if (e.code == GoogleSignInExceptionCode.canceled) {
      return 'Вход через Google отменён.';
    }
    final description = e.description?.trim() ?? '';
    return description.isEmpty
        ? 'Не удалось войти через Google (${e.code.name}).'
        : 'Не удалось войти через Google (${e.code.name}): $description';
  }

  /// Вход через Google на Windows и Linux.
  ///
  /// Нативного SDK там нет, поэтому идёт обычный OAuth: приложение открывает
  /// системный браузер и принимает ответ на 127.0.0.1. Код обменивает на токен
  /// сервер — client secret не должен лежать в файле программы, а ID token
  /// приходит серверу напрямую от Google, минуя клиента.
  Future<void> _loginWithGoogleOnDesktop() async {
    final providers = await _providers();
    final google = providers['google'] as Map<String, dynamic>? ?? const {};
    final clientId = (google['desktopClientId'] as String? ?? '').trim();
    if (google['desktopEnabled'] != true || clientId.isEmpty) {
      throw ApiException(
        'Вход через Google для настольной версии на сервере не настроен.',
      );
    }

    final pkce = PkcePair.generate();
    final expectedState = randomState();
    Uri? redirectUri;

    final callback = await DesktopOAuth.authorize(
      buildAuthorizationUrl: (uri) async {
        redirectUri = uri;
        return Uri.https('accounts.google.com', '/o/oauth2/v2/auth', {
          'client_id': clientId,
          'redirect_uri': uri.toString(),
          'response_type': 'code',
          'scope': 'openid email profile',
          'code_challenge': pkce.challenge,
          'code_challenge_method': 'S256',
          'state': expectedState,
          // Иначе Google молча входит последним аккаунтом, и сменить его в
          // приложении оказывается нечем.
          'prompt': 'select_account',
        });
      },
    );

    final error = callback.queryParameters['error'] ?? '';
    if (error.isNotEmpty) {
      throw ApiException(
        error == 'access_denied' ? 'Вход отменён.' : 'Google отказал во входе.',
      );
    }
    // Ответ приходит на локальный сокет по открытому HTTP: постучаться туда
    // может любая программа на этой же машине. Без сверки state она подсунула
    // бы код от своего аккаунта, и человек вошёл бы в чужой.
    if (callback.queryParameters['state'] != expectedState) {
      throw ApiException('Ответ Google не относится к этой попытке входа.');
    }
    final code = callback.queryParameters['code'] ?? '';
    if (code.isEmpty) {
      throw ApiException('Google не вернул код входа.');
    }

    await _authenticate('/v1/auth/google/desktop', {
      'code': code,
      'codeVerifier': pkce.verifier,
      'redirectUri': redirectUri.toString(),
      'device': _device(),
    });
  }

  /// Яндекс использует серверный OAuth flow. В браузер уходит только URL, а
  /// обратно приложение получает одноразовый код Citavuk, не OAuth-токен.
  Future<void> loginWithYandexInteractive() async {
    if (kIsWeb) {
      throw ApiException('В браузере вход выполняется на самом сайте.');
    }
    if (_nativeMobile) return _loginWithYandexOnMobile();
    if (DesktopOAuth.supported) {
      return _loginWithYandexOnDesktop();
    }
    throw ApiException('Вход через Яндекс на этой системе недоступен.');
  }

  /// На iPhone flutter_web_auth_2 открывает системное окно входа, и схему
  /// citavuk:// оно перехватывает само — регистрировать её в Info.plist не нужно.
  Future<void> _loginWithYandexOnMobile() async {
    final authorizationUrl = await _startYandex(returnTarget: 'mobile');
    final callback = Uri.parse(
      await FlutterWebAuth2.authenticate(
        url: authorizationUrl.toString(),
        callbackUrlScheme: 'citavuk',
      ),
    );
    await _completeYandex(callback);
  }

  /// На Windows и Linux deep link «citavuk://» регистрировать негде, поэтому
  /// сервер возвращает браузер на локальный сокет приложения. Адрес возврата
  /// сервер проверяет и хранит рядом со state — подсунуть чужой нельзя.
  Future<void> _loginWithYandexOnDesktop() async {
    final callback = await DesktopOAuth.authorize(
      buildAuthorizationUrl: (uri) =>
          _startYandex(returnTarget: 'desktop', returnUrl: uri),
    );
    await _completeYandex(callback);
  }

  Future<Uri> _startYandex({required String returnTarget, Uri? returnUrl}) =>
      _startOAuth('yandex', 'Яндекс',
          returnTarget: returnTarget, returnUrl: returnUrl);

  Future<void> _completeYandex(Uri callback) =>
      _completeOAuth('yandex', 'Яндекс', callback);

  Future<void> resendVerification(String email) async {
    _busy = true;
    notifyListeners();
    try {
      await api.post('/v1/auth/resend-verification', {
        'email': email.trim(),
      });
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Есть ли вход через Apple на этом устройстве. На iPhone нужен нативный
  /// вход, на компьютерах — вход через браузер; пока сервер не настроен,
  /// кнопку не показываем вовсе.
  Future<bool> appleSignInAvailable() async {
    if (kIsWeb) return false;
    try {
      final apple =
          (await _providers())['apple'] as Map<String, dynamic>? ?? const {};
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        return apple['enabled'] == true;
      }
      return DesktopOAuth.supported && apple['webEnabled'] == true;
    } catch (_) {
      return false;
    }
  }

  /// Вход через Apple: на iPhone — системное окно Apple ID, на компьютерах —
  /// браузер с возвратом на локальный сокет, как у Яндекса.
  Future<void> loginWithAppleInteractive() async {
    if (defaultTargetPlatform == TargetPlatform.iOS && !kIsWeb) {
      return _loginWithAppleNative();
    }
    if (DesktopOAuth.supported) {
      final callback = await DesktopOAuth.authorize(
        buildAuthorizationUrl: (uri) => _startOAuth('apple', 'Apple',
            returnTarget: 'desktop', returnUrl: uri),
      );
      return _completeOAuth('apple', 'Apple', callback);
    }
    throw ApiException('Вход через Apple на этой системе недоступен.');
  }

  Future<void> _loginWithAppleNative() async {
    final AuthorizationCredentialAppleID credential;
    try {
      credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        throw ApiException('Вход через Apple отменён.');
      }
      throw ApiException('Apple не подтвердил вход.');
    }
    final identityToken = credential.identityToken ?? '';
    if (identityToken.isEmpty) {
      throw ApiException('Apple не выдал токен входа.');
    }
    await _authenticate('/v1/auth/apple', {
      'identityToken': identityToken,
      'authorizationCode': credential.authorizationCode,
      'givenName': credential.givenName ?? '',
      'familyName': credential.familyName ?? '',
      'device': _device(),
    });
  }

  Future<Uri> _startOAuth(
    String provider,
    String name, {
    required String returnTarget,
    Uri? returnUrl,
  }) async {
    final response = await api.post('/v1/auth/$provider/start', {
      'returnTarget': returnTarget,
      if (returnUrl != null) 'returnUrl': returnUrl.toString(),
      'device': _device(),
    }) as Map<String, dynamic>;
    final authorizationUrl =
        (response['authorizationUrl'] as String? ?? '').trim();
    if (authorizationUrl.isEmpty) {
      throw ApiException('Сервер не вернул адрес входа через $name.');
    }
    return Uri.parse(authorizationUrl);
  }

  Future<void> _completeOAuth(String provider, String name, Uri callback) async {
    final providerError = callback.queryParameters['error'];
    if (providerError != null && providerError.isNotEmpty) {
      throw ApiException(providerError);
    }
    final code = callback.queryParameters['code'] ?? '';
    if (code.isEmpty) {
      throw ApiException('$name не вернул код входа.');
    }
    await _authenticate('/v1/auth/$provider/complete', {'code': code});
  }

  Future<Map<String, dynamic>> _providers() {
    return _providerConfig ??= api
        .get('/v1/auth/providers')
        .then((value) => value as Map<String, dynamic>)
        .catchError((Object error) {
      _providerConfig = null;
      throw error;
    });
  }

  Future<void> _authenticate(String path, Map<String, dynamic> body) async {
    _busy = true;
    notifyListeners();
    try {
      final response = await api.post(path, body) as Map<String, dynamic>;
      final token = response['token'] as String? ?? '';
      if (token.isEmpty) {
        throw ApiException('Сервер не выдал токен сессии.');
      }
      api.token = token;
      _account =
          Account.fromJson(response['user'] as Map<String, dynamic>? ?? {});
      await UserDb.instance.activateAccount(_account!.id);
      await _persist(token, _account!);
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Запоминает уровень сербского, только что записанный на сервере.
  ///
  /// Сеть здесь не трогается: уровень уже сохранён тем, кто его спрашивал.
  /// Здесь только приводится в порядок то, что приложение держит о человеке, —
  /// иначе вопрос об уровне вернулся бы при следующем запуске.
  void rememberLevel(String level) {
    final account = _account;
    if (account == null || account.serbianLevel == level) return;
    _account = account.withLevel(level);
    unawaited(_saveAccount(_account!));
    notifyListeners();
  }

  /// Перечитывает аккаунт с сервера: значок поддержки выдаётся на сайте, и
  /// приложение узнаёт о нём только так. Ошибка сети не страшна — остаётся
  /// сохранённая копия.
  Future<void> refreshAccount() async {
    if (_account == null) return;
    try {
      final response = await api.get('/v1/auth/me');
      if (response is! Map<String, dynamic>) return;
      final fresh = Account.fromJson(response);
      if (_account == null || fresh.id != _account!.id) return;
      _account = fresh;
      unawaited(_saveAccount(fresh));
      notifyListeners();
    } catch (_) {
      // Офлайн или сессия истекла — последнее обработает handleUnauthorized.
    }
  }

  Future<void> _saveAccount(Account account) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kAccount, jsonEncode(account.toJson()));
    } catch (_) {
      // Не удалось сохранить: доживёт до перезапуска приложения.
    }
  }

  Future<void> _persist(String token, Account account) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await _secureStorage.write(key: _kToken, value: token);
      await prefs.remove(_kToken);
      await prefs.setString(_kAccount, jsonEncode(account.toJson()));
    } catch (_) {
      // Не удалось сохранить: сессия проживёт до перезапуска приложения.
    }
  }

  /// Смена пароля. Сервер завершает все прочие сессии и выдаёт новый токен.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final response = await api.post('/v1/auth/password', {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    }) as Map<String, dynamic>;

    final token = response['token'] as String? ?? '';
    if (token.isNotEmpty) {
      api.token = token;
      _account =
          Account.fromJson(response['user'] as Map<String, dynamic>? ?? {});
      await UserDb.instance.activateAccount(_account!.id);
      await _persist(token, _account!);
      notifyListeners();
    }
  }

  /// Удаление аккаунта вместе со всеми данными на сервере.
  ///
  /// Книги и слова на самом устройстве остаются: удаляется аккаунт, а не
  /// библиотека.
  Future<void> deleteAccount({String password = ''}) async {
    await api.post('/v1/auth/account/delete', {
      'password': password,
      'confirm': 'УДАЛИТЬ',
    });
    await _clearLocal();
  }

  /// Выход из аккаунта.
  ///
  /// Локальное состояние очищается в любом случае, даже если сервер недоступен:
  /// пользователь нажал «выйти» и обязан выйти. Серверная сессия при этом
  /// доживёт до своего срока — неприятно, но безопаснее, чем оставить человека
  /// внутри аккаунта из-за отсутствия сети.
  Future<void> logout() async {
    try {
      await api.post('/v1/auth/logout', null);
    } catch (_) {
      // Сеть недоступна — выходим локально.
    }
    if (!kIsWeb && _nativeMobile) {
      try {
        await GoogleSignIn.instance.signOut();
      } catch (_) {
        // Google мог не инициализироваться — Citavuk-сессию всё равно закрываем.
      }
    }
    await _clearLocal();
  }

  /// Реакция на 401 от любого запроса: сессия больше не действует.
  Future<void> handleUnauthorized() => _clearLocal();

  Future<void> _clearLocal() async {
    api.token = null;
    _account = null;
    await UserDb.instance.activateGuest();
    try {
      await _secureStorage.delete(key: _kToken);
    } catch (_) {}
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kToken);
      await prefs.remove(_kAccount);
    } catch (_) {}
    notifyListeners();
  }
}
