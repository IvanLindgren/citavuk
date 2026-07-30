import 'api_client.dart';

class BookShare {
  const BookShare({required this.token, required this.title});

  final String token;
  final String title;

  String get url => 'https://citavuk.ru/shared/$token';

  factory BookShare.fromJson(Map<dynamic, dynamic> json) => BookShare(
        token: json['token'] as String? ?? '',
        title: json['title'] as String? ?? '',
      );
}

class BookComment {
  const BookComment({
    required this.id,
    required this.author,
    required this.body,
    required this.createdAt,
    required this.mine,
  });

  final String id;
  final String author;
  final String body;
  final DateTime createdAt;
  final bool mine;

  factory BookComment.fromJson(Map<dynamic, dynamic> json) => BookComment(
        id: json['id'] as String? ?? '',
        author: json['author'] as String? ?? 'Читатель',
        body: json['body'] as String? ?? '',
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
        mine: json['mine'] == true,
      );
}

class ShareService {
  ShareService(this.api);

  final ApiClient api;

  Future<BookShare> create({
    required String contentSha,
    required String title,
    required int paragraphs,
  }) async {
    final result = await api.post('/v1/share/books', {
      'contentSha': contentSha,
      'title': title,
      'paragraphs': paragraphs,
    });
    return BookShare.fromJson(result as Map);
  }

  Future<List<BookComment>> comments(String token, int paragraph) async {
    final result = await api.get(
      '/v1/share/books/$token/comments',
      query: {'paragraph': '$paragraph'},
    );
    final items = (result as Map?)?['items'] as List? ?? const [];
    return items
        .whereType<Map>()
        .map(BookComment.fromJson)
        .toList(growable: false);
  }

  Future<BookComment> addComment(
      String token, int paragraph, String body) async {
    final result = await api.post('/v1/share/books/$token/comments', {
      'paragraph': paragraph,
      'body': body,
    });
    return BookComment.fromJson(result as Map);
  }

  Future<void> deleteComment(String id) => api.delete('/v1/share/comments/$id');
}
