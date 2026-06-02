import 'dart:io';
import 'package:flutter/services.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import '../utils/transliteration.dart';

/// Read-only словарь, поставляемый с приложением (assets/lexicon.db).
///
/// Отделён от пользовательской БД, поэтому обновление словаря не затрагивает
/// книги/прогресс/карточки. При смене содержимого assets — увеличь [_version],
/// и копия в кэше будет перезалита.
class LexiconDb {
  LexiconDb._();
  static final LexiconDb instance = LexiconDb._();

  static const _asset = 'assets/lexicon.db';
  static const _version = 3;
  Database? _db;

  Future<Database> get _database async {
    if (_db != null) return _db!;
    final dir = await getApplicationSupportDirectory();
    final path = join(dir.path, 'chitavuk_lexicon_v$_version.db');
    if (!await File(path).exists()) {
      final data = await rootBundle.load(_asset);
      await File(path).writeAsBytes(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
        flush: true,
      );
    }
    _db = await openReadOnlyDatabase(path);
    return _db!;
  }

  String _lat(String s) =>
      SerbianTransliteration.toLatin(s).trim().toLowerCase();

  /// Строки лексикона для словоформы: lemma, upos, feats, msd.
  Future<List<Map<String, dynamic>>> lookupForm(String form) async {
    try {
      final db = await _database;
      return await db.query(
        'lexicon',
        columns: ['lemma', 'upos', 'feats', 'msd'],
        where: 'form = ?',
        whereArgs: [_lat(form)],
      );
    } catch (_) {
      return [];
    }
  }

  /// Все формы леммы (для парадигм): form, upos, feats, msd.
  Future<List<Map<String, dynamic>>> getLexiconRowsForLemma(String lemma) async {
    try {
      final db = await _database;
      return await db.query(
        'lexicon',
        columns: ['form', 'upos', 'feats', 'msd'],
        where: 'lemma = ?',
        whereArgs: [_lat(lemma)],
      );
    } catch (_) {
      return [];
    }
  }

  Future<String?> getOfflineTranslation(String word, String lemma) async {
    try {
      final db = await _database;
      for (final key in {_lat(word), _lat(lemma)}) {
        final r = await db.query('dictionary',
            columns: ['translation'], where: 'word = ?', whereArgs: [key]);
        if (r.isNotEmpty) return r.first['translation'] as String;
      }
    } catch (_) {}
    return null;
  }

  /// Авто-починка слова с «закорючками»: если в слове есть символы, которые не
  /// являются буквами (битый глиф вместо сербской буквы š/č/ć/ž/đ), подставляем
  /// на их места диакритические буквы и проверяем, есть ли такая форма в словаре.
  /// Возвращает исправленную форму или null.
  Future<String?> repair(String word) async {
    final candidates = _diacriticCandidates(_lat(word));
    if (candidates.isEmpty) return null;
    try {
      final db = await _database;
      final placeholders = List.filled(candidates.length, '?').join(',');
      final rows = await db.query(
        'lexicon',
        columns: ['form'],
        where: 'form IN ($placeholders)',
        whereArgs: candidates,
        distinct: true,
      );
      if (rows.isEmpty) return null;
      final found = rows.map((r) => r['form'].toString()).toSet();
      for (final c in candidates) {
        if (found.contains(c)) return c; // первый найденный (порядок генерации)
      }
    } catch (_) {}
    return null;
  }

  static final RegExp _junk = RegExp(r'[^a-zšđžčć]');
  static const _dia = ['š', 'č', 'ć', 'ž', 'đ'];

  List<String> _diacriticCandidates(String w) {
    if (w.isEmpty) return const [];
    final junkPos = <int>[
      for (var i = 0; i < w.length; i++)
        if (_junk.hasMatch(w[i])) i
    ];
    // Чиним только слова с «закорючками», и не более 3 (иначе слишком неоднозначно).
    if (junkPos.isEmpty || junkPos.length > 3) return const [];
    var results = <String>[''];
    for (var i = 0; i < w.length; i++) {
      final opts = junkPos.contains(i) ? _dia : [w[i]];
      final next = <String>[];
      for (final pre in results) {
        for (final o in opts) {
          next.add(pre + o);
        }
      }
      if (next.length > 400) return const []; // защита от комбинаторного взрыва
      results = next;
    }
    return results.toSet().toList();
  }
}
