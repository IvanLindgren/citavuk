import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:sqflite/sqflite.dart';

import '../utils/uuid.dart';
import 'api_client.dart';
import 'palace_store.dart';
import 'auth_service.dart';
import 'user_db.dart';

/// Состояние последней синхронизации — для показа в интерфейсе.
enum SyncStatus { idle, running, done, offline, failed }

/// Синхронизация книг, словаря и карточек между устройствами.
///
/// Модель: у каждой записи есть глобальный `uuid`, время последнего изменения и
/// флаг «изменена локально». Сервер выдаёт монотонный курсор; клиент отправляет
/// накопленные изменения и забирает всё, что новее его курсора. Конфликты
/// разрешаются по времени изменения — побеждает более позднее.
///
/// Текст книг синхронизируется отдельно и по требованию: метаданные весят
/// байты, а текст — мегабайты, и тянуть его на каждое обновление списка книг
/// нельзя (это тот же инвариант, из-за которого главный экран не читает колонку
/// `content`).
class SyncService extends ChangeNotifier {
  SyncService({required this.api, required this.auth});

  final ApiClient api;
  final AuthService auth;

  SyncStatus _status = SyncStatus.idle;
  SyncStatus get status => _status;

  String _message = '';
  String get message => _message;

  DateTime? _lastSyncAt;
  DateTime? get lastSyncAt => _lastSyncAt;

  bool _running = false;

  /// Максимум записей в одной посылке. Совпадает с ограничением сервера.
  static const _pageSize = 500;

