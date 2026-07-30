import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/public_library.dart';

/// Сетевой каталог свободных текстов.
///
/// Список содержит только метаданные. Полный текст запрашивается отдельно,
/// когда пользователь открыл конкретную карточку.
class PublicLibraryService {
  PublicLibraryService._();

  static const _catalogUrl = 'https://citavuk.ru/public-library/catalog.json';
  static List<PublicLibraryItem>? _cached;

  static Future<List<PublicLibraryItem>> loadCatalog() async {
    if (_cached != null) return _cached!;
    final response = await http
        .get(Uri.parse(_catalogUrl))
        .timeout(const Duration(seconds: 20));
    if (response.statusCode != 200) {
      throw Exception('Каталог временно недоступен');
    }
    final body = jsonDecode(utf8.decode(response.bodyBytes));
    if (body is! Map || body['items'] is! List) {
      throw Exception('Сервер вернул повреждённый каталог');
    }
    _cached = (body['items'] as List)
        .whereType<Map>()
        .map((item) =>
            PublicLibraryItem.fromJson(Map<String, dynamic>.from(item)))
        .where((item) => item.id.isNotEmpty && item.textUrl.isNotEmpty)
        .toList(growable: false);
    return _cached!;
  }

  static Future<String> loadText(PublicLibraryItem item) async {
    final response = await http
        .get(Uri.parse(item.textUrl))
        .timeout(const Duration(seconds: 45));
    if (response.statusCode != 200) {
      throw Exception('Не удалось загрузить текст');
    }
    return utf8.decode(response.bodyBytes);
  }

  static List<String> paragraphs(String text) => text
      .replaceAll('\r\n', '\n')
      .split(RegExp(r'\n\s*\n'))
      .map((part) => part.replaceAll(RegExp(r'\s*\n\s*'), ' ').trim())
      .where((part) => part.isNotEmpty)
      .toList(growable: false);
}
