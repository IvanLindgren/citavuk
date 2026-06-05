import 'dart:io';

/// Записывает текст в файл по пути (десктоп — saveFile только выбирает путь).
Future<void> writeStringFile(String path, String content) async {
  await File(path).writeAsString(content);
}
