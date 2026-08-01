import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import '../models/english_analysis.dart';

/// Английский лемматизатор и классификатор.
///
/// Словарь собирается `tools/build_english_lexicon.py` из WordNet (леммы,
/// части речи, таблица исключений) и Brown (частотность, служебные слова).
/// Тот же файл лежит в Go-сервере, поэтому сайт и приложение разбирают слово
/// одинаково.
///
/// Правило то же, что у сербского движка: форма не угадывается по окончанию,
/// а проверяется — кандидат в начальную форму обязан найтись в словаре.
class EnglishEngine {
  EnglishEngine._();
  static final EnglishEngine instance = EnglishEngine._();

  static const _asset = 'assets/english/english_lexicon.json';

  /// Лемма → коды частей речи («nv» = существительное и глагол).
  Map<String, String> _words = const {};

  /// Неправильная форма → «лемма/код».
  Map<String, String> _irregular = const {};

  bool _loaded = false;
  Future<void>? _loading;

  bool get isLoaded => _loaded;

  Future<void> load() {
    if (_loaded) return Future.value();
    return _loading ??= _read();
  }

  Future<void> _read() async {
    try {
      final raw = await rootBundle.loadString(_asset);
      final data = jsonDecode(raw) as Map<String, dynamic>;
      _words = (data['words'] as Map).map(
          (key, value) => MapEntry(key.toString(), value.toString()));
      _irregular = (data['irregular'] as Map).map(
          (key, value) => MapEntry(key.toString(), value.toString()));
      _loaded = true;
    } catch (_) {
      // Без словаря английская ветка просто не включается — разбор остаётся
      // сербским, и читалка работает как раньше.
      _loaded = false;
    } finally {
      _loading = null;
    }
  }

  /// Заполняет словарь напрямую — для тестов, чтобы не поднимать ассеты.
  void loadForTest({
    required Map<String, String> words,
    required Map<String, String> irregular,
  }) {
    _words = words;
    _irregular = irregular;
    _loaded = true;
  }

  static const _posByCode = {
    'n': 'NOUN',
    'v': 'VERB',
    'a': 'ADJ',
    'r': 'ADV',
    'p': 'PRON',
    'd': 'DET',
    'i': 'ADP',
    'c': 'CONJ',
    't': 'PART',
    'm': 'NUM',
  };

  static const _posRu = {
    'NOUN': 'существительное',
    'VERB': 'глагол',
    'ADJ': 'прилагательное',
    'ADV': 'наречие',
    'PRON': 'местоимение',
    'DET': 'определитель (артикль)',
    'ADP': 'предлог',
    'CONJ': 'союз',
    'PART': 'частица',
    'NUM': 'числительное',
  };

  static const _posShortRu = {
    'NOUN': 'сущ.',
    'VERB': 'глаг.',
    'ADJ': 'прил.',
    'ADV': 'нареч.',
    'PRON': 'мест.',
    'DET': 'артикль',
    'ADP': 'предлог',
    'CONJ': 'союз',
    'PART': 'частица',
    'NUM': 'числ.',
  };

  static String posFull(String upos) => _posRu[upos] ?? 'слово';

  static String posShort(String upos) => _posShortRu[upos] ?? '?';

  /// Буквы и сочетания, невозможные в сербской латинице. Сербский алфавит не
  /// знает q, w, x, y, а «th», «ck», «ph», «gh» не встречаются даже в
  /// заимствованиях: сербский пишет как слышит.
  static final _englishOnly = RegExp(r"[qwxy]|th|ck|ph|gh|wh|'");

  /// Сербские буквы: их наличие однозначно исключает английский.
  static final _serbianOnly = RegExp(r'[šđžčćŠĐŽČĆЀ-ӿ]');

  static bool looksSerbian(String word) => _serbianOnly.hasMatch(word);

  static bool hasEnglishOrthography(String word) =>
      _englishOnly.hasMatch(word.toLowerCase());

  /// Знает ли словарь такую лемму.
  bool knowsLemma(String word) => _words.containsKey(word.toLowerCase());

  /// Знает ли словарь такое слово хоть в каком-то виде (лемма или форма).
  bool knows(String word) {
    final low = word.toLowerCase();
    return _words.containsKey(low) || _irregular.containsKey(low);
  }

  /// Разбор слова. null — словарь такого слова не опознал.
  EnglishAnalysis? analyze(String word) {
    final low = word.trim().toLowerCase();
    if (low.isEmpty || !_loaded) return null;
    if (looksSerbian(low)) return null;
    if (!RegExp(r"^[a-z']+$").hasMatch(low)) return null;

    final irregular = _irregular[low];
    if (irregular != null) {
      final slash = irregular.lastIndexOf('/');
      final lemma = irregular.substring(0, slash);
      final code = irregular.substring(slash + 1);
      final upos = _posByCode[code] ?? 'NOUN';
      return _describeIrregular(low, lemma, upos);
    }

    final direct = _words[low];
    if (direct != null) {
      // WordNet держит отпричастные прилагательные и отглагольные
      // существительные отдельными леммами: «walked», «making», «reading»,
      // «smaller», «quickly» есть в словаре сами по себе. Человеку, нажавшему
      // такое слово в предложении, нужна не эта статья, а разбор формы.
      if (_prefersRule(low, direct)) {
        final byRule = _byRule(low);
        if (byRule != null) return byRule;
      }
      final upos = _preferredPos(direct);
      return EnglishAnalysis(
        surface: low,
        lemma: low,
        upos: upos,
        formKind: EnglishFormKind.lemma,
        facts: [EnglishFact('Часть речи', posFull(upos))],
        why: _whyLemma(upos, direct),
      );
    }

    return _byRule(low);
  }

