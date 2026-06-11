import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import '../models/grammar.dart';
import '../models/word_analysis.dart';
import '../utils/transliteration.dart';
import 'lexicon_db.dart';
import 'user_db.dart';

/// Разбор слова/фразы: сначала онлайн (CLASSLA-сервер), при недоступности —
/// офлайн по локальному лексикону (LexiconDb).
class AnalysisRepository {
  AnalysisRepository._();
  static final AnalysisRepository instance = AnalysisRepository._();

  static String baseUrl = 'https://ivanessalingren-citavukspace.hf.space';

  Future<WordAnalysis> analyzeToken({
    required String sentence,
    required int startOffset,
    required int endOffset,
    required String tokenText,
    String? backendUrl,
  }) async {
    // Фразы (несколько слов) не отправляем на пословный сервер разбора — он
    // для одиночных токенов и на фразе только тормозит. Сразу идём в перевод.
    if (tokenText.trim().contains(' ')) {
      return _offlineOrOnline(tokenText);
    }

    // Авто-починка «битых» букв (š/č/ć/ž/đ, ставшие закорючками при извлечении).
    final repaired = await LexiconDb.instance.repair(tokenText);
    final token = repaired ?? tokenText;
    final sent = repaired == null
        ? sentence
        : _splice(sentence, startOffset, endOffset, repaired);
    final end = repaired == null ? endOffset : startOffset + repaired.length;

    // Кэш разборов: повторный тап по слову не ходит в сеть за морфологией и
    // общим переводом — онлайн остаётся только контекстный перевод (он зависит
    // от предложения и не кэшируется).
    final cachedJson = await UserDb.instance.getCachedAnalysis(token);
    if (cachedJson != null) {
      try {
        final base = WordAnalysis.fromCacheJson(
            jsonDecode(cachedJson) as Map<String, dynamic>, token);
        final contextual = await _translateContextualOnline(
          sentence: sent,
          startOffset: startOffset,
          endOffset: end,
          tokenText: token,
        );
        return base.copyWith(
          contextualTranslation: contextual,
          isOffline: contextual == null,
        );
      } catch (_) {
        // битый кэш — идём обычным путём
      }
    }

    final url = backendUrl ?? baseUrl;
    try {
      final resp = await http
          .post(
            Uri.parse('$url/analyze'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'sentence': sent,
              'start_offset': startOffset,
              'end_offset': end,
              'token_text': token,
            }),
          )
          // Hugging Face Space на бесплатном тарифе может «просыпаться». Даём
          // ему 5 c, иначе быстро откатываемся на мгновенный онлайн-перевод
          // (Google) или офлайн-кэш — чтобы не зависать на каждом слове.
          .timeout(const Duration(milliseconds: 5000));
      if (resp.statusCode == 200) {
        var result = WordAnalysis.fromServer(
            jsonDecode(resp.body) as Map<String, dynamic>, token);
        // Сервер и локальный лексикон — одна система: если CLASSLA не определил
        // часть речи / признаки / формы, дополняем из локального словаря.
        result = await _mergeWithLexicon(result);
        if (result.translation.trim().isNotEmpty) {
          UserDb.instance.cacheTranslation(token, result.translation);
        }
        // Кэшируем только серверные разборы (CLASSLA): они самые дорогие
        // (прогрев HF Space) и самые качественные. Офлайн-результаты не пишем,
        // чтобы слабый разбор не «закрывал» дорогу лучшему серверному.
        if (!result.isPhrase &&
            result.upos != 'UNKNOWN' &&
            result.translation.trim().isNotEmpty) {
          UserDb.instance
              .cacheAnalysis(token, jsonEncode(result.toCacheJson()));
        }
        return result;
      }
    } catch (_) {
      // сервер недоступен — идём в офлайн/онлайн-перевод
    }
    return _offlineOrOnline(token, sentence: sent, startOffset: startOffset, endOffset: end);
  }

  String _splice(String s, int start, int end, String repl) {
    if (start < 0 || end > s.length || start > end) return s;
    return s.substring(0, start) + repl + s.substring(end);
  }

  Future<WordAnalysis> _offlineOrOnline(
    String tokenText, {
    String? sentence,
    int? startOffset,
    int? endOffset,
  }) async {
    // Фразы: морфология не нужна — только перевод. Сначала кэш (офлайн),
    // потом сеть; удачный перевод кэшируем.
    if (tokenText.trim().contains(' ')) {
      var tr = await UserDb.instance.getCachedTranslation(tokenText);
      final cached = tr != null;
      if (tr == null) {
        tr = await _translateOnline(tokenText);
        if (tr != null) await UserDb.instance.cacheTranslation(tokenText, tr);
      }
      // Грамматика фразы: составное время (video sam ga → перфекат) и
      // энклитики с объяснением порядка (закон Ваккернагеля).
      final insight = await _phraseInsight(tokenText);
      return WordAnalysis(
        surface: tokenText,
        lemma: tokenText.toLowerCase(),
        upos: 'PHRASE',
        translation: tr ?? '[Перевод доступен только онлайн]',
        isOffline: tr == null || cached,
        isPhrase: true,
        phraseInsight: insight,
      );
    }

    final lat = SerbianTransliteration.toLatin(tokenText).toLowerCase();
    // Единая точка офлайн-морфологии (та же, что дополняет серверный ответ).
    final morph = await _lexiconMorphology(tokenText);
    final lemma = morph?.lemma ?? lat;
    final upos = morph?.upos ?? 'UNKNOWN';
    final feats = morph?.feats ?? <String, String>{};

    final lemmaRows = await LexiconDb.instance.getLexiconRowsForLemma(lemma);
    final forms = _baseForms(upos, lemmaRows);

    // Перевод: «общий» (слово отдельно: словарь → кэш → сеть) и «в этом тексте»
    // (контекстный, по предложению). Оба сетевых запроса пускаем ПАРАЛЛЕЛЬНО,
    // чтобы не ждать дважды.
    // «Общий» перевод — это СЛОВАРНОЕ значение, поэтому переводим начальную
    // форму (lemma), а не словоформу из текста. Иначе «očekivao» переводится как
    // «ожидал», тогда как в словаре глагол — «ожидать» (očekivati). Конкретную
    // форму из предложения показывает контекстный перевод «в этом тексте».
    var general = await LexiconDb.instance.getOfflineTranslation(tokenText, lemma);
    general ??= await UserDb.instance.getCachedTranslation(lemma);
    // Онлайн-разбор (сервер) кэширует перевод по словоформе — проверяем и её,
    // иначе переведённое онлайн слово «терялось» в офлайне.
    general ??= await UserDb.instance.getCachedTranslation(tokenText);

    final needGeneralOnline = general == null;
    final wantContext =
        sentence != null && startOffset != null && endOffset != null;

    final results = await Future.wait<String?>([
      needGeneralOnline
          ? _translateOnline(lemma)
          : Future<String?>.value(general),
      wantContext
          ? _translateContextualOnline(
              sentence: sentence,
              startOffset: startOffset,
              endOffset: endOffset,
              tokenText: tokenText,
            )
          : Future<String?>.value(null),
    ]);

    final generalNet = needGeneralOnline ? results[0] : null; // из сети
    final contextual = results[1];
    if (generalNet != null) {
      // Кэшируем по начальной форме — это словарное значение (см. выше).
      await UserDb.instance.cacheTranslation(lemma, generalNet);
    }
    final generalFinal = general ?? generalNet;
    final online = generalNet != null || contextual != null;

    return WordAnalysis(
      surface: tokenText,
      lemma: lemma,
      upos: upos,
      feats: feats,
      forms: forms,
      translation: generalFinal ?? '[Перевод недоступен — нет интернета]',
      contextualTranslation: contextual,
      isOffline: !online,
    );
  }

  /// Прямой контекстный sr→ru перевод через разметку предложения.
  Future<String?> _translateContextualOnline({
    required String sentence,
    required int startOffset,
    required int endOffset,
    required String tokenText,
  }) async {
    try {
      if (startOffset < 0 || endOffset > sentence.length || startOffset > endOffset) {
        return null;
      }
      // Берём только предложение вокруг слова: короче контекст — стабильнее тег
      // и быстрее ответ.
      final w = _sentenceWindow(sentence, startOffset, endOffset);
      final tagged =
          '${w.text.substring(0, w.start)}<w>$tokenText</w>${w.text.substring(w.end)}';
      final translated = await _translateOnline(tagged);
      if (translated != null) {
        final reg = RegExp(r'<w[^>]*>(.*?)</w>', caseSensitive: false, dotAll: true);
        final match = reg.firstMatch(translated);
        if (match != null) {
          final inner = match.group(1)?.trim();
          // Иногда Google теряет тег и переводит «<w>» как слово — отсекаем мусор.
          if (inner != null && inner.isNotEmpty && !inner.contains('<')) {
            return inner;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  /// Вырезает предложение вокруг [start..end] из [text] и возвращает текст окна
  /// с пересчитанными смещениями слова внутри него.
  ({String text, int start, int end}) _sentenceWindow(
      String text, int start, int end) {
    const enders = '.!?…\n';
    var ws = 0;
    for (var i = start - 1; i >= 0; i--) {
      if (enders.contains(text[i])) {
        ws = i + 1;
        break;
      }
    }
    while (ws < start && (text[ws] == ' ' || text[ws] == '\n')) {
      ws++;
    }
    var we = text.length;
    for (var i = end; i < text.length; i++) {
      if (enders.contains(text[i])) {
        we = i + 1;
        break;
      }
    }
    // Подстраховка от слишком длинного «предложения».
    if (we - ws > 600) {
      ws = (start - 200) < 0 ? 0 : start - 200;
      we = (end + 200) > text.length ? text.length : end + 200;
    }
    return (text: text.substring(ws, we), start: start - ws, end: end - ws);
  }

  /// sr→ru перевод. Нативно — напрямую через Google web endpoint (быстро).
  /// В вебе прямой запрос к Google блокируется CORS, поэтому идём через бэкенд.
  Future<String?> _translateOnline(String text) async {
    try {
      if (kIsWeb) {
        final uri = Uri.parse(
            '$baseUrl/translate?q=${Uri.encodeComponent(text)}');
        final resp = await http.get(uri).timeout(const Duration(seconds: 8));
        if (resp.statusCode == 200) {
          final data =
              jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
          final out = (data['translation'] ?? '').toString().trim();
          return out.isEmpty ? null : out;
        }
        return null;
      }
      final uri = Uri.parse(
          'https://translate.googleapis.com/translate_a/single?client=gtx&sl=sr&tl=ru&dt=t&q=${Uri.encodeComponent(text)}');
      final resp = await http.get(uri).timeout(const Duration(seconds: 4));
      if (resp.statusCode == 200) {
        final segments = (jsonDecode(resp.body) as List).first as List;
        final sb = StringBuffer();
        for (final seg in segments) {
          sb.write((seg as List).first);
        }
        final out = sb.toString().trim();
        return out.isEmpty ? null : out;
      }
    } catch (_) {}
    return null;
  }

  // --- Грамматика фраз: составные времена и энклитики ---

  static const _auxPerf = {
    'sam': '1 л. ед.',
    'si': '2 л. ед.',
    'je': '3 л. ед.',
    'smo': '1 л. мн.',
    'ste': '2 л. мн.',
    'su': '3 л. мн.',
  };
  static const _auxFut = {
    'ću': '1 л. ед.',
    'ćeš': '2 л. ед.',
    'će': '3 л.',
    'ćemo': '1 л. мн.',
    'ćete': '2 л. мн.',
  };
  static const _auxCond = {
    'bih': '1 л. ед.',
    'bi': '2/3 л.',
    'bismo': '1 л. мн.',
    'biste': '2 л. мн.',
  };
  static const _datClitics = {
    'mi': 'мне',
    'ti': 'тебе',
    'mu': 'ему',
    'joj': 'ей',
    'nam': 'нам',
    'vam': 'вам',
    'im': 'им',
  };
  static const _accClitics = {
    'me': 'меня',
    'te': 'тебя',
    'ga': 'его',
    'ju': 'её',
    'nas': 'нас',
    'vas': 'вас',
    'ih': 'их',
  };

  static const _wackernagelNote =
      'Краткие формы (sam, je, ga, se…) — энклитики: они безударные, не могут '
      'стоять в начале предложения и занимают ВТОРОЕ место (закон Ваккернагеля). '
      'Если их несколько, порядок фиксирован: li → вспомогательные (sam/si/ću…) → '
      'датив (mi/mu…) → акузатив (me/ga…) → se → je.\n'
      'Пример: «Dao sam mu ga» — «я дал ему его».';

  /// Слово — радни глаголски придев? Сначала спрашиваем лексикон (надёжно);
  /// без него (веб) — узкая эвристика по окончанию, чтобы не принять
  /// существительное вроде «škola» за причастие.
  Future<bool> _looksLikeParticiple(String w) async {
    final rows = await LexiconDb.instance.lookupForm(w);
    if (rows.isNotEmpty) {
      return rows.any((r) =>
          WordAnalysis.parseFeats(r['feats'] as String?)['VerbForm'] == 'Part');
    }
    if (w.length < 3) return false;
    // Муж. род: -ao/-eo/-io/-uo (gledao, video, čuo).
    if (RegExp(r'(ao|eo|io|uo)$').hasMatch(w)) return true;
    // Ж./ср. род и мн.: -la/-lo/-li/-le только после согласной (rekla, mogla,
    // došli) — формы после гласной (gledala) пропустим, зато не зацепим
    // «škola»/«jela»-существительные.
    final m = RegExp(r'([a-zšđžčć])l[aoie]$').firstMatch(w);
    if (m != null && !'aeiou'.contains(m.group(1)!)) return true;
    return false;
  }

  /// Распознаёт во фразе составное время (перфекат / футур I / потенцијал)
  /// и энклитики; возвращает разбор с объяснением порядка кратких форм.
  Future<PhraseInsight?> _phraseInsight(String phrase) async {
    final words = SerbianTransliteration.toLatin(phrase)
        .toLowerCase()
        .split(RegExp(r'[^a-zšđžčć]+'))
        .where((w) => w.isNotEmpty)
        .toList();
    if (words.length < 2 || words.length > 12) return null;

    String? aux; // найденный вспомогательный
    String auxKind = ''; // perf / fut / cond
    for (final w in words) {
      if (_auxPerf.containsKey(w)) {
        aux = w;
        auxKind = 'perf';
        break;
      }
      if (_auxFut.containsKey(w)) {
        aux = w;
        auxKind = 'fut';
        break;
      }
      if (_auxCond.containsKey(w)) {
        aux = w;
        auxKind = 'cond';
        break;
      }
    }

    // Причастие и инфинитив (для составных времён).
    String? participle;
    for (final w in words) {
      if (w == aux) continue;
      if (await _looksLikeParticiple(w)) {
        participle = w;
        break;
      }
    }
    String? infinitive;
    for (final w in words) {
      if (w != aux && (w.endsWith('ti') || w.endsWith('ći')) && w.length > 3) {
        infinitive = w;
        break;
      }
    }
    // Слитный футур: radiću / videćemo.
    String? mergedFut;
    for (final w in words) {
      if (RegExp(r'(ću|ćeš|će|ćemo|ćete)$').hasMatch(w) &&
          w.length > 4 &&
          !_auxFut.containsKey(w)) {
        mergedFut = w;
        break;
      }
    }

    // Местоименные энклитики и возвратное se.
    final parts = <GrammarFact>[];
    String? title;

    if (auxKind == 'perf' && participle != null) {
      title = 'Перфекат — прошедшее время';
      parts.add(GrammarFact(participle, 'причастие (радни глаголски придев)'));
      parts.add(GrammarFact(aux!, 'вспом. глагол biti, ${_auxPerf[aux]}'));
    } else if (auxKind == 'cond' && participle != null) {
      title = 'Потенцијал — условное наклонение («бы»)';
      parts.add(GrammarFact(participle, 'причастие (радни глаголски придев)'));
      parts.add(GrammarFact(aux!, 'аорист biti, ${_auxCond[aux]}'));
    } else if (auxKind == 'fut' && infinitive != null) {
      title = 'Футур I — будущее время';
      parts.add(GrammarFact(aux!, 'клитика hteti, ${_auxFut[aux]}'));
      parts.add(GrammarFact(infinitive, 'инфинитив'));
    } else if (mergedFut != null) {
      title = 'Футур I — будущее время (слитная форма)';
      parts.add(GrammarFact(mergedFut, 'инфинитив + клитика hteti (radiću = radi + ću)'));
    }

    var hasClitics = false;
    var unambiguousClitics = false;
    // Первое слово пропускаем: энклитика не может открывать фразу («Ti si
    // dobar» — ti тут подлежащее, а не датив).
    for (var i = 1; i < words.length; i++) {
      final w = words[i];
      if (_datClitics.containsKey(w)) {
        parts.add(GrammarFact(w, '«${_datClitics[w]}» — датив, энклитика'));
        hasClitics = true;
        // mi/ti совпадают с местоимениями «мы»/«ты» — сами по себе ничего
        // не доказывают.
        if (w != 'mi' && w != 'ti') unambiguousClitics = true;
      } else if (_accClitics.containsKey(w)) {
        parts.add(GrammarFact(w, '«${_accClitics[w]}» — акузатив, энклитика'));
        hasClitics = true;
        unambiguousClitics = true;
      } else if (w == 'se') {
        parts.add(const GrammarFact('se', 'возвратная частица, энклитика'));
        hasClitics = true;
        unambiguousClitics = true;
      } else if (w == 'li') {
        parts.add(const GrammarFact('li', 'вопросительная частица, энклитика'));
        hasClitics = true;
        unambiguousClitics = true;
      }
    }

    if (title == null && !hasClitics) return null;
    // Без составного времени показываем разбор только при однозначных
    // энклитиках (ga/ih/se/li…), чтобы не объявлять «ты» дативом.
    if (title == null && !unambiguousClitics) return null;
    return PhraseInsight(
      title: title ?? 'Энклитики (краткие формы)',
      parts: parts,
      note: _wackernagelNote,
    );
  }

  /// Морфология слова из локального лексикона — ЕДИНАЯ точка и для офлайн-
  /// разбора, и для дополнения серверного ответа (чтобы две системы
  /// распознавания не расходились). Сначала ищем словоформу; если её нет —
  /// проверяем, не начальная ли это форма (слово, известное лексикону только
  /// в колонке lemma, раньше давало UNKNOWN).
  Future<({String lemma, String upos, Map<String, String> feats})?>
      _lexiconMorphology(String surface) async {
    final lat = SerbianTransliteration.toLatin(surface).trim().toLowerCase();
    if (lat.isEmpty) return null;
    final formRows = await LexiconDb.instance.lookupForm(lat);
    if (formRows.isNotEmpty) {
      final best = _best(formRows);
      return (
        lemma: (best['lemma'] ?? lat).toString(),
        upos: (best['upos'] ?? 'UNKNOWN').toString(),
        feats: WordAnalysis.parseFeats(best['feats'] as String?),
      );
    }
    final lemmaRows = await LexiconDb.instance.getLexiconRowsForLemma(lat);
    if (lemmaRows.isNotEmpty) {
      // Часть речи — по большинству строк парадигмы этой леммы.
      final counts = <String, int>{};
      for (final r in lemmaRows) {
        final u = (r['upos'] ?? '').toString();
        if (u.isNotEmpty && u != 'UNKNOWN') counts[u] = (counts[u] ?? 0) + 1;
      }
      if (counts.isNotEmpty) {
        final upos = (counts.entries.toList()
              ..sort((a, b) => b.value.compareTo(a.value)))
            .first
            .key;
        return (lemma: lat, upos: upos, feats: const <String, String>{});
      }
    }
    return null;
  }

  /// Сшивает серверный разбор с локальным лексиконом: сервер главнее (он видит
  /// контекст), но если он не определил часть речи или признаки/формы пустые —
  /// дополняем тем, что знает словарь. Раньше системы были независимы, и для
  /// слова из лексикона могло показываться UNKNOWN.
  Future<WordAnalysis> _mergeWithLexicon(WordAnalysis a) async {
    if (a.isPhrase) return a;
    final posUnknown = a.upos.isEmpty || a.upos == 'UNKNOWN' || a.upos == 'X';
    if (!posUnknown && a.feats.isNotEmpty && a.forms.isNotEmpty) return a;

    var lemma = a.lemma;
    var upos = a.upos;
    var feats = a.feats;

    if (posUnknown) {
      final morph = await _lexiconMorphology(a.surface);
      if (morph != null) {
        lemma = morph.lemma;
        upos = morph.upos;
        if (feats.isEmpty) feats = morph.feats;
      }
    } else if (feats.isEmpty) {
      // Сервер знает часть речи, но признаков нет: берём строку лексикона,
      // СОГЛАСНУЮ с серверным разбором (та же лемма и часть речи), чтобы не
      // подменить контекстный разбор другой интерпретацией омонима.
      final lat = SerbianTransliteration.toLatin(a.surface).trim().toLowerCase();
      final lemmaLat =
          SerbianTransliteration.toLatin(a.lemma).trim().toLowerCase();
      for (final r in await LexiconDb.instance.lookupForm(lat)) {
        if ((r['upos'] ?? '').toString() == a.upos &&
            (r['lemma'] ?? '').toString() == lemmaLat) {
          feats = WordAnalysis.parseFeats(r['feats'] as String?);
          break;
        }
      }
    }

    var forms = a.forms;
    if (forms.isEmpty && upos.isNotEmpty && upos != 'UNKNOWN' && upos != 'X') {
      forms = _baseForms(
          upos, await LexiconDb.instance.getLexiconRowsForLemma(lemma));
    }

    if (upos == a.upos &&
        lemma == a.lemma &&
        identical(feats, a.feats) &&
        identical(forms, a.forms)) {
      return a; // дополнить нечем
    }
    return a.copyWith(lemma: lemma, upos: upos, feats: feats, forms: forms);
  }

  /// Выбираем наиболее вероятную интерпретацию.
  ///
  /// Служебные слова (предлоги/союзы/частицы) приоритетнее знаменательных:
  /// например, «da» — это союз, а не форма глагола «dati», поэтому его не
  /// нужно спрягать. Контекстное снятие омонимии делает онлайн-CLASSLA.
  Map<String, dynamic> _best(List<Map<String, dynamic>> rows) {
    int score(Map<String, dynamic> r) {
      final u = (r['upos'] ?? '').toString();
      const particles = {'ADP', 'CCONJ', 'SCONJ', 'PART'};
      const content = {'NOUN', 'VERB', 'ADJ', 'PROPN', 'ADV', 'NUM'};
      var s = 0;
      if (particles.contains(u)) {
        s += 10;
      } else if (content.contains(u)) {
        s += 5;
      } else {
        s += 3; // PRON/DET/AUX и пр.
      }
      if ((r['feats'] ?? '').toString().isNotEmpty) s += 1;
      return s;
    }

    final sorted = [...rows]..sort((a, b) => score(b).compareTo(score(a)));
    return sorted.first;
  }

  Map<String, String> _baseForms(String upos, List<Map<String, dynamic>> rows) {
    final forms = <String, String>{};
    String? find(bool Function(Map<String, String>) match) {
      for (final r in rows) {
        if (match(WordAnalysis.parseFeats(r['feats'] as String?))) {
          return (r['form'] ?? '').toString();
        }
      }
      return null;
    }

    if (upos == 'VERB' || upos == 'AUX') {
      final inf = find((f) => f['VerbForm'] == 'Inf');
      if (inf != null) forms['инфинитив'] = inf;
      final p1 = find((f) =>
          f['Tense'] == 'Pres' && f['Person'] == '1' && f['Number'] == 'Sing');
      if (p1 != null) forms['1 л. ед. (prezent)'] = p1;
    } else if (upos == 'NOUN' || upos == 'PROPN') {
      final nom = find((f) => f['Case'] == 'Nom' && f['Number'] == 'Sing');
      if (nom != null) forms['им. ед.'] = nom;
      final pl = find((f) => f['Case'] == 'Nom' && f['Number'] == 'Plur');
      if (pl != null) forms['им. мн.'] = pl;
    } else if (upos == 'ADJ') {
      final m = find((f) =>
          f['Case'] == 'Nom' && f['Number'] == 'Sing' && f['Gender'] == 'Masc');
      if (m != null) forms['м.р. ед. (им.)'] = m;
    }
    return forms;
  }
}
