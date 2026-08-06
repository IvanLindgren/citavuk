import '../utils/transliteration.dart';
import 'lexicon_db.dart';

/// Возвратная частица «se» и её глагол.
///
/// В сербском «se» почти никогда не стоит вплотную к своему глаголу: своего
/// ударения у неё нет, и место ей отводит не глагол, а фраза — второе, сразу за
/// первым ударным словом. Поэтому «On se zove Marko» выглядит так, будто «se»
/// относится к «on», а на деле это глагол «zvati se».
///
/// Повторяет server/internal/grammar/reflexive.go: приложение разбирает слово
/// офлайн по своей копии словаря, и разбор обязан совпадать с серверным.
class Reflexive {
  final String particle;
  final String verb;

  /// Нажали на саму частицу, а не на глагол.
  final bool onParticle;

  /// Второе слово пары — то, что нужно подсветить вдобавок к нажатому.
  final String companion;

  /// Спутник стоит ПЕРЕД нажатым словом.
  final bool before;

  /// Между частицей и глаголом нет других слов.
  final bool adjacent;

  /// Словарный порядок: «zove se», как бы ни стояло в тексте.
  final String phrase;

  /// Начальная форма вместе с частицей: «zvati se».
  final String lemma;

  final String meaning;
  final String why;

  const Reflexive({
    required this.particle,
    required this.verb,
    required this.onParticle,
    required this.companion,
    required this.before,
    required this.adjacent,
    required this.phrase,
    required this.lemma,
    required this.meaning,
    required this.why,
  });
}

class _Word {
  final String text;
  final int start;
  final int end;
  const _Word(this.text, this.start, this.end);
}

/// Слова, с которых начинается новая часть предложения.
///
/// Своя частица есть у каждой части, и без этого списка «Kad se vrati, reći ću
/// mu» приписало бы её глаголу «reći».
const _clauseOpeners = <String>{
  'i', 'a', 'ali', 'pa', 'te', 'ili', 'jer', 'nego', 'već', 'da', 'ako',
  'kad', 'kada', 'dok', 'što', 'iako', 'mada', 'pošto', 'ukoliko', 'čim',
  'koji', 'koja', 'koje', 'kojeg', 'kojem', 'gde', 'gdje', 'kako', 'jel',
};

/// Глаголы, у которых «se» входит в словарную форму: без частицы их просто нет.
const _seTantum = <String>{
  'bojati', 'smejati', 'smijati', 'nadati', 'truditi', 'potruditi', 'sećati',
  'sjećati', 'setiti', 'sjetiti', 'ponašati', 'dogoditi', 'desiti', 'diviti',
  'snalaziti', 'snaći', 'sviđati', 'svideti', 'svidjeti', 'dopadati', 'dopasti',
  'usuditi', 'rugati', 'šaliti', 'kajati', 'boriti', 'starati', 'protiviti',
  'sastojati', 'baviti', 'ticati', 'čuditi', 'zaljubiti', 'raspitivati',
  'smilovati', 'nadmetati', 'prisećati', 'prisjećati',
};

String _norm(String s) =>
    SerbianTransliteration.toLatin(s).trim().toLowerCase();

bool _isSe(String word) => _norm(word) == 'se';

final _wordChar = RegExp(r"[\p{L}\p{N}\-']", unicode: true);
final _breaks = RegExp(r'''[.,;:!?()\[\]{}"\n\r…«»„“”—–]''');

List<_Word> _splitWords(String sentence) {
  final out = <_Word>[];
  var begin = -1;
  for (var i = 0; i < sentence.length; i++) {
    if (_wordChar.hasMatch(sentence[i])) {
      if (begin < 0) begin = i;
      continue;
    }
    if (begin >= 0) {
      out.add(_Word(sentence.substring(begin, i), begin, i));
      begin = -1;
    }
  }
  if (begin >= 0) {
    out.add(_Word(sentence.substring(begin), begin, sentence.length));
  }
  return out;
}

int _wordIndexAt(List<_Word> words, int start, int end) {
  for (var i = 0; i < words.length; i++) {
    if (words[i].start <= start && end <= words[i].end) return i;
  }
  return -1;
}

/// Часть предложения вокруг слова. Границей служит знак препинания либо союз —
/// он относится уже к своей части и потому включается в неё слева.
(int, int) _clauseBounds(String sentence, List<_Word> words, int index) {
  var from = index;
  while (from > 0) {
    if (_breaks.hasMatch(sentence.substring(words[from - 1].end, words[from].start))) {
      break;
    }
    from--;
    if (_clauseOpeners.contains(_norm(words[from].text))) break;
  }
  var to = index + 1;
  while (to < words.length) {
    if (_breaks.hasMatch(sentence.substring(words[to - 1].end, words[to].start))) {
      break;
    }
    if (_clauseOpeners.contains(_norm(words[to].text))) break;
    to++;
  }
  return (from, to);
}

