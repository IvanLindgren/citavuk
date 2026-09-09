import '../models/personal_lesson.dart';
import 'api_client.dart';
import 'study_service.dart';

/// Экран получает снимок сессии: ответ старого аккаунта не попадёт в новый.
class PersonalService {
  PersonalService(ApiClient api) : _api = api.withSessionToken(api.token ?? '');
  final ApiClient _api;
  Future<PersonalPlan> plan(String id) async => PersonalPlan.fromJson(
      Map<String, dynamic>.from(await _api.get(_path(id)) as Map));
  String _path(String id, [int? day]) =>
      '/v1/personal/${Uri.encodeComponent(id)}${day == null ? '' : '/days/$day'}';
  Future<PersonalState> load() async => PersonalState.fromJson(
      Map<String, dynamic>.from(await _api.get('/v1/personal') as Map));
  Future<void> create(
      String level, String zone, Map<String, String> answers) async {
    await _api.post(
        '/v1/personal', {'level': level, 'timezone': zone, 'answers': answers});
  }

  Future<PersonalLesson> lesson(String id, int day) async =>
      PersonalLesson.fromJson(
          Map<String, dynamic>.from(await _api.get(_path(id, day)) as Map));
  Future<void> edit(
      String id, int day, int revision, Map<String, dynamic> content) async {
    await _api.put(_path(id, day), {'revision': revision, 'content': content});
  }

  Future<Map<String, dynamic>> complete(
      String id, int day, int revision, List<String> answers) async {
    final result = Map<String, dynamic>.from(await _api.post(
        '${_path(id, day)}/complete',
        {'revision': revision, 'answers': answers}) as Map);
    if (result['study'] is Map) {
      await StudyService.instance.accept(
          Map<String, dynamic>.from(result['study'] as Map),
          token: _api.token, userAction: true);
    }
    return result;
  }

  Future<void> rate(String id, int day, int rating) async {
    await _api.put('${_path(id, day)}/rating', {'rating': rating});
  }

  Future<void> regenerate(String id, String feedback) async {
    await _api.post('${_path(id)}/regenerate', {'feedback': feedback});
  }

  Future<void> retry(String id) async {
    await _api.post('${_path(id)}/retry', {});
  }
}