  /// Полный цикл: отправить своё, забрать чужое, докачать недостающие тексты.
  ///
  /// Возвращает true, если цикл дошёл до конца. Повторный вызов во время работы
  /// игнорируется: две одновременные синхронизации боролись бы за курсор.
  Future<bool> sync({bool uploadContent = true}) async {
    if (_running || !auth.isSignedIn) return false;
    _running = true;
    _set(SyncStatus.running, 'Синхронизация…');

    try {
      await _push();
      await _pullAll();
      if (uploadContent) await _uploadMissingContent();

      _lastSyncAt = DateTime.now();
      await _saveLastSync();
      _set(SyncStatus.done, 'Синхронизировано');
      return true;
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        await auth.handleUnauthorized();
        _set(SyncStatus.failed, 'Сессия истекла, войдите снова.');
      } else if (e.isOffline) {
        // Офлайн — обычное состояние приложения, а не сбой. Накопленные
        // изменения останутся помеченными и уйдут при следующей попытке.
        _set(SyncStatus.offline, 'Нет связи — синхронизируем позже.');
      } else {
        _set(SyncStatus.failed, e.message);
      }
      return false;
    } catch (e) {
      _set(SyncStatus.failed, 'Не удалось синхронизировать.');
      if (kDebugMode) debugPrint('sync: $e');
      return false;
    } finally {
      _running = false;
    }
  }

  void _set(SyncStatus status, String message) {
    _status = status;
    _message = message;
    notifyListeners();
  }

  // --- Отправка ---

  /// Отправляет локальные изменения страницами.
  Future<void> _push() async {
    final db = await UserDb.instance.database;

    while (true) {
      final books = await db.query('books',
          where: 'dirty = 1', orderBy: 'updated_at', limit: 150);
      final words = await db.query('vocabulary',
          where: 'dirty = 1', orderBy: 'updated_at', limit: 200);
      final reviews = await db.rawQuery(
        'SELECT r.*, v.uuid AS vocab_uuid FROM reviews r '
        "JOIN vocabulary v ON v.id = r.vocab_id "
        "WHERE r.dirty = 1 AND v.uuid <> '' ORDER BY r.updated_at LIMIT 150",
      );
      final palaces = await PalaceStore.instance.dirty(limit: 50);
      if (books.isEmpty &&
          words.isEmpty &&
          reviews.isEmpty &&
          palaces.isEmpty) {
        return;
      }

      // uuid книги нужен, чтобы связать с ним слова. Локальный id на сервере
      // бессмыслен: он свой на каждом устройстве.
      final bookUuid = <int, String>{};
      for (final row in await db.query('books', columns: ['id', 'uuid'])) {
        bookUuid[row['id'] as int] = (row['uuid'] as String?) ?? '';
      }

      final payload = {
        'books': books.map(_bookToJson).toList(),
        'vocabulary': words.map((w) => _wordToJson(w, bookUuid)).toList(),
        'reviews': reviews.map(_reviewToJson).toList(),
        'palaces': palaces.map(_palaceToJson).toList(),
      };
      await api.post('/v1/sync/push', payload);

      // Пометки снимаются только после подтверждения сервером. Снять их раньше
      // значило бы потерять изменения при обрыве связи.
      await _clearDirty(db, 'books', books);
      await _clearDirty(db, 'vocabulary', words);
      await _clearDirty(db, 'reviews', reviews, idColumn: 'vocab_id');
      await PalaceStore.instance.clearDirty(palaces);

      if (books.length < 150 &&
          words.length < 200 &&
          reviews.length < 150 &&
          palaces.length < 50) {
        return;
      }
    }
  }

  Future<void> _clearDirty(
      Database db, String table, Iterable<Map<String, Object?>> rows,
      {String idColumn = 'id'}) async {
    if (rows.isEmpty) return;
    final batch = db.batch();
    for (final row in rows) {
      // Запись могла измениться, пока запрос был в сети. Снимаем dirty только
      // у той самой версии, которую сервер уже подтвердил.
      batch.rawUpdate(
        'UPDATE $table SET dirty = 0 '
        'WHERE $idColumn = ? AND dirty = 1 AND updated_at IS ?',
        [row[idColumn], row['updated_at']],
      );
    }
    await batch.commit(noResult: true);
  }

  Map<String, dynamic> _bookToJson(Map<String, dynamic> row) => {
        'id': row['uuid'],
        'title': row['title'] ?? '',
        'folder': row['folder'] ?? '',
        'sourceKey': row['filepath'] ?? '',
        'paraCount': row['para_count'] ?? 0,
        'lastPara': row['last_para'] ?? 0,
        'contentSha': row['content_sha'] ?? '',
        'deleted': (row['deleted'] as int? ?? 0) == 1,
        'updatedAt': _iso(row['updated_at']),
      };

  Map<String, dynamic> _wordToJson(
      Map<String, dynamic> row, Map<int, String> bookUuid) {
    final localBook = row['book_id'] as int?;
    final uuid = localBook == null ? null : bookUuid[localBook];
    return {
      'id': row['uuid'],
      'bookId': (uuid != null && uuid.isNotEmpty) ? uuid : null,
      'word': row['word'] ?? '',
      'lemma': row['lemma'] ?? '',
      'pos': row['pos'] ?? '',
      'translation': row['translation'] ?? '',
      'forms': _decodeForms(row['forms']),
      'deleted': (row['deleted'] as int? ?? 0) == 1,
      'updatedAt': _iso(row['updated_at']),
    };
  }

  Map<String, dynamic> _reviewToJson(Map<String, dynamic> row) => {
        'vocabId': row['vocab_uuid'],
        'ease': (row['ease'] as num?)?.toDouble() ?? 2.5,
        'intervalDays': row['interval'] ?? 0,
        'reps': row['reps'] ?? 0,
        'dueAt': row['due_at'] ?? 0,
        'lastReviewed': row['last_reviewed'],
        'updatedAt': _iso(row['updated_at']),
      };

  Map<String, dynamic> _palaceToJson(Palace palace) => {
        'id': palace.uuid,
        'name': palace.name,
        'sceneId': palace.sceneId,
        // Сервер хранит vocabId строкой: отсутствие связи со словарём — это
        // пустая строка, а не null. Преобразование делает PalacePin.toJson.
        'pins': palace.pins.map((spot, pin) => MapEntry(spot, pin.toJson())),
        'deleted': palace.deleted,
        'updatedAt': _iso(palace.updatedAt),
      };

  Map<String, dynamic> _decodeForms(Object? raw) {
    if (raw is! String || raw.isEmpty) return {};
    try {
      final parsed = jsonDecode(raw);
      return parsed is Map ? Map<String, dynamic>.from(parsed) : {};
    } catch (_) {
      return {};
    }
  }

  String _iso(Object? millis) {
    final ms = millis is int ? millis : 0;
    final time = ms > 0
        ? DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true)
        : DateTime.now().toUtc();
    return time.toIso8601String();
  }

  // --- Приём ---

  Future<void> _pullAll() async {
    // Сервер отдаёт изменения порциями. Цикл идёт, пока сервер сообщает, что
    // остались ещё; счётчик страниц защищает от бесконечного цикла, если
    // курсор почему-то перестанет двигаться.
    for (var page = 0; page < 200; page++) {
      final cursor = await _cursor();
      final response = await api.get('/v1/sync/changes',
          query: {'since': '$cursor', 'limit': '$_pageSize'});
      if (response is! Map) return;

      await _applyChanges(response);

      final next = (response['rev'] as num?)?.toInt() ?? cursor;
      await _setCursor(next);
      if (response['hasMore'] != true) return;
      if (next <= cursor) return;
    }
  }

  Future<void> _applyChanges(Map<dynamic, dynamic> response) async {
    final db = await UserDb.instance.database;
    final books = (response['books'] as List?) ?? const [];
    final words = (response['vocabulary'] as List?) ?? const [];
    final reviews = (response['reviews'] as List?) ?? const [];
    final palaces = (response['palaces'] as List?) ?? const [];

    await db.transaction((txn) async {
      for (final item in books) {
        if (item is Map) await _applyBook(txn, item);
      }
      for (final item in words) {
        if (item is Map) await _applyWord(txn, item);
      }
      for (final item in reviews) {
        if (item is Map) await _applyReview(txn, item);
      }
    });

    // Дворцы идут вне общей транзакции: их хранилище работает со своим
    // подключением, и вкладывать его вызовы внутрь чужой транзакции значит
    // получить взаимную блокировку на sqflite.
    for (final item in palaces) {
      if (item is Map) await _applyPalace(item);
    }
  }

  /// Применяет дворец с сервера.
  Future<void> _applyPalace(Map<dynamic, dynamic> item) async {
    final uuid = item['id'] as String? ?? '';
    if (!isUuid(uuid)) return;

    final pins = <String, PalacePin>{};
    final raw = item['pins'];
    if (raw is Map) {
      raw.forEach((spot, value) {
        if (value is Map) {
          pins['$spot'] = PalacePin.fromJson(Map<String, dynamic>.from(value));
        }
      });
    }

    await PalaceStore.instance.applyRemote(Palace(
      uuid: uuid,
      name: (item['name'] as String?) ?? '',
      sceneId: (item['sceneId'] as String?) ?? '',
      pins: pins,
      updatedAt: _parseTime(item['updatedAt']),
      deleted: item['deleted'] == true,
      dirty: false,
    ));
  }

  /// Применяет книгу с сервера.
  ///
  /// Локальная запись обновляется, только если серверная версия не старше её.
  /// Иначе входящие данные затёрли бы правку, которую устройство ещё не успело
  /// отправить.
  Future<void> _applyBook(Transaction txn, Map<dynamic, dynamic> item) async {
    final uuid = item['id'] as String? ?? '';
    if (!isUuid(uuid)) return;

    final remoteAt = _parseTime(item['updatedAt']);
    final existing = await txn.query('books',
        where: 'uuid = ?', whereArgs: [uuid], limit: 1);

    final values = {
      'title': item['title'] ?? '',
      'folder': item['folder'] ?? '',
      'filepath': item['sourceKey'] ?? uuid,
      'para_count': item['paraCount'] ?? 0,
      'last_para': item['lastPara'] ?? 0,
      'content_sha': item['contentSha'] ?? '',
      'deleted': item['deleted'] == true ? 1 : 0,
      'updated_at': remoteAt,
      'dirty': 0,
    };

    if (existing.isEmpty) {
      if (item['deleted'] == true) return; // удалённой книги, которой у нас нет
      await txn.insert('books', {
        ...values,
        'uuid': uuid,
        'content': '[]',
        // Текст ещё не скачан: список книг покажет это, а читалка предложит
        // загрузить при открытии.
        'text_missing': (item['contentSha'] as String? ?? '').isEmpty ? 0 : 1,
      });
      return;
    }

    final row = existing.first;
    final localAt = row['updated_at'] as int? ?? 0;
    if (localAt > remoteAt) return;

    // Текст перекачивать нужно, только если адрес изменился.
    final localSha = (row['content_sha'] as String?) ?? '';
    final remoteSha = (item['contentSha'] as String?) ?? '';
    final textMissing = remoteSha.isNotEmpty && remoteSha != localSha;

    await txn.update(
      'books',
      {
        ...values,
        if (textMissing) 'text_missing': 1,
        if (item['deleted'] == true) 'content': '[]',
      },
      where: 'id = ?',
      whereArgs: [row['id']],
    );
  }

  Future<void> _applyWord(Transaction txn, Map<dynamic, dynamic> item) async {
    final uuid = item['id'] as String? ?? '';
    if (!isUuid(uuid)) return;

    final remoteAt = _parseTime(item['updatedAt']);
    final existing = await txn.query('vocabulary',
        where: 'uuid = ?', whereArgs: [uuid], limit: 1);

    // Слово хранится при книге. Если книга ещё не пришла, слово всё равно
    // сохраняется — с book_id = 0, и подхватится, когда книга появится.
    var bookId = 0;
    final bookUuid = item['bookId'] as String?;
    if (bookUuid != null && bookUuid.isNotEmpty) {
      final book = await txn.query('books',
          columns: ['id'], where: 'uuid = ?', whereArgs: [bookUuid], limit: 1);
      if (book.isNotEmpty) bookId = book.first['id'] as int;
    }

    final values = {
      'book_id': bookId,
      'word': item['word'] ?? '',
      'lemma': item['lemma'] ?? '',
      'pos': item['pos'] ?? '',
      'translation': item['translation'] ?? '',
      'forms': jsonEncode(item['forms'] ?? const {}),
      'deleted': item['deleted'] == true ? 1 : 0,
      'updated_at': remoteAt,
      'dirty': 0,
    };

    if (existing.isEmpty) {
      if (item['deleted'] == true) return;
      final id = await txn.insert('vocabulary', {...values, 'uuid': uuid});
      await txn.insert(
        'reviews',
        {'vocab_id': id, 'due_at': DateTime.now().millisecondsSinceEpoch},
        conflictAlgorithm: ConflictAlgorithm.ignore,
      );
      return;
    }

    final row = existing.first;
    if ((row['updated_at'] as int? ?? 0) > remoteAt) return;
    await txn
        .update('vocabulary', values, where: 'id = ?', whereArgs: [row['id']]);
  }

  Future<void> _applyReview(Transaction txn, Map<dynamic, dynamic> item) async {
    final vocabUuid = item['vocabId'] as String? ?? '';
    if (!isUuid(vocabUuid)) return;

    final word = await txn.query('vocabulary',
        columns: ['id'], where: 'uuid = ?', whereArgs: [vocabUuid], limit: 1);
    if (word.isEmpty) return; // слово ещё не пришло — придёт в следующей порции

    final vocabId = word.first['id'] as int;
    final remoteAt = _parseTime(item['updatedAt']);
    final existing = await txn.query('reviews',
        where: 'vocab_id = ?', whereArgs: [vocabId], limit: 1);
    if (existing.isNotEmpty &&
        (existing.first['updated_at'] as int? ?? 0) > remoteAt) {
      return;
    }

    await txn.insert(
      'reviews',
      {
        'vocab_id': vocabId,
        'ease': (item['ease'] as num?)?.toDouble() ?? 2.5,
        'interval': item['intervalDays'] ?? 0,
        'reps': item['reps'] ?? 0,
        'due_at': item['dueAt'] ?? 0,
        'last_reviewed': item['lastReviewed'],
        'updated_at': remoteAt,
        'dirty': 0,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  int _parseTime(Object? raw) {
    if (raw is int) return raw;
    if (raw is String) {
      final parsed = DateTime.tryParse(raw);
      if (parsed != null) return parsed.millisecondsSinceEpoch;
    }
    return 0;
  }

  // --- Тексты книг ---

  /// Выгружает тексты книг, которых ещё нет на сервере.
  Future<void> _uploadMissingContent() async {
    final db = await UserDb.instance.database;
    final rows = await db.query(
      'books',
      columns: ['id', 'uuid', 'para_count'],
      where: "deleted = 0 AND content_sha = '' AND para_count > 0",
      limit: 40,
    );
    if (rows.isEmpty) return;

    for (final row in rows) {
      final id = row['id'] as int;
      final paragraphs = await UserDb.instance.getBookContent(id);
      if (paragraphs.isEmpty) continue;

      final sha = contentSha(paragraphs);
      try {
        await api.putContent(sha, paragraphs);
      } on ApiException catch (e) {
        // Книга больше допустимого размера — помечаем адресом, чтобы не
        // пытаться выгружать её при каждой синхронизации.
        if (e.status == 413) {
          await db.update('books', {'content_sha': 'too-large'},
              where: 'id = ?', whereArgs: [id]);
          continue;
        }
        rethrow;
      }

      await db.update(
        'books',
        {
          'content_sha': sha,
          'dirty': 1,
          'updated_at': DateTime.now().millisecondsSinceEpoch,
        },
        where: 'id = ?',
        whereArgs: [id],
      );
    }
    // Новые адреса нужно донести до сервера, иначе другое устройство не узнает,
    // что текст появился.
    await _push();
  }

  /// Скачивает текст книги, пришедшей с другого устройства.
  ///
  /// Вызывается при открытии книги, а не при синхронизации: тексты весят
  /// мегабайты, и качать все сразу означало бы долгий старт и лишний трафик.
  Future<bool> downloadContent(int bookId) async {
    if (!auth.isSignedIn) return false;
    final db = await UserDb.instance.database;
    final rows = await db.query('books',
        columns: ['content_sha'],
        where: 'id = ?',
        whereArgs: [bookId],
        limit: 1);
    if (rows.isEmpty) return false;

    final sha = (rows.first['content_sha'] as String?) ?? '';
    if (sha.isEmpty || sha == 'too-large') return false;

    try {
      final response = await api.get('/v1/sync/content/$sha');
      if (response is! List) return false;
      final paragraphs = response.map((e) => e.toString()).toList();

      await db.update(
        'books',
        {
          'content': jsonEncode(paragraphs),
          'para_count': paragraphs.length,
          'text_missing': 0,
        },
        where: 'id = ?',
        whereArgs: [bookId],
      );
      return true;
    } on ApiException {
      return false;
    }
  }

  // --- Курсор ---

  Future<int> _cursor() async {
    final db = await UserDb.instance.database;
    final rows =
        await db.query('sync_state', columns: ['cursor'], where: 'id = 1');
    if (rows.isEmpty) return 0;
    return rows.first['cursor'] as int? ?? 0;
  }

  Future<void> _setCursor(int value) async {
    final db = await UserDb.instance.database;
    await db.update('sync_state', {'cursor': value}, where: 'id = 1');
  }

  Future<void> _saveLastSync() async {
    final db = await UserDb.instance.database;
    await db.update(
        'sync_state', {'last_sync_at': DateTime.now().millisecondsSinceEpoch},
        where: 'id = 1');
  }

  /// Полный сброс синхронизации: курсор обнуляется, всё локальное помечается к
  /// отправке. Нужен при смене аккаунта — иначе данные двух пользователей
  /// перемешались бы.
  Future<void> resetForNewAccount(String userId) async {
    final db = await UserDb.instance.database;
    await db.update('sync_state', {'cursor': 0, 'user_id': userId},
        where: 'id = 1');
    for (final table in ['books', 'vocabulary', 'reviews', 'palaces']) {
      await db.update(table, {'dirty': 1});
    }
    _lastSyncAt = null;
    notifyListeners();
  }

  /// Есть ли неотправленные изменения.
  Future<int> pendingCount() async {
    final db = await UserDb.instance.database;
    var total = 0;
    for (final table in ['books', 'vocabulary', 'reviews', 'palaces']) {
      final rows =
          await db.rawQuery('SELECT COUNT(*) AS c FROM $table WHERE dirty = 1');
      total += (rows.first['c'] as int?) ?? 0;
    }
    return total;
  }
}

/// Считает адрес текста книги.
///
/// Хешируется НЕ JSON, а абзацы с префиксом длины: «<байт>\n<абзац>» подряд.
/// Причина в том, что адрес считают три реализации на разных языках, а правила
/// экранирования у их сериализаторов расходятся: Go всегда экранирует U+2028 и
/// U+2029, а jsonEncode и JSON.stringify выводят их как есть. Эти символы
/// встречаются в тексте из Word, и книга с ними не выгрузилась бы вовсе —
/// сервер посчитал бы другой адрес и отверг запрос.
///
/// Длина обязательна, простого разделителя мало: любой символ-разделитель может
/// встретиться внутри абзаца, и тогда два разных набора абзацев дали бы один
/// адрес, а книги перепутались бы между собой.
///
/// Совпадение проверяется одинаковыми наборами примеров в трёх местах:
/// test/services/sync_content_test.dart, server/internal/store/content_test.go и
/// web/src/lib/content.test.ts.
String contentSha(List<String> paragraphs) {
  final canonical = <int>[];
  for (final paragraph in paragraphs) {
    final body = utf8.encode(paragraph);
    // Длина — в БАЙТАХ UTF-8, а не в символах: сервер на Go считает её так же,
    // и для кириллицы эти числа различаются вдвое.
    canonical.addAll(utf8.encode('${body.length}\n'));
    canonical.addAll(body);
  }
  return sha256.convert(canonical).toString();
}
