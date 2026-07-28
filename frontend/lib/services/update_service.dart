import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

/// Сведения о доступной сборке из `latest.json`.
class UpdateInfo {
  final String version;
  final String url;
  final String notes;
  final int size;

  const UpdateInfo({
    required this.version,
    required this.url,
    this.notes = '',
    this.size = 0,
  });
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

  static bool get supported =>
      !kIsWeb && (Platform.isWindows || Platform.isLinux);

  static String get _platformKey => Platform.isWindows ? 'windows' : 'linux';

  Future<String> currentVersion() async =>
      (await PackageInfo.fromPlatform()).version;

  /// Возвращает сведения о более новой сборке или null, если обновлять нечего.
  Future<UpdateInfo?> check() async {
    if (!supported) return null;
    final response = await _client
        .get(Uri.parse(manifestUrl))
        .timeout(const Duration(seconds: 12));
    if (response.statusCode != 200) {
      throw HttpException('сервер ответил ${response.statusCode}');
    }
    final manifest =
        jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    final platform = manifest[_platformKey] as Map<String, dynamic>?;
    if (platform == null) return null;

    final latest = (manifest['version'] ?? '') as String;
    if (!isNewer(latest, await currentVersion())) return null;

    return UpdateInfo(
      version: latest,
      url: (platform['url'] ?? '') as String,
      notes: (manifest['notes'] ?? '') as String,
      size: (platform['size'] ?? 0) as int,
    );
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
    final request = http.Request('GET', Uri.parse(info.url));
    final response = await _client.send(request);
    if (response.statusCode != 200) {
      throw HttpException('загрузка не удалась: ${response.statusCode}');
    }

    final dir = await getTemporaryDirectory();
    final name = info.url.split('/').last;
    final file = File('${dir.path}/$name');
    final sink = file.openWrite();
    final total = response.contentLength ?? info.size;
    var received = 0;
    try {
      await for (final chunk in response.stream) {
        sink.add(chunk);
        received += chunk.length;
        if (total > 0) onProgress(received / total);
      }
    } finally {
      await sink.close();
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

    final untar = await Process.run(
      'tar',
      ['-xzf', archive.path, '-C', target.path],
    );
    if (untar.exitCode != 0) {
      throw ProcessException('tar', const [], untar.stderr.toString());
    }

    final unpacked = await target
        .list()
        .where((entry) => entry is Directory)
        .cast<Directory>()
        .first;
    final script = '${unpacked.path}/install.sh';
    final home = Platform.environment['HOME'] ?? '';

    // Установка после выхода: install.sh чистит каталог, из которого запущено
    // работающее приложение, и сразу же стартует новую сборку.
    await Process.start(
      'bash',
      ['-c', 'sleep 1; "$script" && "$home/.local/bin/citavuk"'],
      mode: ProcessStartMode.detached,
    );
  }
}
