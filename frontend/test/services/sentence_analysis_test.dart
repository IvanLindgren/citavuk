import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:srbski_read/services/translation_client.dart';

void main() {
  test('parses the contextual sentence analysis returned by the API', () async {
    final client = TranslationClient(
      baseUrl: 'https://api.example',
      client: MockClient((request) async {
        expect(request.url.path, '/v1/analyze/sentence');
        expect(jsonDecode(request.body), {'sentence': 'Živim u kući.'});
        return http.Response(
          jsonEncode({
            'sentence': 'Živim u kući.',
            'tokens': [
              {
                'index': 0,
                'surface': 'Živim',
                'start': 0,
                'end': 6,
                'lemma': 'živeti',
                'upos': 'VERB',
                'posShort': 'глагол',
                'feats': {'Tense': 'Pres'},
                'known': true,
                'translation': 'жить',
                'chosenByContext': false,
              },
              {
                'index': 1,
                'surface': 'u',
                'start': 7,
                'end': 8,
                'lemma': 'u',
                'upos': 'ADP',
                'posShort': 'предлог',
                'feats': {'Case': 'Loc'},
                'known': true,
                'translation': 'в',
                'chosenByContext': false,
              },
            ],
            'chunks': [
              {
                'kind': 'prep',
                'head': 1,
                'tokens': [1],
                'text': 'u kući',
                'case': 'Loc',
                'caseName': 'Предложный/Местный (lokativ)',
                'label': 'предлог «u» + предложный/местный падеж',
                'note': 'в (где — место)',
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );

    final analysis = await client.analyzeSentence('Živim u kući.');

    expect(analysis, isNotNull);
    expect(analysis!.tokens.first.posShort, 'глагол');
    expect(analysis.tokens.first.feats['Tense'], 'Pres');
    expect(analysis.chunks.single.caseKey, 'Loc');
    expect(analysis.chunks.single.note, 'в (где — место)');
    client.close();
  });
}
