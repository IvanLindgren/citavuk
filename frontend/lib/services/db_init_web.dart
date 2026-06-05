import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi_web/sqflite_ffi_web.dart';

/// Веб: sqflite поверх sqlite3 wasm + IndexedDB.
///
/// Используем вариант БЕЗ веб-воркера: он надёжнее на дев-сервере
/// (`flutter run -d chrome`), где воркер/cross-origin-isolation часто не
/// настроены, и не падает с «unsupported result null». Нужен только
/// `sqlite3.wasm` в web/.
///
/// ВАЖНО: один раз выполни из папки frontend:
///   dart run sqflite_common_ffi_web:setup
/// — это положит sqlite3.wasm (и sqflite_sw.js) в web/.
void initDatabaseFactory() {
  databaseFactory = databaseFactoryFfiWebNoWebWorker;
}
