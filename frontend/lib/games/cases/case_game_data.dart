// Логика игры «Уничтожь эти падежи с Читавуком!» без интерфейса.
//
// Правила продублированы на сайте (web/src/games/cases/data.ts, keyboard.ts,
// voice.ts) и обязаны совпадать: одинаковые задания, одинаковая проверка.

import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class CaseInfo {
  const CaseInfo(this.key, this.sr, this.ru);
  final String key;
  final String sr;
  final String ru;
}

const caseInfos = [
  CaseInfo('n', 'nominativ', 'Именительный'),
  CaseInfo('g', 'genitiv', 'Родительный'),
  CaseInfo('d', 'dativ', 'Дательный'),
  CaseInfo('a', 'akuzativ', 'Винительный'),
  CaseInfo('v', 'vokativ', 'Звательный'),
  CaseInfo('i', 'instrumental', 'Творительный'),
  CaseInfo('l', 'lokativ', 'Местный'),
];

const tenseInfos = [
  CaseInfo('pres', 'prezent', 'Настоящее'),
  CaseInfo('perf', 'perfekat', 'Прошедшее'),
  CaseInfo('fut', 'futur I', 'Будущее'),
  CaseInfo('imp', 'imperativ', 'Повелительное'),
];

CaseInfo _case(String key) => caseInfos.firstWhere((c) => c.key == key);

class NounEntry {
  NounEntry(this.lemma, this.translation, this.level, this.forms);
  final String lemma, translation, level;
  final Map<String, List<String>> forms;
}

class PronounEntry {
  PronounEntry(this.lemma, this.translation, this.forms);
  final String lemma, translation;
  final Map<String, List<String>> forms;
}

class VerbEntry {
  VerbEntry(this.lemma, this.translation, this.level, this.present,
      this.participle, this.imperative, this.future);
  final String lemma, translation, level;
  final Map<String, List<String>> present, participle;
  final Map<String, List<String>>? imperative, future;
}

Map<String, List<String>> _forms(Object? raw) => {
      for (final entry in (raw as Map? ?? const {}).entries)
        entry.key as String: [
          for (final form in entry.value as List) form as String
        ],
    };

class CaseGameData {
  CaseGameData(this.nouns, this.pronouns, this.verbs);
  final List<NounEntry> nouns;
  final List<PronounEntry> pronouns;
  final List<VerbEntry> verbs;

  factory CaseGameData.fromJson(Map<String, dynamic> json) => CaseGameData(
        [
          for (final n in json['nouns'] as List)
            NounEntry(n['l'], n['t'], n['lv'], _forms(n['f'])),
        ],
        [
          for (final p in json['pronouns'] as List)
            PronounEntry(p['l'], p['t'], _forms(p['f'])),
        ],
        [
          for (final v in json['verbs'] as List)
            VerbEntry(
              v['l'],
              v['t'],
              v['lv'],
              _forms(v['pr']),
              _forms(v['pp']),
              v['im'] == null ? null : _forms(v['im']),
              v['fu'] == null ? null : _forms(v['fu']),
            ),
        ],
      );

  static Future<CaseGameData>? _loading;

  /// Слова лежат в ассетах: 300 КиБ JSON разбираются один раз за запуск.
  static Future<CaseGameData> load() => _loading ??= rootBundle
      .loadString('assets/games/cases.json')
      .then((raw) => compute(_parseCaseGame, raw));
}

/// Разбор в фоновом изоляте: 300 КиБ JSON не тормозят открытие игры.
CaseGameData _parseCaseGame(String raw) =>
    CaseGameData.fromJson(jsonDecode(raw) as Map<String, dynamic>);

class GameTask {
  const GameTask({
    required this.kind,
    required this.lemma,
    required this.translation,
    required this.label,
    required this.labelSr,
    required this.before,
    required this.after,
    required this.answers,
    required this.weakKey,
    required this.weakLabel,
  });

  final String kind, lemma, translation, label, labelSr, before, after;
  final List<String> answers;
  final String weakKey, weakLabel;
}

const _levels = {
  'a': ['A1', 'A2'],
  'b': ['A1', 'A2', 'B1', 'B2'],
  'all': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
};

const _nounFrames = {
  'n': ('Ovo su', ''),
  'g': ('bez', ''),
  'd': ('prema', ''),
  'a': ('Vidim', ''),
  'v': ('Zdravo,', '!'),
  'i': ('sa', ''),
  'l': ('o', ''),
};

const _pronounFrames = {
  'g': ('bez', ''),
  'd': ('Daj', 'knjigu.'),
  'a': ('Vidim', ''),
  'i': ('sa', ''),
  'l': ('o', ''),
};