  /// Разбирать ли слово как форму, хотя оно есть в словаре само по себе.
  ///
  /// Да — если оно оканчивается на словообразующий суффикс И записано ТОЛЬКО
  /// теми частями речи, которые этот суффикс и порождает. «walked» — только
  /// глагол/прилагательное, значит это форма. А «news» тоже кончается на -s,
  /// но существительное, и разбирать его как множественное от «new» нельзя,
  /// поэтому «-s» в этот список не входит вовсе: настоящее множественное
  /// («books») отдельной леммой в словаре не лежит.
  bool _prefersRule(String form, String codes) {
    const derived = {
      'ly': {'r'},
      'ed': {'a', 'v'},
      'ing': {'a', 'n'},
      'er': {'a'},
      'est': {'a'},
    };
    for (final entry in derived.entries) {
      if (!form.endsWith(entry.key)) continue;
      return codes.split('').every(entry.value.contains);
    }
    return false;
  }

  /// Наиболее вероятная часть речи, когда слово бывает и тем и другим.
  ///
  /// Порядок отражает, чем слово оказывается чаще при чтении текста, а не
  /// алфавит: «book» и «run» в учебнике почти всегда существительные.
  String _preferredPos(String codes) {
    for (final code in ['d', 'p', 'i', 'c', 't', 'm', 'n', 'v', 'a', 'r']) {
      if (codes.contains(code)) return _posByCode[code]!;
    }
    return 'NOUN';
  }

  String _whyLemma(String upos, String codes) {
    final others = codes.split('').map((c) => _posByCode[c]).whereType<String>();
    final list = others.map(posFull).toSet().toList();
    if (list.length > 1) {
      return 'Это начальная (словарная) форма. В английском одно и то же слово '
          'часто бывает разными частями речи без изменения написания — здесь '
          'это ${list.join(', ')}. Какая именно, показывает место в предложении.';
    }
    return 'Это начальная (словарная) форма — ${posFull(upos)}.';
  }

  EnglishAnalysis _describeIrregular(String form, String lemma, String upos) {
    final facts = <EnglishFact>[EnglishFact('Часть речи', posFull(upos))];
    var label = 'неправильная форма';
    var why = '';

    switch (upos) {
      case 'NOUN':
        label = 'мн. ч.';
        facts.add(const EnglishFact('Число', 'множественное'));
        why = 'Множественное число образовано не по правилу «+s»: «$lemma» → '
            '«$form». Такие существительные приходится запоминать.';
      case 'VERB':
        label = 'прош. вр. / причастие';
        facts.add(const EnglishFact('Форма', 'прошедшее время или причастие'));
        why = 'Неправильный глагол: прошедшее время образуется не через «-ed». '
            'Начальная форма — «$lemma».';
      case 'ADJ':
        label = 'степень сравнения';
        facts.add(const EnglishFact('Степень', 'сравнительная или превосходная'));
        why = 'Степень сравнения образована не по правилу «-er/-est»: '
            'начальная форма — «$lemma».';
      case 'ADV':
        label = 'степень сравнения';
        facts.add(const EnglishFact('Степень', 'сравнительная или превосходная'));
        why = 'Наречие с неправильной степенью сравнения; начальная форма — '
            '«$lemma».';
    }

    return EnglishAnalysis(
      surface: form,
      lemma: lemma,
      upos: upos,
      formKind: EnglishFormKind.irregular,
      facts: facts,
      formLabel: label,
      why: why,
      alsoLemma: _words.containsKey(form),
    );
  }

  /// Кандидаты в начальную форму + описание формы. Проверяется каждый: в
  /// словарь обязан попасть результат, иначе разбор не принимается.
  EnglishAnalysis? _byRule(String form) {
    for (final rule in _rules(form)) {
      final codes = _words[rule.lemma];
      if (codes == null || !codes.contains(rule.code)) continue;
      final upos = _posByCode[rule.code]!;
      return EnglishAnalysis(
        surface: form,
        lemma: rule.lemma,
        upos: upos,
        formKind: EnglishFormKind.regular,
        facts: [
          EnglishFact('Часть речи', posFull(upos)),
          ...rule.facts,
        ],
        formLabel: rule.label,
        why: rule.why,
        alsoLemma: _words.containsKey(form),
      );
    }
    return null;
  }

