import '../../services/api_client.dart';

class CaseGameAccess {
  const CaseGameAccess({required this.open, required this.publicFrom, required this.supporter, required this.signedIn});
  final bool open, supporter, signedIn;
  final DateTime publicFrom;
}

class CaseGameRecord {
  CaseGameRecord.fromJson(Map<String, dynamic> json)
      : scope = json['scope'] as String? ?? '',
        limitSeconds = json['limitSeconds'] as int? ?? 0,
        correct = json['correct'] as int? ?? 0,
        wrong = json['wrong'] as int? ?? 0,
        accuracy = (json['accuracy'] as num? ?? 0).toDouble(),
        createdAt = DateTime.tryParse(json['createdAt'] as String? ?? ''),
        weak = [
          for (final item in json['weak'] as List? ?? const [])
            (item as Map)['label'] as String? ?? '',
        ];

  final String scope;
  final int limitSeconds, correct, wrong;
  final double accuracy;
  final DateTime? createdAt;
  final List<String> weak;
}

/// Сервер игры на падежи: доступ, сохранение партии и история для профиля.
class CaseGameService {
  const CaseGameService(this.api);
  final ApiClient api;

  Future<CaseGameAccess> access() async {
    final json = Map<String, dynamic>.from(await api.get('/v1/games/cases/access') as Map);
    return CaseGameAccess(
      open: json['open'] == true,
      publicFrom: DateTime.tryParse(json['publicFrom'] as String? ?? '')?.toLocal() ?? DateTime(2026, 10, 12),
      supporter: json['supporter'] == true,
      signedIn: json['signedIn'] == true,
    );
  }

  /// Возвращает снимок серии, если партия её продлила.
  Future<Map<String, dynamic>?> save(Map<String, dynamic> result) async {
    final json = Map<String, dynamic>.from(await api.post('/v1/games/cases/results', result) as Map);
    final study = json['study'];
    return study is Map ? Map<String, dynamic>.from(study) : null;
  }

  Future<List<CaseGameRecord>> results() async {
    final json = Map<String, dynamic>.from(await api.get('/v1/games/cases/results') as Map);
    return [
      for (final item in json['results'] as List? ?? const [])
        CaseGameRecord.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }
}
