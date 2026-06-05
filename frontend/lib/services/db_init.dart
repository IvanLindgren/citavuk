// Кросс-платформенная инициализация фабрики sqflite.
//
// Условный импорт: на вебе подключается db_init_web.dart (sqlite3 wasm +
// IndexedDB), на остальном — db_init_native.dart (ffi на десктопе). Так
// веб-зависимости не попадают в нативную сборку и наоборот.
import 'db_init_native.dart'
    if (dart.library.html) 'db_init_web.dart' as impl;

void initDatabaseFactory() => impl.initDatabaseFactory();
