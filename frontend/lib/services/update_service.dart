import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

/// Сведения о доступной сборке из `latest.json`.
class UpdateInfo {
  final String version;
  final String url;
  final String notes;
  final int size;
  final String sha256;

  const UpdateInfo({
    required this.version,
    required this.url,
    this.notes = '',
    this.size = 0,
    required this.sha256,
  });
}

/// Принимает единственный итоговый digest от потокового хешера, не удерживая
/// архив обновления в памяти.
class _DigestSink implements Sink<Digest> {
  Digest? value;

  @override
  void add(Digest data) => value = data;

  @override
  void close() {}
}

/// Проверка и установка обновлений на Windows и Linux.
///
/// Android обновляется через Play, веб — сам по себе, поэтому здесь только
/// настольные сборки: там пользователь иначе вынужден раз за разом скачивать
/// установщик руками.
class UpdateService {
  UpdateService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  static const manifestUrl = 'https://citavuk.ru/files/latest.json';
  static const _signatureUrl = 'https://citavuk.ru/files/latest.json.sig';
  static const _publicKey = String.fromEnvironment('CITAVUK_UPDATE_PUBLIC_KEY');
  static const _maxDownloadBytes = 512 * 1024 * 1024;

  static bool get supported =>
      !kIsWeb && (Platform.isWindows || Platform.isLinux);

  static String get _platformKey => Platform.isWindows ? 'windows' : 'linux';

  Future<String> currentVersion() async =>
      (await PackageInfo.fromPlatform()).version;