/// Краткие формы: после предлога они невозможны («bez me» — ошибка).
const _clitics = {
  'me', 'te', 'ga', 'je', 'ju', 'mi', 'ti', 'mu', 'joj', 'nam', 'vam', 'im',
  'ih', 'se', 'si',
};
const _prepositionCases = {'g', 'i', 'l'};

const _persons = [
  ('1s', 'ja', '1-е л. ед.'),
  ('2s', 'ti', '2-е л. ед.'),
  ('3s', 'on', '3-е л. ед.'),
  ('1p', 'mi', '1-е л. мн.'),
  ('2p', 'vi', '2-е л. мн.'),
  ('3p', 'oni', '3-е л. мн.'),
];
const _auxPerfect = {'1s': 'sam', '2s': 'si', '3s': 'je', '1p': 'smo', '2p': 'ste', '3p': 'su'};
const _auxFuture = {'1s': 'ću', '2s': 'ćeš', '3s': 'će', '1p': 'ćemo', '2p': 'ćete', '3p': 'će'};

String _number(String n) => n == 's' ? 'ед. ч.' : 'мн. ч.';
String _numberSr(String n) => n == 's' ? 'jednina' : 'množina';

GameTask? _nounTask(NounEntry noun, String cell) {
  final answers = noun.forms[cell];
  if (answers == null || answers.isEmpty) return null;
  final number = cell[0], key = cell[1];
  final info = _case(key);
  final frame = _nounFrames[key]!;
  return GameTask(
    kind: 'noun',
    lemma: noun.lemma,
    translation: noun.translation,
    label: '${info.ru} · ${_number(number)}',
    labelSr: '${info.sr} · ${_numberSr(number)}',
    before: frame.$1,
    after: frame.$2,
    answers: answers,
    weakKey: 'noun:$cell',
    weakLabel: '${info.ru}, ${_number(number)}',
  );
}

GameTask? _pronounTask(PronounEntry pronoun, String key) {
  var answers = pronoun.forms[key];
  if (answers == null || answers.isEmpty) return null;
  if (_prepositionCases.contains(key)) {
    answers = answers.where((f) => !_clitics.contains(f)).toList();
  }
  if (answers.isEmpty) return null;
  final info = _case(key);
  final frame = _pronounFrames[key]!;
  return GameTask(
    kind: 'pronoun',
    lemma: pronoun.lemma,
    translation: pronoun.translation,
    label: '${info.ru} · местоимение',
    labelSr: info.sr,
    before: frame.$1,
    after: frame.$2,
    answers: answers,
    weakKey: 'pronoun:$key',
    weakLabel: 'Местоимения: ${info.ru.toLowerCase()}',
  );
}

GameTask? _verbTask(VerbEntry verb, String tense, Random random) {
  final info = tenseInfos.firstWhere((t) => t.key == tense);
  GameTask make(String label, String labelSr, String before, String after, List<String> answers) => GameTask(
        kind: 'verb',
        lemma: verb.lemma,
        translation: verb.translation,
        label: label,
        labelSr: labelSr,
        before: before,
        after: after,
        answers: answers,
        weakKey: 'verb:$tense',
        weakLabel: 'Глаголы: ${info.ru.toLowerCase()}',
      );
  if (tense == 'imp') {
    final imperative = verb.imperative;
    if (imperative == null) return null;
    final person = const ['2s', '1p', '2p'][random.nextInt(3)];
    final who = person == '2s' ? 'ti' : person == '1p' ? 'mi' : 'vi';
    return make('${info.ru} · $who', '${info.sr} · $who', '($who)', '!', imperative[person]!);
  }
  final person = _persons[random.nextInt(_persons.length)];
  if (tense == 'pres') {
    return make('${info.ru} · ${person.$3}', info.sr, person.$2, '', verb.present[person.$1]!);
  }
  if (tense == 'fut') {
    // С подлежащим клитика идёт второй: «ja ću raditi».
    final answers = ['${_auxFuture[person.$1]} ${verb.lemma}', ...?verb.future?[person.$1]];
    return make('${info.ru} · ${person.$3}', info.sr, person.$2, '', answers);
  }
  final plural = person.$1.endsWith('p');
  var gender = random.nextBool() ? 'm' : 'f';
  var pronoun = person.$2;
  if (person.$1 == '3s') {
    gender = const ['m', 'f', 'n'][random.nextInt(3)];
    pronoun = gender == 'm' ? 'on' : gender == 'f' ? 'ona' : 'ono';
  } else if (person.$1 == '3p') {
    gender = const ['m', 'f', 'n'][random.nextInt(3)];
    pronoun = gender == 'm' ? 'oni' : gender == 'f' ? 'one' : 'ona';
  } else if (plural) {
    gender = 'm';
  }
  final participles = verb.participle['${plural ? 'p' : 's'}$gender']!;
  final aux = _auxPerfect[person.$1]!;
  final answers = [
    for (final p in participles) '$aux $p',
    for (final p in participles) '$p $aux',
    if (plural && person.$1 != '3p')
      for (final p in verb.participle['pf']!) ...['$aux $p', '$p $aux'],
  ];
  final showGender = person.$1 == '1s' || person.$1 == '2s';
  final genderRu = gender == 'm' ? 'муж.' : gender == 'f' ? 'жен.' : 'ср.';
  return make(
    '${info.ru} · ${person.$3}${showGender ? ', $genderRu род' : ''}',
    info.sr,
    showGender ? '$pronoun (${gender == 'm' ? 'm' : 'ž'})' : pronoun,
    '',
    answers,
  );
}

