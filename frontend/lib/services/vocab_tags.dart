/// Метки записи словаря.
///
/// Словарь копится из читалки и к сотне записей превращается в кучу: слово и
/// выделенная фраза лежат рядом, найти нужное нечем, а единственная
/// группировка — по книге, из которой слово взято. Метки дают второй разрез: по
/// виду записи, по части речи, по письму, по тому, как идёт запоминание, и по
/// теме.
///
/// Проставляются сами и нигде не хранятся. Метка — не поле записи, а взгляд на
/// неё: хранимая метка разошлась бы с состоянием повторения на следующий же
/// день, а перенос старых записей потребовал бы миграции ради подсказки.
///
/// Тот же расчёт на сайте — web/src/lib/vocabTags.ts. Совпадать он обязан:
/// словарь синхронизируется, и одна и та же запись на телефоне и в браузере
/// должна лежать под одной меткой.
library;

import '../utils/transliteration.dart';
import 'word_index.dart';

/// Разряд метки: по нему они раскладываются в отдельные ряды фильтра.
enum TagKind {
  kind('Вид'),
  pos('Часть речи'),
  script('Письмо'),
  progress('Как идёт'),
  topic('Тема'),
  freq('Насколько ходовое');

  const TagKind(this.title);

  final String title;
}

class VocabTag {
  const VocabTag(this.id, this.kind);

  final String id;
  final TagKind kind;

  @override
  bool operator ==(Object other) =>
      other is VocabTag && other.id == id && other.kind == kind;

  @override
  int get hashCode => Object.hash(id, kind);

  @override
  String toString() => id;
}

/// Фраза ли это.
///
/// По пробелу — им же отличаются фразы в повторении письмом. Из книги в словарь
/// уходит выделенный кусок целиком, и таких записей у читающего человека
/// набирается едва ли не половина.
bool isPhrase(String word) => word.trim().contains(RegExp(r'\s'));

final _cyrillic = RegExp(r'[Ѐ-ӿ]');
final _latin = RegExp(r'[A-Za-zČĆĐŠŽčćđšž]');

/// Каким письмом записано.
///
/// Сербский равноправно пишется кириллицей и латиницей, и в словарь одного
/// человека попадает и то и другое — из разных книг. Смешанные записи
/// (латинское название внутри сербской фразы) остаются без метки: спорную
/// запись лучше не относить никуда, чем отнести неверно.
String? scriptOf(String word) {
  final hasCyrillic = _cyrillic.hasMatch(word);
  final hasLatin = _latin.hasMatch(word);
  if (hasCyrillic == hasLatin) return null;
  return hasCyrillic ? 'кириллица' : 'латиница';
}

const _posTag = {
  'NOUN': 'существительное',
  'PROPN': 'имя собственное',
  'ADJ': 'прилагательное',
  'VERB': 'глагол',
  'AUX': 'глагол',
  'PRON': 'местоимение',
  'DET': 'местоимение',
  'ADV': 'наречие',
  'NUM': 'числительное',
  'ADP': 'предлог',
  'CCONJ': 'союз',
  'SCONJ': 'союз',
  'PART': 'частица',
  'INTJ': 'междометие',
};

/// Часть речи. `UNKNOWN` и `X` метки не дают: «слово» ничего не разделяет.
String? posTag(String pos) => _posTag[pos];

/// Как идёт запоминание.
///
/// Считается по интервалу и лёгкости, а не по числу показов: три показа за один
/// день значат меньше одного удачного через месяц. «Трудное» — слово, на
/// котором лёгкость просела ниже начальной: именно к нему стоит вернуться
/// отдельно, и найти его иначе нельзя.
String progressTag({required int reps, required int intervalDays, required double ease}) {
  if (reps == 0) return 'новое';
  if (intervalDays >= 30) return 'выучено';
  if (ease < 2.2) return 'трудное';
  return 'учу';
}

final _edges = RegExp(r'^[^\p{L}]+|[^\p{L}]+$', unicode: true);

/// Ключ для указателя тем: латиница, нижний регистр, без хвостовых знаков.
String _topicKey(String word) =>
    SerbianTransliteration.toLatin(word.trim().toLowerCase()).replaceAll(_edges, '');

/// Темы слова.
///
/// Указатель собран из Путешествия — см. tools/build_word_index.py. У фраз тем
/// не бывает: указатель ведётся по словам, а искать в нём фразу целиком значит
/// не найти ничего.
List<String> topicTags(String word) {
  if (isPhrase(word)) return const [];
  return kWordTopics[_topicKey(word)] ?? const [];
}

