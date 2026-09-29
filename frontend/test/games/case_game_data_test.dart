import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:srbski_read/games/cases/case_game_data.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final data = CaseGameData.fromJson(
      jsonDecode(File('assets/games/cases.json').readAsStringSync()) as Map<String, dynamic>);

  test('у каждого существительного есть все падежи обоих чисел', () {
    expect(data.nouns.length, greaterThan(300));
    for (final noun in data.nouns) {
      for (final number in ['s', 'p']) {
        for (final key in 'ngdail'.split('')) {
          expect(noun.forms['$number$key'], isNotEmpty, reason: '${noun.lemma} $number$key');
        }
      }
    }
  });

  test('проверка ответа совпадает с сайтом', () {
    expect(checkAnswer('kuće', ['kuće']).result, VerdictKind.exact);
    expect(checkAnswer('  Nju ', ['je', 'nju', 'ju']).result, VerdictKind.exact);
    final slip = checkAnswer('kuce', ['kuće']);
    expect(slip.result, VerdictKind.diacritics);
    expect(slip.missing, ['ć']);
    expect(checkAnswer('djaka', ['đaka']).result, VerdictKind.diacritics);
    expect(checkAnswer('daka', ['đaka']).result, VerdictKind.diacritics);
    expect(checkAnswer('kuča', ['kuca']).result, VerdictKind.wrong);
    expect(checkAnswer('кући', ['kući']).result, VerdictKind.exact);
    expect(normalizeAnswer('Ђаци!'), 'đaci');
  });

  test('все наборы дают задания, после предлога нет кратких форм', () {
    for (final scope in [
      'all', 'nouns', 'pronouns', 'case:n', 'case:g', 'case:d', 'case:a', 'case:v', 'case:i', 'case:l',
      'verbs', 'tense:pres', 'tense:perf', 'tense:fut', 'tense:imp',
    ]) {
      final source = TaskSource(data, scope, 'all', random: Random(7));
      for (var i = 0; i < 60; i++) {
        final task = source.next();
        expect(task.answers, isNotEmpty);
        if (['bez', 'sa', 'o'].contains(task.before) && task.kind == 'pronoun') {
          expect(task.answers, isNot(contains('me')));
          expect(task.answers, isNot(contains('ga')));
        }
      }
    }
  });

  test('перфект принимает оба порядка, футур — клитика после подлежащего', () {
    final perfect = TaskSource(data, 'tense:perf', 'a', random: Random(11)).next();
    final parts = perfect.answers.first.split(' ');
    expect(perfect.answers, contains('${parts[1]} ${parts[0]}'));
    final future = TaskSource(data, 'tense:fut', 'a', random: Random(5)).next();
    expect(future.answers.first, matches(RegExp(r'^ć(u|eš|e|emo|ete) ')));
  });

  test('голос находит форму внутри фразы, но не кусок слова', () {
    expect(spokenAnswer(['Идем без куће'], ['kuće']), 'kuće');
    expect(spokenAnswer(['ја сам радила'], ['sam radila', 'radila sam']), 'sam radila');
    expect(spokenAnswer(['jedem'], ['je']), isNull);
    expect(spokenAnswer(['kuca'], ['kuća']), 'kuća');
  });

  test('итоги и лапы', () {
    final task = TaskSource(data, 'case:g', 'a', random: Random(2)).next();
    final summary = summarize([
      Attempt(task, task.answers.first, checkAnswer(task.answers.first, task.answers)),
      Attempt(task, 'xxx', checkAnswer('xxx', task.answers)),
    ], 60);
    expect(summary.correct, 1);
    expect(summary.wrong, 1);
    expect(summary.accuracy, 50);
    expect(summary.weak.single.total, 2);
    expect(leftPawFor('b'), isTrue);
    expect(leftPawFor('n'), isFalse);
    expect(leftPawFor('z'), isFalse);
    expect(textFromInput('Љубав!'), 'ljubav');
  });
}