/// Источник заданий набора. scope: all | nouns | pronouns | case:X | verbs | tense:X.
class TaskSource {
  TaskSource(CaseGameData data, String scope, String level, {Random? random})
      : _random = random ?? Random() {
    final allowed = _levels[level] ?? _levels['all']!;
    final nouns = data.nouns.where((n) => allowed.contains(n.level)).toList();
    final verbs = data.verbs.where((v) => allowed.contains(v.level)).toList();
    final caseFilter = scope.startsWith('case:')
        ? [scope.substring(5)]
        : const ['n', 'g', 'd', 'a', 'v', 'i', 'l'];
    final wantNouns = scope == 'all' || scope == 'nouns' || scope.startsWith('case:');
    final wantPronouns = scope == 'all' || scope == 'pronouns' || scope.startsWith('case:');

    if (wantNouns && nouns.isNotEmpty) {
      final cells = [
        for (final key in caseFilter) ...[if (key != 'n') 's$key', 'p$key'],
      ];
      _makers.add(() {
        final cell = cells[_random.nextInt(cells.length)];
        final pool = cell[1] == 'v' ? nouns.where((n) => n.forms.containsKey('sv')).toList() : nouns;
        return pool.isEmpty ? null : _nounTask(pool[_random.nextInt(pool.length)], cell);
      });
    }
    final pronounCases = caseFilter.where((k) => k != 'n' && k != 'v').toList();
    if (wantPronouns && pronounCases.isNotEmpty) {
      // Местоимений мало, поэтому в общем наборе они выпадают реже.
      final weight = scope == 'pronouns' ? 1.0 : 0.35;
      _makers.add(() => _random.nextDouble() < weight
          ? _pronounTask(data.pronouns[_random.nextInt(data.pronouns.length)],
              pronounCases[_random.nextInt(pronounCases.length)])
          : null);
    }
    final tenses = scope == 'verbs'
        ? const ['pres', 'perf', 'fut', 'imp']
        : scope.startsWith('tense:')
            ? [scope.substring(6)]
            : const <String>[];
    if (tenses.isNotEmpty && verbs.isNotEmpty) {
      _makers.add(() => _verbTask(verbs[_random.nextInt(verbs.length)],
          tenses[_random.nextInt(tenses.length)], _random));
    }
    if (_makers.isEmpty) throw StateError('пустой набор: $scope');
  }

  final Random _random;
  final List<GameTask? Function()> _makers = [];
  String _previous = '';

  GameTask next() {
    for (var attempt = 0; attempt < 50; attempt++) {
      final task = _makers[_random.nextInt(_makers.length)]();
      // Одно и то же слово подряд выглядит как зависание.
      if (task != null && '${task.lemma}:${task.label}' != _previous) {
        _previous = '${task.lemma}:${task.label}';
        return task;
      }
    }
    throw StateError('не удалось составить задание');
  }
}

// --- Проверка ответа ---

const _cyrillic = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'đ', 'е': 'e', 'ж': 'ž',
  'з': 'z', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj', 'м': 'm', 'н': 'n',
  'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'ћ': 'ć', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'č', 'џ': 'dž', 'ш': 'š',
};
const diacriticBase = {'č': 'c', 'ć': 'c', 'š': 's', 'ž': 'z', 'đ': 'd'};

