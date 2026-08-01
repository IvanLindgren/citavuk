/// Тексты «Одиссеи» из ассетов приложения.
///
/// Песня грузится по требованию и остаётся в памяти: 24 песни разом — это
/// около мегабайта текста, и держать их все ради одной открытой незачем.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;

const String _dir = 'assets/events/odyssey';

@immutable
class OdysseyChapter {
  const OdysseyChapter({
    required this.number,
    required this.title,
    required this.subtitle,
    required this.paragraphs,
  });

  final int number;
  final String title;
  final String subtitle;
  final List<String> paragraphs;

  factory OdysseyChapter.fromJson(Map<String, dynamic> json) => OdysseyChapter(
        number: (json['number'] as num?)?.toInt() ?? 0,
        title: json['title'] as String? ?? '',
        subtitle: json['subtitle'] as String? ?? '',
        paragraphs: [
          for (final value in (json['paragraphs'] as List? ?? const []))
            '$value',
        ],
      );
}

@immutable
class OdysseyChapterInfo {
  const OdysseyChapterInfo({
    required this.number,
    required this.title,
    required this.subtitle,
  });

  final int number;
  final String title;
  final String subtitle;
}

@immutable
class OdysseyManifest {
  const OdysseyManifest({
    required this.source,
    required this.sourceUrl,
    required this.license,
    required this.chapters,
  });

  final String source;
  final String sourceUrl;
  final String license;
  final List<OdysseyChapterInfo> chapters;
}

class OdysseyContent {
  OdysseyContent._();

  static OdysseyManifest? _manifest;
  static final Map<int, OdysseyChapter> _cache = {};

  static Future<OdysseyManifest> manifest() async {
    final cached = _manifest;
    if (cached != null) return cached;
    final raw = await rootBundle.loadString('$_dir/manifest.json');
    final json = jsonDecode(raw) as Map<String, dynamic>;
    final loaded = OdysseyManifest(
      source: json['source'] as String? ?? '',
      sourceUrl: json['sourceUrl'] as String? ?? '',
      license: json['license'] as String? ?? '',
      chapters: [
        for (final item in (json['chapters'] as List? ?? const []))
          if (item is Map)
            OdysseyChapterInfo(
              number: (item['number'] as num?)?.toInt() ?? 0,
              title: item['title'] as String? ?? '',
              subtitle: item['subtitle'] as String? ?? '',
            ),
      ],
    );
    _manifest = loaded;
    return loaded;
  }

  /// Держим не больше трёх песен: человек листает вперёд-назад, и соседние
  /// песни стоит иметь под рукой, а вся поэма в памяти не нужна.
  static Future<OdysseyChapter> chapter(int number) async {
    final cached = _cache[number];
    if (cached != null) return cached;
    final name = number.toString().padLeft(2, '0');
    final raw = await rootBundle.loadString('$_dir/chapter-$name.json');
    final loaded =
        OdysseyChapter.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    if (_cache.length >= 3) _cache.remove(_cache.keys.first);
    _cache[number] = loaded;
    return loaded;
  }

  /// Иллюстрации к песням. Репродукции public domain, источники указаны в
  /// подписи — так же, как на сайте.
  static const Map<int, OdysseyIllustration> illustrations = {
    5: OdysseyIllustration(
      asset: '$_dir/calypso.webp',
      caption: '«Одиссей и Калипсо», Арнольд Бёклин, 1882. Public domain.',
    ),
    6: OdysseyIllustration(
      asset: '$_dir/nausicaa.webp',
      caption: '«Одиссей и Навсикая», Питер Ластман, 1619. Public domain.',
    ),
    9: OdysseyIllustration(
      asset: '$_dir/cyclops.webp',
      caption: '«Одиссей и Полифем», Арнольд Бёклин, 1896. Public domain.',
    ),
    10: OdysseyIllustration(
      asset: '$_dir/circe.webp',
      caption:
          '«Кирка подаёт чашу Одиссею», Джон Уильям Уотерхаус, 1891. Public domain.',
    ),
    12: OdysseyIllustration(
      asset: '$_dir/sirens.webp',
      caption:
          '«Одиссей и сирены», Джон Уильям Уотерхаус, 1891. Public domain.',
    ),
    19: OdysseyIllustration(
      asset: '$_dir/penelope.webp',
      caption:
          '«Пенелопа и женихи», Джон Уильям Уотерхаус, 1912. Public domain.',
    ),
    23: OdysseyIllustration(
      asset: '$_dir/return.webp',
      caption: '«Возвращение Одиссея», Пинтуриккьо, около 1509. Public domain.',
    ),
  };

  /// Обложка события и текстура награды.
  static const String coverAsset = '$_dir/sirens.webp';
  static const String helmetsAsset = '$_dir/spartan-helmets.webp';
}

@immutable
class OdysseyIllustration {
  const OdysseyIllustration({required this.asset, required this.caption});

  final String asset;
  final String caption;
}
