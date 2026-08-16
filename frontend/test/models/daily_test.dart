import 'package:srbski_read/models/daily.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('набор «На каждый день»', () {
    test('разбирает ответ сервера целиком', () {
      final state = DailyState.fromJson({
        'set': {
          'id': 'd1',
          'day': '2026-08-15',
          'level': 'A2',
          'words': [
            {
              'lemma': 'бурек',
              'translation': 'бурек',
              'theme': 'Еда',
              'example': 'Купујем *бурек* сваког јутра.',
            },
          ],
          'lesson': {
            'title': 'Јутро',
            'text': 'Ана иде у пекару.',
            'exercises': [
              {
                'kind': 'choice',
                'question': 'Куда иде Ана?',
                'options': ['у пекару', 'у школу'],
                'answer': 'у пекару',
              },
            ],
          },
          'learned': ['бурек'],
        },
        'level': 'A2',
        'themes': ['Еда'],
        'configured': true,
        'canCompose': true,
        'progress': {
          'reviewedToday': 4,
          'dueNow': 2,
          'streak': 3,
          'faded': [
            {'word': 'кашика', 'translation': 'ложка', 'overdueDays': 9},
          ],
        },
      });

      expect(state.ready, isTrue);
      expect(state.set!.words.single.lemma, 'бурек');
      expect(state.set!.isLearned('бурек'), isTrue);
      expect(state.set!.lesson!.exercises.single.hasOptions, isTrue);
      expect(state.progress.faded.single.overdueDays, 9);
    });

    // Уровень или темы могут быть ещё не названы: тогда окно спрашивает, а не
    // показывает пустой набор.
    test('без уровня и настроек считается ненастроенным', () {
      final state = DailyState.fromJson({'set': null, 'level': ''});
      expect(state.ready, isFalse);
      expect(state.set, isNull);
      expect(state.progress.reviewedToday, 0);
    });

    // Задание с одним вариантом — не выбор: сервер такие превращает в перевод,
    // но клиент не должен рисовать кнопку-одиночку, даже если оно проскочит.
    test('выбор с одним вариантом не считается выбором', () {
      final exercise = DailyExercise.fromJson({
        'kind': 'choice',
        'question': 'Переведи: она идёт',
        'options': ['она иде'],
        'answer': 'она иде',
      });
      expect(exercise.hasOptions, isFalse);
    });

    test('пример показывается без разметки сайта', () {
      expect(plainExample('Купујем *бурек* сваког јутра.'),
          'Купујем бурек сваког јутра.');
      expect(plainExample('   '), '');
    });

    test('слепок для виджета переживает кодирование', () {
      final set = DailySet.fromJson({
        'id': 'd1',
        'day': '2026-08-15',
        'level': 'A2',
        'words': [
          {'lemma': 'пекара', 'translation': 'пекарня'},
        ],
        'learned': ['пекара'],
      });
      final again = DailySet.fromJson(set.toJson());
      expect(again.words.single.translation, 'пекарня');
      expect(again.isLearned('пекара'), isTrue);
    });
  });
}
