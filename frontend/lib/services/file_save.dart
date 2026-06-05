// Запись текстового файла — условный импорт: нативно через dart:io, на вебе
// заглушка (там FilePicker.saveFile сам инициирует скачивание).
export 'file_save_io.dart' if (dart.library.html) 'file_save_web.dart';
