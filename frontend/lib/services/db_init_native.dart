import 'dart:io';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Десктоп (Windows/Linux/macOS) — sqflite через FFI. Android/iOS используют
/// штатную фабрику sqflite, поэтому там ничего не делаем.
void initDatabaseFactory() {
  if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  }
}
