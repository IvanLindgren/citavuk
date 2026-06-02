import 'dart:convert';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

/// Пользовательская БД (read-write): книги, прогресс, словарь книги, карточки.
/// Отделена от словаря-лексикона (LexiconDb).
class UserDb {
  UserDb._();
  static final UserDb instance = UserDb._();
  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    final dir = await getApplicationDocumentsDirectory();
    final path = join(dir.path, 'chitavuk_user.db');
    _db = await openDatabase(
      path,
      version: 1,
      onCreate: (db, _) => _create(db),
      onOpen: _create,
    );
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
  }

  // --- Книги ---

  Future<int> insertBook(String title, String filepath, List<String> paragraphs) async {
    final db = await database;
    return db.insert('books', {
      'title': title,
      'filepath': filepath,
      'content': jsonEncode(paragraphs),
      'last_para': 0,
    });
  }

  Future<List<Map<String, dynamic>>> getBooks() async {
    final db = await database;
    return db.query('books', orderBy: 'added_at DESC');
  }

  Future<void> updateBookProgress(int bookId, int lastPara) async {
    final db = await database;
    await db.update('books', {'last_para': lastPara},
        where: 'id = ?', whereArgs: [bookId]);
  }

  Future<void> renameBook(int bookId, String title) async {
    final db = await database;
    await db.update('books', {'title': title},
        where: 'id = ?', whereArgs: [bookId]);
  }

  Future<void> setBookFolder(int bookId, String folder) async {
    final db = await database;
    await db.update('books', {'folder': folder},
        where: 'id = ?', whereArgs: [bookId]);
  }

  Future<List<String>> getFolders() async {
    final db = await database;
    final rows = await db.rawQuery(
        "SELECT DISTINCT folder FROM books WHERE folder <> '' ORDER BY folder");
    return rows.map((r) => r['folder'].toString()).toList();
  }

  Future<void> deleteBook(int bookId) async {
    final db = await database;
    await db.delete(
      'reviews',
      where: 'vocab_id IN (SELECT id FROM vocabulary WHERE book_id = ?)',
      whereArgs: [bookId],
    );
    await db.delete('books', where: 'id = ?', whereArgs: [bookId]);
    await db.delete('vocabulary', where: 'book_id = ?', whereArgs: [bookId]);
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
      where: 'book_id = ? AND LOWER(word) = ?',
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
    });
    await _ensureReview(db, id);
    return id;
  }

  Future<List<Map<String, dynamic>>> getVocabularyForBook(int bookId) async {
    final db = await database;
    return db.query('vocabulary',
        where: 'book_id = ?', whereArgs: [bookId], orderBy: 'added_at DESC');
  }

  /// Недавно добавленные слова (для приветствия на главной).
  Future<List<String>> getRecentWords(int limit) async {
    final db = await database;
    final rows = await db.query('vocabulary',
        columns: ['word'], orderBy: 'added_at DESC', limit: limit);
    return rows.map((r) => r['word'].toString()).toList();
  }

  Future<void> removeVocabulary(int id) async {
    final db = await database;
    await db.delete('reviews', where: 'vocab_id = ?', whereArgs: [id]);
    await db.delete('vocabulary', where: 'id = ?', whereArgs: [id]);
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
      'WHERE v.book_id = ? AND r.due_at <= ? ORDER BY r.due_at ASC',
      [bookId, now],
    );
  }

  Future<int> getDueCount(int bookId) async {
    final db = await database;
    final now = DateTime.now().millisecondsSinceEpoch;
    final res = await db.rawQuery(
      'SELECT COUNT(*) AS c FROM vocabulary v JOIN reviews r ON r.vocab_id = v.id '
      'WHERE v.book_id = ? AND r.due_at <= ?',
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
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}
