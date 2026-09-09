import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/micro_feed_service.dart';
import 'package:srbski_read/services/analysis_cache_key.dart';
import 'package:srbski_read/services/grammar_engine.dart';
import 'package:srbski_read/services/listening_service.dart';
import 'package:srbski_read/course/widgets/bone_mascot.dart';
import 'package:srbski_read/theme/app_theme.dart';

void main() {
  test('презент не угадывается по одному окончанию', () {
    expect(GrammarEngine.matchVerb('izabrati', 'izabram'), isNull);
    expect(GrammarEngine.matchVerb('izabrati', 'izaberem')?['Person'], '1');
    expect(GrammarEngine.matchVerb('ustati', 'ustam'), isNull);
    expect(GrammarEngine.matchVerb('raditi', 'radim')?['Person'], '1');
  });
  test('тёмные текстовые акценты и кнопки сохраняют контраст', () {
    final c = AppTheme.dark().colorScheme;
    double ratio(Color a, Color b) {
      final x = a.computeLuminance(), y = b.computeLuminance();
      return (x > y ? (x + .05) / (y + .05) : (y + .05) / (x + .05));
    }

    for (final bg in [
      c.surface,
      c.surfaceContainer,
      c.surfaceContainerHighest
    ]) {
      expect(ratio(c.primary, bg), greaterThanOrEqualTo(4.5));
      expect(ratio(c.secondary, bg), greaterThanOrEqualTo(4.5));
    }
    expect(ratio(c.primary, c.onPrimary), greaterThanOrEqualTo(4.5));
    expect(ratio(c.secondary, c.onSecondary), greaterThanOrEqualTo(4.5));
  });
  test('тема выпуска не наследует кофе из названия подкаста', () {
    expect(
        ListeningService.topicOf(
            'Learn Serbian & Može kafa podcast: Episode 16 - Protests in Serbia'),
        'Культура');
    expect(
        ListeningService.topicOf(
            'Learn Serbian & Može kafa podcast: Episode 12 - Serbian Language Textbook A1-A2'),
        'Учёба');
    expect(
        ListeningService.topicOf(
            'Learn Serbian & Može kafa podcast: Episode 18 - Season Recap'),
        'Разговоры');
    expect(
        ListeningService.topicOf(
            'Intermediate Serbian: Serbian Food (Srpska hrana)'),
        'Еда');
  });
  test('кэш переводов различает английский и сербский', () {
    expect(translationCacheKey('list'),
        isNot(translationCacheKey('list', source: 'en')));
    expect(translationCacheKey(' LIST '),
        translationCacheKey('list', source: 'sr'));
    expect(translationCacheKey('list'), isNot('list'));
  });
  test('лента использует живую сессию, а не старый токен preferences',
      () async {
    SharedPreferences.setMockInitialValues({'citavuk_session_token': 'legacy'});
    final headers = <String?>[];
    final api = ApiClient(
        baseUrl: 'https://example.invalid',
        client: MockClient((r) async {
          headers.add(r.headers['Authorization']);
          return http.Response('{"items":[]}', 200);
        }));
    addTearDown(api.close);
    final service = MicroFeedService(api: api);
    expect(await service.signedIn(), isFalse);
    await service.comments('one');
    api.token = 'current';
    expect(await service.signedIn(), isTrue);
    await service.comments('one');
    api.token = null;
    expect(await service.signedIn(), isFalse);
    await service.comments('one');
    expect(headers, [null, 'Bearer current', null]);
  });

  test('лента не скрывает отказ отозванной сессии', () async {
    final api = ApiClient(
        baseUrl: 'https://example.invalid',
        token: 'expired',
        client: MockClient((_) async => http.Response(
            '{"message":"Войди снова"}', 401,
            headers: {'content-type': 'application/json; charset=utf-8'})));
    addTearDown(api.close);
    await expectLater(MicroFeedService(api: api).comments('one'),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
  });
  test('сохранённые видео не смешиваются с текстовыми карточками', () async {
    SharedPreferences.setMockInitialValues({});
    final modes = <String?>[];
    final api = ApiClient(
        baseUrl: 'https://example.invalid',
        token: 'test-session',
        client: MockClient((r) async {
          modes.add(r.url.queryParameters['mode']);
          return http.Response('{"items":[]}', 200);
        }));
    addTearDown(api.close);
    final service = MicroFeedService(api: api);
    await service.liked(video: true);
    await service.liked();
    expect(modes, ['video', 'text']);
  });

  test('ключ морфологии различает контекст, позицию и сервер', () {
    String key(String sentence, int start, {String backend = 'a'}) =>
        analysisCacheKey(
            token: 'sam',
            sentence: sentence,
            start: start,
            end: start + 3,
            backend: backend);
    expect(key('Ja sam stigao', 3), key('Ja sam stigao', 3));
    expect(key('Ja sam stigao', 3), isNot(key('On je sam', 6)));
    expect(key('sam sam', 0), isNot(key('sam sam', 4)));
    expect(key('sam', 0), isNot(key('sam', 0, backend: 'b')));
    expect(key('sam', 0), isNot('sam'));
  });

  test('страдательное причастие не склоняет инфинитив', () {
    final tables = GrammarEngine.buildParadigms(
        lemma: 'izabrati',
        upos: 'ADJ',
        surface: 'izabrana',
        feats: {
          'Gender': 'Fem',
          'Number': 'Sing',
          'VerbForm': 'Part',
          'Voice': 'Pass'
        },
        lexiconRows: [
          {
            'form': 'izabrana',
            'feats':
                'Case=Nom|Definite=Def|Gender=Fem|Number=Sing|VerbForm=Part|Voice=Pass'
          }
        ]);
    final forms =
        tables.expand((t) => t.rows).where((r) => r.form != '—').toList();
    expect(forms, isNotEmpty);
    expect(forms.every((r) => r.form == 'izabrana' && !r.generated), isTrue);
    expect(tables.any((t) => t.title == 'Степени сравнения'), isFalse);
  });

  testWidgets('скелет возобновляет реакцию после still', (tester) async {
    var completed = 0;
    Widget scene(bool still) => MaterialApp(
        home: BoneMascot(
            reaction: 'correct',
            height: 120,
            fallback: const SizedBox(),
            still: still,
            onCompleted: () => completed++));
    await tester.pumpWidget(scene(true));
    await tester.pumpWidget(scene(false));
    await tester.pump(const Duration(seconds: 2));
    expect(completed, 1);
  });
}
