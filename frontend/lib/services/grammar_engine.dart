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
    'DET': 'определитель',
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
    'Nom': 'Кто/что делает действие — подлежащее. Вопрос: ко? шта? '
        'Пример: «Pas spava» — пёс спит.',
    'Gen': 'Чей, чего, откуда, «нет чего». Вопрос: кога? чега? '
        'После предлогов iz/od/do/bez и при отрицании. Пример: «nema vremena» — нет времени.',
    'Dat': 'Кому, к кому — адресат и направление к кому-то. Вопрос: коме? чему? '
        'Пример: «dajem prijatelju» — даю другу.',
    'Acc': 'Кого/что — прямой объект; направление с u/na. Вопрос: кога? шта? '
        'Пример: «vidim grad» — вижу город.',
    'Voc': 'Обращение, зов. Пример: «Marko!», «prijatelju!».',
    'Ins': 'Кем/чем — орудие или «с кем/чем». Вопрос: ким? чим? '
        'После предлога s/sa. Пример: «pišem olovkom» — пишу карандашом.',
    'Loc': 'Где, о ком/о чём — употребляется ТОЛЬКО с предлогами (u, na, o, po). '
        'Вопрос: о коме? о чему? где? Пример: «u školi» — в школе.',
  };
  static const _numberRu = {'Sing': 'единственное', 'Plur': 'множественное'};
  static const _genderRu = {'Masc': 'мужской', 'Fem': 'женский', 'Neut': 'средний'};
  static const _tenseRu = {
    'Pres': 'настоящее (prezent)',
    'Past': 'прошедшее (perfekat)',
    'Fut': 'будущее (futur)',
  };
  static const _personRu = {'1': '1-е лицо', '2': '2-е лицо', '3': '3-е лицо'};

  static const _persons = ['ja', 'ti', 'on/ona', 'mi', 'vi', 'oni/one'];
  static const _perfAux = ['sam', 'si', 'je', 'smo', 'ste', 'su'];
  static const _futClitic = ['ću', 'ćeš', 'će', 'ćemo', 'ćete', 'će'];

  // ---------------------------------------------------------------------------
  // Разбор MSD (схема lexicon.db — подмножество MULTEXT-East).
  // ---------------------------------------------------------------------------
  static String? _g(String c) => const {'m': 'Masc', 'f': 'Fem', 'n': 'Neut'}[c];
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
    'DET': 'опред.',
    'INTJ': 'межд.',
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

  /// Справочник падежей (для интерактивной шпаргалки).
  static List<({String key, String name, String use})> casesReference() =>
      _caseOrder
          .map((c) => (key: c, name: _caseRu[c]!, use: _caseUse[c]!))
          .toList();

  /// Карточки грамматики для запоминания: 7 падежей + 3 времени.
  static List<({String front, String back, String tag})> ruleCards() {
    final cards = <({String front, String back, String tag})>[
      for (final c in casesReference())
        (front: c.name, back: c.use, tag: 'Падеж'),
      (
        front: 'Презент (prezent) — настоящее время',
        back: 'Действие происходит сейчас. Основа глагола + личные окончания: '
            '-m, -š, -∅, -mo, -te, -(j)u.\nПример: radim, radiš, radi, radimo, '
            'radite, rade.',
        tag: 'Время',
      ),
      (
        front: 'Перфекат (perfekat) — прошедшее время',
        back: 'Вспомогательный глагол biti (sam/si/je/smo/ste/su) + причастие '
            'на -o/-la/-lo (по роду и числу).\nПример: radio sam, radila si, '
            'radili smo.',
        tag: 'Время',
      ),
      (
        front: 'Футур I (futur) — будущее время',
        back: 'Клитика hteti (ću/ćeš/će/ćemo/ćete/će) + инфинитив.\n'
            'Пример: radiću / ću raditi, čitaćeš / ćeš čitati.',
        tag: 'Время',
      ),
    ];
    return cards;
  }

  // ---------------------------------------------------------------------------
  // Объяснение «Почему так?».
  // ---------------------------------------------------------------------------
  static GrammarInfo describe(String upos, Map<String, String> feats) {
    final posLabel = _posRu[upos] ?? upos;
    final facts = <GrammarFact>[];

    final gcase = feats['Case'];
    final number = feats['Number'];
    final gender = feats['Gender'];
    final tense = feats['Tense'];
    final person = feats['Person'];
    final verbForm = feats['VerbForm'];

    if (gcase != null) facts.add(GrammarFact('Падеж', _caseRu[gcase] ?? gcase));
    if (tense != null) facts.add(GrammarFact('Время', _tenseRu[tense] ?? tense));
    if (person != null) facts.add(GrammarFact('Лицо', _personRu[person] ?? person));
    if (number != null) facts.add(GrammarFact('Число', _numberRu[number] ?? number));
    if (gender != null) facts.add(GrammarFact('Род', _genderRu[gender] ?? gender));
    if (verbForm == 'Inf') facts.add(const GrammarFact('Форма', 'инфинитив'));

    final summaryParts = [
      if (gcase != null) (_caseRu[gcase] ?? gcase).toLowerCase(),
      if (tense != null) (_tenseRu[tense] ?? tense),
      if (person != null) _personRu[person],
      if (number != null) _numberRu[number],
      if (gender != null) 'род: $gender',
    ].whereType<String>().toList();

    String why;
    if (gcase != null) {
      why = 'Это $posLabel в форме «${(_caseRu[gcase] ?? gcase).toLowerCase()} '
          'падеж», ${_numberRu[number] ?? ''} число'
          '${gender != null ? ', ${_genderRu[gender]} род' : ''}.\n\n'
          'Зачем нужен этот падеж: ${_caseUse[gcase] ?? '—'}.';
    } else if (tense != null || verbForm == 'Inf') {
      if (verbForm == 'Inf') {
        why = 'Это инфинитив — начальная форма глагола (отвечает на «что делать?»). '
            'От неё образуются все времена.';
      } else {
        why = 'Глагол в форме «${_tenseRu[tense] ?? tense}», '
            '${_personRu[person] ?? ''}, ${_numberRu[number] ?? ''} число.\n\n'
            'Ниже — спряжение во всех трёх сербских временах.';
      }
    } else {
      why = 'Базовый разбор: $posLabel. Полный разбор формы доступен при '
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
        return _adjParadigm(lemmaLat, parsed, fromLexicon, surfaceLat);
      case 'VERB':
      case 'AUX':
        return _verbParadigm(lemmaLat, feats, fromLexicon, surfaceLat);
      default:
        return const [];
    }
  }

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
        ));
      }
      tables.add(ParadigmTable(
        title: 'Склонение — ${_numberRu[number]} число',
        rows: rows,
      ));
    }
    return tables;
  }

  static List<ParadigmTable> _adjParadigm(
    String lemma,
    List<({String form, String msd, Map<String, String> feats})> parsed,
    String? Function(bool Function(Map<String, String>)) fromLexicon,
    String surface,
  ) {
    ParadigmCell cell(String label, String g, String number) {
      final form = fromLexicon(
          (f) => f['Gender'] == g && f['Number'] == number && f['Case'] == 'Nom');
      return ParadigmCell(
        label: label,
        form: form ?? '—',
        current: form != null && form == surface,
      );
    }

    return [
      ParadigmTable(
        title: 'Именительный падеж',
        subtitle: 'по родам и числам',
        rows: [
          cell('муж. ед.', 'Masc', 'Sing'),
          cell('жен. ед.', 'Fem', 'Sing'),
          cell('ср. ед.', 'Neut', 'Sing'),
          cell('муж. мн.', 'Masc', 'Plur'),
          cell('жен. мн.', 'Fem', 'Plur'),
          cell('ср. мн.', 'Neut', 'Plur'),
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
      var form = fromLexicon(
          (f) => f['Tense'] == 'Pres' && f['Person'] == person && f['Number'] == number);
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
    ParadigmCell buildPerfCell(String label, String aux, String? part1, [String? part2]) {
      final form = part1 == null ? '—' : (part2 == null ? '$aux $part1' : '$aux $part1 / $part2');
      final isGen = part1 != null && rulePart != null && (
        part1 == rulePart[0] || part1 == rulePart[1] || part1 == rulePart[2] ||
        part1 == rulePart[3] || part1 == rulePart[4] || part1 == rulePart[5]
      );
      return ParadigmCell(
        label: label,
        form: form,
        generated: isGen,
      );
    }

    perfRows.add(buildPerfCell('ja (м./ж.)', _perfAux[0], partMascSg, partFemSg));
    perfRows.add(buildPerfCell('ti (м./ж.)', _perfAux[1], partMascSg, partFemSg));
    perfRows.add(buildPerfCell('on', _perfAux[2], partMascSg));
    perfRows.add(buildPerfCell('ona', _perfAux[2], partFemSg));
    perfRows.add(buildPerfCell('ono', _perfAux[2], partNeutSg));
    perfRows.add(buildPerfCell('mi (м./ж.)', _perfAux[3], partMascPl, partFemPl));
    perfRows.add(buildPerfCell('vi (м./ж.)', _perfAux[4], partMascPl, partFemPl));
    perfRows.add(buildPerfCell('oni', _perfAux[5], partMascPl));
    perfRows.add(buildPerfCell('one', _perfAux[5], partFemPl));
    perfRows.add(buildPerfCell('ona', _perfAux[5], partNeutPl));

    // Футур I = клитика hteti + инфинитив
    final futRows = List.generate(
      6,
      (i) => ParadigmCell(label: _persons[i], form: '${_futClitic[i]} $lemma'),
    );

    return [
      ParadigmTable(title: 'Презент (настоящее)', rows: prezRows),
      ParadigmTable(
        title: 'Перфекат (прошедшее)',
        subtitle: 'biti + причастие (здесь — муж. род; ж.р.: -la, ср.р.: -lo)',
        rows: perfRows,
      ),
      ParadigmTable(
        title: 'Футур I (будущее)',
        subtitle: 'клитика hteti + инфинитив',
        rows: futRows,
      ),
    ];
  }

  // --- правила (приблизительные) ---
  static List<String?> _presentForms(String inf) {
    inf = inf.toLowerCase();
    String stem;
    List<String> end;
    if (inf.endsWith('ovati') || inf.endsWith('ivati')) {
      stem = '${inf.substring(0, inf.length - 4)}uj';
      end = ['em', 'eš', 'e', 'emo', 'ete', 'u'];
    } else if (inf.endsWith('nuti')) {
      stem = '${inf.substring(0, inf.length - 4)}n';
      end = ['em', 'eš', 'e', 'emo', 'ete', 'u'];
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
    if (inf.endsWith('ći') || !inf.endsWith('ti')) return null;
    final s = inf.substring(0, inf.length - 2);
    return ['${s}o', '${s}la', '${s}lo', '${s}li', '${s}le', '${s}la'];
  }

  static String? _declension(String lemma, String gender, String number, String c) {
    if (gender == 'Fem' && lemma.endsWith('a')) {
      final s = lemma.substring(0, lemma.length - 1);
      const sg = {'Nom': '', 'Gen': 'e', 'Dat': 'i', 'Acc': 'u', 'Voc': 'o', 'Ins': 'om', 'Loc': 'i'};
      const pl = {'Nom': 'e', 'Gen': 'a', 'Dat': 'ama', 'Acc': 'e', 'Voc': 'e', 'Ins': 'ama', 'Loc': 'ama'};
      final suf = (number == 'Sing' ? sg : pl)[c];
      return suf == null ? null : (c == 'Nom' && number == 'Sing' ? lemma : s + suf);
    }
    if (gender == 'Masc') {
      const sg = {'Nom': '', 'Gen': 'a', 'Dat': 'u', 'Acc': 'a', 'Voc': 'e', 'Ins': 'om', 'Loc': 'u'};
      const pl = {'Nom': 'i', 'Gen': 'a', 'Dat': 'ima', 'Acc': 'e', 'Voc': 'i', 'Ins': 'ima', 'Loc': 'ima'};
      final suf = (number == 'Sing' ? sg : pl)[c];
      return suf == null ? null : lemma + suf;
    }
    if (gender == 'Neut' && (lemma.endsWith('o') || lemma.endsWith('e'))) {
      final s = lemma.substring(0, lemma.length - 1);
      const sg = {'Nom': '', 'Gen': 'a', 'Dat': 'u', 'Acc': '', 'Voc': '', 'Ins': 'om', 'Loc': 'u'};
      const pl = {'Nom': 'a', 'Gen': 'a', 'Dat': 'ima', 'Acc': 'a', 'Voc': 'a', 'Ins': 'ima', 'Loc': 'ima'};
      final suf = (number == 'Sing' ? sg : pl)[c];
      if (suf == null) return null;
      return suf.isEmpty ? lemma : s + suf;
    }
    return null;
  }
}
