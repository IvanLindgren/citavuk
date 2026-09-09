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
  Completer<void>? _runFinished;
  Database? _runDb;
  ApiClient? _runApi;
  String? _runAccount;
  String? _runToken;
  int? _runGeneration;

  bool get _sessionCurrent =>
      auth.isSignedIn &&
      auth.account?.id == _runAccount &&
      api.token == _runToken &&
      UserDb.instance.generation == _runGeneration;

  void _checkSession() {
    if (!_sessionCurrent) throw StateError('Сессия синхронизации сменилась.');
  }

  Database get _syncDb {
    _checkSession();
    return _runDb!;
  }

  ApiClient get _syncApi {
    _checkSession();
    return _runApi!;
  }

  PalaceStore get _syncPalaces => PalaceStore.forDatabase(_syncDb);

  /// Максимум записей в одной посылке. Совпадает с ограничением сервера.
  static const _pageSize = 500;

  /// Полный цикл: отправить метаданные, разрешить конфликты, выгрузить тексты
  /// и получить итоговое состояние сервера.
  ///
  /// Возвращает true, если цикл дошёл до конца. Повторный вызов во время работы
  /// той же сессии игнорируется. Новая сессия ждёт завершения старого цикла.
  Future<bool> sync({bool uploadContent = true}) async {
    if (!auth.isSignedIn) return false;
    if (_running) {
      if (_sessionCurrent) return false;
      final account = auth.account!.id;
      final token = api.token;
      final generation = UserDb.instance.generation;
      await _runFinished!.future;
      if (!auth.isSignedIn ||
          auth.account?.id != account ||
          api.token != token ||
          UserDb.instance.generation != generation) {
        return false;
      }
      return sync(uploadContent: uploadContent);
    }
    _running = true;
    _runFinished = Completer<void>();
    _runAccount = auth.account!.id;
    _runToken = api.token!;
    _runApi = api.withSessionToken(_runToken!);

    try {
      final activation = UserDb.instance.activateAccount(_runAccount!);
      _runGeneration = UserDb.instance.generation;
      await activation;
      _checkSession();
      _runDb = await UserDb.instance.database;
      _checkSession();
      _set(SyncStatus.running, 'Синхронизация…');
      await _push();
      await _pullAll();
      if (uploadContent) {
        await _uploadMissingContent();
        // Подтверждение текста могло проиграть более свежей серверной правке.
        await _pullAll();
        final pending = await _syncDb.query('books',
            columns: ['id'],
            where: 'deleted = 0 AND content_pending = 1',
            limit: 1);
        _checkSession();
        if (pending.isNotEmpty) {
          _set(SyncStatus.idle,
              'Не все тексты отправлены. Повтори синхронизацию.');
          return false;
        }
      }

      await _saveLastSync();
      _checkSession();
      _lastSyncAt = DateTime.now();
      _set(SyncStatus.done, 'Синхронизировано');
      return true;
    } on ApiException catch (e) {
      if (!_sessionCurrent) {
        _set(SyncStatus.idle, '');
        return false;
      }
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
      if (!_sessionCurrent) {
        _set(SyncStatus.idle, '');
        return false;
      }
      _set(SyncStatus.failed, 'Не удалось синхронизировать.');
      if (kDebugMode) debugPrint('sync: $e');
      return false;
    } finally {
      _runDb = null;
      _runApi = null;
      _runAccount = null;
      _runToken = null;
      _runGeneration = null;
      _running = false;
      final finished = _runFinished;
      _runFinished = null;
      finished!.complete();
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
    final db = _syncDb;

    while (true) {
      final books = await db.query('books',
          where: 'dirty = 1', orderBy: 'updated_at', limit: 150);
      final words = await db.query('vocabulary',
          where: 'dirty = 1', orderBy: 'updated_at', limit: 200);
      final reviews = await db.rawQuery(
        'SELECT r.*, v.uuid AS vocab_uuid FROM reviews r '
        "JOIN vocabulary v ON v.id = r.vocab_id "
        "WHERE r.dirty = 1 AND v.uuid <> '' ORDER BY r.updated_at LIMIT 100",
      );
      // Общий бюджет: 150 книг + 200 слов + 100 повторений + 50 дворцов.
      final palaces = await _syncPalaces.dirty(limit: 50);
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
      await _syncApi.post('/v1/sync/push', payload);
      _checkSession();

      // Пометки снимаются только после подтверждения сервером. Снять их раньше
      // значило бы потерять изменения при обрыве связи.
      await _clearDirty(db, 'books', books);
      await _clearDirty(db, 'vocabulary', words);
      await _clearDirty(db, 'reviews', reviews, idColumn: 'vocab_id');
      await _syncPalaces.clearDirty(palaces);

      if (books.length < 150 &&
          words.length < 200 &&
          reviews.length < 100 &&
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
      final response = await _syncApi.get('/v1/sync/changes',
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
    final db = _syncDb;
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

    await _syncPalaces.applyRemote(Palace(
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
    if (row['dirty'] == 1 && localAt > remoteAt) return;
    // Push подтверждает метаданные, но не текст. Равное время — эхо нашей
    // посылки, где сервер мог оставить прежний хеш. Оно не отменяет очередь
    // локального текста; более свежая серверная правка всё ещё побеждает.
    if (row['content_pending'] == 1 && localAt >= remoteAt) return;

    // Текст перекачивать нужно, только если адрес изменился.
    final localSha = (row['content_sha'] as String?) ?? '';
    final remoteSha = (item['contentSha'] as String?) ?? '';
    final textMissing = remoteSha.isNotEmpty && remoteSha != localSha;

    await txn.update(
      'books',
      {
        ...values,
        'content_pending': 0,
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
    if (row['dirty'] == 1 && (row['updated_at'] as int? ?? 0) > remoteAt) {
      return;
    }
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
        existing.first['dirty'] == 1 &&
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
    final db = _syncDb;
    final rows = await db.query(
      'books',
      columns: ['id'],
      where: 'deleted = 0 AND content_pending = 1',
    );
    if (rows.isEmpty) return;

    for (final row in rows) {
      final id = row['id'] as int;
      // Повторяем изменившийся текст, но не держим цикл бесконечно, если
      // пользователь продолжает править книгу. Остаток сохраняется в БД.
      for (var attempt = 0; attempt < 3; attempt++) {
        _checkSession();
        final snapshots = await db.query('books',
            columns: ['content'],
            where: 'id = ? AND deleted = 0 AND content_pending = 1',
            whereArgs: [id]);
        if (snapshots.isEmpty) break;
        final rawContent = snapshots.first['content'] as String;
        final List<String> paragraphs;
        try {
          paragraphs = List<String>.from(jsonDecode(rawContent) as List);
        } catch (_) {
          // Не снимаем очередь повреждённого текста; остальные отправятся.
          break;
        }

        var sha = contentSha(paragraphs);
        try {
          await _syncApi.putContent(sha, paragraphs);
        } on ApiException catch (e) {
          if (e.status != 413) rethrow;
          sha = 'too-large';
        }
        _checkSession();

        // Подтверждение транспорта не является новой пользовательской
        // правкой: сохраняем updated_at и актуальные название/прогресс.
        // Сравнение текста защищает от запоздавшего ответа на прежнюю версию.
        final changed = await db.update(
          'books',
          {
            'content_sha': sha,
            'content_pending': 0,
            'text_missing': 0,
            'dirty': 1,
          },
          where:
              'id = ? AND deleted = 0 AND content_pending = 1 AND content = ?',
          whereArgs: [id, rawContent],
        );
        if (changed > 0) break;
      }
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
    final accountId = auth.account!.id;
    final token = api.token!;
    final generation = UserDb.instance.generation;
    final sessionApi = api.withSessionToken(token);
    bool current() =>
        auth.isSignedIn &&
        auth.account?.id == accountId &&
        api.token == token &&
        UserDb.instance.generation == generation;
    try {
      final db = await UserDb.instance.database;
      if (!current()) return false;
      final rows = await db.query('books',
          columns: ['content_sha'],
          where: 'id = ? AND deleted = 0 AND content_pending = 0',
          whereArgs: [bookId],
          limit: 1);
      if (rows.isEmpty) return false;

      final sha = (rows.first['content_sha'] as String?) ?? '';
      if (sha.isEmpty || sha == 'too-large') return false;

      if (!current()) return false;
      final response = await sessionApi.get('/v1/sync/content/$sha');
      if (!current()) return false;
      if (response is! List || response.any((e) => e is! String)) return false;
      final paragraphs = response.cast<String>();
      if (contentSha(paragraphs) != sha) return false;

      final changed = await db.update(
        'books',
        {
          'content': jsonEncode(paragraphs),
          'para_count': paragraphs.length,
          'text_missing': 0,
        },
        where:
            'id = ? AND content_sha = ? AND deleted = 0 AND content_pending = 0',
        whereArgs: [bookId, sha],
      );
      return changed > 0;
    } on ApiException {
      return false;
    } catch (_) {
      // Соединение могло закрыться при переключении аккаунта.
      if (!current()) return false;
      rethrow;
    }
  }

  // --- Курсор ---

  Future<int> _cursor() async {
    final db = _syncDb;
    final rows =
        await db.query('sync_state', columns: ['cursor'], where: 'id = 1');
    if (rows.isEmpty) return 0;
    return rows.first['cursor'] as int? ?? 0;
  }

  Future<void> _setCursor(int value) async {
    final db = _syncDb;
    await db.update('sync_state', {'cursor': value}, where: 'id = 1');
  }

  Future<void> _saveLastSync() async {
    final db = _syncDb;
    await db.update(
        'sync_state', {'last_sync_at': DateTime.now().millisecondsSinceEpoch},
        where: 'id = 1');
  }

  /// Переключает на отдельную локальную БД аккаунта и сбрасывает только её
  /// курсор. Данные другого аккаунта никогда не становятся dirty здесь.
  Future<void> resetForNewAccount(String userId) async {
    await UserDb.instance.activateAccount(userId);
    final db = await UserDb.instance.database;
    final current =
        await db.query('sync_state', columns: ['user_id'], where: 'id = 1');
    if (current.isNotEmpty && current.first['user_id'] == userId) return;
    await db.update('sync_state', {'cursor': 0, 'user_id': userId},
        where: 'id = 1');
    _lastSyncAt = null;
    notifyListeners();
  }

  /// Есть ли неотправленные изменения.
  Future<int> pendingCount() async {
    final db = await UserDb.instance.database;
    var total = 0;
    for (final table in ['books', 'vocabulary', 'reviews', 'palaces']) {
      final condition = table == 'books'
          ? 'dirty = 1 OR (deleted = 0 AND content_pending = 1)'
          : 'dirty = 1';
      final rows = await db
          .rawQuery('SELECT COUNT(*) AS c FROM $table WHERE $condition');
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
