import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/vocab_tags.dart';

/// Метки словаря. Тот же расчёт, что на сайте (web/src/lib/vocabTags.test.ts):
/// словарь синхронизируется, и одна запись на двух устройствах обязана лежать
/// под одной меткой.
void main() {
  group('вид записи', () {
    test('фраза отличается от слова по пробелу', () {
      expect(isPhrase('kuća'), isFalse);
      expect(isPhrase('  kuća  '), isFalse);
      expect(isPhrase('mala kuća'), isTrue);
      expect(isPhrase('Колико кошта?'), isTrue);
    });
  });

  group('письмо', () {
    test('различает кириллицу и латиницу', () {
      expect(scriptOf('кућа'), 'кириллица');
      expect(scriptOf('kuća'), 'латиница');
    });

    // Спорную запись лучше не относить никуда, чем отнести неверно.
    test('смешанное и бесписьменное остаётся без метки', () {
      expect(scriptOf('кућа Wi-Fi'), isNull);
      expect(scriptOf('123'), isNull);
      expect(scriptOf(''), isNull);
    });
  });

  group('часть речи', () {
    test('переводит UD-теги в человеческие названия', () {
      expect(posTag('NOUN'), 'существительное');
      expect(posTag('VERB'), 'глагол');
      expect(posTag('AUX'), 'глагол');
    });

    test('неопределённость метки не даёт', () {
      expect(posTag('UNKNOWN'), isNull);
      expect(posTag('X'), isNull);
      expect(posTag(''), isNull);
    });
  });

  group('как идёт запоминание', () {
    test('несмотренное слово — новое', () {
      expect(progressTag(reps: 0, intervalDays: 0, ease: 2.5), 'новое');
    });

    test('месячный интервал считается выученным', () {
      expect(progressTag(reps: 5, intervalDays: 30, ease: 2.5), 'выучено');
    });

    test('просевшая лёгкость делает слово трудным', () {
      expect(progressTag(reps: 4, intervalDays: 2, ease: 1.9), 'трудное');
    });

    test('обычный ход — учу', () {
      expect(progressTag(reps: 2, intervalDays: 3, ease: 2.5), 'учу');
    });

    test('выучено сильнее трудного', () {
      expect(progressTag(reps: 9, intervalDays: 40, ease: 1.5), 'выучено');
    });
  });

  group('темы', () {
    test('слово получает тему из указателя', () {
      expect(topicTags('hleb'), contains('еда'));
      expect(topicTags('recept'), contains('здоровье'));
    });

    // Сохранить слово можно из книги на любом из двух писем.
    test('кириллица и латиница дают одну тему', () {
      expect(topicTags('хлеб'), topicTags('hleb'));
    });

    test('регистр и хвостовые знаки не мешают', () {
      expect(topicTags('Hleb,'), contains('еда'));
    });

    test('у фразы темы не ищутся', () {
      expect(topicTags('Дајте ми хлеб'), isEmpty);
    });

    test('незнакомое слово остаётся без темы', () {
      expect(topicTags('квазимодогенез'), isEmpty);
    });
  });

  group('метки записи целиком', () {
    test('слово размечается по всем разрядам', () {
      final tags = tagsFor(
          word: 'hleb', lemma: 'hleb', pos: 'NOUN', reps: 0, intervalDays: 0, ease: 2.5);
      expect(tags.map((t) => t.id).toList(),
          ['слово', 'существительное', 'латиница', 'новое', 'еда', 'частое']);
    });

    test('фраза не получает части речи', () {
      final tags = tagsFor(
          word: 'Колико кошта?', lemma: '', pos: 'NOUN', reps: 0, intervalDays: 0, ease: 2.5);
      expect(tags.map((t) => t.kind), isNot(contains(TagKind.pos)));
      expect(tags.first, const VocabTag('фраза', TagKind.kind));
    });
  });

  group('насколько ходовое', () {
    test('ядро языка отделено от просто частого', () {
      expect(freqTag('biti', 'biti'), 'первая тысяча');
      expect(freqTag('hleb', 'hleb'), 'частое');
    });

    // Указатель ведётся по леммам: «кућама» в нём нет, а «кућа» есть.
    test('спрашивается начальная форма', () {
      expect(freqTag('kućama', 'kuća'), freqTag('kuća', 'kuća'));
    });

    // Отсутствие значит и «редкое», и «начальную форму не распознали». Метка
    // «редкое» на неразобранном слове — уверенное враньё вместо молчания.
    test('слово вне указателя метки не получает', () {
      expect(freqTag('квазимодогенез', 'квазимодогенез'), isNull);
    });
  });

  group('место из Путешествия', () {
    test('слово ведёт в место, где им пользуются', () {
      expect(placeOf('burek')?.id, 'bakery');
      expect(placeOf('бурек')?.id, 'bakery');
    });

    test('у места есть оба названия', () {
      expect(placeOf('burek')?.ru, 'пекарня');
      expect(placeOf('burek')?.sr, 'пекара');
    });

    test('у фразы места нет', () {
      expect(placeOf('Дајте ми бурек'), isNull);
    });

    test('незнакомое слово места не получает', () {
      expect(placeOf('квазимодогенез'), isNull);
    });
  });

  group('метки с числами', () {
    final tagged = [
      tagsFor(word: 'hleb', lemma: 'hleb', pos: 'NOUN', reps: 0, intervalDays: 0, ease: 2.5),
      tagsFor(word: 'burek', lemma: 'burek', pos: 'NOUN', reps: 2, intervalDays: 3, ease: 2.5),
      tagsFor(word: 'trčati', lemma: 'trčati', pos: 'VERB', reps: 0, intervalDays: 0, ease: 2.5),
    ];

    test('считает, сколько записей под каждой меткой', () {
      final counts = {for (final c in tagCounts(tagged)) c.tag.id: c.count};
      expect(counts['еда'], 2);
      expect(counts['существительное'], 2);
      expect(counts['глагол'], 1);
      expect(counts['новое'], 2);
      expect(counts['учу'], 1);
    });

    // Вид записи разложен отдельными кнопками выше ряда, и в самом ряду он был
    // бы вторым способом сделать то же самое.
    test('вид записи в ряд не попадает', () {
      expect(tagCounts(tagged).map((c) => c.tag.kind),
          isNot(contains(TagKind.kind)));
    });

    test('темы идут первыми, внутри разряда — по убыванию числа', () {
      final listed = tagCounts(tagged);
      expect(listed.first.tag.kind, TagKind.topic);
      final pos = listed.where((c) => c.tag.kind == TagKind.pos).toList();
      expect(pos.map((c) => c.count).toList(), [2, 1]);
    });

    test('на пустом словаре ряд пуст', () {
      expect(tagCounts(const []), isEmpty);
    });
  });

  group('поиск', () {
    test('находит по слову, переводу и контексту', () {
      final fields = ['kuća', 'дом', 'Ovo je mala kuća.'];
      expect(matchesQuery(fields, 'kuć'), isTrue);
      expect(matchesQuery(fields, 'дом'), isTrue);
      expect(matchesQuery(fields, 'mala'), isTrue);
      expect(matchesQuery(fields, 'корабль'), isFalse);
    });

    test('письмо запроса не имеет значения', () {
      expect(matchesQuery(['kuća'], 'кућа'), isTrue);
      expect(matchesQuery(['кућа'], 'kuća'), isTrue);
    });

    test('пустой запрос пропускает всё', () {
      expect(matchesQuery(['kuća'], '   '), isTrue);
    });
  });
}
