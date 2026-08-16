/// Путешествие: справочник мест и то, что в них говорят.
///
/// Формат общий с сайтом (`web/src/travel/types.ts`): файлы лежат в
/// `assets/travel/` и читаются приложением напрямую, а веб получает копию одним
/// bundle.json. Поэтому здесь только данные — ничего про карту.
///
/// Узлы разговора устроены как диалоги курса: тот же `startNodeId`, те же
/// `choices` с переходом по `next`. Второй формат означал бы второй
/// проигрыватель диалогов в одном приложении.
library;

import 'dart:convert';

import 'package:flutter/services.dart';

class TravelPhrase {
  const TravelPhrase(this.sr, this.ru);

  final String sr;
  final String ru;

  factory TravelPhrase.fromJson(Map<String, dynamic> json) => TravelPhrase(
        json['sr'] as String? ?? '',
        json['ru'] as String? ?? '',
      );
}

class PlaceKind {
  const PlaceKind({
    required this.id,
    required this.group,
    required this.sr,
    required this.ru,
    required this.icon,
    required this.rank,
    required this.osm,
    required this.omt,
  });

  final String id;

  /// `place` — заведение, `road` — дорожный объект, `basic` — нужное везде.
  final String group;
  final String sr;
  final String ru;
  final String icon;

  /// Насколько важна подпись на карте: 1 — показывать первой, 3 — вблизи.
  final int rank;

  /// Теги OSM, по которым узнаётся тип нажатого объекта.
  final List<String> osm;

  /// Подклассы векторных тайлов. Приложению они не нужны, но формат общий.
  final List<String> omt;

  factory PlaceKind.fromJson(Map<String, dynamic> json) => PlaceKind(
        id: json['id'] as String? ?? '',
        group: json['group'] as String? ?? 'place',
        sr: json['sr'] as String? ?? '',
        ru: json['ru'] as String? ?? '',
        icon: json['icon'] as String? ?? '',
        rank: (json['rank'] as num?)?.toInt() ?? 2,
        osm: ((json['osm'] as List?) ?? const []).whereType<String>().toList(),
        omt: ((json['omt'] as List?) ?? const []).whereType<String>().toList(),
      );
}

class DialogueChoice {
  const DialogueChoice({
    required this.id,
    required this.label,
    required this.next,
  });

  final String id;
  final String label;
  final String next;

  factory DialogueChoice.fromJson(Map<String, dynamic> json) => DialogueChoice(
        id: json['id'] as String? ?? '',
        label: json['label'] as String? ?? '',
        next: json['next'] as String? ?? '',
      );
}

class DialogueNode {
  const DialogueNode({
    required this.id,
    required this.speaker,
    required this.text,
    required this.choices,
    required this.end,
  });

  final String id;
  final String speaker;
  final String text;
  final List<DialogueChoice> choices;
  final bool end;

