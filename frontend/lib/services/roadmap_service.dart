import '../models/roadmap.dart';
import 'api_client.dart';

/// Дорожная карта: карта, содержимое разделов, отметки и обсуждение.
///
/// Карта открыта всем, вход нужен только чтобы отмечать пройденное и писать
/// в обсуждение. Поэтому чтение здесь не проверяет наличие токена: гость видит
/// ту же карту, только без своего прогресса.
class RoadmapService {
  RoadmapService({required this.api});

  final ApiClient api;

  Future<RoadmapOverview> overview() async {
    final data = await api.get('/v1/roadmap');
    return RoadmapOverview.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<RoadmapSection> section(String level, String category) async {
    final data = await api.get('/v1/roadmap/$level/$category');
    return RoadmapSection.fromJson((data as Map).cast<String, dynamic>());
  }

  /// Отмечает пункт, набор упражнений или слово.
  ///
  /// [score] осмысленна только у упражнений — доля верных ответов. У пункта и
  /// слова отметка целая: они либо сделаны, либо нет.
  Future<void> mark(
    String kind,
    String id, {
    required bool done,
    double score = 1,
    String source = 'manual',
  }) async {
    await api.post('/v1/roadmap/progress', {
      'kind': kind,
      'id': id,
      'done': done,
      'score': score,
      'source': source,
    });
  }

  Future<String> setTarget(String level) async {
    final data = await api.put('/v1/roadmap/target', {'level': level});
    return ((data as Map)['target'] ?? '').toString();
  }

  Future<List<RoadmapComment>> comments(String level) async {
    final data = await api.get('/v1/roadmap/$level/comments');
    final raw = (data as Map)['comments'] as List? ?? const [];
    return [
      for (final item in raw)
        RoadmapComment.fromJson((item as Map).cast<String, dynamic>()),
    ];
  }

  Future<RoadmapComment> addComment(
    String level,
    String body, {
    String parentId = '',
  }) async {
    final data = await api.post('/v1/roadmap/$level/comments', {
      'body': body,
      'parentId': parentId,
    });
    return RoadmapComment.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<void> deleteComment(String id) =>
      api.delete('/v1/roadmap/comments/$id');
}