String normalizeAnswer(String value) {
  final buffer = StringBuffer();
  for (final ch in value.toLowerCase().split('')) {
    buffer.write(_cyrillic[ch] ?? ch);
  }
  return buffer
      .toString()
      .replaceAll(RegExp(r'[.,!?;:]+$'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

String _fold(String value, bool dj) => value.split('').map((ch) {
      if (ch == 'đ') return dj ? 'dj' : 'd';
      return diacriticBase[ch] ?? ch;
    }).join();

enum VerdictKind { exact, diacritics, wrong }

class Verdict {
  Verdict(this.result, this.matched, this.missing);
  VerdictKind result;
  final String matched;
  List<String> missing;
}

/// Буква без чёрточки засчитывается с отметкой; «dj» вместо «đ» — тоже.
Verdict checkAnswer(String typed, List<String> answers) {
  final value = normalizeAnswer(typed);
  for (final answer in answers) {
    if (value == normalizeAnswer(answer)) return Verdict(VerdictKind.exact, answer, []);
  }
  for (final answer in answers) {
    final expected = normalizeAnswer(answer);
    if (_fold(value, true) == _fold(expected, true) ||
        _fold(value, false) == _fold(expected, false)) {
      final missing = expected
          .split('')
          .where((ch) => diacriticBase.containsKey(ch) && !value.contains(ch))
          .toSet()
          .toList();
      return Verdict(missing.isEmpty ? VerdictKind.wrong : VerdictKind.diacritics, answer, missing);
    }
  }
  return Verdict(VerdictKind.wrong, answers.isEmpty ? '' : answers.first, []);
}

// --- Голос ---

List<String> spokenWords(String value) => normalizeAnswer(value)
    .replaceAll(RegExp(r'[.,!?;:"«»()]'), ' ')
    .split(RegExp(r'\s+'))
    .where((w) => w.isNotEmpty)
    .toList();

/// Прозвучал ли где-то во фразе верный ответ — целыми словами, без чёрточек.
String? spokenAnswer(List<String> alternatives, List<String> answers) {
  for (final heard in alternatives) {
    final said = spokenWords(heard).map((w) => _fold(w, true)).toList();
    for (final answer in answers) {
      final target = spokenWords(answer).map((w) => _fold(w, true)).toList();
      if (target.isEmpty) continue;
      for (var i = 0; i + target.length <= said.length; i++) {
        var ok = true;
        for (var k = 0; k < target.length; k++) {
          if (said[i + k] != target[k]) {
            ok = false;
            break;
          }
        }
        if (ok) return answer;
      }
    }
  }
  return null;
}

// --- Итоги ---

class Attempt {
  Attempt(this.task, this.typed, this.verdict);
  final GameTask task;
  final String typed;
  final Verdict verdict;
}

class WeakSpot {
  WeakSpot(this.label);
  final String label;
  int wrong = 0, total = 0;
  Map<String, dynamic> toJson() => {'label': label, 'wrong': wrong, 'total': total};
}

class GameSummary {
  GameSummary({
    required this.words,
    required this.correct,
    required this.diacriticSlips,
    required this.chars,
    required this.cpm,
    required this.wpm,
    required this.accuracy,
    required this.weak,
  });
  final int words, correct, diacriticSlips, chars, cpm;
  final double wpm, accuracy;
  final List<WeakSpot> weak;
  int get wrong => words - correct;
}

GameSummary summarize(List<Attempt> attempts, int elapsedSeconds) {
  final correctOnes = attempts.where((a) => a.verdict.result != VerdictKind.wrong).toList();
  final chars = correctOnes.fold<int>(0, (sum, a) => sum + normalizeAnswer(a.typed).length);
  final minutes = max(elapsedSeconds, 1) / 60;
  final groups = <String, WeakSpot>{};
  for (final a in attempts) {
    final group = groups.putIfAbsent(a.task.weakKey, () => WeakSpot(a.task.weakLabel));
    group.total++;
    if (a.verdict.result == VerdictKind.wrong) group.wrong++;
  }
  final weak = groups.values.where((g) => g.wrong > 0).toList()
    ..sort((a, b) {
      final byRate = (b.wrong / b.total).compareTo(a.wrong / a.total);
      return byRate != 0 ? byRate : b.wrong.compareTo(a.wrong);
    });
  return GameSummary(
    words: attempts.length,
    correct: correctOnes.length,
    diacriticSlips: attempts.where((a) => a.verdict.result == VerdictKind.diacritics).length,
    chars: chars,
    cpm: (chars / minutes).round(),
    wpm: (correctOnes.length / minutes * 10).round() / 10,
    accuracy: attempts.isEmpty ? 0 : (correctOnes.length / attempts.length * 1000).round() / 10,
    weak: weak.take(5).toList(),
  );
}

String scopeTitle(String scope) {
  if (scope == 'all') return 'Все падежи';
  if (scope == 'nouns') return 'Падежи существительных';
  if (scope == 'pronouns') return 'Падежи местоимений';
  if (scope == 'verbs') return 'Все времена глаголов';
  if (scope.startsWith('case:')) return _case(scope.substring(5)).ru;
  if (scope.startsWith('tense:')) {
    return tenseInfos.firstWhere((t) => t.key == scope.substring(6), orElse: () => CaseInfo('', '', scope)).ru;
  }
  return scope;
}

// --- Клавиатура машинки ---

/// Сербская латинская QWERTZ, как у югославских Olympia и UNIS.
const typewriterRows = [
  ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'š', 'đ'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'č', 'ć', 'ž'],
  ['y', 'x', 'c', 'v', 'b', 'n', 'm'],
];
const serbianLetters = {'č', 'ć', 'š', 'ž', 'đ'};

/// Какой лапой жать — как у машинистки: q–t, a–g, y–b левой.
bool leftPawFor(String key) {
  for (final row in typewriterRows) {
    final index = row.indexOf(key);
    if (index >= 0) return index < 5;
  }
  return key != 'backspace' && key != 'enter';
}

final _serbianOnly = RegExp(r'^[ђјљњћџ]$');
final _latin = RegExp(r'^[a-zčćšžđ]$');

/// Буква по физической клавише: у пользователя может быть включена кириллица,
/// а печатать надо латиницей. Сербские буквы — на местах [ ] ; ' \.
String? letterForKey(KeyEvent event) {
  final physical = event.physicalKey;
  final character = event.character?.toLowerCase();
  if (character != null && _latin.hasMatch(character)) return character;
  if (character != null && _serbianOnly.hasMatch(character)) return _cyrillic[character];
  final special = {
    PhysicalKeyboardKey.bracketLeft: 'š',
    PhysicalKeyboardKey.bracketRight: 'đ',
    PhysicalKeyboardKey.semicolon: 'č',
    PhysicalKeyboardKey.quote: 'ć',
    PhysicalKeyboardKey.backslash: 'ž',
    PhysicalKeyboardKey.intlBackslash: 'ž',
    PhysicalKeyboardKey.space: ' ',
  };
  if (special.containsKey(physical)) return special[physical];
  // Таблица, а не имя клавиши: debugName в релизной сборке пустой.
  return _physicalLetters[physical];
}

final _physicalLetters = <PhysicalKeyboardKey, String>{
  PhysicalKeyboardKey.keyA: 'a',
  PhysicalKeyboardKey.keyB: 'b',
  PhysicalKeyboardKey.keyC: 'c',
  PhysicalKeyboardKey.keyD: 'd',
  PhysicalKeyboardKey.keyE: 'e',
  PhysicalKeyboardKey.keyF: 'f',
  PhysicalKeyboardKey.keyG: 'g',
  PhysicalKeyboardKey.keyH: 'h',
  PhysicalKeyboardKey.keyI: 'i',
  PhysicalKeyboardKey.keyJ: 'j',
  PhysicalKeyboardKey.keyK: 'k',
  PhysicalKeyboardKey.keyL: 'l',
  PhysicalKeyboardKey.keyM: 'm',
  PhysicalKeyboardKey.keyN: 'n',
  PhysicalKeyboardKey.keyO: 'o',
  PhysicalKeyboardKey.keyP: 'p',
  PhysicalKeyboardKey.keyQ: 'q',
  PhysicalKeyboardKey.keyR: 'r',
  PhysicalKeyboardKey.keyS: 's',
  PhysicalKeyboardKey.keyT: 't',
  PhysicalKeyboardKey.keyU: 'u',
  PhysicalKeyboardKey.keyV: 'v',
  PhysicalKeyboardKey.keyW: 'w',
  PhysicalKeyboardKey.keyX: 'x',
  PhysicalKeyboardKey.keyY: 'y',
  PhysicalKeyboardKey.keyZ: 'z',
};

/// Текст с экранной клавиатуры: кириллица переводится, лишнее отбрасывается.
String textFromInput(String data) {
  final buffer = StringBuffer();
  for (final ch in data.toLowerCase().split('')) {
    if (_latin.hasMatch(ch) || ch == ' ') {
      buffer.write(ch);
    } else if (_cyrillic.containsKey(ch)) {
      buffer.write(_cyrillic[ch]);
    }
  }
  return buffer.toString();
}
