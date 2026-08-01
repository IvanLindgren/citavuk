import 'dart:convert';
import 'dart:io';

import 'package:srbski_read/models/english_analysis.dart';
import 'package:srbski_read/services/english_engine.dart';
import 'package:flutter_test/flutter_test.dart';

/// Разбор английского слова.
///
/// Тесты гоняются на настоящем ассете, а не на выдуманном словаре: смысл
/// движка в том, что кандидат в начальную форму ПРОВЕРЯЕТСЯ по словарю, и на
/// трёх подставных словах эта проверка ничего не значит.
void main() {
  final engine = EnglishEngine.instance;

  setUpAll(() {
    final raw = File('assets/english/english_lexicon.json').readAsStringSync();
    final data = jsonDecode(raw) as Map<String, dynamic>;
    engine.loadForTest(
      words: (data['words'] as Map)
          .map((k, v) => MapEntry(k.toString(), v.toString())),
      irregular: (data['irregular'] as Map)
          .map((k, v) => MapEntry(k.toString(), v.toString())),
    );
  });

  group('начальная форма', () {
    test('слово из словаря разбирается как лемма', () {
      final result = engine.analyze('book')!;
      expect(result.lemma, 'book');
      expect(result.formKind, EnglishFormKind.lemma);
      expect(result.formLabel, isEmpty);
    });

    test('регистр не мешает', () {
      expect(engine.analyze('Book')!.lemma, 'book');
    });

    test('служебные слова опознаются', () {
      expect(engine.analyze('the')!.upos, 'DET');
      expect(engine.analyze('of')!.upos, 'ADP');
      expect(engine.analyze('you')!.upos, 'PRON');
      expect(engine.analyze('and')!.upos, 'CONJ');
    });

    test('модальные глаголы есть в словаре', () {
      for (final modal in ['would', 'should', 'could', 'shall', 'does']) {
        expect(engine.analyze(modal), isNotNull, reason: modal);
      }
    });

    test('неопределённые местоимения есть в словаре', () {
      // WordNet их не описывает — они добираются из корпуса. Без этого
      // «everyone» не считался бы английским словом вовсе.
      for (final word in [
        'everyone',
        'everybody',
        'everything',
        'anyone',
        'anybody',
        'anything',
        'something',
        'someone'
      ]) {
        expect(engine.analyze(word), isNotNull, reason: word);
      }
    });

    test('добор из корпуса не делает леммами обычные формы', () {
      // Корпус метит «states» существительным, но это множественное от
      // «state», и разбор формы теряться не должен.
      for (final entry in {
        'states': 'state',
        'members': 'member',
        'problems': 'problem',
        'schools': 'school',
      }.entries) {
        expect(engine.analyze(entry.key)?.lemma, entry.value,
            reason: entry.key);
      }
    });
  });

  group('правильные формы', () {
    test('множественное число', () {
      final result = engine.analyze('books')!;
      expect(result.lemma, 'book');
      expect(result.formKind, EnglishFormKind.regular);
      expect(result.formLabel, 'мн. ч.');
    });

    test('-ies после согласной даёт -y', () {
      expect(engine.analyze('cities')!.lemma, 'city');
    });

    test('-es после шипящей', () {
      expect(engine.analyze('boxes')!.lemma, 'box');
      expect(engine.analyze('watches')!.lemma, 'watch');
    });

    test('немое e восстанавливается', () {
      expect(engine.analyze('making')!.lemma, 'make');
    });

    test('удвоенная согласная снимается', () {
      expect(engine.analyze('stopped')!.lemma, 'stop');
      expect(engine.analyze('running')!.lemma, 'run');
    });

    test('-ied после согласной даёт -y', () {
      expect(engine.analyze('studied')!.lemma, 'study');
    });

    test('прошедшее время помечается', () {
      final result = engine.analyze('walked')!;
      expect(result.lemma, 'walk');
      expect(result.formLabel, 'прош. вр.');
      expect(result.upos, 'VERB');
    });

    test('форма -ing помечается', () {
      expect(engine.analyze('reading')!.formLabel, 'форма -ing');
    });

    test('степени сравнения', () {
      expect(engine.analyze('smaller')!.lemma, 'small');
      expect(engine.analyze('smallest')!.lemma, 'small');
      expect(engine.analyze('smallest')!.formLabel, 'превосх. степень');
    });

    test('наречие на -ly', () {
      expect(engine.analyze('quickly')!.lemma, 'quick');
    });
  });

  group('неправильные формы', () {
    test('существительные', () {
      expect(engine.analyze('children')!.lemma, 'child');
      expect(engine.analyze('mice')!.lemma, 'mouse');
      expect(engine.analyze('feet')!.lemma, 'foot');
    });

    test('глаголы', () {
      expect(engine.analyze('ran')!.lemma, 'run');
      expect(engine.analyze('went')!.lemma, 'go');
      expect(engine.analyze('was')!.lemma, 'be');
      expect(engine.analyze('are')!.lemma, 'be');
    });

    test('степени сравнения', () {
      expect(engine.analyze('better')!.lemma, 'good');
      expect(engine.analyze('best')!.lemma, 'good');
    });

    test('формы помечаются как исключения', () {
      expect(engine.analyze('children')!.formKind, EnglishFormKind.irregular);
    });

    test('омоним отмечается: saw — и «пила», и прошедшее от see', () {
      final result = engine.analyze('saw')!;
      expect(result.lemma, 'see');
      expect(result.alsoLemma, isTrue);
    });
  });

  group('форма или самостоятельное слово', () {
    // WordNet держит отпричастные прилагательные и отглагольные
    // существительные отдельными леммами. Слово, нажатое в предложении, должно
    // разбираться как форма — но только там, где суффикс действительно
    // словообразующий.
    test('слово на -ed/-ing/-ly разбирается как форма', () {
      expect(engine.analyze('walked')!.lemma, 'walk');
      expect(engine.analyze('making')!.lemma, 'make');
      expect(engine.analyze('reading')!.lemma, 'read');
      expect(engine.analyze('quickly')!.lemma, 'quick');
    });

    test('слово на -s остаётся собой, если есть в словаре', () {
      // «news» — не множественное от «new», а «always» — не форма «alway».
      expect(engine.analyze('news')!.lemma, 'news');
      expect(engine.analyze('always')!.lemma, 'always');
    });

    test('существительное на -ing со своим значением не ломается', () {
      // «building» — здание, а не только «строящий»: разбор формы обязан
      // сохранить ссылку на исходный глагол, но слово остаётся известным.
      expect(engine.analyze('building'), isNotNull);
    });
  });

  group('чего разбирать не должен', () {
    test('сербские буквы отсекаются сразу', () {
      expect(engine.analyze('kuća'), isNull);
      expect(engine.analyze('džep'), isNull);
      expect(engine.analyze('šuma'), isNull);
    });

    test('кириллица отсекается', () {
      expect(engine.analyze('књига'), isNull);
      expect(engine.analyze('книга'), isNull);
    });

    test('выдуманное слово не разбирается', () {
      expect(engine.analyze('qwertyuio'), isNull);
      expect(engine.analyze('bzzzzt'), isNull);
    });

    test('пустая строка и мусор', () {
      expect(engine.analyze(''), isNull);
      expect(engine.analyze('123'), isNull);
      expect(engine.analyze('  '), isNull);
    });
  });

  group('орфография, невозможная в сербском', () {
    test('английские сочетания опознаются', () {
      for (final word in ['think', 'what', 'black', 'phone', 'night']) {
        expect(EnglishEngine.hasEnglishOrthography(word), isTrue,
            reason: word);
      }
    });

    test('сербские слова не дают ложного срабатывания', () {
      for (final word in ['kuca', 'dobar', 'raditi', 'covek', 'ulica']) {
        expect(EnglishEngine.hasEnglishOrthography(word), isFalse,
            reason: word);
      }
    });

    test('сербские диакритики распознаются', () {
      expect(EnglishEngine.looksSerbian('kuća'), isTrue);
      expect(EnglishEngine.looksSerbian('book'), isFalse);
    });
  });
}
