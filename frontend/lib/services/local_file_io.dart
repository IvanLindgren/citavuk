import 'dart:io';
import 'dart:typed_data';

Future<Uint8List?> readLocalFile(String path) async {
  final file = File(path);
  return await file.exists() ? file.readAsBytes() : null;
}
