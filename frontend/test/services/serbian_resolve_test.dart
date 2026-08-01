import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/grammar_engine.dart';

/// Достройка начальной формы для слов, которых нет в лексиконе.
///
/// Лексикон хранит в среднем две формы на лемму, поэтому «kućom» в нём просто
/// нет, и раньше такое слово показывалось без основы. Правило проверяет себя
/// само: кандидат обязан ПОСТРОИТЬ ту же форму, иначе разбор не принимается.
///
/// Правила обязаны совпадать с `server/internal/grammar/resolve.go`: иначе
/// сайт и приложение показали бы для одного слова разную начальную форму.
void main() {
  group('кандидаты в начальную форму', () {
    test('само слово идёт первым', () {
      expect(GrammarEngine.lemmaCandidates('kućom').first, 'kućom');
    });

    test('глагольные окончания предлагаются', () {
      final candidates = GrammarEngine.lemmaCandidates('radim');
      expect(candidates, contains('raditi'));
    });

    test('существительные на -a предлагаются', () {
      expect(GrammarEngine.lemmaCandidates('kućom'), contains('kuća'));
    });

    test('без дублей', () {
      final candidates = GrammarEngine.lemmaCandidates('radim');
      expect(candidates.length, candidates.toSet().length);
    });

    test('короткое слово не роняет разбор', () {
      expect(() => GrammarEngine.lemmaCandidates('a'), returnsNormally);
      expect(() => GrammarEngine.lemmaCandidates(''), returnsNormally);
    });
  });

  group('существительные', () {
    test('инструменталь женского рода', () {
      final feats = GrammarEngine.matchNoun('kuća', 'Fem', 'kućom');
      expect(feats, isNotNull);
      expect(feats!['Case'], 'Ins');
      expect(feats['Number'], 'Sing');
    });

    test('родительный женского рода', () {
      expect(GrammarEngine.matchNoun('kuća', 'Fem', 'kuće')?['Case'], 'Gen');
    });

    test('чужая форма не принимается', () {
      expect(GrammarEngine.matchNoun('kuća', 'Fem', 'radim'), isNull);
    });
  });

  group('глаголы', () {
    test('презент 1 л. ед.', () {
      final feats = GrammarEngine.matchVerb('raditi', 'radim');
      expect(feats, isNotNull);
      expect(feats!['Person'], '1');
      expect(feats['Number'], 'Sing');
      expect(feats['Tense'], 'Pres');
    });

    test('презент 3 л. мн.', () {
      final feats = GrammarEngine.matchVerb('raditi', 'rade');
      expect(feats?['Person'], '3');
      expect(feats?['Number'], 'Plur');
    });

    test('причастие женского рода', () {
      final feats = GrammarEngine.matchVerb('raditi', 'radila');
      expect(feats?['VerbForm'], 'Part');
      expect(feats?['Gender'], 'Fem');
    });

    test('инфинитив узнаёт сам себя', () {
      expect(GrammarEngine.matchVerb('raditi', 'raditi')?['VerbForm'], 'Inf');
    });

    test('чужая форма не принимается', () {
      expect(GrammarEngine.matchVerb('raditi', 'kućom'), isNull);
    });

    test('глагол, который правилом не выводится, молчит', () {
      // «jesti → jedem» правилом не строится, и выдумывать «jestim» нельзя.
      expect(GrammarEngine.matchVerb('jesti', 'jestim'), isNull);
    });
  });
}
