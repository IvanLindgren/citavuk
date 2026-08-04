import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import 'user_db.dart';

/// Дворцы памяти: хранение и развеска.
///
/// Приём древний: чтобы запомнить список, его раскладывают по предметам
/// знакомого помещения и потом «проходят» по нему мысленно. Слова чужого языка
/// ложатся на него хорошо — вспоминается не строчка из списка, а место.
///
/// Модель хранения та же, что у книг и словаря: глобальный `uuid`, время
/// изменения, флаг `dirty` и надгробие вместо стирания. Иначе устройство, у
/// которого дворец ещё есть, вернуло бы его обратно при следующей отправке, и
/// удаление никогда бы не запомнилось.
///
/// Развеска лежит одним значением JSON, а не таблицей «предмет — слово». Так же
/// устроен и сервер, и это осознанно: дворец — цельная картина, и «половина
/// расстановки с телефона, половина с компьютера» не то, что человек имел в
/// виду. Слияние идёт по времени изменения дворца целиком, как у книг.
class PalacePin {
  const PalacePin({
    required this.word,
    required this.translation,
    this.vocabId,
    this.at = 0,
  });

  /// Сербское слово на предмете.
  final String word;
  final String translation;

  /// Слово из словаря, если брали оттуда, — иначе введено руками.
  final String? vocabId;

  /// Когда слово повесили. По нему строится маршрут обхода (см. [walkOrder]).
  /// Ноль — развеска, сделанная до появления поля.
  final int at;

  Map<String, dynamic> toJson() => {
        'word': word,
        'translation': translation,
        'vocabId': vocabId ?? '',
        'at': at,
      };

  static PalacePin fromJson(Map<String, dynamic> json) {
    final vocabId = (json['vocabId'] as String?) ?? '';
    return PalacePin(
      word: (json['word'] as String?) ?? '',
      translation: (json['translation'] as String?) ?? '',
      vocabId: vocabId.isEmpty ? null : vocabId,
      at: (json['at'] as num?)?.toInt() ?? 0,
    );
  }
}

class Palace {
  Palace({
    required this.uuid,
    required this.name,
    required this.sceneId,
    required this.pins,
    required this.updatedAt,
    this.deleted = false,
    this.dirty = true,
  });

  final String uuid;
  final String name;
  final String sceneId;

  /// Ключ — идентификатор предмета сцены.
  final Map<String, PalacePin> pins;

  final int updatedAt;
  final bool deleted;
  final bool dirty;

  Palace copyWith({
    String? name,
    Map<String, PalacePin>? pins,
    int? updatedAt,
    bool? deleted,
    bool? dirty,
  }) =>
      Palace(
        uuid: uuid,
        name: name ?? this.name,
        sceneId: sceneId,
        pins: pins ?? this.pins,
        updatedAt: updatedAt ?? this.updatedAt,
        deleted: deleted ?? this.deleted,
        dirty: dirty ?? this.dirty,
      );
}

class PalaceStore {
  PalaceStore._();
  static final PalaceStore instance = PalaceStore._();

  Future<Database> get _db => UserDb.instance.database;

  Future<List<Palace>> list() async {
    final db = await _db;
    final rows = await db.query('palaces',
        where: 'deleted = 0', orderBy: 'updated_at DESC');
    return rows.map(_fromRow).toList();
  }

  Future<Palace?> byId(String uuid) async {
    final db = await _db;
    final rows =
        await db.query('palaces', where: 'uuid = ?', whereArgs: [uuid]);
    if (rows.isEmpty) return null;
    final palace = _fromRow(rows.first);
    return palace.deleted ? null : palace;
  }

