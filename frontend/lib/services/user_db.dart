import 'dart:convert';
import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../utils/uuid.dart';

/// Пользовательская БД (read-write): книги, прогресс, словарь книги, карточки.
/// Отделена от словаря-лексикона (LexiconDb).
class UserDb {
  UserDb._();
  static final UserDb instance = UserDb._();
  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    String path;
    if (kIsWeb) {
      // Веб: имя БД (хранится в IndexedDB), файловой системы нет.
      path = 'chitavuk_user.db';
    } else {
      final dir = await getApplicationDocumentsDirectory();
      path = join(dir.path, 'chitavuk_user.db');
    }
    try {
      _db = await openDatabase(
        path,
        // Версия 2 добавила колонки синхронизации. Старые базы получают их в
        // onUpgrade; onOpen оставлен ради прежних идемпотентных миграций,
        // которые ставились до появления версионирования.
        version: 2,
        onCreate: (db, _) => _create(db),
        onUpgrade: (db, from, to) => _upgrade(db, from, to),
        onOpen: _create,
      );
    } catch (e, stack) {
      debugPrint('=== DATABASE OPEN EXCEPTION ===');
      debugPrint('Error: $e');
      debugPrint('Stack: $stack');
      rethrow;
    }
    return _db!;
  }

  Future<void> _create(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        filepath TEXT NOT NULL,
        content TEXT NOT NULL,
        last_para INTEGER DEFAULT 0,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS vocabulary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        word TEXT NOT NULL,
        lemma TEXT NOT NULL,
        pos TEXT NOT NULL,
        translation TEXT NOT NULL,
        forms TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS reviews (
        vocab_id INTEGER PRIMARY KEY,
        ease REAL NOT NULL DEFAULT 2.5,
        interval INTEGER NOT NULL DEFAULT 0,
        reps INTEGER NOT NULL DEFAULT 0,
        due_at INTEGER NOT NULL DEFAULT 0,
        last_reviewed INTEGER
      )
    ''');
    // Кэш онлайн-переводов: слова, переведённые в сети, становятся доступны
    // офлайн. Пополняет «офлайн-словарь» по мере использования приложения.
    await db.execute('''
      CREATE TABLE IF NOT EXISTS translation_cache (
        word TEXT PRIMARY KEY,
        translation TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    ''');
    // Кэш полных разборов слов (морфология + общий перевод, JSON):
    // повторный тап по слову не ходит в сеть вообще. Контекстный перевод сюда
    // не пишется (зависит от предложения).
    await db.execute('''
      CREATE TABLE IF NOT EXISTS analysis_cache (
        word TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    ''');
    await db.execute('''
      INSERT INTO reviews (vocab_id, due_at)
      SELECT id, 0 FROM vocabulary
      WHERE id NOT IN (SELECT vocab_id FROM reviews)
    ''');
    // Миграция: папка-коллекция для книги (для старых баз).
    try {
      await db.execute(
          "ALTER TABLE books ADD COLUMN folder TEXT NOT NULL DEFAULT ''");
    } catch (_) {
      // колонка уже есть
    }
    // Миграция: число абзацев книги. Нужно, чтобы список книг на главной НЕ
    // тянул в память тяжёлую колонку content (полный текст КАЖДОЙ книги). ALTER
    // выбросит исключение, если колонка уже есть, — тогда разовый бэкфилл ниже
    // не выполняется (он нужен только один раз, при добавлении колонки).
    try {
      await db.execute(
          'ALTER TABLE books ADD COLUMN para_count INTEGER NOT NULL DEFAULT 0');
      // Разовый бэкфилл para_count для существующих книг: читаем content
      // построчно (не держим всё в памяти разом) и записываем длину.
      final rows = await db.query('books', columns: ['id', 'content']);
      for (final r in rows) {
        var count = 0;
        try {
          count = (jsonDecode(r['content'] as String) as List).length;
        } catch (_) {}
        await db.update('books', {'para_count': count},
            where: 'id = ?', whereArgs: [r['id']]);
      }
    } catch (_) {
      // колонка уже есть — бэкфилл не нужен
    }
    await _createSyncColumns(db);
  }

  Future<void> _upgrade(Database db, int from, int to) async {
    if (from < 2) await _createSyncColumns(db);
  }

  /// Колонки, нужные для синхронизации между устройствами.
  ///
  /// `uuid` — глобальный идентификатор записи. Локальный `id` для этого не
  /// годится: он выдаётся автоинкрементом, и на двух устройствах одна и та же
  /// книга получила бы разные id, а разные книги — одинаковые.
  ///
  /// `deleted` — надгробие. Обычное удаление строки не синхронизируется: другое
  /// устройство просто не узнает, что запись исчезла, и вернёт её обратно при
  /// следующей отправке.
  ///
  /// `dirty` — запись изменена локально и ждёт отправки. Позволяет работать без
  /// сети сколько угодно и отправить накопленное разом.
  Future<void> _createSyncColumns(Database db) async {
    Future<void> addColumn(String table, String definition) async {
      try {
        await db.execute('ALTER TABLE $table ADD COLUMN $definition');
      } catch (_) {
        // Колонка уже есть. SQLite не умеет ADD COLUMN IF NOT EXISTS, поэтому
        // единственный переносимый способ — попытаться и не заметить отказ.
      }
    }

    for (final table in ['books', 'vocabulary']) {
      await addColumn(table, "uuid TEXT NOT NULL DEFAULT ''");
      await addColumn(table, 'updated_at INTEGER NOT NULL DEFAULT 0');
      await addColumn(table, 'dirty INTEGER NOT NULL DEFAULT 1');
      await addColumn(table, 'deleted INTEGER NOT NULL DEFAULT 0');
    }
    await addColumn('books', "content_sha TEXT NOT NULL DEFAULT ''");
    // Книга, метаданные которой пришли с сервера, а текст ещё не скачан.
    await addColumn('books', 'text_missing INTEGER NOT NULL DEFAULT 0');
    await addColumn('reviews', 'updated_at INTEGER NOT NULL DEFAULT 0');
    await addColumn('reviews', 'dirty INTEGER NOT NULL DEFAULT 1');

    await db.execute('''
      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cursor INTEGER NOT NULL DEFAULT 0,
        user_id TEXT NOT NULL DEFAULT '',
        last_sync_at INTEGER NOT NULL DEFAULT 0
      )
    ''');
    await db
        .execute('INSERT OR IGNORE INTO sync_state (id, cursor) VALUES (1, 0)');

    // Уже существующие записи получают uuid и время. Без этого первая же
    // отправка ушла бы с пустыми идентификаторами и сервер отверг бы её.
    await _backfillUuids(db);

    await db
        .execute('CREATE INDEX IF NOT EXISTS books_uuid_idx ON books (uuid)');
    await db.execute(
        'CREATE INDEX IF NOT EXISTS vocabulary_uuid_idx ON vocabulary (uuid)');
  }

  /// Проставляет uuid и updated_at записям, созданным до появления синхронизации.
  Future<void> _backfillUuids(Database db) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final table in ['books', 'vocabulary']) {
      final rows = await db.query(table,
          columns: ['id'], where: "uuid = '' OR uuid IS NULL");
      for (final row in rows) {
        await db.update(
          table,
          {'uuid': newUuid(), 'updated_at': now, 'dirty': 1},
          where: 'id = ?',
          whereArgs: [row['id']],
        );
      }
    }
    await db.update('reviews', {'updated_at': now, 'dirty': 1},
        where: 'updated_at = 0');
  }

  // --- Книги ---

  Future<int> insertBook(
      String title, String filepath, List<String> paragraphs) async {
    final db = await database;
    return db.insert('books', {
      'title': title,
      'filepath': filepath,
      'content': jsonEncode(paragraphs),
      'para_count': paragraphs.length,
      'last_para': 0,
      'uuid': newUuid(),
      'updated_at': DateTime.now().millisecondsSinceEpoch,
      'dirty': 1,
    });
  }

  /// Помечает книгу изменённой, чтобы синхронизация отправила её на сервер.
  ///
  /// Время ставится клиентом и служит для разрешения конфликтов между
  /// устройствами по правилу «побеждает более позднее изменение».
  Future<void> _touchBook(Database db, int bookId) async {
    await db.update(
      'books',
      {'updated_at': DateTime.now().millisecondsSinceEpoch, 'dirty': 1},
      where: 'id = ?',
      whereArgs: [bookId],
    );
  }

  /// Список книг для главной — БЕЗ колонки content (полный текст). Иначе на вебе
  /// при каждом заходе в память браузера тянется текст ВСЕХ книг сразу. Контент
  /// грузим по требованию при открытии книги — см. [getBookContent].
  Future<List<Map<String, dynamic>>> getBooks() async {
    final db = await database;
    return db.query('books',
        columns: [
          'id',
          'title',
          'filepath',
          'last_para',
          'folder',
          'para_count',
          'added_at',
          // Книга пришла с другого устройства, а её текст ещё не скачан.
          'text_missing',
        ],
        // Удалённые книги остаются в базе надгробиями, пока их не заберёт
        // синхронизация, но показывать их нельзя.
        where: 'deleted = 0',
        orderBy: 'added_at DESC');
  }

  /// Текст книги (список абзацев) — грузится только когда книгу открывают.
  Future<List<String>> getBookContent(int bookId) async {
    final db = await database;
    final rows = await db.query('books',
        columns: ['content'], where: 'id = ?', whereArgs: [bookId], limit: 1);
    if (rows.isEmpty) return [];
    try {
      return List<String>.from(jsonDecode(rows.first['content'] as String));
    } catch (_) {
      return [];
    }
  }

  Future<void> updateBookProgress(int bookId, int lastPara) async {
    final db = await database;
    await db.update('books', {'last_para': lastPara},
        where: 'id = ?', whereArgs: [bookId]);
    await _touchBook(db, bookId);
  }

  /// Заменяет текст книги новым разбором. Позиция чтения сбрасывается: после
  /// переразбора абзацы делятся иначе, и прежний номер указывал бы не туда.
  Future<void> replaceBookContent(int bookId, List<String> paragraphs) async {
    final db = await database;
    await db.update(
      'books',
      {
        'content': jsonEncode(paragraphs),
        'para_count': paragraphs.length,
        'last_para': 0,
        'text_missing': 0,
      },
      where: 'id = ?',
      whereArgs: [bookId],
    );
    await _touchBook(db, bookId);
  }

  Future<void> renameBook(int bookId, String title) async {
    final db = await database;
    await db.update('books', {'title': title},
        where: 'id = ?', whereArgs: [bookId]);
    await _touchBook(db, bookId);
  }

  Future<void> setBookFolder(int bookId, String folder) async {
    final db = await database;
    await db.update('books', {'folder': folder},
        where: 'id = ?', whereArgs: [bookId]);
    await _touchBook(db, bookId);
  }

  Future<List<String>> getFolders() async {
    final db = await database;
    final rows = await db.rawQuery(
        "SELECT DISTINCT folder FROM books WHERE folder <> '' AND deleted = 0 "
        'ORDER BY folder');
    return rows.map((r) => r['folder'].toString()).toList();
  }

  /// Удаляет книгу вместе со словами и карточками.
  ///
  /// Строки не стираются, а помечаются надгробием: иначе другое устройство,
  /// у которого книга ещё есть, при следующей синхронизации отправит её обратно
  /// и удаление «не запомнится». Тяжёлый текст при этом освобождается сразу —
  /// надгробие занимает считаные байты.
  Future<void> deleteBook(int bookId) async {
    final db = await database;
    final now = DateTime.now().millisecondsSinceEpoch;

    await db.rawUpdate(
      'UPDATE reviews SET dirty = 1, updated_at = ? '
      'WHERE vocab_id IN (SELECT id FROM vocabulary WHERE book_id = ?)',
      [now, bookId],
    );
    await db.update(
      'vocabulary',
      {'deleted': 1, 'dirty': 1, 'updated_at': now},
      where: 'book_id = ?',
      whereArgs: [bookId],
    );
    await db.update(
      'books',
      {'deleted': 1, 'dirty': 1, 'updated_at': now, 'content': '[]'},
      where: 'id = ?',
      whereArgs: [bookId],
    );
  }

  // --- Словарь книги ---

  Future<int> addVocabulary({
    required int bookId,
    required String word,
    required String lemma,
    required String pos,
    required String translation,
    required Map<String, dynamic> forms,
  }) async {
    final db = await database;
    final existing = await db.query(
      'vocabulary',
      where: 'book_id = ? AND LOWER(word) = ? AND deleted = 0',
      whereArgs: [bookId, word.toLowerCase().trim()],
    );
    if (existing.isNotEmpty) {
      final id = existing.first['id'] as int;
      await _ensureReview(db, id);
      return id;
    }
    final id = await db.insert('vocabulary', {
      'book_id': bookId,
      'word': word,
      'lemma': lemma,
      'pos': pos,
      'translation': translation,
      'forms': jsonEncode(forms),
      'uuid': newUuid(),
      'updated_at': DateTime.now().millisecondsSinceEpoch,
      'dirty': 1,
    });
    await _ensureReview(db, id);
    return id;
  }

  Future<List<Map<String, dynamic>>> getVocabularyForBook(int bookId) async {
    final db = await database;
    return db.query('vocabulary',
        where: 'book_id = ? AND deleted = 0',
        whereArgs: [bookId],
        orderBy: 'added_at DESC');
  }

  /// Все слова из всех книг (для экспорта в Markdown).
  Future<List<Map<String, dynamic>>> getAllVocabulary() async {
    final db = await database;
    return db.query('vocabulary',
        where: 'deleted = 0', orderBy: 'added_at DESC');
  }

  /// Все слова вместе с названием книги, из которой они взяты.
  Future<List<Map<String, dynamic>>> getVocabularyWithBooks() async {
    final db = await database;
    return db.rawQuery('''
      SELECT v.*, b.title AS book_title
      FROM vocabulary v
      LEFT JOIN books b ON b.id = v.book_id
      WHERE v.deleted = 0
      ORDER BY v.added_at DESC
    ''');
  }

  // --- Кэш онлайн-переводов (офлайн-доступ к уже переведённым словам) ---

  Future<void> cacheTranslation(String word, String translation) async {
    final w = word.trim().toLowerCase();
    if (w.isEmpty || translation.trim().isEmpty) return;
    try {
      final db = await database;
      await db.insert(
        'translation_cache',
        {'word': w, 'translation': translation.trim()},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    } catch (_) {}
  }

  Future<String?> getCachedTranslation(String word) async {
    final w = word.trim().toLowerCase();
    if (w.isEmpty) return null;
    try {
      final db = await database;
      final r = await db.query('translation_cache',
          columns: ['translation'],
          where: 'word = ?',
          whereArgs: [w],
          limit: 1);
      if (r.isNotEmpty) return r.first['translation'] as String;
    } catch (_) {}
    return null;
  }

  // --- Кэш разборов слов (морфология + общий перевод) ---

  Future<void> cacheAnalysis(String word, String json) async {
    final w = word.trim().toLowerCase();
    if (w.isEmpty || json.isEmpty) return;
    try {
      final db = await database;
      await db.insert(
        'analysis_cache',
        {'word': w, 'json': json},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    } catch (_) {}
  }

  Future<String?> getCachedAnalysis(String word) async {
    final w = word.trim().toLowerCase();
    if (w.isEmpty) return null;
    try {
      final db = await database;
      final r = await db.query('analysis_cache',
          columns: ['json'], where: 'word = ?', whereArgs: [w], limit: 1);
      if (r.isNotEmpty) return r.first['json'] as String;
    } catch (_) {}
    return null;
  }

  Future<int> cachedTranslationCount() async {
    try {
      final db = await database;
      final r =
          await db.rawQuery('SELECT COUNT(*) AS c FROM translation_cache');
      return (r.first['c'] as int?) ?? 0;
    } catch (_) {
      return 0;
    }
  }

  /// Вставляет/обновляет книгу по уникальному [filepath] (например, ссылке на
  /// новость) — без дублей при повторном открытии. Возвращает id.
  Future<int> upsertBook(
    String title,
    String filepath,
    List<String> paragraphs, {
    String folder = '',
  }) async {
    final db = await database;
    final existing = await db.query('books',
        where: 'filepath = ? AND deleted = 0', whereArgs: [filepath], limit: 1);
    if (existing.isNotEmpty) {
      final id = existing.first['id'] as int;
      await db.update(
        'books',
        {
          'title': title,
          'content': jsonEncode(paragraphs),
          'para_count': paragraphs.length,
          if (folder.isNotEmpty) 'folder': folder,
        },
        where: 'id = ?',
        whereArgs: [id],
      );
      await _touchBook(db, id);
      return id;
    }
    final id = await db.insert('books', {
      'title': title,
      'filepath': filepath,
      'content': jsonEncode(paragraphs),
      'para_count': paragraphs.length,
      'last_para': 0,
      'uuid': newUuid(),
      'updated_at': DateTime.now().millisecondsSinceEpoch,
      'dirty': 1,
    });
    if (folder.isNotEmpty) await setBookFolder(id, folder);
    return id;
  }

  /// Находит книгу с таким названием или создаёт пустую (приёмник для импорта
  /// карточек из .md). Возвращает её id.
  Future<int> ensureBook(String title) async {
    final db = await database;
    final existing = await db.query('books',
        where: 'title = ? AND deleted = 0', whereArgs: [title], limit: 1);
    if (existing.isNotEmpty) return existing.first['id'] as int;
    return db.insert('books', {
      'title': title,
      'filepath': title,
      'content': jsonEncode(<String>[]),
      'para_count': 0,
      'last_para': 0,
      'uuid': newUuid(),
      'updated_at': DateTime.now().millisecondsSinceEpoch,
      'dirty': 1,
    });
  }

  /// Недавно добавленные слова (для приветствия на главной).
  Future<List<String>> getRecentWords(int limit) async {
    final db = await database;
    final rows = await db.query('vocabulary',
        columns: ['word'],
        where: 'deleted = 0',
        orderBy: 'added_at DESC',
        limit: limit);
    return rows.map((r) => r['word'].toString()).toList();
  }

  /// Убирает слово из словаря книги.
  ///
  /// Как и книга, слово помечается надгробием, а не стирается: иначе другое
  /// устройство вернуло бы его при следующей синхронизации.
  Future<void> removeVocabulary(int id) async {
    final db = await database;
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.update('reviews', {'dirty': 1, 'updated_at': now},
        where: 'vocab_id = ?', whereArgs: [id]);
    await db.update('vocabulary', {'deleted': 1, 'dirty': 1, 'updated_at': now},
        where: 'id = ?', whereArgs: [id]);
  }

  // --- Карточки (SRS) ---

  Future<void> _ensureReview(Database db, int vocabId) async {
    await db.insert(
      'reviews',
      {'vocab_id': vocabId, 'due_at': DateTime.now().millisecondsSinceEpoch},
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );
  }

  Future<List<Map<String, dynamic>>> getDueCards(int bookId) async {
    final db = await database;
    final now = DateTime.now().millisecondsSinceEpoch;
    return db.rawQuery(
      'SELECT v.*, r.ease AS ease, r.reps AS reps FROM vocabulary v '
      'JOIN reviews r ON r.vocab_id = v.id '
      'WHERE v.book_id = ? AND v.deleted = 0 AND r.due_at <= ? '
      'ORDER BY r.due_at ASC',
      [bookId, now],
    );
  }

  Future<int> getDueCount(int bookId) async {
    final db = await database;
    final now = DateTime.now().millisecondsSinceEpoch;
    final res = await db.rawQuery(
      'SELECT COUNT(*) AS c FROM vocabulary v JOIN reviews r ON r.vocab_id = v.id '
      'WHERE v.book_id = ? AND v.deleted = 0 AND r.due_at <= ?',
      [bookId, now],
    );
    return (res.first['c'] as int?) ?? 0;
  }

  /// SM-2 lite. grade: 0 — снова, 1 — хорошо, 2 — легко.
  Future<void> gradeCard(int vocabId, int grade) async {
    final db = await database;
    final now = DateTime.now().millisecondsSinceEpoch;
    const dayMs = 86400000;

    final rows =
        await db.query('reviews', where: 'vocab_id = ?', whereArgs: [vocabId]);
    var ease = rows.isNotEmpty ? (rows.first['ease'] as num).toDouble() : 2.5;
    var interval = rows.isNotEmpty ? (rows.first['interval'] as int) : 0;
    var reps = rows.isNotEmpty ? (rows.first['reps'] as int) : 0;

    int dueAt;
    if (grade <= 0) {
      reps = 0;
      interval = 0;
      ease = (ease - 0.2).clamp(1.3, 3.0);
      dueAt = now + 10 * 60 * 1000;
    } else {
      reps += 1;
      if (reps == 1) {
        interval = 1;
      } else if (reps == 2) {
        interval = 3;
      } else {
        interval = (interval * ease).round();
      }
      if (grade >= 2) {
        ease = (ease + 0.15).clamp(1.3, 3.0);
        interval = (interval * 1.3).round();
      }
      if (interval < 1) interval = 1;
      dueAt = now + interval * dayMs;
    }

    await db.insert(
      'reviews',
      {
        'vocab_id': vocabId,
        'ease': ease,
        'interval': interval,
        'reps': reps,
        'due_at': dueAt,
        'last_reviewed': now,
        'updated_at': now,
        'dirty': 1,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}
