import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:srbski_read/services/user_db.dart';

class _DocumentsPath extends PathProviderPlatform {
  _DocumentsPath(this.directory);
  final String directory;
  @override
  Future<String?> getApplicationDocumentsPath() async => directory;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('цитата из базы v6 сохраняется и помечается к синхронизации', () async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    final directory = await Directory.systemTemp.createTemp('citavuk-quotes-test-');
    final previous = PathProviderPlatform.instance;
    PathProviderPlatform.instance = _DocumentsPath(directory.path);
    final dbPath = path.join(directory.path, 'chitavuk_user.db');
    final old = await openDatabase(dbPath, version: 6, onCreate: (db, _) async {
      await db.execute('CREATE TABLE books (id INTEGER PRIMARY KEY, uuid TEXT NOT NULL)');
      await db.execute('CREATE TABLE reader_quotes (id INTEGER PRIMARY KEY, book_id INTEGER, page INTEGER, paragraph INTEGER, start_offset INTEGER, end_offset INTEGER, text TEXT)');
      await db.insert('books', {'id': 1, 'uuid': '00000000-0000-4000-8000-000000000987'});
      await db.insert('reader_quotes', {'book_id': 1, 'page': 2, 'paragraph': 0, 'start_offset': 3, 'end_offset': 12, 'text': 'добар дан'});
    });
    await old.close();
    try {
      final db = await UserDb.instance.database;
      final rows = await db.query('reader_quotes');
      expect(rows, hasLength(1));
      expect(rows.single['text'], 'добар дан');
      expect(rows.single['dirty'], 1);
      expect(rows.single['book_uuid'], '00000000-0000-4000-8000-000000000987');
      expect(rows.single['id'], isA<String>());
      await UserDb.instance.deleteReaderQuote(rows.single['id'] as String);
      expect(await UserDb.instance.readerQuotes(1), isEmpty);
      expect((await db.query('reader_quotes')).single['deleted'], 1);
      await db.close();
    } finally {
      PathProviderPlatform.instance = previous;
      await directory.delete(recursive: true);
    }
  });
}
