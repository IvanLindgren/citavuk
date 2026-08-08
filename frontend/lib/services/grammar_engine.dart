import '../models/grammar.dart';
import '../utils/transliteration.dart';

/// Грамматический движок: строит объяснение «Почему так?» и парадигмы
/// (склонение / спряжение) из признаков CLASSLA (feats) или из MSD лексикона.
///
/// Точные формы берутся из lexicon.db (где они есть); недостающие достраиваются
/// правилами и помечаются как приблизительные (generated == true).
class GrammarEngine {
  // --- словари меток ---
  static const _posRu = {
    'NOUN': 'существительное',
    'PROPN': 'имя собственное',
    'ADJ': 'прилагательное',
    'VERB': 'глагол',
    'AUX': 'вспомогательный глагол',
    'PRON': 'местоимение',
    'ADV': 'наречие',
    'NUM': 'числительное',
    'ADP': 'предлог',
    'CCONJ': 'союз',
    'SCONJ': 'союз',
    'PART': 'частица',
    'DET': 'определительное местоимение',
    'INTJ': 'междометие',
    'UNKNOWN': 'слово (часть речи не определена)',
    'X': 'слово (часть речи не определена)',
  };

  static const _caseOrder = ['Nom', 'Gen', 'Dat', 'Acc', 'Voc', 'Ins', 'Loc'];
  static const _caseRu = {
    'Nom': 'Именительный (nominativ)',
    'Gen': 'Родительный (genitiv)',
    'Dat': 'Дательный (dativ)',
    'Acc': 'Винительный (akuzativ)',
    'Voc': 'Звательный (vokativ)',
    'Ins': 'Творительный (instrumental)',
    'Loc': 'Предложный/Местный (lokativ)',
  };
  static const _caseUse = {
    'Nom':
        'Это основной падеж любого языка. Выражает неизменную форму слова. Вопрос: ко? шта? '
            'Пример: «Pas spava» — пёс спит.',
    'Gen': 'Падеж принадлежности и отрицания. Вопрос: кога? чега? '
        'После предлогов iz/od/do/bez и при отрицании. Пример: «nema vremena» — нет времени.',
    'Dat': 'Падеж направления, а также указания. Вопрос: коме? чему? '
        'Пример: «dajem prijatelju» — даю другу.',
    'Acc':
        'Падеж любви :))))))) Используется после глаголов действий. Вопрос: кога? шта? '
            'Пример: «volim Denisa» — я люблю Дениса.',
    'Voc': 'Падеж для обращения. Пример: «Marko!», «prijatelju!».',
    'Ins': 'Падеж указания инстрмента, авторства. Вопрос: ким? чим? '
        'После предлога s/sa. Пример: «pišem olovkom» — пишу карандашом.',
    'Loc':
        'Падеж местоположения и некоторых предлогов. Вопрос: о коме? о чему? где? '
            'Пример: «u školi» — в школе.',
  };

  /// Типичные предлоги, требующие данного падежа (смысловая нагрузка падежа).
  static const _casePreps = {
    'Nom': <String>[],
    'Gen': [
      'od',
      'do',
      'iz',
      'sa',
      'bez',
      'kod',
      'oko',
      'posle',
      'pre',
      'protiv',
      'zbog',
      'radi',
      'preko',
      'ispod',
      'iznad',
      'ispred',
      'iza',
      'pored',
      'umesto',
      'tokom',
      'blizu',
      'između'
    ],
    'Dat': ['k', 'ka', 'prema', 'nasuprot', 'uprkos'],
    'Acc': [
      'u',
      'na',
      'kroz',
      'niz',
      'uz',
      'za',
      'po',
      'o',
      'pod',
      'pred',
      'nad'
    ],
    'Voc': <String>[],
    'Ins': ['s', 'sa', 'nad', 'pod', 'pred', 'među', 'za'],
    'Loc': ['u', 'na', 'o', 'po', 'pri', 'prema'],
  };
  static const _numberRu = {'Sing': 'единственное', 'Plur': 'множественное'};
  static const _genderRu = {
    'Masc': 'мужской',
    'Fem': 'женский',
    'Neut': 'средний'
  };
  static const _tenseRu = {
    'Pres': 'настоящее (prezent)',
    'Past': 'прошедшее (perfekat)',
    'Fut': 'будущее (futur)',
    'Imp': 'имперфект (imperfekat)',
    'Pqp': 'плусквамперфект (pluskvamperfekat)',
  };
  static const _personRu = {'1': '1-е лицо', '2': '2-е лицо', '3': '3-е лицо'};

  static const _persons = ['ja', 'ti', 'on/ona', 'mi', 'vi', 'oni/one'];
  static const _perfAux = ['sam', 'si', 'je', 'smo', 'ste', 'su'];
  static const _futClitic = ['ću', 'ćeš', 'će', 'ćemo', 'ćete', 'će'];

  // ---------------------------------------------------------------------------
  // Управление предлогов падежами (с каким падежом работает предлог).
  // Ключ — предлог латиницей в нижнем регистре. Значение — список пар
  // (падеж, значение). У «двусторонних» предлогов (u/na/o/za/pod/pred/nad/među)
  // несколько падежей — разводим по смыслу (движение → акузатив, место → локатив/
  // инструментал).
  // ---------------------------------------------------------------------------
  static const Map<String, List<(String, String)>> _prepGov = {
    // Генитив
    'od': [('Gen', 'от / из / у (откуда, от кого)')],
    'do': [('Gen', 'до (предела, места)')],
    'iz': [('Gen', 'из (изнутри)')],
    'bez': [('Gen', 'без чего-либо')],
    'kod': [('Gen', 'у / возле (kod doktora — у врача)')],
    'oko': [('Gen', 'вокруг / около')],
    'posle': [('Gen', 'после (во времени)')],
    'pre': [('Gen', 'до / перед (во времени)')],
    'protiv': [('Gen', 'против')],
    'zbog': [('Gen', 'из-за (причина)')],
    'radi': [('Gen', 'ради / для')],
    'preko': [('Gen', 'через / поверх / свыше')],
    'ispod': [('Gen', 'под (ниже чего-либо)')],
    'iznad': [('Gen', 'над (выше чего-либо)')],
    'ispred': [('Gen', 'перед (впереди чего-либо)')],
    'iza': [('Gen', 'за / позади')],
    'pored': [('Gen', 'рядом / возле')],
    'pokraj': [('Gen', 'рядом / возле')],
    'umesto': [('Gen', 'вместо')],
    'tokom': [('Gen', 'в течение')],
    'blizu': [('Gen', 'близко от')],
    'van': [('Gen', 'вне / снаружи')],
    'izvan': [('Gen', 'вне / снаружи')],
    'unutar': [('Gen', 'внутри')],
    // Датив
    'k': [('Dat', 'к (направление к кому/чему)')],
    'ka': [('Dat', 'к (направление к кому/чему)')],
    'nasuprot': [('Dat', 'напротив')],
    'uprkos': [('Dat', 'вопреки')],
    'prema': [
      ('Dat', 'к / по направлению к; согласно'),
      ('Loc', 'по / согласно (prema dogovoru)')
    ],
    // Двусторонние и прочие
    'u': [
      ('Acc', 'в (куда — движение): u grad'),
      ('Loc', 'в (где — место): u gradu')
    ],
    'na': [
      ('Acc', 'на (куда — движение): na sto'),
      ('Loc', 'на (где — место): na stolu')
    ],
    'o': [
      ('Loc', 'о / об (о ком, о чём): o ljubavi'),
      ('Acc', 'обо (удар обо что)')
    ],
    'po': [
      ('Loc', 'по (по чему, после): po gradu'),
      ('Acc', 'за (сходить за чем-то)')
    ],
    'pri': [('Loc', 'при / возле / в процессе')],
    's': [('Ins', 'с (с кем/чем — вместе): s prijateljem')],
    'sa': [
      ('Ins', 'с (с кем/чем — вместе): sa drugom'),
      ('Gen', 'с / со (откуда: sa stola)')
    ],
    'nad': [('Ins', 'над (где): nad gradom'), ('Acc', 'над (куда)')],
    'pod': [('Ins', 'под (где): pod stolom'), ('Acc', 'под (куда): pod sto')],
    'pred': [('Ins', 'перед (где): pred kućom'), ('Acc', 'перед (куда)')],
    'među': [('Ins', 'между / среди')],
    'za': [
      ('Acc', 'за / для (uzeti za ruku; za tebe)'),
      ('Ins', 'за (следовать за, позади)'),
      ('Gen', 'во время (za vreme rata)')
    ],
    'kroz': [('Acc', 'сквозь / через')],
    'niz': [('Acc', 'вниз по')],
    'uz': [('Acc', 'вверх по / вдоль / рядом с')],
    'između': [('Gen', 'между')],
  };

