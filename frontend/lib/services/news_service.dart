import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/news.dart';
import 'analysis_repository.dart';

/// Клиент новостей: тянет ленту и статьи с бэкенда (HF Space). Парсинг RSS и
/// извлечение текста делает сервер — приложение лишь показывает результат.
class NewsService {
  NewsService._();
  static final NewsService instance = NewsService._();

  String get _base => AnalysisRepository.baseUrl;

  Future<List<NewsItem>> getNews(String topic) async {
    final uri = Uri.parse('$_base/news?topic=$topic');
    final resp = await http.get(uri).timeout(const Duration(seconds: 25));
    if (resp.statusCode != 200) {
      throw Exception('Сервер вернул ${resp.statusCode}');
    }
    final data =
        jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
    final items = (data['items'] as List?) ?? const [];
    return items
        .map((e) => NewsItem.fromJson(e as Map<String, dynamic>))
        .where((n) => n.title.isNotEmpty && n.link.isNotEmpty)
        .toList();
  }

  Future<NewsArticle> getArticle(String url) async {
    final uri = Uri.parse('$_base/article?url=${Uri.encodeComponent(url)}');
    final resp = await http.get(uri).timeout(const Duration(seconds: 35));
    if (resp.statusCode != 200) {
      throw Exception('Сервер вернул ${resp.statusCode}');
    }
    final data =
        jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
    if (data['error'] != null) {
      throw Exception('Не удалось извлечь статью');
    }
    return NewsArticle.fromJson(data);
  }

  /// URL картинки через прокси бэкенда — работает и в вебе (нет CORS).
  String? proxiedImage(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    return '$_base/img?url=${Uri.encodeComponent(raw)}';
  }
}
