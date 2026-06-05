import 'dart:typed_data';

// На вебе read-only SQLite-словарь из ассета недоступен (нет файловой системы,
// а wasm-БД не открывает произвольный .db). Поэтому здесь заглушки: офлайн-
// словарь отключён, а разбор/перевод на вебе идут через бэкенд (HF Space).
Future<String?> ensureLexiconFile(int version, String asset) async => null;

Future<bool> replaceLexiconFromBytes(int version, Uint8List bytes) async =>
    false;