  factory DialogueNode.fromJson(Map<String, dynamic> json) => DialogueNode(
        id: json['id'] as String? ?? '',
        speaker: json['speaker'] as String? ?? '',
        text: json['text'] as String? ?? '',
        choices: ((json['choices'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) =>
                DialogueChoice.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        end: json['end'] as bool? ?? false,
      );
}

class PlaceDialogue {
  const PlaceDialogue({
    required this.participants,
    required this.startNodeId,
    required this.nodes,
  });

  final List<String> participants;
  final String startNodeId;
  final List<DialogueNode> nodes;

  DialogueNode? nodeById(String id) {
    for (final node in nodes) {
      if (node.id == id) return node;
    }
    return null;
  }

  factory PlaceDialogue.fromJson(Map<String, dynamic> json) => PlaceDialogue(
        participants:
            ((json['participants'] as List?) ?? const []).whereType<String>().toList(),
        startNodeId: json['startNodeId'] as String? ?? '',
        nodes: ((json['nodes'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => DialogueNode.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
      );
}

class PlaceContent {
  const PlaceContent({
    required this.kind,
    required this.hint,
    required this.words,
    required this.phrases,
    required this.dialogue,
  });

  final String kind;

  /// Как это устроено в Сербии: то, чего из словаря не узнать.
  final String hint;
  final List<TravelPhrase> words;
  final List<TravelPhrase> phrases;
  final PlaceDialogue? dialogue;

  factory PlaceContent.fromJson(Map<String, dynamic> json) => PlaceContent(
        kind: json['kind'] as String? ?? '',
        hint: json['hint'] as String? ?? '',
        words: ((json['words'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => TravelPhrase.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        phrases: ((json['phrases'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => TravelPhrase.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        dialogue: json['dialogue'] is Map
            ? PlaceDialogue.fromJson(
                Map<String, dynamic>.from(json['dialogue'] as Map))
            : null,
      );
}

class CityPin {
  const CityPin({
    required this.id,
    required this.sr,
    required this.ru,
    required this.kind,
    required this.lat,
    required this.lon,
  });

  final String id;
  final String sr;
  final String ru;
  final String kind;
  final double lat;
  final double lon;

  /// В файле координаты в порядке карты: долгота, потом широта.
  factory CityPin.fromJson(Map<String, dynamic> json) {
    final at = (json['at'] as List?) ?? const [];
    return CityPin(
      id: json['id'] as String? ?? '',
      sr: json['sr'] as String? ?? '',
      ru: json['ru'] as String? ?? '',
      kind: json['kind'] as String? ?? '',
      lon: at.isNotEmpty ? (at[0] as num).toDouble() : 0,
      lat: at.length > 1 ? (at[1] as num).toDouble() : 0,
    );
  }
}

class City {
  const City({
    required this.id,
    required this.sr,
    required this.ru,
    required this.lat,
    required this.lon,
    required this.zoom,
    required this.pins,
  });

  final String id;
  final String sr;
  final String ru;
  final double lat;
  final double lon;
  final double zoom;
  final List<CityPin> pins;

  factory City.fromJson(Map<String, dynamic> json) {
    final center = (json['center'] as List?) ?? const [];
    return City(
      id: json['id'] as String? ?? '',
      sr: json['sr'] as String? ?? '',
      ru: json['ru'] as String? ?? '',
      lon: center.isNotEmpty ? (center[0] as num).toDouble() : 0,
      lat: center.length > 1 ? (center[1] as num).toDouble() : 0,
      zoom: (json['zoom'] as num?)?.toDouble() ?? 15,
      pins: ((json['pins'] as List?) ?? const [])
          .whereType<Map>()
          .map((item) => CityPin.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
    );
  }
}

/// Всё Путешествие целиком: справочник, города и содержимое мест.
class TravelBundle {
  const TravelBundle({
    required this.kinds,
    required this.cities,
    required this.places,
    required this.reviewedAt,
  });

  final List<PlaceKind> kinds;
  final List<City> cities;
  final Map<String, PlaceContent> places;

  /// Когда содержимое сверяли руками: цены и расписания стареют.
  final String reviewedAt;

  PlaceKind? kindById(String id) {
    for (final kind in kinds) {
      if (kind.id == id) return kind;
    }
    return null;
  }

  PlaceContent? contentOf(String id) => places[id];
}

/// Загрузка справочника из ассетов.
///
/// Читается один раз за запуск: шестьдесят шесть файлов при каждом открытии
/// карточки — это заметная задержка на телефоне.
class TravelContent {
  TravelContent._();

  static final TravelContent instance = TravelContent._();

  TravelBundle? _bundle;
  Future<TravelBundle>? _loading;

  Future<TravelBundle> load() {
    final ready = _bundle;
    if (ready != null) return Future.value(ready);
    return _loading ??= _read().then((bundle) {
      _bundle = bundle;
      return bundle;
    }).catchError((Object error) {
      // Неудача не запоминается: иначе раздел не ожил бы и после возврата сети.
      _loading = null;
      throw error;
    });
  }

  Future<TravelBundle> _read() async {
    final kindsRaw = jsonDecode(
      await rootBundle.loadString('assets/travel/kinds.json'),
    ) as Map<String, dynamic>;
    final citiesRaw = jsonDecode(
      await rootBundle.loadString('assets/travel/cities.json'),
    ) as Map<String, dynamic>;

    final kinds = ((kindsRaw['kinds'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => PlaceKind.fromJson(Map<String, dynamic>.from(item)))
        .toList();

    final places = <String, PlaceContent>{};
    for (final kind in kinds) {
      try {
        final raw = jsonDecode(
          await rootBundle.loadString('assets/travel/places/${kind.id}.json'),
        ) as Map<String, dynamic>;
        places[kind.id] = PlaceContent.fromJson(raw);
      } catch (_) {
        // Тип без файла содержимого пропускаем: место останется на карте, но
        // без карточки — это лучше, чем пустой раздел целиком.
      }
    }

    return TravelBundle(
      kinds: kinds,
      cities: ((citiesRaw['cities'] as List?) ?? const [])
          .whereType<Map>()
          .map((item) => City.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
      places: places,
      reviewedAt: kindsRaw['contentReviewedAt'] as String? ?? '',
    );
  }
}

/// Опознание типа объекта по тегам OSM.
///
/// Правило — это «tourism=hotel» или «shop=pastry;cuisine=bakery»: условия
/// через `;` обязаны совпасть все, `*` означает «тег есть, значение любое».
/// Побеждает правило с большим числом условий: у моста через проспект есть и
/// `bridge=yes`, и `highway=primary`, и назвать его улицей — значит показать
/// слова не о том.
String? matchKind(Map<String, String> tags, List<PlaceKind> kinds) {
  String? best;
  var weight = 0;

  for (final kind in kinds) {
    for (final rule in kind.osm) {
      final parts = rule.split(';');
      var fits = true;
      for (final part in parts) {
        final pair = part.split('=');
        final key = pair.first.trim();
        final value = pair.length > 1 ? pair[1].trim() : '';
        final actual = tags[key];
        if (actual == null || (value != '*' && actual != value)) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;
      if (parts.length > weight) {
        best = kind.id;
        weight = parts.length;
      }
    }
  }
  return best;
}

const Map<String, String> _cyrillicToLatin = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'đ', 'е': 'e',
  'ж': 'ž', 'з': 'z', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj',
  'м': 'm', 'н': 'n', 'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's',
  'т': 't', 'ћ': 'ć', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'č',
  'џ': 'dž', 'ш': 'š',
};

/// Сербское хранится кириллицей, латиница получается транслитерацией.
///
/// Обратно не получается: `nj` из «конј» и «инјекција» уже не различить.
String toLatin(String text) {
  final out = StringBuffer();
  for (final char in text.split('')) {
    final lower = char.toLowerCase();
    final mapped = _cyrillicToLatin[lower];
    if (mapped == null) {
      out.write(char);
      continue;
    }
    // Регистр восстанавливается: «Њ» → «Nj», а не «nj».
    out.write(char == lower
        ? mapped
        : mapped[0].toUpperCase() + mapped.substring(1));
  }
  return out.toString();
}

/// Письмо раздела: кириллица по умолчанию.
enum TravelScript { cyrillic, latin }

String inScript(String text, TravelScript script) =>
    script == TravelScript.latin ? toLatin(text) : text;