  /// Возвращает сведения о более новой сборке или null, если обновлять нечего.
  Future<UpdateInfo?> check() async {
    if (!supported) return null;
    if (_publicKey.isEmpty) return null;
    final responses = await Future.wait([
      _client.get(Uri.parse(manifestUrl)).timeout(const Duration(seconds: 12)),
      _client
          .get(Uri.parse(_signatureUrl))
          .timeout(const Duration(seconds: 12)),
    ]);
    final manifestResponse = responses[0];
    final signatureResponse = responses[1];
    if (manifestResponse.statusCode != 200 ||
        signatureResponse.statusCode != 200) {
      throw const HttpException(
          'не удалось получить подписанный манифест обновления');
    }
    if (!await _verifyManifest(
        manifestResponse.bodyBytes, signatureResponse.bodyBytes)) {
      throw const FormatException(
          'подпись манифеста обновления не прошла проверку');
    }
    final decoded = jsonDecode(utf8.decode(manifestResponse.bodyBytes));
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('неверный манифест обновления');
    }
    final manifest = decoded;
    return offerFor(manifest, _platformKey, await currentVersion());
  }

  Future<bool> _verifyManifest(List<int> bytes, List<int> signature) async {
    try {
      final key =
          SimplePublicKey(base64Decode(_publicKey), type: KeyPairType.ed25519);
      return await Ed25519()
          .verify(bytes, signature: Signature(signature, publicKey: key));
    } catch (_) {
      return false;
    }
  }

  /// Что манифест предлагает этой системе. Пусто — обновлять нечего.
  ///
  /// Версия берётся у самой платформы, а общая — только запасная. Сборки
  /// выходят вразнобой: Windows пересобирается на машине разработчика, а
  /// macOS — на серверах GitHub и по кнопке. Общий номер обещал бы Linux
  /// обновление, которого в его архиве нет: оно скачалось бы, установилось,
  /// не изменило версию — и предложилось снова, и так без конца.
  @visibleForTesting
  static UpdateInfo? offerFor(
    Map<String, dynamic> manifest,
    String platformKey,
    String current,
  ) {
    final platform = manifest[platformKey];
    if (platform is! Map) return null;

    final latest =
        (platform['version'] ?? manifest['version'] ?? '').toString();
    if (latest.isEmpty || !isNewer(latest, current)) return null;
    final url = (platform['url'] ?? '').toString();
    final size = (platform['size'] as num?)?.toInt() ?? 0;
    final sha = (platform['sha256'] ?? '').toString().toLowerCase();
    if (!_allowedArtifact(url) ||
        size <= 0 ||
        size > _maxDownloadBytes ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(sha)) {
      return null;
    }

    return UpdateInfo(
      version: latest,
      url: url,
      notes: (manifest['notes'] ?? '') as String,
      size: size,
      sha256: sha,
    );
  }

  static bool _allowedArtifact(String value) {
    final uri = Uri.tryParse(value);
    return uri != null &&
        uri.scheme == 'https' &&
        uri.host == 'citavuk.ru' &&
        uri.query.isEmpty &&
        uri.path.startsWith('/files/') &&
        uri.pathSegments.length == 2;
  }

  /// Сравнение версий вида 1.5.10 по числам, а не по строке: иначе «1.5.10»
  /// оказывается старше «1.5.9».
  @visibleForTesting
  static bool isNewer(String candidate, String current) {
    List<int> parse(String v) => [
          for (final part in v.split(RegExp(r'[.+\-]')))
            int.tryParse(part) ?? 0,
        ];
    final a = parse(candidate);
    final b = parse(current);
    for (var i = 0; i < (a.length > b.length ? a.length : b.length); i++) {
      final x = i < a.length ? a[i] : 0;
      final y = i < b.length ? b[i] : 0;
      if (x != y) return x > y;
    }
    return false;
  }

  /// Скачивает сборку во временный каталог.
  Future<File> download(
    UpdateInfo info,
    void Function(double progress) onProgress,
  ) async {
    if (!_allowedArtifact(info.url)) {
      throw const FormatException('недопустимый адрес обновления');
    }
    final request = http.Request('GET', Uri.parse(info.url));
    final response = await _client.send(request);
    if (response.statusCode != 200) {
      throw HttpException('загрузка не удалась: ${response.statusCode}');
    }

    if (response.contentLength != null &&
        (response.contentLength! > info.size ||
            response.contentLength! > _maxDownloadBytes)) {
      throw const HttpException('размер обновления превышает допустимый');
    }
    final dir = await getTemporaryDirectory();
    final name = Uri.parse(info.url).pathSegments.last;
    final file = File('${dir.path}/$name');
    final sink = file.openWrite();
    final digestSink = _DigestSink();
    final hash = sha256.startChunkedConversion(digestSink);
    final total = response.contentLength ?? info.size;
    var received = 0;
    try {
      await for (final chunk in response.stream) {
        if (received + chunk.length > info.size ||
            received + chunk.length > _maxDownloadBytes) {
          throw const HttpException(
              'размер обновления не совпадает с манифестом');
        }
        sink.add(chunk);
        hash.add(chunk);
        received += chunk.length;
        if (total > 0) onProgress(received / total);
      }
    } finally {
      hash.close();
      await sink.close();
    }
    final actual = digestSink.value?.toString();
    if (received != info.size || actual != info.sha256) {
      try {
        await file.delete();
      } catch (_) {
        // Несовпавший файл всё равно никогда не запускается; временный файл
        // ОС при необходимости уберёт сама.
      }
      throw const FormatException('файл обновления не совпадает с манифестом');
    }
    return file;
  }

  /// Запускает установку и завершает приложение: и установщик Windows, и
  /// install.sh переписывают файлы, которые сейчас заняты.
  Future<void> install(File file) async {
    if (Platform.isWindows) {
      await Process.start(
        file.path,
        ['/SILENT', '/CLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS'],
        mode: ProcessStartMode.detached,
      );
    } else {
      await _installLinux(file);
    }
    exit(0);
  }

  Future<void> _installLinux(File archive) async {
    final dir = await getTemporaryDirectory();
    final target = Directory('${dir.path}/citavuk-update');
    if (await target.exists()) await target.delete(recursive: true);
    await target.create(recursive: true);

    final listing = await Process.run('tar', ['-tzf', archive.path]);
    if (listing.exitCode != 0) {
      throw ProcessException('tar', const [], listing.stderr.toString());
    }
    final entries = listing.stdout
        .toString()
        .split('\n')
        .where((entry) => entry.isNotEmpty);
    final roots = <String>{};
    for (final entry in entries) {
      final parts = entry.split('/').where((part) => part.isNotEmpty).toList();
      if (entry.startsWith('/') ||
          parts.isEmpty ||
          parts.any((part) => part == '..')) {
        throw const FormatException(
            'архив обновления содержит небезопасный путь');
      }
      roots.add(parts.first);
    }
    if (roots.length != 1) {
      throw const FormatException('архив обновления имеет неверную структуру');
    }

    final untar = await Process.run(
      'tar',
      [
        '--no-same-owner',
        '--no-same-permissions',
        '-xzf',
        archive.path,
        '-C',
        target.path
      ],
    );
    if (untar.exitCode != 0) {
      throw ProcessException('tar', const [], untar.stderr.toString());
    }

    final unpacked = Directory('${target.path}/${roots.single}');
    final script = '${unpacked.path}/install.sh';
    if (!await File(script).exists()) {
      throw const FormatException('в архиве нет install.sh');
    }
    final home = Platform.environment['HOME'] ?? '';

    // Установка после выхода: install.sh чистит каталог, из которого запущено
    // работающее приложение, и сразу же стартует новую сборку.
    await Process.start(
      'bash',
      [
        '-c',
        r'sleep 1; "$1" && "$2"',
        'citavuk-update',
        script,
        '$home/.local/bin/citavuk'
      ],
      mode: ProcessStartMode.detached,
    );
  }
}
