import 'dart:io';
import 'package:flutter/services.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

Future<String> _lexPath(int version) async {
  final dir = await getApplicationSupportDirectory();
  return join(dir.path, 'chitavuk_lexicon_v$version.db');
}

/// При первом запуске копирует бандл-словарь из ассета в рабочий файл и
/// возвращает путь. null — если что-то пошло не так.
Future<String?> ensureLexiconFile(int version, String asset) async {
  try {
    final path = await _lexPath(version);
    if (!await File(path).exists()) {
      final data = await rootBundle.load(asset);
      await File(path).writeAsBytes(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
        flush: true,
      );
    }
    return path;
  } catch (_) {
    return null;
  }
}

/// Заменяет рабочий файл словаря скачанными байтами: пишет во временный файл,
/// проверяет, что это валидная SQLite-БД с таблицей `lexicon`, и только тогда
/// подменяет. true при успехе.
Future<bool> replaceLexiconFromBytes(int version, Uint8List bytes) async {
  try {
    final dir = await getApplicationSupportDirectory();
    final tmp = File(join(dir.path, 'chitavuk_lexicon_dl.tmp'));
    await tmp.writeAsBytes(bytes, flush: true);

    bool valid = false;
    try {
      final test = await openReadOnlyDatabase(tmp.path);
      final rows = await test.rawQuery(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='lexicon'");
      valid = rows.isNotEmpty;
      await test.close();
    } catch (_) {
      valid = false;
    }
    if (!valid) {
      try {
        await tmp.delete();
      } catch (_) {}
      return false;
    }

    final target = File(await _lexPath(version));
    await tmp.copy(target.path);
    try {
      await tmp.delete();
    } catch (_) {}
    return true;
  } catch (_) {
    return false;
  }
}