  /// Сохраняет правку и помечает дворец к отправке.
  Future<void> save(Palace palace) async {
    final db = await _db;
    await db.insert(
      'palaces',
      _toRow(palace.copyWith(dirty: true)),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Оставляет надгробие: стереть запись сразу — значит получить дворец обратно
  /// с другого устройства.
  Future<void> remove(String uuid) async {
    final palace = await byId(uuid);
    if (palace == null) return;
    await save(palace.copyWith(
      pins: const {},
      deleted: true,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
    ));
  }

  Future<List<Palace>> dirty({int limit = 50}) async {
    final db = await _db;
    final rows = await db.query('palaces',
        where: 'dirty = 1', orderBy: 'updated_at', limit: limit);
    return rows.map(_fromRow).toList();
  }

  /// Снимает пометку после подтверждения сервером.
  Future<void> clearDirty(List<Palace> sent) async {
    if (sent.isEmpty) return;
    final db = await _db;
    for (final palace in sent) {
      // Дворец могли изменить снова, пока шёл запрос: тогда пометку снимать
      // нельзя, иначе правка потеряется.
      await db.update(
        'palaces',
        {'dirty': 0},
        where: 'uuid = ? AND dirty = 1 AND updated_at = ?',
        whereArgs: [palace.uuid, palace.updatedAt],
      );
    }
  }

  /// Принимает дворец с сервера. Возвращает true, если запись изменилась.
  Future<bool> applyRemote(Palace remote) async {
    final db = await _db;
    final rows =
        await db.query('palaces', where: 'uuid = ?', whereArgs: [remote.uuid]);

    if (rows.isNotEmpty) {
      final current = _fromRow(rows.first);
      if (current.updatedAt > remote.updatedAt) return false;
    } else if (remote.deleted) {
      // Удалённого дворца, которого у нас и не было, заводить незачем.
      return false;
    }

    await db.insert(
      'palaces',
      _toRow(remote.copyWith(dirty: false)),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    return true;
  }

  /// Помечает всё к отправке — при смене аккаунта.
  Future<void> markAllDirty() async {
    final db = await _db;
    await db.update('palaces', {'dirty': 1});
  }

  Map<String, dynamic> _toRow(Palace palace) => {
        'uuid': palace.uuid,
        'name': palace.name,
        'scene_id': palace.sceneId,
        'pins': jsonEncode(
          palace.pins.map((key, pin) => MapEntry(key, pin.toJson())),
        ),
        'deleted': palace.deleted ? 1 : 0,
        'updated_at': palace.updatedAt,
        'dirty': palace.dirty ? 1 : 0,
      };

  Palace _fromRow(Map<String, Object?> row) {
    final pins = <String, PalacePin>{};
    // Повреждённый JSON не должен закрывать раздел целиком: дворец без
    // развески починить можно, а дворец, роняющий экран, — нет.
    try {
      final decoded = jsonDecode((row['pins'] as String?) ?? '{}');
      if (decoded is Map) {
        decoded.forEach((key, value) {
          if (value is Map) {
            pins['$key'] = PalacePin.fromJson(Map<String, dynamic>.from(value));
          }
        });
      }
    } catch (_) {
      // Оставляем пустую развеску.
    }

    return Palace(
      uuid: (row['uuid'] as String?) ?? '',
      name: (row['name'] as String?) ?? '',
      sceneId: (row['scene_id'] as String?) ?? '',
      pins: pins,
      updatedAt: (row['updated_at'] as int?) ?? 0,
      deleted: ((row['deleted'] as int?) ?? 0) == 1,
      dirty: ((row['dirty'] as int?) ?? 0) == 1,
    );
  }
}

/// Прикрепляет слово к предмету. Пустое слово снимает прежнее.
Palace withPin(Palace palace, String spotId, PalacePin? pin) {
  final pins = Map<String, PalacePin>.from(palace.pins);
  if (pin != null && pin.word.trim().isNotEmpty) {
    pins[spotId] = PalacePin(
      word: pin.word.trim(),
      translation: pin.translation,
      vocabId: pin.vocabId,
      // Место в маршруте закрепляется за предметом при первой развеске и
      // больше не меняется. Замена слова на том же предмете — это правка
      // ошибки, а не перестройка маршрута: переносить из-за неё предмет в
      // конец обхода значило бы ломать выученную последовательность.
      at: palace.pins[spotId]?.at ??
          (pin.at != 0 ? pin.at : DateTime.now().millisecondsSinceEpoch),
    );
  } else {
    pins.remove(spotId);
  }
  return palace.copyWith(
    pins: pins,
    updatedAt: DateTime.now().millisecondsSinceEpoch,
    dirty: true,
  );
}

/// Шаг обхода дворца.
class PalaceStep {
  const PalaceStep(this.spotId, this.pin);

  final String spotId;
  final PalacePin pin;
}

/// Порядок обхода дворца — тот, в котором слова расставляли.
///
/// Маршрут обязан быть постоянным: в этом весь приём, вспоминается не слово, а
/// место и путь к нему. Перемешивать шаги здесь было бы ошибкой, хотя для
/// обычного повторения это норма.
///
/// Постоянным был и прежний порядок — порядок предметов в сцене, — но он был
/// чужим. Человек расставляет слова осознанно: сначала то, с чего начнёт, потом
/// следующее.
///
/// Развеска, сделанная до появления поля `at`, обходится по-старому и идёт
/// первой: у неё привычный порядок, и менять его задним числом нельзя — человек
/// этот маршрут уже выучил. Порядок обязан совпадать с `walkOrder` в
/// `web/src/lib/palace.ts`.
List<PalaceStep> walkOrder(Palace palace, List<String> spotIds) {
  final steps = <({PalaceStep step, int key})>[];
  for (var index = 0; index < spotIds.length; index++) {
    final pin = palace.pins[spotIds[index]];
    if (pin == null) continue;
    steps.add((
      step: PalaceStep(spotIds[index], pin),
      key: pin.at != 0 ? pin.at : index,
    ));
  }
  steps.sort((a, b) => a.key.compareTo(b.key));
  return steps.map((entry) => entry.step).toList();
}