int _nearestSe(List<_Word> words, int from, int to, int index) {
  var best = -1;
  for (var i = from; i < to; i++) {
    if (i == index || !_isSe(words[i].text)) continue;
    if (best < 0 || (i - index).abs() < (best - index).abs()) best = i;
  }
  return best;
}

bool _adjacent(String sentence, List<_Word> words, int a, int b) {
  if ((a - b).abs() != 1) return false;
  final left = a < b ? a : b;
  final right = a < b ? b : a;
  return sentence.substring(words[left].end, words[right].start).trim().isEmpty;
}

String _meaning(String lemma) {
  if (_seTantum.contains(_norm(lemma))) {
    return '«$lemma» без «se» не бывает — это как «-ся» в «бояться».';
  }
  return '«se» бывает разным: «umiva se» — умывается (сам себя), '
      '«vide se» — видят друг друга, «ovde se ne puši» — здесь не курят.';
}

/// Объясняет место частицы коротко и без терминов: «клитика» русскому читателю
/// ничего не объясняет, а объяснение с ней становится вдвое длиннее.
String _why(List<_Word> words, int clauseFrom, int verbIndex, int seIndex, String verb) {
  final position = seIndex - clauseFrom;
  if (position == 0) {
    return '«se» — безударная частица и фразу не открывает: ей нужно слово, '
        'на которое опереться.';
  }
  if (position == 1 && seIndex - 1 == verbIndex) {
    return '«se» всегда стоит вторым словом. Здесь фразу открывает сам глагол '
        '«$verb», поэтому частица встала сразу за ним.';
  }
  if (position == 1) {
    return '«se» всегда стоит вторым словом фразы — здесь после '
        '«${words[seIndex - 1].text}». Место ей задаёт фраза, а не глагол, '
        'поэтому она и оказалась вдали от «$verb».';
  }
  final group = [for (var i = clauseFrom; i < seIndex; i++) words[i].text].join(' ');
  return '«$group» — это одно смысловое начало фразы, и «se» встаёт сразу за '
      'ним, а не рядом с глаголом «$verb».';
}

/// Связывает глагол и частицу «se» в пределах одной части предложения.
///
/// Работает в обе стороны: нажали глагол — ищется частица, нажали частицу —
/// её глагол. Второе не менее важно: «se» попадается в тексте на каждом шагу, а
/// в отрыве от глагола разбирается как местоимение «sebe».
Future<Reflexive?> attachSe({
  required String sentence,
  required int start,
  required int end,
  required String surface,
  String lemma = '',
}) async {
  final words = _splitWords(sentence);
  final index = _wordIndexAt(words, start, end);
  if (index < 0) return null;

  Future<String?> verbLemmaOf(String word) => LexiconDb.instance.verbLemma(word);

  final (from, to) = _clauseBounds(sentence, words, index);
  var verbIndex = index;
  int seIndex;
  final onParticle = _isSe(words[index].text);

  if (onParticle) {
    seIndex = index;
    verbIndex = -1;
    // Перебор от ближайшего слова наружу: «Bližila se ponoć» — глагол слева,
    // «On se zove Marko» — справа, и заранее сторона неизвестна.
    for (var step = 1; step < to - from && verbIndex < 0; step++) {
      for (final at in [index - step, index + step]) {
        if (at < from || at >= to || at == index) continue;
        if (_isSe(words[at].text)) continue;
        if (await verbLemmaOf(words[at].text) != null) {
          verbIndex = at;
          break;
        }
      }
    }
    if (verbIndex < 0) return null;
  } else {
    if (await verbLemmaOf(surface) == null) return null;
    seIndex = _nearestSe(words, from, to, index);
    if (seIndex < 0) return null;
  }

  final particle = words[seIndex].text;
  final verb = words[verbIndex].text;
  final verbLemma = lemma.isNotEmpty ? lemma : (await verbLemmaOf(verb) ?? '');
  final companionIndex = onParticle ? verbIndex : seIndex;

  return Reflexive(
    particle: particle,
    verb: verb,
    onParticle: onParticle,
    companion: onParticle ? verb : particle,
    before: companionIndex < index,
    adjacent: _adjacent(sentence, words, verbIndex, seIndex),
    phrase: '$verb ${particle.toLowerCase()}',
    lemma: verbLemma.isEmpty ? '' : '$verbLemma ${particle.toLowerCase()}',
    meaning: _meaning(verbLemma),
    why: _why(words, from, verbIndex, seIndex, verb),
  );
}
