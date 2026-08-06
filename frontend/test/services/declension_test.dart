import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/grammar_engine.dart';

/// Склонение существительных и прилагательных.
///
/// Примеры ЗДЕСЬ И В `server/internal/grammar/declension_test.go` одни и те же
/// намеренно: правила реализованы дважды, и разойтись они могут только молча.
/// Сайт и приложение обязаны называть одну и ту же форму — иначе человек,
/// который разбирает слово на телефоне и повторяет в браузере, увидит разное.
void main() {
  group('существительные', () {
    test('первая врста — защита от регресса', () {
      expect(GrammarEngine.matchNoun('kuća', 'Fem', 'kućom')?['Case'], 'Ins');
      expect(GrammarEngine.matchNoun('knjiga', 'Fem', 'knjizi')?['Case'], 'Dat');
    });

    test('женский род на согласный склоняется', () {
      // Раньше весь класс возвращал пустоту: noć, stvar, ljubav, kost.
      expect(GrammarEngine.matchNoun('noć', 'Fem', 'noći')?['Case'], 'Gen');
      expect(GrammarEngine.matchNoun('noć', 'Fem', 'noću')?['Case'], 'Ins');
      expect(GrammarEngine.matchNoun('noć', 'Fem', 'noćima')?['Number'], 'Plur');
      expect(
          GrammarEngine.matchNoun('ljubav', 'Fem', 'ljubavlju')?['Case'], 'Ins');
      expect(GrammarEngine.matchNoun('kost', 'Fem', 'košću')?['Case'], 'Ins');
      // После «р» йотования нет — только форма на -i.
      expect(GrammarEngine.matchNoun('stvar', 'Fem', 'stvari')?['Case'], 'Gen');
    });

    test('средний род с расширением основы', () {
      // ime → imena, а не «ima»; vreme → vremena, а не «vrema».
      expect(GrammarEngine.matchNoun('ime', 'Neut', 'imena')?['Case'], 'Gen');
      expect(GrammarEngine.matchNoun('ime', 'Neut', 'imenom')?['Case'], 'Ins');
      expect(
          GrammarEngine.matchNoun('vreme', 'Neut', 'vremena')?['Case'], 'Gen');
      expect(GrammarEngine.matchNoun('dete', 'Neut', 'deteta')?['Case'], 'Gen');
      // Средний род без расширения его не получает.
      expect(GrammarEngine.matchNoun('selo', 'Neut', 'sela')?['Case'], 'Gen');
      expect(GrammarEngine.matchNoun('polje', 'Neut', 'poljem')?['Case'], 'Ins');
    });

    test('беглое «а»', () {
      expect(GrammarEngine.matchNoun('otac', 'Masc', 'oca')?['Case'], 'Gen');
      expect(GrammarEngine.matchNoun('pas', 'Masc', 'psa')?['Case'], 'Gen');
      expect(GrammarEngine.matchNoun('momak', 'Masc', 'momka')?['Case'], 'Gen');
      expect(GrammarEngine.matchNoun('momak', 'Masc', 'momci')?['Number'],
          'Plur');
      expect(
          GrammarEngine.matchNoun('starac', 'Masc', 'starci')?['Number'],
          'Plur');
      // Родительный множественного — единственное место, где «а» возвращается.
      final momaka = GrammarEngine.matchNoun('momak', 'Masc', 'momaka');
      expect(momaka?['Case'], 'Gen');
      expect(momaka?['Number'], 'Plur');
      // Односложное «-ak» беглого «а» не имеет.
      expect(GrammarEngine.matchNoun('znak', 'Masc', 'znaka')?['Case'], 'Gen');
    });

    test('мужской род на -a склоняется по женскому типу', () {
      expect(GrammarEngine.matchNoun('tata', 'Masc', 'tate')?['Case'], 'Gen');
      expect(GrammarEngine.matchNoun('sudija', 'Masc', 'sudiju')?['Case'],
          'Acc');
    });

    test('множественное считает слоги, а не буквы', () {
      expect(GrammarEngine.matchNoun('grad', 'Masc', 'gradovi')?['Number'],
          'Plur');
      // По буквам «sport» получал «sporti».
      expect(GrammarEngine.matchNoun('sport', 'Masc', 'sportovi')?['Number'],
          'Plur');
      expect(GrammarEngine.matchNoun('muž', 'Masc', 'muževi')?['Number'],
          'Plur');
      expect(GrammarEngine.matchNoun('prozor', 'Masc', 'prozori')?['Number'],
          'Plur');
      // Слоговое «р» — слог: «vrt» односложное и берёт -ov-.
      expect(GrammarEngine.matchNoun('vrt', 'Masc', 'vrtovi')?['Number'],
          'Plur');
      // Исключения: по буквам получалось «danovi» и «zubovi».
      expect(GrammarEngine.matchNoun('dan', 'Masc', 'dani')?['Number'], 'Plur');
      expect(GrammarEngine.matchNoun('zub', 'Masc', 'zubi')?['Number'], 'Plur');
      expect(GrammarEngine.matchNoun('konj', 'Masc', 'konji')?['Number'],
          'Plur');
    });

    test('винительный одушевлённого опознаётся', () {
      // Строка для показа склеивает варианты через «/», поэтому опознание
      // обязано перебирать список форм, а не сравниваться со строкой.
      expect(GrammarEngine.matchNoun('čovek', 'Masc', 'čoveka'), isNotNull);
    });
  });

  group('прилагательные', () {
    test('вид различается в мужском и среднем роде', () {
      expect(
          GrammarEngine.adjectiveForm('dobar', 'Masc', 'Sing', 'Nom', false),
          'dobar');
      expect(GrammarEngine.adjectiveForm('dobar', 'Masc', 'Sing', 'Nom', true),
          'dobri');
      expect(GrammarEngine.adjectiveForm('dobar', 'Masc', 'Sing', 'Gen', false),
          'dobra');
      expect(GrammarEngine.adjectiveForm('dobar', 'Masc', 'Sing', 'Gen', true),
          'dobrog');
      expect(GrammarEngine.adjectiveForm('dobar', 'Neut', 'Sing', 'Gen', true),
          'dobrog');
    });

    test('женский род и множественное вид не различают', () {
      expect(GrammarEngine.adjectiveForm('dobar', 'Fem', 'Sing', 'Dat', false),
          GrammarEngine.adjectiveForm('dobar', 'Fem', 'Sing', 'Dat', true));
      expect(GrammarEngine.adjectiveForm('dobar', 'Masc', 'Plur', 'Gen', false),
          GrammarEngine.adjectiveForm('dobar', 'Masc', 'Plur', 'Gen', true));
      expect(GrammarEngine.adjectiveForm('dobar', 'Fem', 'Sing', 'Dat', false),
          'dobroj');
      expect(GrammarEngine.adjectiveForm('dobar', 'Masc', 'Plur', 'Gen', true),
          'dobrih');
    });

    test('мягкая основа меняет «о» на «е» — но не в женском роде', () {
      expect(GrammarEngine.adjectiveForm('vruć', 'Masc', 'Sing', 'Gen', true),
          'vrućeg');
      expect(GrammarEngine.adjectiveForm('vruć', 'Neut', 'Sing', 'Nom', false),
          'vruće');
      expect(GrammarEngine.adjectiveForm('vruć', 'Fem', 'Sing', 'Dat', false),
          'vrućoj');
    });

    test('беглое «а» в основе прилагательного', () {
      expect(GrammarEngine.adjectiveForm('hladan', 'Masc', 'Sing', 'Gen', true),
          'hladnog');
      expect(GrammarEngine.adjectiveForm('topao', 'Masc', 'Sing', 'Gen', true),
          'toplog');
      // Односложные беглого «а» не имеют.
      expect(GrammarEngine.adjectiveForm('star', 'Masc', 'Sing', 'Gen', true),
          'starog');
    });

    test('лемма в определённом виде разбирается', () {
      expect(GrammarEngine.adjectiveForm('veliki', 'Masc', 'Sing', 'Gen', true),
          'velikog');
      expect(
          GrammarEngine.adjectiveForm('veliki', 'Masc', 'Sing', 'Nom', false),
          'velik');
    });
  });

  group('разбор признаков', () {
    test('степень сравнения называется', () {
      final info = GrammarEngine.describe('ADJ', const {
        'Degree': 'Cmp',
        'Case': 'Nom',
        'Number': 'Sing',
        'Gender': 'Masc',
      });
      expect(info.facts.any((f) => f.label == 'Степень сравнения'), isTrue);
      expect(info.summary, contains('сравнительная степень'));
    });

    test('вид прилагательного называется и объясняется', () {
      final info = GrammarEngine.describe('ADJ', const {
        'Definite': 'Def',
        'Case': 'Gen',
        'Number': 'Sing',
        'Gender': 'Masc',
      });
      expect(info.facts.any((f) => f.label == 'Вид прилагательного'), isTrue);
      expect(info.why, contains('određeni'));
    });

    test('деепричастие больше не даёт пустую карточку', () {
      final info = GrammarEngine.describe('VERB', const {'VerbForm': 'Conv'});
      expect(info.facts.any((f) => f.label == 'Форма'), isTrue);
      expect(info.summary, isNotEmpty);
      expect(info.why, contains('деепричастие'));
    });

    test('трпни придев отличается от прилагательного', () {
      final info = GrammarEngine.describe('ADJ', const {
        'VerbForm': 'Part',
        'Voice': 'Pass',
        'Gender': 'Masc',
        'Number': 'Sing',
        'Case': 'Nom',
      });
      expect(info.facts.any((f) => f.label == 'Залог'), isTrue);
      expect(info.why, contains('трпни'));
    });

    test('в сводке род по-русски, а не сырым тегом', () {
      final info = GrammarEngine.describe('NOUN', const {
        'Case': 'Nom',
        'Number': 'Sing',
        'Gender': 'Masc',
      });
      expect(info.summary, contains('род: мужской'));
      expect(info.summary, isNot(contains('Masc')));
    });
  });

  group('спряжение', () {
    test('i-спряжение на -ati', () {
      expect(GrammarEngine.matchVerb('držati', 'držim')?['Person'], '1');
      expect(GrammarEngine.matchVerb('trčati', 'trči')?['Person'], '3');
    });

    test('a-спряжение осталось a-спряжением', () {
      expect(GrammarEngine.matchVerb('slušati', 'slušam')?['Person'], '1');
      expect(GrammarEngine.matchVerb('čitati', 'čitamo')?['Number'], 'Plur');
    });
  });
}
