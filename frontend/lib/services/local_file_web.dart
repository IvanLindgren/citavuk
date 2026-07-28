import 'dart:typed_data';

/// В браузере пути к файлам на диске нет.
Future<Uint8List?> readLocalFile(String path) async => null;
