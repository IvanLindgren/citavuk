import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

Future<String> persistAudioBytes({
  required String accountId,
  required String id,
  required String filename,
  required Uint8List bytes,
}) async {
  final documents = await getApplicationDocumentsDirectory();
  final safeAccount = accountId.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
  final extension = p.extension(filename).toLowerCase();
  final directory =
      Directory(p.join(documents.path, 'citavuk-audio', safeAccount));
  await directory.create(recursive: true);
  final target = File(p.join(directory.path, '$id$extension'));
  await target.writeAsBytes(bytes, flush: true);
  return target.path;
}

Future<void> deleteStoredAudio(String path) async {
  if (path.isEmpty) return;
  final documents = await getApplicationDocumentsDirectory();
  final root = p.normalize(p.join(documents.path, 'citavuk-audio'));
  final target = p.normalize(p.absolute(path));
  if (!p.isWithin(root, target)) {
    throw StateError('Путь записи находится вне медиатеки Читавука.');
  }
  final file = File(target);
  if (await file.exists()) await file.delete();
}

Future<bool> storedAudioExists(String path) async =>
    path.isNotEmpty && await File(path).exists();