  /// С каким падежом (падежами) работает предлог. Пусто — если не предлог
  /// или предлог неизвестен. Принимает кириллицу/латиницу в любом регистре.
  static List<PrepositionGovernment> prepositionGovernment(String word) {
    final p = SerbianTransliteration.toLatin(word)
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-zšđžčć]'), '')
        .trim();
    final entries = _prepGov[p];
    if (entries == null) return const [];
    return entries
        .map((e) => PrepositionGovernment(
            caseKey: e.$1, caseName: _caseRu[e.$1] ?? e.$1, meaning: e.$2))
        .toList();
  }

  /// Известный ли это предлог (для авто-подсказки при выделении слова/фразы).
  static bool isKnownPreposition(String word) =>
      prepositionGovernment(word).isNotEmpty;

  /// Короткое имя падежа («Генитив»), без латинского дубля — для чипов.
  static String caseShort(String caseKey) =>
      const {
        'Nom': 'Номинатив',
        'Gen': 'Генитив',
        'Dat': 'Датив',
        'Acc': 'Акузатив',
        'Voc': 'Вокатив',
        'Ins': 'Инструментал',
        'Loc': 'Локатив',
      }[caseKey] ??
      caseKey;

  /// Наибольший общий префикс двух строк.
  static String _commonPrefix(String a, String b) {
    final n = a.length < b.length ? a.length : b.length;
    var i = 0;
    while (i < n && a[i] == b[i]) {
      i++;
    }
    return a.substring(0, i);
  }

  /// Делит набор словоформ на (основу, окончание) по общему префиксу, чтобы в
  /// таблице подчёркивать именно меняющееся окончание. Пустые формы и «—»
  /// возвращаются как есть.
  static List<({String stem, String ending})> splitStemEndings(
      List<String> forms) {
    final real = forms.where((f) => f.isNotEmpty && f != '—').toList();
    if (real.length < 2) {
      return forms.map((f) => (stem: f, ending: '')).toList();
    }
    var prefix = real.first;
    for (final f in real.skip(1)) {
      prefix = _commonPrefix(prefix, f);
      if (prefix.isEmpty) break;
    }
    return forms.map((f) {
      if (f.isEmpty || f == '—' || prefix.length >= f.length) {
        return (stem: f, ending: '');
      }
      return (
        stem: f.substring(0, prefix.length),
        ending: f.substring(prefix.length),
      );
    }).toList();
  }

  // ---------------------------------------------------------------------------
  // Разбор MSD (схема lexicon.db — подмножество MULTEXT-East).
  // ---------------------------------------------------------------------------
  static String? _g(String c) =>
      const {'m': 'Masc', 'f': 'Fem', 'n': 'Neut'}[c];
  static String? _n(String c) => const {'s': 'Sing', 'p': 'Plur'}[c];
  static String? _c(String c) => const {
        'n': 'Nom',
        'g': 'Gen',
        'd': 'Dat',
        'a': 'Acc',
        'v': 'Voc',
        'i': 'Ins',
        'l': 'Loc',
      }[c];

  static Map<String, String> featsFromMsd(String msd) {
    final f = <String, String>{};
    if (msd.isEmpty) return f;
    switch (msd[0]) {
      case 'N':
        if (msd.length >= 5) {
          _put(f, 'Gender', _g(msd[2]));
          _put(f, 'Number', _n(msd[3]));
          _put(f, 'Case', _c(msd[4]));
        }
        break;
      case 'A':
        if (msd.length >= 6) {
          _put(f, 'Gender', _g(msd[3]));
          _put(f, 'Number', _n(msd[4]));
          _put(f, 'Case', _c(msd[5]));
        }
        break;
      case 'V':
        if (msd.length >= 3 && msd[2] == 'n') {
          f['VerbForm'] = 'Inf';
        } else if (msd.length >= 5 && msd[2] == 'p') {
          f['Tense'] = 'Pres';
          f['Person'] = msd[3];
          _put(f, 'Number', _n(msd[4]));
        }
        break;
      case 'P':
        if (msd.length >= 6) {
          f['Person'] = msd[2];
          if (msd[3] != '-') _put(f, 'Gender', _g(msd[3]));
          _put(f, 'Number', _n(msd[4]));
          _put(f, 'Case', _c(msd[5]));
        }
        break;
    }
    return f;
  }

  static void _put(Map<String, String> m, String k, String? v) {
    if (v != null) m[k] = v;
  }

  /// Разбирает строку признаков UD ("Case=Nom|Gender=Masc|Number=Sing").
  static Map<String, String> parseFeats(String? raw) {
    final m = <String, String>{};
    if (raw == null || raw.isEmpty || raw == '_') return m;
    for (final part in raw.split('|')) {
      final i = part.indexOf('=');
      if (i > 0) m[part.substring(0, i)] = part.substring(i + 1);
    }
    return m;
  }

  // --- Русские подписи (чтобы в карточках не было «сырых» UD-тегов) ---

  static const _posShortRu = {
    'NOUN': 'сущ.',
    'PROPN': 'имя собств.',
    'ADJ': 'прил.',
    'VERB': 'глагол',
    'AUX': 'всп. глагол',
    'PRON': 'мест.',
    'ADV': 'нареч.',
    'NUM': 'числит.',
    'ADP': 'предлог',
    'CCONJ': 'союз',
    'SCONJ': 'союз',
    'PART': 'частица',
    'DET': 'опред. местоимение',
    'INTJ': 'межд.',
    // Никогда не показываем пользователю сырые UD-теги неопределённости.
    'UNKNOWN': 'слово',
    'X': 'слово',
  };

  static String posShort(String upos) => _posShortRu[upos] ?? upos;
  static String posFull(String upos) => _posRu[upos] ?? upos;

  /// Русское название «основной формы» (ключи приходят с сервера на англ.).
  static String formKeyRu(String key) =>
      const {
        'infinitive': 'инфинитив',
        'present_1sg': '1 л. ед. ч. (наст.)',
        'nominative_singular': 'им. п., ед. ч.',
        'nominative_plural': 'им. п., мн. ч.',
        'nominative_masculine': 'им. п., муж. род',
        'nominative_feminine': 'им. п., жен. род',
        'nominative_neuter': 'им. п., ср. род',
      }[key] ??
      key;

  /// Готовые «человеческие» подписи признаков для чипов: [(Падеж, Родительный), ...].
  static List<GrammarFact> humanFacts(String upos, Map<String, String> feats) =>
      describe(upos, feats).facts;

  /// Справочник падежей (для интерактивной шпаргалки): название, для чего
  /// нужен и типичные предлоги этого падежа.
  static List<({String key, String name, String use, List<String> preps})>
      casesReference() => _caseOrder
          .map((c) => (
                key: c,
                name: _caseRu[c]!,
                use: _caseUse[c]!,
                preps: _casePreps[c] ?? const <String>[],
              ))
          .toList();

  /// Все карточки грамматики (агрегат карточек всех тем) — для обратной
  /// совместимости с местами, где нужна плоская колода.
  static List<RuleCard> ruleCards() =>
      grammarTopics().expand((t) => t.cards).toList();

  /// Темы грамматического раздела: список тем, в каждой — подробное правило
  /// по шагам и карточки для запоминания.
  static List<GrammarTopic> grammarTopics() {
    final cases = casesReference();
    return [
      GrammarTopic(
        id: 'cases',
        title: 'Падежи',
        subtitle: '7 падежей: шесть знакомых по русскому + звательный',
        tag: 'Падежи',
        intro: 'В сербском 7 падежей: шесть соответствуют русским, седьмой — '
            'звательный (vokativ) для обращения («Marko!», «prijatelju!»). '
            'Lokativ соответствует русскому предложному и, как и в русском, '
            'употребляется только с предлогами. Логика употребления очень '
            'близка к русской, а многие окончания похожи — это самая «лёгкая» '
            'часть сербской грамматики для русскоговорящих.',
        sections: [
          for (final c in cases)
            GrammarTopicSection(
              c.name,
              c.preps.isEmpty
                  ? c.use
                  : '${c.use}\n\nТипичные предлоги: ${c.preps.join(', ')}.',
            ),
        ],
        cards: [
          for (final c in cases)
            (
              front: c.name,
              back: c.preps.isEmpty
                  ? c.use
                  : '${c.use}\n\nПредлоги: ${c.preps.join(', ')}.',
              tag: 'Падеж'
            ),
        ],
      ),
      const GrammarTopic(
        id: 'prezent',
        title: 'Презент (prezent)',
        subtitle: 'настоящее время — основа основ',
        tag: 'Время',
        intro:
            'Настоящее время. Единственное простое (несоставное) время, которое '
            'используется всегда и везде — и в речи, и на письме. С него и '
            'начинают учить глагол.',
        sections: [
          GrammarTopicSection(
            'Как образуется',
            'Основа глагола + личные окончания: -m, -š, —, -mo, -te, -u/-ju/-e.\n\n'
                'По соединительной гласной глаголы делятся на три класса:\n'
                '• A-класс: imati → imam, imaš, ima, imamo, imate, imaju\n'
                '• E-класс: pisati → pišem, pišeš, piše, pišemo, pišete, pišu\n'
                '• I-класс: govoriti → govorim, govoriš, govori, govorimo, govorite, govore',
          ),
          GrammarTopicSection(
            'Нюансы',
            '3-е лицо ед. числа — без окончания (on radi). Окончание 3-го лица '
                'мн. числа зависит от класса: -aju / -u / -e.\n\n'
                'Глаголы на -ovati / -ivati в презенте меняют суффикс на -uj-: '
                'putovati → putujem, kupovati → kupujem.',
          ),
          GrammarTopicSection(
            'Примеры',
            'Čitam knjigu. — Я читаю книгу.\n'
                'Šta radiš? — Что делаешь?\n'
                'Oni žive u Beogradu. — Они живут в Белграде.',
          ),
        ],
        cards: [
          (
            front: 'Презент (prezent) — настоящее время',
            back:
                'Действие происходит сейчас. Основа глагола + личные окончания: '
                '-m, -š, -∅, -mo, -te, -(j)u.\nПример: radim, radiš, radi, radimo, '
                'radite, rade.',
            tag: 'Время',
          ),
        ],
      ),
      const GrammarTopic(
        id: 'perfekat',
        title: 'Перфекат (perfekat)',
        subtitle: 'главное прошедшее время разговорной речи',
        tag: 'Время',
        intro: 'Основное прошедшее время: в современной речи им выражают почти '
            'любое действие в прошлом. По смыслу соответствует русскому '
            'прошедшему, а по строению похоже на английский Present Perfect — '
            'это составная форма из вспомогательного глагола и причастия.',
        sections: [
          GrammarTopicSection(
            'Как образуется',
            'Вспомогательный глагол biti (sam, si, je, smo, ste, su) + радни '
                'глаголски придев — причастие на -o/-la/-lo (ед. ч.) и '
                '-li/-le/-la (мн. ч.), согласуется в роде и числе:\n\n'
                'radio sam (я делал, м.р.) / radila sam (ж.р.)\n'
                'radili smo (мы делали) / radile smo (мы, ж.р.)',
          ),
          GrammarTopicSection(
            'Порядок слов',
            'Краткие формы sam/si/je… — энклитики: не могут стоять первым словом. '
                '«Radio sam.» или «Ja sam radio.», но не «Sam radio».\n\n'
                'У возвратных глаголов в 3-м лице ед. числа je обычно опускается: '
                '«On se smejao» (а не «se je smejao»).',
          ),
          GrammarTopicSection(
            'Примеры',
            'Juče sam gledao film. — Вчера я смотрел фильм.\n'
                'Ona je došla kasno. — Она пришла поздно.\n'
                'Gde ste bili? — Где вы были?',
          ),
        ],
        cards: [
          (
            front: 'Перфекат (perfekat) — прошедшее время',
            back: 'Основное прошедшее. Вспомогательный глагол biti '
                '(sam/si/je/smo/ste/su) + причастие на -o/-la/-lo (по роду и '
                'числу).\nПример: radio sam, radila si, radili smo.',
            tag: 'Время',
          ),
        ],
      ),
      const GrammarTopic(
        id: 'futur1',
        title: 'Футур I (futur prvi)',
        subtitle: 'будущее время: hteti + инфинитив',
        tag: 'Время',
        intro:
            'Будущее время. Как русское «буду делать», только вместо глагола '
            '«быть» — глагол hteti («хотеть»). Это основная форма будущего, '
            'употребляется и в речи, и на письме.',
        sections: [
          GrammarTopicSection(
            'Как образуется',
            'Краткие формы hteti (ću, ćeš, će, ćemo, ćete, će) + инфинитив.\n\n'
                'Два равноправных варианта записи:\n'
                '• раздельно: ja ću raditi, ti ćeš čitati\n'
                '• слитно (инфинитив на -ti теряет -ti): radiću, čitaćeš\n\n'
                'Глаголы на -ći не сливаются: doći ću (приду), ići ćemo (пойдём).',
          ),
          GrammarTopicSection(
            'Примеры',
            'Sutra ću doći. — Завтра приду.\n'
                'Videćemo se. — Увидимся.\n'
                'Šta ćeš raditi? — Что будешь делать?',
          ),
        ],
        cards: [
          (
            front: 'Футур I (futur) — будущее время',
            back: 'Краткие формы hteti (ću/ćeš/će/ćemo/ćete/će) + инфинитив.\n'
                'Пример: radiću / ću raditi, čitaćeš / ćeš čitati. '
                'Глаголы на -ći не сливаются: doći ću.',
            tag: 'Время',
          ),
        ],
      ),
      const GrammarTopic(
        id: 'aorist',
        title: 'Аорист (aorist)',
        subtitle: 'простое прошедшее — в книгах и коротких репликах',
        tag: 'Время',
        intro:
            'Простое (одно слово, без вспомогательного глагола) прошедшее время '
            'для завершённого действия. Живёт в художественной литературе и '
            'повествовании, а в разговорной речи — в коротких эмоциональных '
            'репликах и сообщениях. Образуется почти всегда от глаголов '
            'совершенного вида.',
        sections: [
          GrammarTopicSection(
            'Как образуется',
            'Основа аориста + окончания: -h, -∅/-e, -∅/-e, -smo, -ste, -še '
                '(после согласной основы: -oh, -e, -e, -osmo, -oste, -oše).\n\n'
                'pogledati → pogledah, pogleda, pogleda, pogledasmo, pogledaste, pogledaše\n'
                'reći → rekoh, reče, reče, rekosmo, rekoste, rekoše',
          ),
          GrammarTopicSection(
            'biti в аористе',
            'bih, bi, bi, bismo, biste, biše.\n\n'
                'Эти же формы работают вспомогательным глаголом условного '
                'наклонения (potencijal): «Ja bih došao» — я бы пришёл. Поэтому '
                'встретив bi/bih, сначала проверь — не условное ли это «бы».',
          ),
          GrammarTopicSection(
            'Как узнать в тексте',
            'Одна короткая форма без sam/je/su рядом, часто в диалогах и '
                'повествовании:\n\n'
                '«Odoh ja!» — ну, я пошёл!\n'
                '«Reče mi da dođem.» — он сказал мне прийти.\n'
                '«Stigosmo!» — приехали!',
          ),
        ],
        cards: [
          (
            front: 'Аорист (aorist) — простое прошедшее',
            back:
                'Одна форма без вспомогательного глагола; завершённое действие. '
                'Окончания: -h/-oh, -e, -e, -smo, -ste, -še.\n'
                'Пример: rekoh, reče, rekosmo (от reći).\n'
                'biti: bih, bi, bismo — они же в условном наклонении («бы»).',
            tag: 'Время',
          ),
        ],
      ),
      const GrammarTopic(
        id: 'imperfekat',
        title: 'Имперфект (imperfekat)',
        subtitle: 'простое прошедшее длительное — почти только в книгах',
        tag: 'Время',
        intro: 'Простое прошедшее время для длительного или повторяющегося '
            'действия. В современной речи практически вышел из употребления — '
            'его место занял перфекат, — но в художественной литературе и '
            'старых текстах встречается регулярно. Образуется только от '
            'глаголов несовершенного вида.',
        sections: [
          GrammarTopicSection(
            'Как образуется',
            'Основа + окончания: -ah, -aše, -aše, -asmo, -aste, -ahu '
                '(варианты -jah/-ijah у части глаголов).\n\n'
                'govoriti → govorah, govoraše, govoraše, govorasmo, govoraste, govorahu',
          ),
          GrammarTopicSection(
            'biti в имперфекте',
            'bejah, beše, beše, bejasmo, bejaste, bejahu (екавский вариант; '
                'в иекавском — bijah, bješe…).\n\n'
                '«Beše jednom…» — «Жил-был однажды…» — классическое начало сказок.',
          ),
          GrammarTopicSection(
            'Как узнать в тексте',
            'Характерные суффиксы -aše / -ijaše / -ahu:\n\n'
                '«On pevaše» — он пел (тогда, долго).\n'
                '«Deca se igrahu u dvorištu.» — дети играли во дворе.',
          ),
        ],
        cards: [
          (
            front: 'Имперфект (imperfekat) — простое прошедшее',
            back: 'Длительное/повторяющееся действие в прошлом; только '
                'несовершенный вид. Окончания: -ah, -aše, -aše, -asmo, -aste, -ahu.\n'
                'Пример: govorah, govoraše (от govoriti).\n'
                'Сейчас почти только в литературе; biti: bejah, beše…',
            tag: 'Время',
          ),
        ],
      ),
      const GrammarTopic(
        id: 'pluskvamperfekat',
        title: 'Плусквамперфект (pluskvamperfekat)',
        subtitle: 'давнопрошедшее: раньше другого прошедшего',
        tag: 'Время',
        intro:
            'Давнопрошедшее время: действие, которое произошло РАНЬШЕ другого '
            'действия в прошлом. В современной речи часто заменяется перфектом '
            'со словами već («уже») или pre toga («до этого»), но в книгах '
            'встречается часто.',
        sections: [
          GrammarTopicSection(
            'Как образуется',
            'Два равнозначных способа:\n\n'
                '1) перфекат глагола biti + причастие: bio sam radio\n'
                '2) имперфект глагола biti + причастие: bejah radio (книжный вариант)',
          ),
          GrammarTopicSection(
            'Пример',
            'Kad smo stigli, voz je već bio otišao. — Когда мы пришли, поезд '
                'уже ушёл (раньше нашего прихода).\n\n'
                'Vratio sam knjigu koju sam bio pozajmio. — Я вернул книгу, '
                'которую (до этого) брал.',
          ),
        ],
        cards: [
          (
            front: 'Плусквамперфект — давнопрошедшее',
            back: 'Действие раньше другого прошедшего. biti в перфекте + '
                'причастие: bio sam radio.\nПример: Kad smo stigli, voz je već '
                'bio otišao. — поезд ушёл ДО нашего прихода.',
            tag: 'Время',
          ),
        ],
      ),
      const GrammarTopic(
        id: 'futur2',
        title: 'Футур II (futur drugi)',
        subtitle: 'предбудущее — только в придаточных',
        tag: 'Время',
        intro: '«Предбудущее» время: употребляется только в придаточных '
            'предложениях условия и времени — там, где русский использует '
            'будущее («когда у меня БУДЕТ время…»). Самостоятельно, в главном '
            'предложении, не употребляется.',
        sections: [
          GrammarTopicSection(
            'Как образуется',
            'Презент глагола biti (budem, budeš, bude, budemo, budete, budu) + '
                'причастие на -o/-la/-lo:\n\n'
                'budem radio, budeš čitala, budemo živeli',
          ),
          GrammarTopicSection(
            'Примеры',
            'Kad budem imao vremena, doći ću. — Когда у меня будет время, я приду.\n'
                'Ako budeš učio, položićeš ispit. — Если будешь учиться, сдашь экзамен.',
          ),
        ],
        cards: [
          (
            front: 'Футур II (futur drugi) — предбудущее',
            back: 'Только в придаточных условия/времени. budem/budeš/bude… + '
                'причастие.\nПример: Kad budem imao vremena, doći ću. — Когда '
                'у меня будет время, приду.',
            tag: 'Время',
          ),
        ],
      ),
    ];
  }

  // ---------------------------------------------------------------------------
  // Распознавание времени глагола, включая аорист и имперфект.
  //
  // CLASSLA/UD кодирует их так:
  //  • имперфект           → Tense=Imp;
  //  • аорист              → Tense=Past + VerbForm=Fin (финитная форма);
  //  • перфекат            → Tense=Past + VerbForm=Part (радни глаг. придев -o/-la);
  //  • плусквамперфект     → Tense=Pqp.
  // Так аорист отличается от перфеката: первый — простая (синтетическая) форма,
  // второй — составная (biti + причастие).
  // ---------------------------------------------------------------------------
  static String? _verbTenseLabel(Map<String, String> feats) {
    final tense = feats['Tense'];
    if (tense == null) return null;
    switch (tense) {
      case 'Pres':
        return 'настоящее (prezent)';
      case 'Fut':
        return 'будущее (futur)';
      case 'Imp':
        return 'имперфект (imperfekat) — прошедшее';
      case 'Pqp':
        return 'плусквамперфект (pluskvamperfekat) — давнопрошедшее';
      case 'Past':
        // Финитная форма прошедшего в изъявительном наклонении — аорист.
        // (Mood=Cnd + Fin — это bih/bi/bismo, аорист biti для потенцијала; его
        // разбирает ветка условного наклонения, тут не маркируем как аорист.)
        final mood = feats['Mood'];
        return (feats['VerbForm'] == 'Fin' && (mood == null || mood == 'Ind'))
            ? 'аорист (aorist) — прошедшее'
            : 'прошедшее (perfekat)';
      default:
        return _tenseRu[tense] ?? tense;
    }
  }

  /// Короткое пояснение для редких/синтетических времён (аорист, имперфект,
  /// плусквамперфект) — добавляется к разбору, когда они распознаны.
  static String _tenseExplain(Map<String, String> feats) {
    final tense = feats['Tense'];
    final verbForm = feats['VerbForm'];
    if (tense == 'Imp') {
      return 'Имперфект — простое (синтетическое) прошедшее время для длительного '
          'или повторяющегося действия в прошлом. В современной речи редок, '
          'встречается в литературе. Пример: govoraše (от govoriti).';
    }
    if (tense == 'Past' && verbForm == 'Fin') {
      return 'Аорист — простое (синтетическое) прошедшее время для завершённого '
          'действия. Часто в повествовании и живой речи. Пример: rekoh, reče, '
          'rekosmo (от reći). Отличается от перфеката тем, что это одна форма, '
          'без вспомогательного глагола.';
    }
    if (tense == 'Pqp') {
      return 'Плусквамперфект — давнопрошедшее: действие, случившееся раньше '
          'другого прошедшего. Строится как biti в прошедшем + причастие.';
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // Объяснение «Почему так?».
  // ---------------------------------------------------------------------------
  /// Степень сравнения. Без неё «bolji» описывался как обычное прилагательное.
  static const _degreeRu = {
    'Pos': 'положительная (dobar)',
    'Cmp': 'сравнительная (bolji)',
    'Sup': 'превосходная (najbolji)',
  };

  /// Вид прилагательного — то, чем сербское прилагательное отличается от
  /// русского сильнее всего.
  static const _definiteRu = {
    'Ind': 'неопределённый (dobar čovek — какой-то)',
    'Def': 'определённый (dobri čovek — тот самый)',
  };

  /// Короткие названия для строки-сводки: в ней перечисление, и развёрнутые
  /// пояснения с примерами читались бы как каша.
  static const _degreeSummary = {
    'Cmp': 'сравнительная степень',
    'Sup': 'превосходная степень',
  };
  static const _definiteSummary = {
    'Ind': 'неопределённый вид',
    'Def': 'определённый вид',
  };

  /// Название именной формы глагола. Раньше их не было вовсе: `VerbForm=Conv`
  /// давал пустую карточку, а трпни придев показывался как прилагательное.
  static String? _verbFormLabel(String? verbForm, String? voice) {
    switch (verbForm) {
      case 'Inf':
        return 'инфинитив';
      case 'Conv':
        return 'деепричастие (глаголски прилог)';
      case 'Part':
        return voice == 'Pass'
            ? 'страдательное причастие (трпни глаголски придев)'
            : 'причастие (радни глаголски придев)';
      case 'Ger':
        return 'отглагольное существительное (глаголска именица)';
    }
    return null;
  }

  static String? _verbFormSummary(String? verbForm, String? voice) {
    switch (verbForm) {
      case 'Inf':
        return 'инфинитив';
      case 'Conv':
        return 'деепричастие';
      case 'Part':
        return voice == 'Pass' ? 'страдательное причастие' : 'причастие';
    }
    return null;
  }

  /// Дописывает то, чего нет в русском языке и о чём поэтому нужно сказать
  /// словами: вид прилагательного и степень сравнения.
  static String _adjectiveExplain(Map<String, String> feats) {
    final parts = <String>[];
    switch (feats['Definite']) {
      case 'Ind':
        parts.add('Неопределённый вид (neodređeni): называет признак впервые, '
            'отвечает на «kakav?». «Ovo je dobar čovek» — это хороший человек.');
      case 'Def':
        parts.add('Определённый вид (određeni): указывает на уже известный '
            'предмет, отвечает на «koji?». «Dobri čovek je došao» — тот самый '
            'хороший человек пришёл. В родительном и дательном виды различаются '
            'окончанием: «dobra» против «dobrog», «dobru» против «dobrom».');
    }
    switch (feats['Degree']) {
      case 'Cmp':
        parts.add('Сравнительная степень (komparativ): образуется суффиксами '
            '-iji, -ji или -ši. Сравнение вводится словом «od» с родительным '
            'падежом либо «nego»: «viši od mene», «viši nego ja».');
      case 'Sup':
        parts.add('Превосходная степень (superlativ): приставка naj- к '
            'сравнительной степени, всегда слитно — «najviši», «najbolji».');
    }
    return parts.join('\n\n');
  }

  static GrammarInfo describe(String upos, Map<String, String> feats) {
    final posLabel = _posRu[upos] ?? upos;
    final facts = <GrammarFact>[];

    final gcase = feats['Case'];
    final number = feats['Number'];
    final gender = feats['Gender'];
    final tense = feats['Tense'];
    final person = feats['Person'];
    final verbForm = feats['VerbForm'];
    final mood = feats['Mood'];
    final degree = feats['Degree'];
    final definite = feats['Definite'];
    final voice = feats['Voice'];

    // Именная форма глагола называется первой: без этого «radeći» показывалось
    // пустой карточкой, а «urađen» — как обычное прилагательное.
    final formLabel = _verbFormLabel(verbForm, voice);
    if (formLabel != null) facts.add(GrammarFact('Форма', formLabel));
    if (gcase != null) facts.add(GrammarFact('Падеж', _caseRu[gcase] ?? gcase));
    // Положительная степень не отмечается: «прилагательное в положительной
    // степени» — это просто прилагательное.
    if (degree != null && degree != 'Pos' && _degreeRu[degree] != null) {
      facts.add(GrammarFact('Степень сравнения', _degreeRu[degree]!));
    }
    if (definite != null && _definiteRu[definite] != null) {
      facts.add(GrammarFact('Вид прилагательного', _definiteRu[definite]!));
    }
    if (tense != null) {
      facts.add(GrammarFact(
          'Время', _verbTenseLabel(feats) ?? _tenseRu[tense] ?? tense));
    }
    if (mood == 'Imp') {
      facts.add(const GrammarFact('Наклонение', 'повелительное (императив)'));
    }
    if (mood == 'Cnd') {
      facts.add(const GrammarFact('Наклонение', 'условное (потенцијал)'));
    }
    if (voice == 'Pass') {
      facts.add(const GrammarFact('Залог', 'страдательный'));
    }
    if (person != null) {
      facts.add(GrammarFact('Лицо', _personRu[person] ?? person));
    }
    if (number != null) {
      facts.add(GrammarFact('Число', _numberRu[number] ?? number));
    }
    if (gender != null) {
      facts.add(GrammarFact('Род', _genderRu[gender] ?? gender));
    }

    final summaryParts = [
      _verbFormSummary(verbForm, voice),
      if (gcase != null) (_caseRu[gcase] ?? gcase).toLowerCase(),
      if (degree != null && degree != 'Pos') _degreeSummary[degree],
      if (definite != null) _definiteSummary[definite],
      if (tense != null) (_verbTenseLabel(feats) ?? _tenseRu[tense] ?? tense),
      if (mood == 'Imp') 'повелительное наклонение',
      if (mood == 'Cnd') 'условное наклонение',
      if (person != null) _personRu[person],
      if (number != null) _numberRu[number],
      // Раньше сюда попадал сырой тег: «род: Masc» вместо «род: мужской».
      if (gender != null) 'род: ${_genderRu[gender] ?? gender}',
    ].whereType<String>().toList();

    String why;
    // Именные формы глагола проверяются РАНЬШЕ падежа: у страдательного
    // причастия падеж есть, и без этой ветки «urađen» объяснялся бы как
    // обычное прилагательное в именительном падеже.
    if (verbForm == 'Conv') {
      why = 'Это деепричастие (глаголски прилог) — неизменяемая форма глагола, '
          'которая называет побочное действие: «radeći» — работая, '
          '«ušavši» — войдя.\n\n'
          'Настоящего времени (садашњи) образуется от 3-го лица множественного '
          'презента с -ći: rade → radeći. Прошедшего (прошли) — от инфинитива '
          'с -vši: uraditi → uradivši. Деепричастие не склоняется и не '
          'спрягается.';
    } else if (verbForm == 'Part' && voice == 'Pass') {
      why = 'Это страдательное причастие (трпни глаголски придев) — форма '
          'глагола, которая ведёт себя как прилагательное: склоняется по родам, '
          'числам и падежам («urađen posao», «urađena kuća»).\n\n'
          'Образуется от инфинитива суффиксами -n/-en/-t: pisati → pisan, '
          'uraditi → urađen, otvoriti → otvoren. Именно из него строится '
          'страдательный залог: «Posao je urađen» — работа сделана.';
    } else if (verbForm == 'Part') {
      why = 'Это радни глаголски придев — причастие на -o/-la/-lo, из которого '
          'строится прошедшее время.\n\nСамо по себе оно не употребляется: '
          'перфекат — это вспомогательный глагол biti плюс это причастие '
          '(«ja sam radio», «ona je radila»). Род и число причастие берёт от '
          'подлежащего, а лицо выражает вспомогательный глагол.';
    } else if (gcase != null) {
      why = 'Это $posLabel в форме «${(_caseRu[gcase] ?? gcase).toLowerCase()} '
          'падеж», ${_numberRu[number] ?? ''} число'
          '${gender != null ? ', ${_genderRu[gender]} род' : ''}.\n\n'
          'Зачем нужен этот падеж: ${_caseUse[gcase] ?? '—'}.';
      final extra = _adjectiveExplain(feats);
      if (extra.isNotEmpty) why = '$why\n\n$extra';
    } else if (verbForm == 'Inf' ||
        (tense != null && mood != 'Imp' && mood != 'Cnd')) {
      if (verbForm == 'Inf') {
        why =
            'Это инфинитив — начальная форма глагола (отвечает на «что делать?»). '
            'От неё образуются все времена.';
      } else {
        final label = _verbTenseLabel(feats) ?? _tenseRu[tense] ?? tense;
        final explain = _tenseExplain(feats);
        why = 'Глагол в форме «$label», '
            '${_personRu[person] ?? ''}, ${_numberRu[number] ?? ''} число.'
            '${explain.isNotEmpty ? '\n\n$explain' : ''}'
            '\n\nНиже — спряжение в трёх самых употребительных временах: презент, '
            'перфекат, футур I. В сербском есть и другие времена (аорист, '
            'имперфекат, плусквамперфекат, футур II), но в живой речи чаще всего '
            'используются эти три.';
      }
    } else if (mood == 'Imp') {
      why =
          'Это повелительное наклонение (императив) — выражает приказ или просьбу '
          '(${_personRu[person] ?? ''}, ${_numberRu[number] ?? ''} число).\n\n'
          'Ниже — спряжение этого глагола в основных временах.';
    } else if (mood == 'Cnd') {
      why =
          'Это условное наклонение (потенцијал) — выражает возможность или условие '
          '(бы, если бы).\n\n'
          'Ниже — спряжение этого глагола в основных временах.';
    } else if (feats.isNotEmpty) {
      why = 'Это $posLabel. Базовые грамматические признаки указаны выше.';
    } else {
      why =
          'Базовый разбор: $posLabel. Полный разбор формы (падежи, лица) доступен при '
          'подключённом сервере (CLASSLA) или для слов из словаря.';
    }

    return GrammarInfo(
      posLabel: posLabel,
      facts: facts,
      summary: summaryParts.join(', '),
      why: why,
    );
  }

  // ---------------------------------------------------------------------------
  // Парадигмы.
  // ---------------------------------------------------------------------------
  static List<ParadigmTable> buildParadigms({
    required String lemma,
    required String upos,
    required Map<String, String> feats,
    required List<Map<String, dynamic>> lexiconRows,
    required String surface,
  }) {
    final lemmaLat = SerbianTransliteration.toLatin(lemma).toLowerCase();
    final surfaceLat = SerbianTransliteration.toLatin(surface).toLowerCase();

    // form(latin) с разобранными feats из MSD.
    final parsed = lexiconRows.map((r) {
      final form = (r['form'] ?? '').toString().toLowerCase();
      final msd = (r['msd'] ?? '').toString();
      final fstr = (r['feats'] ?? '').toString();
      // Предпочитаем реальные UD-feats; MSD — запасной разбор для старых данных.
      final feats = fstr.isNotEmpty ? parseFeats(fstr) : featsFromMsd(msd);
      return (form: form, msd: msd, feats: feats);
    }).toList();

    String? fromLexicon(bool Function(Map<String, String>) match) {
      for (final p in parsed) {
        if (match(p.feats)) return p.form;
      }
      return null;
    }

    switch (upos) {
      case 'NOUN':
      case 'PROPN':
        return _nounParadigm(lemmaLat, feats, parsed, fromLexicon, surfaceLat);
      case 'ADJ':
        return _adjParadigm(lemmaLat, feats, parsed, fromLexicon, surfaceLat);
      case 'VERB':
      case 'AUX':
        return _verbParadigm(lemmaLat, feats, fromLexicon, surfaceLat);
      default:
        return const [];
    }
  }

  /// Возможные начальные формы для словоформы.
  ///
  /// Лексикон хранит в среднем две формы на лемму, поэтому «kućom» в нём
  /// просто нет, и слово оставалось без основы. Вместо угадывания разбора по
  /// окончанию проверяем обратное: строим от каждого кандидата его парадигму и
  /// смотрим, получилась ли из неё эта форма. Правило то же, что на сервере
  /// (`server/internal/grammar/resolve.go`), — иначе сайт и приложение
  /// показывали бы разную начальную форму.
  static List<String> lemmaCandidates(String form) {
    final low = form.toLowerCase();
    final seen = <String>{low};
    final out = <String>[low];

    void add(String word) {
      if (word.length < 2 || !seen.add(word)) return;
      out.add(word);
    }

    const endings = [
      '', 'a', 'o', 'e', 'ti', 'iti', 'ati', 'eti', 'nuti', 'ovati' //
    ];
    for (var cut = 1; cut <= 4 && cut < low.length; cut++) {
      final base = low.substring(0, low.length - cut);
      for (final ending in endings) {
        add(base + ending);
      }
    }
    return out;
  }

  /// Падеж и число, при которых лемма даёт эту форму.
  ///
  /// Перебирается список форм, а не строка для показа: там варианты склеены
  /// через «/», и сравнение со склеенной строкой не совпало бы никогда —
  /// «čoveka» так и не опозналось бы винительным падежом.
  static Map<String, String>? matchNoun(
      String lemma, String gender, String form) {
    final low = form.toLowerCase();
    for (final number in const ['Sing', 'Plur']) {
      for (final c in _caseOrder) {
        if (!_declensionForms(lemma, gender, number, c).contains(low)) continue;
        return {'Case': c, 'Number': number, 'Gender': gender};
      }
    }
    return null;
  }

  /// Лицо и число презента или род и число причастия.
  static Map<String, String>? matchVerb(String lemma, String form) {
    final low = form.toLowerCase();

    final present = _presentForms(lemma);
    for (var i = 0; i < present.length; i++) {
      if (present[i] == null || present[i] != low) continue;
      return {
        'Tense': 'Pres',
        'Person': '${i % 3 + 1}',
        'Number': i >= 3 ? 'Plur' : 'Sing',
        'VerbForm': 'Fin',
        'Mood': 'Ind',
      };
    }

    final participle = _pastParticiple(lemma);
    if (participle != null) {
      const genders = ['Masc', 'Fem', 'Neut', 'Masc', 'Fem', 'Neut'];
      for (var i = 0; i < participle.length; i++) {
        if (participle[i] != low) continue;
        return {
          'VerbForm': 'Part',
          'Tense': 'Past',
          'Gender': genders[i],
          'Number': i >= 3 ? 'Plur' : 'Sing',
        };
      }
    }

    if (lemma == low) return {'VerbForm': 'Inf'};
    return null;
  }

  /// Род существительного по лемме и известным формам — для [matchNoun].
  static String guessGender(
          String lemma,
          List<({String form, String msd, Map<String, String> feats})>
              parsed) =>
      _gender(lemma, const {}, parsed);

  static String _gender(String lemma, Map<String, String> feats,
      List<({String form, String msd, Map<String, String> feats})> parsed) {
    if (feats['Gender'] != null) return feats['Gender']!;
    for (final p in parsed) {
      if (p.feats['Gender'] != null) return p.feats['Gender']!;
    }
    if (lemma.endsWith('a')) return 'Fem';
    if (lemma.endsWith('o') || lemma.endsWith('e')) return 'Neut';
    return 'Masc';
  }

  static List<ParadigmTable> _nounParadigm(
    String lemma,
    Map<String, String> feats,
    List<({String form, String msd, Map<String, String> feats})> parsed,
    String? Function(bool Function(Map<String, String>)) fromLexicon,
    String surface,
  ) {
    final gender = _gender(lemma, feats, parsed);
    final tables = <ParadigmTable>[];
    for (final number in const ['Sing', 'Plur']) {
      final rows = <ParadigmCell>[];
      for (final c in _caseOrder) {
        var form = fromLexicon((f) => f['Number'] == number && f['Case'] == c);
        var generated = false;
        if (form == null) {
          form = _declension(lemma, gender, number, c);
          generated = form != null;
        }
        rows.add(ParadigmCell(
          label: _caseRu[c]!,
          form: form ?? '—',
          generated: generated,
          current: form != null && form == surface,
          caseKey: c,
        ));
      }
      tables.add(ParadigmTable(
        title: 'Склонение — ${_numberRu[number]} число',
        rows: rows,
        highlightEndings: true,
      ));
    }
    return tables;
  }

  /// Нерегулярный компаратив частотных прилагательных (-ši/-ji и супплетивы).
  static const Map<String, String> _irregularComparative = {
    'dobar': 'bolji',
    'loš': 'gori',
    'zao': 'gori',
    'velik': 'veći',
    'veliki': 'veći',
    'mali': 'manji',
    'dug': 'duži',
    'lep': 'lepši',
    'lak': 'lakši',
    'mek': 'mekši',
    'brz': 'brži',
    'jak': 'jači',
    'drag': 'draži',
    'tih': 'tiši',
    'strog': 'stroži',
    'mlad': 'mlađi',
    'tvrd': 'tvrđi',
    'čest': 'češći',
    'gust': 'gušći',
    'ljut': 'ljući',
    'skup': 'skuplji',
    'visok': 'viši',
    'nizak': 'niži',
    'dubok': 'dublji',
    'širok': 'širi',
    'dalek': 'dalji',
    'težak': 'teži',
    'kratak': 'kraći',
    'blizak': 'bliži',
    'sladak': 'slađi',
    'redak': 'ređi',
    'žut': 'žući',
    'krut': 'krući',
    'glup': 'gluplji',
    'suv': 'suvlji',
    'grub': 'grublji',
    'čvrst': 'čvršći',
    'gorak': 'gorči',
    'uzak': 'uži',
    'debeo': 'deblji',
    'beo': 'belji',
    'star': 'stariji',
    'nov': 'noviji',
    'jeftin': 'jeftiniji',
    'pametan': 'pametniji',
  };

  /// Основы прилагательных, которые правилом не выводятся из-за чередований:
  /// nizak → niska (z→s), redak → retka (d→t).
  static const Map<String, String> _irregularAdjStem = {
    'nizak': 'nisk',
    'redak': 'retk',
    'blizak': 'blisk',
    'težak': 'tešk',
    'uzak': 'usk',
    'sladak': 'slatk',
    'gorak': 'gork',
    'zao': 'zl',
  };

  /// Основа прилагательного.
  ///
  /// Лемма бывает и определённой («veliki»), и неопределённой («dobar»). У
  /// неопределённой обычно есть беглое «а», и его надо убрать: dobar → dobr,
  /// hladan → hladn, topao → topl. Повторяет adjectiveStem в
  /// server/internal/grammar/adjective.go.
  static String _adjectiveStem(String lemma) {
    final irr = _irregularAdjStem[lemma];
    if (irr != null) return irr;
    if (lemma.length < 3) return lemma;
    String cut(int n, String add) => lemma.substring(0, lemma.length - n) + add;
    // Определённый вид уже содержит окончание -i: veliki → velik.
    if (lemma.endsWith('i')) return cut(1, '');
    // -ao/-eo восходят к основе на -l: topao → topl, veseo → vesel.
    if (lemma.endsWith('eo')) return cut(2, 'el');
    if (lemma.endsWith('ao')) return cut(2, 'l');
    // Беглое «а» только у многосложных: «hladan» → hladn, но «stran» → stran.
    if (lemma.endsWith('an') && _syllables(lemma) >= 2) return cut(2, 'n');
    if (lemma.endsWith('ar') && _syllables(lemma) >= 2) return cut(2, 'r');
    if (lemma.endsWith('ak') && _syllables(lemma) >= 2) return cut(2, 'k');
    return lemma;
  }

  /// Окончания прилагательного. Женский род и всё множественное у обоих видов
  /// совпадают; расходятся только мужской и средний род в единственном числе —
  /// именно там вид и виден.
  static const Map<String, Map<String, String>> _adjIndefSing = {
    'Masc': {
      'Nom': '',
      'Gen': 'a',
      'Dat': 'u',
      'Acc': '',
      'Voc': '',
      'Ins': 'im',
      'Loc': 'u'
    },
    'Fem': {
      'Nom': 'a',
      'Gen': 'e',
      'Dat': 'oj',
      'Acc': 'u',
      'Voc': 'a',
      'Ins': 'om',
      'Loc': 'oj'
    },
    'Neut': {
      'Nom': 'o',
      'Gen': 'a',
      'Dat': 'u',
      'Acc': 'o',
      'Voc': 'o',
      'Ins': 'im',
      'Loc': 'u'
    },
  };
  static const Map<String, Map<String, String>> _adjDefSing = {
    'Masc': {
      'Nom': 'i',
      'Gen': 'og',
      'Dat': 'om',
      'Acc': 'i',
      'Voc': 'i',
      'Ins': 'im',
      'Loc': 'om'
    },
    'Fem': {
      'Nom': 'a',
      'Gen': 'e',
      'Dat': 'oj',
      'Acc': 'u',
      'Voc': 'a',
      'Ins': 'om',
      'Loc': 'oj'
    },
    'Neut': {
      'Nom': 'o',
      'Gen': 'og',
      'Dat': 'om',
      'Acc': 'o',
      'Voc': 'o',
      'Ins': 'im',
      'Loc': 'om'
    },
  };
  static const Map<String, Map<String, String>> _adjPlural = {
    'Masc': {
      'Nom': 'i',
      'Gen': 'ih',
      'Dat': 'im',
      'Acc': 'e',
      'Voc': 'i',
      'Ins': 'im',
      'Loc': 'im'
    },
    'Fem': {
      'Nom': 'e',
      'Gen': 'ih',
      'Dat': 'im',
      'Acc': 'e',
      'Voc': 'e',
      'Ins': 'im',
      'Loc': 'im'
    },
    'Neut': {
      'Nom': 'a',
      'Gen': 'ih',
      'Dat': 'im',
      'Acc': 'a',
      'Voc': 'a',
      'Ins': 'im',
      'Loc': 'im'
    },
  };

  /// Форма прилагательного. [definite] выбирает вид; для женского рода и
  /// множественного числа он не влияет ни на что — так устроен язык.
  static String? adjectiveForm(
      String lemma, String gender, String number, String c, bool definite) {
    final stem = _adjectiveStem(lemma);
    if (stem.isEmpty || gender.isEmpty) return null;
    final table = number == 'Sing'
        ? (definite ? _adjDefSing : _adjIndefSing)
        : _adjPlural;
    final ending = table[gender]?[c];
    if (ending == null) return null;
    // Нулевое окончание — неопределённый именительный мужского рода, и беглое
    // «а» в нём НА МЕСТЕ: «dobar», а не «dobr».
    if (ending.isEmpty) return lemma.endsWith('i') ? stem : lemma;
    return stem + _softenAdjEnding(stem, gender, ending);
  }

  /// После мягкой основы «о» переходит в «е»: vruć → vrućeg, vruće. Женского
  /// рода это не касается — там «vrućoj» и «vrućom».
  static String _softenAdjEnding(String stem, String gender, String ending) {
    if (gender == 'Fem' || !_softFinal(stem) || !ending.startsWith('o')) {
      return ending;
    }
    return 'e${ending.substring(1)}';
  }

  /// Компаратив по правилу: -iji (star → stariji); беглое «a» в -an выпадает
  /// (pametan → pametniji). Для нерегулярных — таблица выше.
  static String? _comparative(String lemma) {
    final irr = _irregularComparative[lemma];
    if (irr != null) return irr;
    if (lemma.length < 3) return null;
    var base = lemma;
    if (base.endsWith('an') && base.length > 4) {
      base = '${base.substring(0, base.length - 2)}n';
    }
    return '${base}iji';
  }

  static List<ParadigmTable> _adjParadigm(
    String lemma,
    Map<String, String> feats,
    List<({String form, String msd, Map<String, String> feats})> parsed,
    String? Function(bool Function(Map<String, String>)) fromLexicon,
    String surface,
  ) {
    ParadigmCell cell(String label, String g, String number) {
      final form = fromLexicon((f) =>
          f['Gender'] == g && f['Number'] == number && f['Case'] == 'Nom');
      return ParadigmCell(
        label: label,
        form: form ?? '—',
        current: form != null && form == surface,
      );
    }

    // Степени сравнения: лексикон (Degree=Cmp/Sup) в приоритете, иначе правило
    // с пометкой ≈. Суперлатив = naj- + компаратив (всегда).
    final lexCmp = fromLexicon((f) =>
        f['Degree'] == 'Cmp' &&
        f['Gender'] == 'Masc' &&
        f['Number'] == 'Sing' &&
        f['Case'] == 'Nom');
    final cmp = lexCmp ?? _comparative(lemma);
    final lexSup = fromLexicon((f) =>
        f['Degree'] == 'Sup' &&
        f['Gender'] == 'Masc' &&
        f['Number'] == 'Sing' &&
        f['Case'] == 'Nom');
    final sup = lexSup ?? (cmp == null ? null : 'naj$cmp');

    // Склонение показывается для того рода и числа, в которых стоит
    // разобранное слово: полная сетка «три рода × два числа × семь падежей» —
    // это 42 строки, и нужную человек в ней не найдёт.
    final gender = feats['Gender'] ?? 'Masc';
    final number = feats['Number'] == 'Plur' ? 'Plur' : 'Sing';
    final declensionRows = <ParadigmCell>[];
    for (final c in _caseOrder) {
      final lexIndef = fromLexicon((f) =>
          f['Gender'] == gender &&
          f['Number'] == number &&
          f['Case'] == c &&
          f['Definite'] == 'Ind');
      final lexDef = fromLexicon((f) =>
          f['Gender'] == gender &&
          f['Number'] == number &&
          f['Case'] == c &&
          f['Definite'] == 'Def');
      final indefinite =
          lexIndef ?? adjectiveForm(lemma, gender, number, c, false);
      final definite = lexDef ?? adjectiveForm(lemma, gender, number, c, true);
      if (indefinite == null && definite == null) continue;
      // Совпали — показываем одну форму. Это не экономия места, а факт языка:
      // в женском роде и во множественном числе вид не различается вовсе.
      final form = (definite != null && definite != indefinite)
          ? '$indefinite / $definite'
          : (indefinite ?? definite)!;
      declensionRows.add(ParadigmCell(
        label: _caseRu[c] ?? c,
        form: form,
        generated: lexIndef == null || lexDef == null,
        current: indefinite == surface || definite == surface,
      ));
    }

    return [
      ParadigmTable(
        title: 'Именительный падеж',
        subtitle: 'по родам и числам',
        highlightEndings: true,
        rows: [
          cell('муж. ед.', 'Masc', 'Sing'),
          cell('жен. ед.', 'Fem', 'Sing'),
          cell('ср. ед.', 'Neut', 'Sing'),
          cell('муж. мн.', 'Masc', 'Plur'),
          cell('жен. мн.', 'Fem', 'Plur'),
          cell('ср. мн.', 'Neut', 'Plur'),
        ],
      ),
      if (declensionRows.isNotEmpty)
        ParadigmTable(
          title: 'Склонение — ${_genderRu[gender]} род, '
              '${_numberRu[number]} число',
          subtitle: number == 'Plur'
              ? 'во множественном числе вид не различается'
              : 'неопределённый вид / определённый вид '
                  '(«dobar čovek» — какой-то, «dobri čovek» — тот самый)',
          highlightEndings: true,
          rows: declensionRows,
        ),
      if (cmp != null)
        ParadigmTable(
          title: 'Степени сравнения',
          subtitle: 'компаратив -iji/-ši/-ji; суперлатив = naj- + компаратив',
          rows: [
            ParadigmCell(
                label: 'позитив', form: lemma, current: lemma == surface),
            ParadigmCell(
                label: 'компаратив',
                form: cmp,
                generated: lexCmp == null,
                current: cmp == surface),
            ParadigmCell(
                label: 'суперлатив',
                form: sup ?? '—',
                generated: lexSup == null,
                current: sup != null && sup == surface),
          ],
        ),
    ];
  }

  static List<ParadigmTable> _verbParadigm(
    String lemma,
    Map<String, String> feats,
    String? Function(bool Function(Map<String, String>)) fromLexicon,
    String surface,
  ) {
    // Презент
    final present = _presentForms(lemma);
    final prezRows = <ParadigmCell>[];
    for (var i = 0; i < 6; i++) {
      final person = '${(i % 3) + 1}';
      final number = i < 3 ? 'Sing' : 'Plur';
      var form = fromLexicon((f) =>
          f['Tense'] == 'Pres' &&
          f['Person'] == person &&
          f['Number'] == number);
      var generated = false;
      if (form == null && present[i] != null) {
        form = present[i];
        generated = true;
      }
      prezRows.add(ParadigmCell(
        label: _persons[i],
        form: form ?? '—',
        generated: generated,
        current: form != null && form == surface,
      ));
    }

    // Перфекат = вспом. глагол biti + радни глаг. придев (муж. род).
    // Причастие берём из лексикона (точное), иначе достраиваем правилом.
    final lexPartMascSg = fromLexicon((f) =>
        f['VerbForm'] == 'Part' &&
        f['Tense'] == 'Past' &&
        f['Gender'] == 'Masc' &&
        f['Number'] == 'Sing');
    final lexPartFemSg = fromLexicon((f) =>
        f['VerbForm'] == 'Part' &&
        f['Tense'] == 'Past' &&
        f['Gender'] == 'Fem' &&
        f['Number'] == 'Sing');
    final lexPartNeutSg = fromLexicon((f) =>
        f['VerbForm'] == 'Part' &&
        f['Tense'] == 'Past' &&
        f['Gender'] == 'Neut' &&
        f['Number'] == 'Sing');
    final lexPartMascPl = fromLexicon((f) =>
        f['VerbForm'] == 'Part' &&
        f['Tense'] == 'Past' &&
        f['Gender'] == 'Masc' &&
        f['Number'] == 'Plur');
    final lexPartFemPl = fromLexicon((f) =>
        f['VerbForm'] == 'Part' &&
        f['Tense'] == 'Past' &&
        f['Gender'] == 'Fem' &&
        f['Number'] == 'Plur');
    final lexPartNeutPl = fromLexicon((f) =>
        f['VerbForm'] == 'Part' &&
        f['Tense'] == 'Past' &&
        f['Gender'] == 'Neut' &&
        f['Number'] == 'Plur');

    final rulePart = _pastParticiple(lemma);
    final partMascSg = lexPartMascSg ?? rulePart?[0];
    final partFemSg = lexPartFemSg ?? rulePart?[1];
    final partNeutSg = lexPartNeutSg ?? rulePart?[2];
    final partMascPl = lexPartMascPl ?? rulePart?[3];
    final partFemPl = lexPartFemPl ?? rulePart?[4];
    final partNeutPl = lexPartNeutPl ?? rulePart?[5];

    final perfRows = <ParadigmCell>[];
    ParadigmCell buildPerfCell(String label, String aux, String? part1,
        [String? part2]) {
      final form = part1 == null
          ? '—'
          : (part2 == null ? '$aux $part1' : '$aux $part1 / $part2');
      final isGen = part1 != null &&
          rulePart != null &&
          (part1 == rulePart[0] ||
              part1 == rulePart[1] ||
              part1 == rulePart[2] ||
              part1 == rulePart[3] ||
              part1 == rulePart[4] ||
              part1 == rulePart[5]);
      return ParadigmCell(
        label: label,
        form: form,
        generated: isGen,
      );
    }

    perfRows
        .add(buildPerfCell('ja (м./ж.)', _perfAux[0], partMascSg, partFemSg));
    perfRows
        .add(buildPerfCell('ti (м./ж.)', _perfAux[1], partMascSg, partFemSg));
    perfRows.add(buildPerfCell('on', _perfAux[2], partMascSg));
    perfRows.add(buildPerfCell('ona', _perfAux[2], partFemSg));
    perfRows.add(buildPerfCell('ono', _perfAux[2], partNeutSg));
    perfRows
        .add(buildPerfCell('mi (м./ж.)', _perfAux[3], partMascPl, partFemPl));
    perfRows
        .add(buildPerfCell('vi (м./ж.)', _perfAux[4], partMascPl, partFemPl));
    perfRows.add(buildPerfCell('oni', _perfAux[5], partMascPl));
    perfRows.add(buildPerfCell('one', _perfAux[5], partFemPl));
    perfRows.add(buildPerfCell('ona', _perfAux[5], partNeutPl));

    // Футур I = клитика hteti + инфинитив
    final futRows = List.generate(
      6,
      (i) => ParadigmCell(label: _persons[i], form: '${_futClitic[i]} $lemma'),
    );

    // Аорист и имперфект: лексикон в приоритете, правило — с пометкой ≈.
    // Таблица добавляется, только если есть хоть одна форма.
    List<ParadigmCell> simplePastRows(
        bool Function(Map<String, String>, String person, String number) match,
        List<String?> ruleForms) {
      final rows = <ParadigmCell>[];
      for (var i = 0; i < 6; i++) {
        final person = '${(i % 3) + 1}';
        final number = i < 3 ? 'Sing' : 'Plur';
        var form = fromLexicon((f) => match(f, person, number));
        var generated = false;
        if (form == null && ruleForms[i] != null) {
          form = ruleForms[i];
          generated = true;
        }
        rows.add(ParadigmCell(
          label: _persons[i],
          form: form ?? '—',
          generated: generated,
          current: form != null && form == surface,
        ));
      }
      return rows;
    }

    final aorRows = simplePastRows(
      // Аорист в UD: Tense=Past + финитная форма (не причастие), изъявительное
      // наклонение (Mood=Cnd с теми же формами — потенцијал, не аорист).
      (f, p, n) =>
          f['Tense'] == 'Past' &&
          f['VerbForm'] == 'Fin' &&
          (f['Mood'] == null || f['Mood'] == 'Ind') &&
          f['Person'] == p &&
          f['Number'] == n,
      _aoristForms(lemma),
    );
    final impfRows = simplePastRows(
      (f, p, n) =>
          f['Tense'] == 'Imp' &&
          f['VerbForm'] == 'Fin' &&
          f['Person'] == p &&
          f['Number'] == n,
      _imperfectForms(lemma),
    );
    final hasAorist = aorRows.any((r) => r.form != '—');
    final hasImperfect = impfRows.any((r) => r.form != '—');

    return [
      ParadigmTable(
          title: 'Презент (настоящее)', rows: prezRows, highlightEndings: true),
      ParadigmTable(
        title: 'Перфекат (прошедшее)',
        subtitle:
            'глагол biti + причастие (здесь — муж. род; ж.р.: -la, ср.р.: -lo)',
        rows: perfRows,
      ),
      ParadigmTable(
        title: 'Футур I (будущее)',
        subtitle: 'глагол hteti + инфинитив',
        rows: futRows,
      ),
      if (hasAorist)
        ParadigmTable(
          title: 'Аорист (книжное прошедшее)',
          subtitle: 'завершённое действие; чаще от глаголов совершенного вида',
          rows: aorRows,
          highlightEndings: true,
        ),
      if (hasImperfect)
        ParadigmTable(
          title: 'Имперфект (книжное прошедшее)',
          subtitle: 'длительное действие; только несовершенный вид',
          rows: impfRows,
          highlightEndings: true,
        ),
    ];
  }

  // --- правила (приблизительные) ---

  /// Частотные нерегулярные глаголы: точный презент там, где правило по
  /// инфинитиву даёт неверные формы (pisati → «pisam» вместо pišem и т.п.).
  static const Map<String, List<String>> _irregularPresent = {
    'biti': ['sam', 'si', 'je', 'smo', 'ste', 'su'],
    'hteti': ['hoću', 'hoćeš', 'hoće', 'hoćemo', 'hoćete', 'hoće'],
    'moći': ['mogu', 'možeš', 'može', 'možemo', 'možete', 'mogu'],
    'ići': ['idem', 'ideš', 'ide', 'idemo', 'idete', 'idu'],
    'doći': ['dođem', 'dođeš', 'dođe', 'dođemo', 'dođete', 'dođu'],
    'otići': ['odem', 'odeš', 'ode', 'odemo', 'odete', 'odu'],
    'naći': ['nađem', 'nađeš', 'nađe', 'nađemo', 'nađete', 'nađu'],
    'stići': ['stignem', 'stigneš', 'stigne', 'stignemo', 'stignete', 'stignu'],
    'jesti': ['jedem', 'jedeš', 'jede', 'jedemo', 'jedete', 'jedu'],
    'sesti': ['sednem', 'sedneš', 'sedne', 'sednemo', 'sednete', 'sednu'],
    'pasti': ['padnem', 'padneš', 'padne', 'padnemo', 'padnete', 'padnu'],
    'piti': ['pijem', 'piješ', 'pije', 'pijemo', 'pijete', 'piju'],
    'čuti': ['čujem', 'čuješ', 'čuje', 'čujemo', 'čujete', 'čuju'],
    'uzeti': ['uzmem', 'uzmeš', 'uzme', 'uzmemo', 'uzmete', 'uzmu'],
    'početi': ['počnem', 'počneš', 'počne', 'počnemo', 'počnete', 'počnu'],
    'umreti': ['umrem', 'umreš', 'umre', 'umremo', 'umrete', 'umru'],
    'doneti': [
      'donesem',
      'doneseš',
      'donese',
      'donesemo',
      'donesete',
      'donesu'
    ],
    'pisati': ['pišem', 'pišeš', 'piše', 'pišemo', 'pišete', 'pišu'],
    'kazati': ['kažem', 'kažeš', 'kaže', 'kažemo', 'kažete', 'kažu'],
    'vikati': ['vičem', 'vičeš', 'viče', 'vičemo', 'vičete', 'viču'],
    'plakati': ['plačem', 'plačeš', 'plače', 'plačemo', 'plačete', 'plaču'],
    'skakati': ['skačem', 'skačeš', 'skače', 'skačemo', 'skačete', 'skaču'],
    'zvati': ['zovem', 'zoveš', 'zove', 'zovemo', 'zovete', 'zovu'],
    'brati': ['berem', 'bereš', 'bere', 'beremo', 'berete', 'beru'],
    'prati': ['perem', 'pereš', 'pere', 'peremo', 'perete', 'peru'],
    'slati': ['šaljem', 'šalješ', 'šalje', 'šaljemo', 'šaljete', 'šalju'],
    'davati': ['dajem', 'daješ', 'daje', 'dajemo', 'dajete', 'daju'],
    'prodavati': [
      'prodajem',
      'prodaješ',
      'prodaje',
      'prodajemo',
      'prodajete',
      'prodaju'
    ],
    'poznavati': [
      'poznajem',
      'poznaješ',
      'poznaje',
      'poznajemo',
      'poznajete',
      'poznaju'
    ],
    'spavati': ['spavam', 'spavaš', 'spava', 'spavamo', 'spavate', 'spavaju'],
    'očekivati': [
      'očekujem',
      'očekuješ',
      'očekuje',
      'očekujemo',
      'očekujete',
      'očekuju'
    ],
    'plivati': ['plivam', 'plivaš', 'pliva', 'plivamo', 'plivate', 'plivaju'],
    'uživati': ['uživam', 'uživaš', 'uživa', 'uživamo', 'uživate', 'uživaju'],
    'dati': ['dam', 'daš', 'da', 'damo', 'date', 'daju'],
    'smeti': ['smem', 'smeš', 'sme', 'smemo', 'smete', 'smeju'],
    'umeti': ['umem', 'umeš', 'ume', 'umemo', 'umete', 'umeju'],
    'razumeti': [
      'razumem',
      'razumeš',
      'razume',
      'razumemo',
      'razumete',
      'razumeju'
    ],
    'smejati': ['smejem', 'smeješ', 'smeje', 'smejemo', 'smejete', 'smeju'],
    'stajati': ['stojim', 'stojiš', 'stoji', 'stojimo', 'stojite', 'stoje'],
  };

  /// Радни глаголски придев нерегулярных глаголов (где правило «-ti → -o/-la»
  /// не работает: ići → išao, reći → rekao, jesti → jeo…).
  static const Map<String, List<String>> _irregularParticiple = {
    'biti': ['bio', 'bila', 'bilo', 'bili', 'bile', 'bila'],
    'moći': ['mogao', 'mogla', 'moglo', 'mogli', 'mogle', 'mogla'],
    'ići': ['išao', 'išla', 'išlo', 'išli', 'išle', 'išla'],
    'doći': ['došao', 'došla', 'došlo', 'došli', 'došle', 'došla'],
    'otići': ['otišao', 'otišla', 'otišlo', 'otišli', 'otišle', 'otišla'],
    'naći': ['našao', 'našla', 'našlo', 'našli', 'našle', 'našla'],
    'stići': ['stigao', 'stigla', 'stiglo', 'stigli', 'stigle', 'stigla'],
    'reći': ['rekao', 'rekla', 'reklo', 'rekli', 'rekle', 'rekla'],
    'jesti': ['jeo', 'jela', 'jelo', 'jeli', 'jele', 'jela'],
    'sesti': ['seo', 'sela', 'selo', 'seli', 'sele', 'sela'],
    'pasti': ['pao', 'pala', 'palo', 'pali', 'pale', 'pala'],
    'umreti': ['umro', 'umrla', 'umrlo', 'umrli', 'umrle', 'umrla'],
    'doneti': ['doneo', 'donela', 'donelo', 'doneli', 'donele', 'donela'],
  };

  /// Аорист нерегулярных глаголов (основы на -ći/-sti, rekoh-ряд: во 2/3 л.
  /// ед. — палатализация k→č, g→ž).
  static const Map<String, List<String>> _irregularAorist = {
    'biti': ['bih', 'bi', 'bi', 'bismo', 'biste', 'biše'],
    'reći': ['rekoh', 'reče', 'reče', 'rekosmo', 'rekoste', 'rekoše'],
    'doći': ['dođoh', 'dođe', 'dođe', 'dođosmo', 'dođoste', 'dođoše'],
    'otići': ['odoh', 'ode', 'ode', 'odosmo', 'odoste', 'odoše'],
    'naći': ['nađoh', 'nađe', 'nađe', 'nađosmo', 'nađoste', 'nađoše'],
    'stići': ['stigoh', 'stiže', 'stiže', 'stigosmo', 'stigoste', 'stigoše'],
    'pasti': ['padoh', 'pade', 'pade', 'padosmo', 'padoste', 'padoše'],
    'sesti': ['sedoh', 'sede', 'sede', 'sedosmo', 'sedoste', 'sedoše'],
    'jesti': ['jedoh', 'jede', 'jede', 'jedosmo', 'jedoste', 'jedoše'],
  };

  /// Имперфект нерегулярных глаголов (екавские формы).
  static const Map<String, List<String>> _irregularImperfect = {
    'biti': ['bejah', 'beše', 'beše', 'bejasmo', 'bejaste', 'bejahu'],
  };

  /// Аорист по правилу: для основ на гласную (inf минус -ti) — pogledati →
  /// pogledah, pogleda, pogleda, pogledasmo, pogledaste, pogledaše.
  /// -ći/-sti без таблицы не выводятся (rekoh — чередование в основе).
  static List<String?> _aoristForms(String inf) {
    inf = inf.toLowerCase();
    final irr = _irregularAorist[inf];
    if (irr != null) return irr;
    if (inf.endsWith('ći') || inf.endsWith('sti') || !inf.endsWith('ti')) {
      return List.filled(6, null);
    }
    final s = inf.substring(0, inf.length - 2); // pogleda-, radi-, uze-
    return ['${s}h', s, s, '${s}smo', '${s}ste', '$sše'];
  }

  /// Частотные глаголы НЕСОВЕРШЕННОГО вида на -ati: только для них генерируем
  /// имперфект правилом. Вид офлайн не определить, а имперфект от совершенного
  /// вида (pogledati → «pogledah») грамматически невозможен — не рискуем.
  static const Set<String> _knownImperfectiveAti = {
    'gledati',
    'čitati',
    'slušati',
    'pevati',
    'igrati',
    'čekati',
    'pričati',
    'spavati',
    'plivati',
    'kuvati',
    'šetati',
    'sanjati',
    'padati',
    'davati',
    'imati',
    'znati',
    'pitati',
    'trčati',
    'plakati',
  };

  /// Имперфект по правилу — надёжно только для известных несовершенных на -ati
  /// (gledah/gledaše/gledahu). Для -iti/-eti нужна йотация (nositi → nošah) —
  /// не генерируем.
  static List<String?> _imperfectForms(String inf) {
    inf = inf.toLowerCase();
    final irr = _irregularImperfect[inf];
    if (irr != null) return irr;
    if (!_knownImperfectiveAti.contains(inf)) return List.filled(6, null);
    final s = inf.substring(0, inf.length - 2); // gleda-
    return ['${s}h', '$sše', '$sše', '${s}smo', '${s}ste', '${s}hu'];
  }

  /// Глаголы на -ati, спрягающиеся по i-типу: držati → držim, а не «držam».
  ///
  /// Список, а не правило по окончанию основы. Правило напрашивается — почти у
  /// всех этих глаголов основа кончается на č/ž/š, — но оно неверно: «slušati»
  /// даёт «slušam», и по форме эти два класса неразличимы. Повторяет
  /// iConjugationAti в server/internal/grammar/generate.go.
  static const Set<String> _iConjugationAti = {
    'bežati',
    'bojati',
    'brujati',
    'ćutati',
    'držati',
    'klečati',
    'ležati',
    'pištati',
    'škripati',
    'trčati',
    'vrištati',
    'zviždati',
    'zvučati',
    'šuštati',
  };

  static List<String?> _presentForms(String inf) {
    inf = inf.toLowerCase();
    final irr = _irregularPresent[inf];
    if (irr != null) return irr;
    String stem;
    List<String> end;
    if (inf.endsWith('ovati')) {
      // -ovati → -ujem надёжно (kupovati → kupujem, putovati → putujem).
      // Режем все 5 букв «ovati» (раньше резали 4 → «kupoujem»).
      stem = '${inf.substring(0, inf.length - 5)}uj';
      end = ['em', 'eš', 'e', 'emo', 'ete', 'u'];
    } else if (inf.endsWith('ivati') || inf.endsWith('avati')) {
      // А тут правила нет: očekivati → očekujem, но plivati → plivam;
      // davati → dajem, но spavati → spavam. Не угадываем — пусть ответит
      // лексикон или сервер.
      return List.filled(6, null);
    } else if (inf.endsWith('nuti')) {
      stem = '${inf.substring(0, inf.length - 4)}n';
      end = ['em', 'eš', 'e', 'emo', 'ete', 'u'];
    } else if (inf.endsWith('sti')) {
      return List.filled(6, null); // jesti → jedem: правилом не выводится
    } else if (inf.endsWith('ati') && _iConjugationAti.contains(inf)) {
      // Часть глаголов на -ati спрягается по i-типу: držati → držim,
      // trčati → trčim. Правило «всё на -ati даёт -am» учило «držam».
      stem = inf.substring(0, inf.length - 3);
      end = ['im', 'iš', 'i', 'imo', 'ite', 'e'];
    } else if (inf.endsWith('ati')) {
      stem = inf.substring(0, inf.length - 3);
      end = ['am', 'aš', 'a', 'amo', 'ate', 'aju'];
    } else if (inf.endsWith('iti') || inf.endsWith('eti')) {
      stem = inf.substring(0, inf.length - 3);
      end = ['im', 'iš', 'i', 'imo', 'ite', 'e'];
    } else {
      return List.filled(6, null); // -ći и нерегулярные
    }
    return end.map((e) => stem + e).toList();
  }

  /// Радни глаголски придев: [муж.ед, жен.ед, ср.ед, муж.мн, жен.мн, ср.мн].
  static List<String>? _pastParticiple(String inf) {
    inf = inf.toLowerCase();
    final irr = _irregularParticiple[inf];
    if (irr != null) return irr;
    // -ći и -sti правилом не выводятся (išao, jeo, pao) — без таблицы молчим,
    // чтобы не учить выдуманным формам («ićio», «jesto»).
    if (inf.endsWith('ći') || inf.endsWith('sti') || !inf.endsWith('ti')) {
      return null;
    }
    final s = inf.substring(0, inf.length - 2);
    return ['${s}o', '${s}la', '${s}lo', '${s}li', '${s}le', '${s}la'];
  }

  /// «Мягкий» финал основы (после него Voc -u, Ins -em, мн. -evi).
  static bool _softFinal(String s) =>
      s.endsWith('lj') ||
      s.endsWith('nj') ||
      (s.isNotEmpty &&
          const {'š', 'ž', 'č', 'ć', 'đ', 'j', 'c'}.contains(s[s.length - 1]));

  /// Сибиларизация k/g/h → c/z/s перед -i/-ima (vojnik → vojnici, knjiga →
  /// knjizi). Блокируется после c/č/ć/z/s/š/đ (mačka → mački, а не «mačci»).
  static String _sibilarize(String stem) {
    if (stem.isEmpty) return stem;
    final last = stem[stem.length - 1];
    final prev = stem.length > 1 ? stem[stem.length - 2] : '';
    if (const {'c', 'č', 'ć', 'z', 's', 'š', 'đ'}.contains(prev)) return stem;
    final r = const {'k': 'c', 'g': 'z', 'h': 's'}[last];
    return r == null ? stem : stem.substring(0, stem.length - 1) + r;
  }

  /// Палатализация k/g/h → č/ž/š перед вокативным -e (čovek → čoveče, bog → bože).
  static String _palatalize(String stem) {
    if (stem.isEmpty) return stem;
    final r =
        const {'k': 'č', 'g': 'ž', 'h': 'š', 'c': 'č'}[stem[stem.length - 1]];
    return r == null ? stem : stem.substring(0, stem.length - 1) + r;
  }

  /// Супплетивное/нерегулярное множественное число частотных существительных
  /// (правилом не выводится: čovek → ljudi, dete → deca, brat → braća).
  static const Map<String, Map<String, String>> _irregularPlural = {
    'čovek': {
      'Nom': 'ljudi',
      'Gen': 'ljudi',
      'Dat': 'ljudima',
      'Acc': 'ljude',
      'Voc': 'ljudi',
      'Ins': 'ljudima',
      'Loc': 'ljudima'
    },
    'dete': {
      'Nom': 'deca',
      'Gen': 'dece',
      'Dat': 'deci',
      'Acc': 'decu',
      'Voc': 'deco',
      'Ins': 'decom',
      'Loc': 'deci'
    },
    'brat': {
      'Nom': 'braća',
      'Gen': 'braće',
      'Dat': 'braći',
      'Acc': 'braću',
      'Voc': 'braćo',
      'Ins': 'braćom',
      'Loc': 'braći'
    },
    'oko': {
      'Nom': 'oči',
      'Gen': 'očiju',
      'Dat': 'očima',
      'Acc': 'oči',
      'Voc': 'oči',
      'Ins': 'očima',
      'Loc': 'očima'
    },
    'uho': {
      'Nom': 'uši',
      'Gen': 'ušiju',
      'Dat': 'ušima',
      'Acc': 'uši',
      'Voc': 'uši',
      'Ins': 'ušima',
      'Loc': 'ušima'
    },
  };

  /// Средний род с расширением основы. Оба класса закрытые и по форме не
  /// выводятся: -e одинаково у «selo/polje», «ime» (-en-) и «tele» (-et-).
  /// Повторяет neuterMenStems/neuterEtStems в server/internal/grammar.
  static const Set<String> _neuterMenStems = {
    'ime',
    'vreme',
    'breme',
    'pleme',
    'seme',
    'teme',
    'rame',
    'vime',
    'sleme',
    'prezime',
  };
  static const Set<String> _neuterEtStems = {
    'dete',
    'tele',
    'jagnje',
    'pile',
    'prase',
    'mače',
    'štene',
    'kuče',
    'momče',
    'unuče',
    'dugme',
    'uže',
    'bure',
    'đubre',
  };

  /// Беглое «а», которое не выводится правилом: «dan» и «znak» его не имеют, и
  /// отличить их от «starac» по форме нельзя.
  static const Map<String, String> _irregularFugitive = {
    'otac': 'oc',
    'pas': 'ps',
    'san': 'sn',
    'vetar': 'vetr',
    'metar': 'metr',
    'litar': 'litr',
    'mozak': 'mozg',
    'nokat': 'nokt',
    'lakat': 'lakt',
    'vosak': 'vosk',
    'orao': 'orl',
    'posao': 'posl',
    'ugao': 'ugl',
  };

  /// Односложные слова, множественное которых обходится без -ov-/-ev-.
  /// «ključ», «muž», «nož» сюда НЕ входят — у них правило работает.
  static const Set<String> _shortPluralNouns = {
    'dan',
    'zub',
    'gost',
    'konj',
    'prst',
    'crv',
    'mrav',
    'vuk',
    'sat',
    'zec',
  };

  /// Считает слоги. Слоговое «р» («prst», «vrt») даёт слог без единой гласной.
  static int _syllables(String word) {
    var count = 0;
    var hasR = false;
    for (final ch in word.split('')) {
      if (const {'a', 'e', 'i', 'o', 'u'}.contains(ch)) count++;
      if (ch == 'r') hasR = true;
    }
    if (count == 0 && hasR) return 1;
    return count;
  }

  /// Основа без беглого «а». Второе значение говорит, что «а» действительно
  /// беглое: от этого зависит и звательный падеж (starac → starče).
  static (String, bool) _fugitiveStem(String lemma) {
    final irr = _irregularFugitive[lemma];
    if (irr != null) return (irr, true);
    if (lemma.length < 4) return (lemma, false);
    if (lemma.endsWith('ac')) {
      return ('${lemma.substring(0, lemma.length - 2)}c', true);
    }
    if (lemma.endsWith('ak') && _syllables(lemma) >= 2) {
      return ('${lemma.substring(0, lemma.length - 2)}k', true);
    }
    return (lemma, false);
  }

  /// Йотование основы на согласный в творительном: kost → košću,
  /// ljubav → ljubavlju, noć → noću. Пустой результат = правила нет
  /// (после «р» йотования не бывает: «stvar» → только «stvari»).
  static String? _femInstrumental(String lemma) {
    String cut(int n, String add) => lemma.substring(0, lemma.length - n) + add;
    if (lemma.endsWith('st')) return cut(2, 'šću');
    if (lemma.endsWith('zd')) return cut(2, 'ždu');
    for (final soft in const ['ć', 'č', 'š', 'ž', 'j', 'lj', 'nj']) {
      if (lemma.endsWith(soft)) return '${lemma}u';
    }
    if (lemma.endsWith('t')) return cut(1, 'ću');
    if (lemma.endsWith('d')) return cut(1, 'đu');
    if (lemma.endsWith('s')) return cut(1, 'šu');
    if (lemma.endsWith('z')) return cut(1, 'žu');
    if (lemma.endsWith('n')) return cut(1, 'nju');
    if (lemma.endsWith('l')) return cut(1, 'lju');
    for (final labial in const ['b', 'p', 'm', 'v', 'f']) {
      if (lemma.endsWith(labial)) return '${lemma}lju';
    }
    return null;
  }

  /// Все допустимые формы падежа, канонической первой.
  ///
  /// Опознание словоформы обязано перебирать ИМЕННО этот список, а не строку
  /// для показа: там варианты склеены через «/», и «čoveka» не опозналось бы
  /// винительным никогда. Правила повторяют declensionForms в
  /// server/internal/grammar/generate.go — иначе сайт и приложение назвали бы
  /// для одного слова разную начальную форму.
  static List<String> _declensionForms(
      String lemma, String gender, String number, String c) {
    if (number == 'Plur') {
      final irr = _irregularPlural[lemma];
      if (irr != null) return [if (irr[c] != null) irr[c]!];
    }
    // Мужской род на -a («tata», «sudija») склоняется по женскому типу, а
    // согласуется по мужскому. Без этой ветки получалось «tataa».
    if (lemma.endsWith('a') && (gender == 'Fem' || gender == 'Masc')) {
      final form = _femAForm(lemma, number, c);
      return [if (form != null) form];
    }
    if (gender == 'Fem') return _femConsonantForms(lemma, number, c);
    if (gender == 'Masc') return _mascForms(lemma, number, c);
    if (gender == 'Neut') {
      final form = _neuterForm(lemma, number, c);
      return [if (form != null) form];
    }
    return const [];
  }

  /// Форма падежа для показа. Где норма допускает два варианта, показываются
  /// оба через «/»: винительный мужского зависит от одушевлённости, а
  /// творительный женского на согласный — от йотования.
  static String? _declension(
      String lemma, String gender, String number, String c) {
    final forms = _declensionForms(lemma, gender, number, c);
    return forms.isEmpty ? null : forms.join(' / ');
  }

  /// Первая врста: kuća, žena, knjiga.
  static String? _femAForm(String lemma, String number, String c) {
    final s = lemma.substring(0, lemma.length - 1);
    if (number == 'Sing') {
      switch (c) {
        case 'Nom':
          return lemma;
        case 'Gen':
          return '${s}e';
        // Датив/локатив -i с сибиларизацией: ruka → ruci, knjiga → knjizi
        // (но mačka → mački — см. блокираторы в _sibilarize).
        case 'Dat':
        case 'Loc':
          return '${_sibilarize(s)}i';
        case 'Acc':
          return '${s}u';
        case 'Voc':
          return '${s}o';
        case 'Ins':
          return '${s}om';
      }
      return null;
    }
    const pl = {
      'Nom': 'e',
      'Gen': 'a',
      'Dat': 'ama',
      'Acc': 'e',
      'Voc': 'e',
      'Ins': 'ama',
      'Loc': 'ama'
    };
    final suf = pl[c];
    return suf == null ? null : s + suf;
  }

  /// Третья врста: noć, stvar, ljubav, kost, reč. Раньше весь класс возвращал
  /// пустоту, и таблица состояла из прочерков.
  static List<String> _femConsonantForms(
      String lemma, String number, String c) {
    if (number == 'Sing') {
      switch (c) {
        case 'Nom':
        case 'Acc':
          return [lemma];
        case 'Gen':
        case 'Dat':
        case 'Voc':
        case 'Loc':
          return ['${lemma}i'];
        case 'Ins':
          // Норма даёт и йотованную форму, и форму на -i. Йотованная первая:
          // именно она стоит в словарях.
          final jotated = _femInstrumental(lemma);
          return [if (jotated != null) jotated, '${lemma}i'];
      }
      return const [];
    }
    switch (c) {
      case 'Nom':
      case 'Gen':
      case 'Acc':
      case 'Voc':
        return ['${lemma}i'];
      case 'Dat':
      case 'Ins':
      case 'Loc':
        return ['${lemma}ima'];
    }
    return const [];
  }

  /// Вторая врста: grad, čovek, konj, starac.
  static List<String> _mascForms(String lemma, String number, String c) {
    final (stem, fugitive) = _fugitiveStem(lemma);
    final soft = _softFinal(stem);

    if (number == 'Sing') {
      switch (c) {
        case 'Nom':
          return [lemma];
        case 'Gen':
          return ['${stem}a'];
        case 'Dat':
        case 'Loc':
          return ['${stem}u'];
        // Акузатив зависит от одушевлённости: vidim grad (неодуш. = Ном.),
        // но vidim čoveka (одуш. = Ген.). Без словаря не угадать — даём оба.
        case 'Acc':
          return [lemma, '${stem}a'];
        case 'Voc':
          // У слов с беглым «а» звательный всегда на -e с чередованием:
          // starac → starče, momak → momče, otac → oče. Мягкость основы,
          // возникшая после выпадения «а», здесь ни при чём.
          if (fugitive) return ['${_palatalize(stem)}e'];
          return [soft ? '${stem}u' : '${_palatalize(stem)}e'];
        case 'Ins':
          return [soft ? '${stem}em' : '${stem}om'];
      }
      return const [];
    }

    // Мн. число: односложные основы расширяются -ov-/-ev- (grad → gradovi,
    // muž → muževi). Считаем СЛОГИ, а не буквы: по буквам «sport» получал
    // «sporti», а «dan» — «danovi».
    var plural = stem;
    if (!fugitive &&
        _syllables(lemma) == 1 &&
        !_shortPluralNouns.contains(lemma)) {
      plural += soft ? 'ev' : 'ov';
    }
    switch (c) {
      case 'Nom':
      case 'Voc':
        return ['${_sibilarize(plural)}i'];
      case 'Gen':
        // Родительный множественного — единственное место, где беглое «а»
        // возвращается: momak → momaka, starac → staraca.
        return [fugitive ? '${lemma}a' : '${plural}a'];
      case 'Dat':
      case 'Ins':
      case 'Loc':
        return ['${_sibilarize(plural)}ima'];
      case 'Acc':
        return ['${plural}e'];
    }
    return const [];
  }

  /// Третья врста среднего рода: selo, polje, ime, tele.
  static String? _neuterForm(String lemma, String number, String c) {
    if (!lemma.endsWith('o') && !lemma.endsWith('e')) return null;
    var stem = lemma.substring(0, lemma.length - 1);

    // Расширение достраивается к ЦЕЛОЙ лемме: -e остаётся частью основы.
    // ime → imen-, vreme → vremen-, dete → detet-. Без него получалось «ima».
    var extended = false;
    if (_neuterMenStems.contains(lemma)) {
      stem = '${lemma}n';
      extended = true;
    } else if (_neuterEtStems.contains(lemma)) {
      stem = '${lemma}t';
      extended = true;
      // Множественное у этого класса собирательное («telad», «dugmad») и
      // склоняется по женскому типу. Что есть — лежит в _irregularPlural;
      // правилом такое не достраивается, и молчание честнее выдумки.
      if (number == 'Plur') return null;
    }

    // Мягкость решает окончание: -o даёт «selom», -e даёт «poljem» и «morem».
    // Расширенная основа кончается на согласный и ведёт себя как твёрдая.
    final soft = !extended && lemma.endsWith('e');

    if (number == 'Plur') {
      const pl = {
        'Nom': 'a',
        'Gen': 'a',
        'Dat': 'ima',
        'Acc': 'a',
        'Voc': 'a',
        'Ins': 'ima',
        'Loc': 'ima'
      };
      final suf = pl[c];
      return suf == null ? null : stem + suf;
    }
    switch (c) {
      case 'Nom':
      case 'Acc':
      case 'Voc':
        return lemma;
      case 'Gen':
        return '${stem}a';
      case 'Dat':
      case 'Loc':
        return '${stem}u';
      case 'Ins':
        return soft ? '${stem}em' : '${stem}om';
    }
    return null;
  }
}
