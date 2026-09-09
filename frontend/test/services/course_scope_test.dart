import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/auth_service.dart';
import 'package:srbski_read/course/services/course_progress_store.dart';
import 'package:srbski_read/course/models/progress.dart';

class ScopedAuth extends AuthService {
  ScopedAuth({required super.api});
  Account? current;
  @override
  Account? get account => current;
  @override
  bool get isSignedIn => current != null;
  void use(String? id) {
    current = id == null
        ? null
        : Account(id: id, email: '$id@example.invalid', displayName: id);
    api.token = id;
  }
}

void main() {
  test('разные аккаунты, гость и курсы не делят локальный прогресс', () async {
    SharedPreferences.setMockInitialValues(
        {'course_progress_v1': 'legacy-backup'});
    final writes = <String?>[];
    final api = ApiClient(
        baseUrl: 'https://example.invalid',
        client: MockClient((r) async {
          if (r.method == 'PUT') writes.add(r.headers['Authorization']);
          return http.Response('', r.method == 'GET' ? 404 : 204);
        }));
    final auth = ScopedAuth(api: api);
    CourseProgressStore.configure(api: api, auth: auth);
    CourseProgress p(String id, int xp) =>
        CourseProgress(courseId: id, courseVersion: '1', xp: xp);
    final guest = CourseProgressStore();
    await guest.save(p('c', 1));
    auth.use('a');
    final a = CourseProgressStore();
    await a.save(p('c', 10));
    await a.save(p('second', 20));
    auth.use('b');
    final b = CourseProgressStore();
    expect(await b.load('c'), isNull);
    // Старый объект записывает старому владельцу и после смены аккаунта.
    await a.save(p('c', 30));
    expect((await a.load('c'))?.xp, 30);
    expect((await a.load('second'))?.xp, 20);
    expect((await guest.load('c'))?.xp, 1);
    await b.clear();
    expect((await a.load('c'))?.xp, 30);
    await Future<void>.delayed(Duration.zero);
    expect(writes, everyElement('Bearer a'));
    expect(
        (await SharedPreferences.getInstance()).getString('course_progress_v1'),
        'legacy-backup');
  });

  test('запоздалый ответ не записывается новому владельцу', () async {
    SharedPreferences.setMockInitialValues({});
    final response = Completer<http.Response>();
    final requested = Completer<void>();
    final api = ApiClient(
        baseUrl: 'https://example.invalid',
        client: MockClient((r) {
          requested.complete();
          return response.future;
        }));
    final auth = ScopedAuth(api: api)..use('a');
    CourseProgressStore.configure(api: api, auth: auth);
    final store = CourseProgressStore();
    final pending = store.load('c');
    await requested.future;
    auth.use('b');
    response.complete(http.Response(
        jsonEncode({
          'payload':
              CourseProgress(courseId: 'c', courseVersion: '1', xp: 99).toJson()
        }),
        200));
    await pending;
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys();
    expect(keys.any((k) => k.contains('user%3Aa')), isTrue);
    expect(keys.any((k) => k.contains('user%3Ab')), isFalse);
  });
}
