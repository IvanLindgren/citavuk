import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import '../models/word_analysis.dart';
import '../utils/transliteration.dart';
import 'lexicon_db.dart';

/// Разбор слова/фразы: сначала онлайн (CLASSLA-сервер), при недоступности —
/// офлайн по локальному лексикону (LexiconDb).
class AnalysisRepository {
  AnalysisRepository._();
  static final AnalysisRepository instance = AnalysisRepository._();

  String get _defaultBackend =>
      (!kIsWeb && Platform.isAndroid) ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

  Future<WordAnalysis> analyzeToken({
    required String sentence,
    required int startOffset,
    required int endOffset,
    required String tokenText,
    String? backendUrl,
  }) async {
    // Авто-починка «битых» букв (š/č/ć/ž/đ, ставшие закорючками при извлечении).
    final repaired = await LexiconDb.instance.repair(tokenText);
    final token = repaired ?? tokenText;
    final sent = repaired == null
        ? sentence
        : _splice(sentence, startOffset, endOffset, repaired);
    final end = repaired == null ? endOffset : startOffset + repaired.length;

    final url = backendUrl ?? _defaultBackend;
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
          .timeout(const Duration(milliseconds: 2500));
      if (resp.statusCode == 200) {
        return WordAnalysis.fromServer(
            jsonDecode(resp.body) as Map<String, dynamic>, token);
      }
    } catch (_) {
      // локальный сервер недоступен — идём в офлайн/онлайн-перевод
    }
    return _offlineOrOnline(token);
  }

  String _splice(String s, int start, int end, String repl) {
    if (start < 0 || end > s.length || start > end) return s;
    return s.substring(0, start) + repl + s.substring(end);
  }

  Future<WordAnalysis> _offlineOrOnline(String tokenText) async {
    // Фразы: морфология не нужна — только перевод (по интернету).
    if (tokenText.trim().contains(' ')) {
      final tr = await _translateOnline(tokenText);
      return WordAnalysis(
        surface: tokenText,
        lemma: tokenText.toLowerCase(),
        upos: 'PHRASE',
        translation: tr ?? '[Перевод доступен только онлайн]',
        isOffline: tr == null,
        isPhrase: true,
      );
    }

    final lat = SerbianTransliteration.toLatin(tokenText).toLowerCase();
    final formRows = await LexiconDb.instance.lookupForm(lat);

    var lemma = lat;
    var upos = 'UNKNOWN';
    var feats = <String, String>{};
    if (formRows.isNotEmpty) {
      final best = _best(formRows);
      lemma = (best['lemma'] ?? lat).toString();
      upos = (best['upos'] ?? 'UNKNOWN').toString();
      feats = WordAnalysis.parseFeats(best['feats'] as String?);
    }

    final lemmaRows = await LexiconDb.instance.getLexiconRowsForLemma(lemma);
    final forms = _baseForms(upos, lemmaRows);

    // Перевод: сначала локальный словарь, иначе — онлайн (нужен только интернет).
    var translation = await LexiconDb.instance.getOfflineTranslation(tokenText, lemma);
    var online = false;
    if (translation == null) {
      translation = await _translateOnline(tokenText);
      online = translation != null;
    }

    return WordAnalysis(
      surface: tokenText,
      lemma: lemma,
      upos: upos,
      feats: feats,
      forms: forms,
      translation: translation ?? '[Перевод недоступен — нет интернета]',
      isOffline: !online,
    );
  }

  /// Прямой sr→ru перевод без локального сервера (Google web endpoint).
  Future<String?> _translateOnline(String text) async {
    try {
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