  List<_Rule> _rules(String form) {
    final out = <_Rule>[];
    final len = form.length;

    void add(String lemma, String code, String label, String why,
        List<EnglishFact> facts) {
      if (lemma.length >= 2) out.add(_Rule(lemma, code, label, why, facts));
    }

    // -s / -es: множественное число или 3 л. ед. настоящего времени.
    if (len > 2 && form.endsWith('s') && !form.endsWith('ss')) {
      final stem = form.substring(0, len - 1);
      for (final candidate in _plural(form, stem)) {
        add(candidate, 'n', 'мн. ч.',
            'Множественное число: «$candidate» + окончание -s.',
            [const EnglishFact('Число', 'множественное')]);
        add(candidate, 'v', '3 л. ед. ч.',
            'Настоящее время, 3-е лицо единственного числа (he/she/it): '
            '«$candidate» + окончание -s.',
            [
              const EnglishFact('Лицо', '3-е'),
              const EnglishFact('Число', 'единственное'),
              const EnglishFact('Время', 'настоящее'),
            ]);
      }
    }

    // -ing: причастие настоящего времени / герундий.
    if (len > 4 && form.endsWith('ing')) {
      for (final candidate in _stems(form.substring(0, len - 3))) {
        add(candidate, 'v', 'форма -ing',
            'Форма на -ing: причастие настоящего времени или герундий от '
            '«$candidate». Употребляется в длительных временах (is $form).',
            [const EnglishFact('Форма', 'причастие -ing / герундий')]);
      }
    }

    // -ed: прошедшее время и причастие прошедшего времени.
    if (len > 3 && form.endsWith('ed')) {
      for (final candidate in _stems(form.substring(0, len - 2))) {
        add(candidate, 'v', 'прош. вр.',
            'Правильный глагол: прошедшее время или причастие прошедшего '
            'времени от «$candidate» через -ed.',
            [const EnglishFact('Время', 'прошедшее')]);
      }
    }

    // -er / -est: степени сравнения.
    if (len > 3 && form.endsWith('est')) {
      for (final candidate in _stems(form.substring(0, len - 3))) {
        add(candidate, 'a', 'превосх. степень',
            'Превосходная степень: «$candidate» + -est (the $form).',
            [const EnglishFact('Степень', 'превосходная')]);
      }
    }
    if (len > 3 && form.endsWith('er')) {
      for (final candidate in _stems(form.substring(0, len - 2))) {
        add(candidate, 'a', 'сравн. степень',
            'Сравнительная степень: «$candidate» + -er ($form than…).',
            [const EnglishFact('Степень', 'сравнительная')]);
        // «-er» ещё и деятель: teach → teacher. Это уже другое слово, поэтому
        // помечаем производным, а не формой.
        add(candidate, 'v', 'производное',
            'Существительное от глагола «$candidate»: -er обозначает того, кто '
            'выполняет действие.',
            [const EnglishFact('Образование', 'от глагола, суффикс -er')]);
      }
    }

    // -ly: наречие от прилагательного.
    if (len > 3 && form.endsWith('ly')) {
      final stem = form.substring(0, len - 2);
      final candidates = {stem, '${stem}e'};
      if (stem.endsWith('i')) candidates.add('${stem.substring(0, stem.length - 1)}y');
      for (final candidate in candidates) {
        add(candidate, 'a', 'наречие',
            'Наречие от прилагательного «$candidate» через -ly: отвечает на '
            'вопрос «как?».',
            [const EnglishFact('Образование', 'наречие на -ly')]);
      }
    }

    return out;
  }

  /// Основы для -s: books → book, boxes → box, cities → city, wolves → wolf.
  Set<String> _plural(String form, String stem) {
    final out = <String>{stem};
    if (stem.endsWith('e')) {
      final short = stem.substring(0, stem.length - 1);
      // «-ies» после согласной — это «-y»: cities → city.
      if (stem.endsWith('ie')) {
        out.add('${stem.substring(0, stem.length - 2)}y');
      }
      // «-ses/-xes/-zes/-ches/-shes» — просто «+es».
      if (RegExp(r'(s|x|z|ch|sh)$').hasMatch(short)) out.add(short);
      // «wolves → wolf», «knives → knife».
      if (stem.endsWith('ve')) {
        final base = stem.substring(0, stem.length - 2);
        out.addAll(['${base}f', '${base}fe']);
      }
    }
    return out;
  }

  /// Основы для -ing/-ed/-er/-est с учётом немого «e» и удвоения согласной:
  /// making → make, stopped → stop, bigger → big.
  Set<String> _stems(String stem) {
    final out = <String>{stem, '${stem}e'};
    if (stem.length >= 2) {
      final last = stem[stem.length - 1];
      final prev = stem[stem.length - 2];
      // Удвоенная согласная: stopped → stop.
      if (last == prev && !'aeiou'.contains(last)) {
        out.add(stem.substring(0, stem.length - 1));
      }
      // «-ied» после согласной — это «-y»: studied → study, tried → try.
      if (stem.endsWith('i')) {
        out.add('${stem.substring(0, stem.length - 1)}y');
      }
    }
    return out;
  }
}

class _Rule {
  final String lemma;
  final String code;
  final String label;
  final String why;
  final List<EnglishFact> facts;

  const _Rule(this.lemma, this.code, this.label, this.why, this.facts);
}
