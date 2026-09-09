import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/personal_service.dart';

void main() {
  test('колода использует снимок сессии и общий транспорт', () async {
    final requests = <http.Request>[];
    final api = ApiClient(
        baseUrl: 'https://example.invalid',
        token: 'first',
        client: MockClient((r) async {
          requests.add(r);
          return http.Response(
              jsonEncode({'available': true, 'questions': [], 'plan': null}),
              200);
        }));
    final service = PersonalService(api);
    api.token = 'second';
    final state = await service.load();
    expect(state.plan, isNull);
    expect(state.available, isTrue);
    await service.create('A2', 'Europe/Belgrade', {'goal': 'Культура'});
    expect(requests.every((r) => r.headers['Authorization'] == 'Bearer first'),
        isTrue);
    expect(jsonDecode(requests.last.body)['timezone'], 'Europe/Belgrade');
  });
  test('сохранение передаёт ревизию, а ошибки не скрываются', () async {
    final api = ApiClient(
        baseUrl: 'https://example.invalid',
        client: MockClient((r) async {
          expect(jsonDecode(r.body)['revision'], 7);
          return http.Response(
              jsonEncode({'code': 'conflict', 'message': 'Урок изменился'}),
              409,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }));
    await expectLater(PersonalService(api).edit('plan', 1, 7, {}),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 409)));
  });
}