/// Насколько ходовое слово.
///
/// Считается по списку из двадцати тысяч лемм, по которому сервер оценивает
/// сложность книги; в клиент уезжает первая пятитысяча. Спрашивается сперва
/// начальная форма: указатель ведётся по леммам, и «кућама» в нём нет, а
/// «кућа» есть.
///
/// Слова вне указателя метки НЕ получают. Отсутствие значит и «редкое», и
/// «начальную форму не распознали», а метка «редкое» на неразобранном слове —
/// это уверенное враньё вместо молчания.
String? freqTag(String word, String lemma) {
  final bucket = kWordFreq[_topicKey(lemma)] ?? kWordFreq[_topicKey(word)];
  if (bucket == 1) return 'первая тысяча';
  if (bucket == 2) return 'частое';
  return null;
}

class VocabPlace {
  const VocabPlace(this.id, this.sr, this.ru);

  final String id;
  final String sr;
  final String ru;
}

/// Место из Путешествия, где слово встречается.
///
/// Из всех мест берётся самое «узкое» — с наименьшим словником: слово из места
/// с пятнадцатью словами говорит о нём больше, чем из места с сорока. Нужно для
/// обратной ссылки: сохранённое слово перестаёт быть строкой в списке и ведёт
/// туда, где им пользуются.
VocabPlace? placeOf(String word) {
  if (isPhrase(word)) return null;
  final id = kWordPlace[_topicKey(word)];
  if (id == null) return null;
  final name = kPlaceNames[id];
  if (name == null) return null;
  return VocabPlace(id, name[0], name[1]);
}

/// Все метки записи, в порядке разрядов.
List<VocabTag> tagsFor({
  required String word,
  required String lemma,
  required String pos,
  required int reps,
  required int intervalDays,
  required double ease,
}) {
  final tags = <VocabTag>[
    VocabTag(isPhrase(word) ? 'фраза' : 'слово', TagKind.kind),
  ];

  // У фразы часть речи не спрашивается: разбор идёт по одному слову, и
  // сохранённая с ним часть речи описывала бы только первое.
  final part = isPhrase(word) ? null : posTag(pos);
  if (part != null) tags.add(VocabTag(part, TagKind.pos));

  final script = scriptOf(word);
  if (script != null) tags.add(VocabTag(script, TagKind.script));

  tags.add(VocabTag(
    progressTag(reps: reps, intervalDays: intervalDays, ease: ease),
    TagKind.progress,
  ));

  for (final topic in topicTags(word)) {
    tags.add(VocabTag(topic, TagKind.topic));
  }

  // У фразы частотность не спрашивается по той же причине, что и часть речи:
  // указатель ведётся по одному слову.
  final freq = isPhrase(word) ? null : freqTag(word, lemma);
  if (freq != null) tags.add(VocabTag(freq, TagKind.freq));

  return tags;
}

/// Порядок разрядов в ряду меток: сперва то, чем словарь делят чаще.
const _kindOrder = [
  TagKind.topic,
  TagKind.freq,
  TagKind.pos,
  TagKind.progress,
  TagKind.script,
  TagKind.kind,
];

class TagCount {
  const TagCount(this.tag, this.count);

  final VocabTag tag;
  final int count;
}

/// Метки с числами для ряда фильтра.
///
/// Считать надо по тому, что осталось после поиска и выбранного вида, а не по
/// всему словарю: метка с числом, не совпадающим с длиной списка после нажатия
/// на неё, — обман. Вид записи в ряд не попадает: он уже разложен отдельными
/// кнопками выше.
List<TagCount> tagCounts(Iterable<List<VocabTag>> tagged) {
  final counts = <String, TagCount>{};
  for (final tags in tagged) {
    for (final tag in tags) {
      if (tag.kind == TagKind.kind) continue;
      counts[tag.id] = TagCount(tag, (counts[tag.id]?.count ?? 0) + 1);
    }
  }
  final list = counts.values.toList()
    ..sort((a, b) {
      final byKind =
          _kindOrder.indexOf(a.tag.kind).compareTo(_kindOrder.indexOf(b.tag.kind));
      if (byKind != 0) return byKind;
      final byCount = b.count.compareTo(a.count);
      return byCount != 0 ? byCount : a.tag.id.compareTo(b.tag.id);
    });
  return list;
}

/// Подходит ли запись под строку поиска.
///
/// Ищется и по сербскому слову, и по переводу, и по сохранённому контексту:
/// вспоминают запись по любому из трёх, а чаще всего — по русскому переводу.
/// Сравнение идёт в латинице, поэтому «kuća» находится и запросом «кућа».
bool matchesQuery(List<String> fields, String query) {
  final needle = SerbianTransliteration.toLatin(query.trim().toLowerCase());
  if (needle.isEmpty) return true;
  return fields.any((field) =>
      SerbianTransliteration.toLatin(field.toLowerCase()).contains(needle));
}
