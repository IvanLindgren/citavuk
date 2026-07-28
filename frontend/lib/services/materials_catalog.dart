import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;

/// Каталог материалов для поступления.
///
/// Тот же файл, что и на сайте: его кладёт в ассеты общий сборщик
/// `web/scripts/build-materials.py`. Две копии, собранные по-разному, однажды
/// разъедутся и покажут людям разное, поэтому источник строго один.
///
/// Сами документы у нас не хранятся — только описания и ссылки на сайт
/// учреждения. Скачивание идёт по явному нажатию через прокси сервера.
@immutable
class MaterialDocument {
  const MaterialDocument({
    required this.id,
    required this.title,
    required this.subjectId,
    required this.subject,
    required this.track,
    required this.year,
    required this.kindId,
    required this.kind,
    required this.level,
    required this.levelTitle,
    required this.bytes,
    required this.url,
    required this.publisher,
    required this.publisherShort,
    required this.sourcePage,
  });

  factory MaterialDocument.fromJson(Map<String, dynamic> json) =>
      MaterialDocument(
        id: json['id'] as String? ?? '',
        title: json['title'] as String? ?? '',
        subjectId: json['subjectId'] as String? ?? '',
        subject: json['subject'] as String? ?? '',
        track: json['track'] as String?,
        year: (json['year'] as num?)?.toInt(),
        kindId: json['kindId'] as String? ?? 'test',
        kind: json['kind'] as String? ?? 'Тест',
        level: json['level'] as String? ?? 'gimnazija',
        levelTitle: json['levelTitle'] as String? ?? '',
        bytes: (json['bytes'] as num?)?.toInt() ?? 0,
        url: json['url'] as String? ?? '',
        publisher: json['publisher'] as String? ?? '',
        publisherShort: json['publisherShort'] as String? ?? '',
        sourcePage: json['sourcePage'] as String? ?? '',
      );

  final String id;
  final String title;
  final String subjectId;
  final String subject;

  /// Направление приёма: филологическая гимназия, двуязычные отделения и т. д.
  final String? track;

  /// У пособий без привязки к конкретному экзамену года нет.
  final int? year;

  /// test | key | guide | book
  final String kindId;
  final String kind;

  /// gimnazija | fakultet
  final String level;
  final String levelTitle;

  final int bytes;
  final String url;
  final String publisher;
  final String publisherShort;
  final String sourcePage;

  /// Человекочитаемый размер: «1,2 МБ».
  String get sizeLabel {
    if (bytes <= 0) return '';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} КБ';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1).replaceAll('.', ',')} МБ';
  }
}

@immutable
class MaterialGroup {
  const MaterialGroup({
    required this.id,
    required this.title,
    required this.count,
  });

  final String id;
  final String title;
  final int count;
}

/// Разобранный каталог. Читается из ассетов один раз за запуск.
class MaterialsCatalog {
  MaterialsCatalog._({
    required this.levels,
    required this.subjects,
    required this.documents,
    required this.sources,
  });

  static const _assetPath = 'assets/materials/catalog.json';
  static Future<MaterialsCatalog>? _loading;

  final List<MaterialGroup> levels;
  final List<MaterialGroup> subjects;
  final List<MaterialGroup> sources;
  final List<MaterialDocument> documents;

  /// Годы, за которые есть материалы, — от новых к старым.
  late final List<int> years = () {
    final all = documents
        .map((d) => d.year)
        .whereType<int>()
        .toSet()
        .toList(growable: false)
      ..sort((a, b) => b.compareTo(a));
    return all;
  }();

  static Future<MaterialsCatalog> load() {
    return _loading ??= _read().catchError((Object error) {
      // Иначе первая же неудача (например, ассет не собран) залипнет навсегда.
      _loading = null;
      throw error;
    });
  }

  static Future<MaterialsCatalog> _read() async {
    final raw = await rootBundle.loadString(_assetPath);
    final json = jsonDecode(raw) as Map<String, dynamic>;

    List<MaterialGroup> groups(String key, String titleKey) => [
          for (final item in (json[key] as List? ?? const []))
            MaterialGroup(
              id: (item as Map<String, dynamic>)['id'] as String? ?? '',
              title: item[titleKey] as String? ?? '',
              count: (item['count'] as num?)?.toInt() ?? 0,
            ),
        ];

    return MaterialsCatalog._(
      levels: groups('levels', 'title'),
      subjects: groups('subjects', 'title'),
      sources: groups('sources', 'publisher'),
      documents: [
        for (final item in (json['documents'] as List? ?? const []))
          MaterialDocument.fromJson(item as Map<String, dynamic>),
      ],
    );
  }

  /// Предметы, которые встречаются при выбранном уровне.
  ///
  /// Показывать «Химия 69» и находить ноль документов, потому что выбрана
  /// гимназия, — способ убедить человека, что фильтр сломан.
  List<MaterialGroup> subjectsFor(String? level) {
    if (level == null) return subjects;

    final counts = <String, int>{};
    for (final document in documents) {
      if (document.level != level) continue;
      counts.update(document.subjectId, (n) => n + 1, ifAbsent: () => 1);
    }
    return [
      for (final subject in subjects)
        if (counts.containsKey(subject.id))
          MaterialGroup(
            id: subject.id,
            title: subject.title,
            count: counts[subject.id]!,
          ),
    ]..sort((a, b) => b.count.compareTo(a.count));
  }

  List<MaterialDocument> filter({
    String? level,
    String? subjectId,
    int? year,
    String? kindId,
    String query = '',
  }) {
    final needle = query.trim().toLowerCase();

    return [
      for (final document in documents)
        if ((level == null || document.level == level) &&
            (subjectId == null || document.subjectId == subjectId) &&
            (year == null || document.year == year) &&
            (kindId == null || document.kindId == kindId) &&
            (needle.isEmpty ||
                document.title.toLowerCase().contains(needle) ||
                document.kind.toLowerCase().contains(needle) ||
                document.publisher.toLowerCase().contains(needle)))
          document,
    ];
  }
}
