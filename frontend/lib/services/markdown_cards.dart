import 'dart:convert';
import 'grammar_engine.dart';

/// Одна карточка из/для Markdown-файла.
class ParsedCard {
  final String word;
  final String translation;
  final String lemma;
  final String pos;
  final Map<String, String> forms;

  const ParsedCard({
    required this.word,
    required this.translation,
    this.lemma = '',
    this.pos = '',
    this.forms = const {},
  });
}

/// Экспорт/импорт карточек в Markdown.
///
/// Экспорт — аккуратная Markdown-таблица (читается в Obsidian/GitHub, легко
/// переносится в Anki/таблицы). Импорт — гибкий: понимает и таблицу, и простые
/// строки вида «слово — перевод», чтобы можно было вести список вручную.
class MarkdownCards {
  // ---------------------------------------------------------------------------
  // Экспорт
  // ---------------------------------------------------------------------------
  static String export(
    List<Map<String, dynamic>> vocab, {
    String source = '',
    DateTime? date,
  }) {
    final d = date ?? DateTime.now();
    final ds = '${d.year}-${_two(d.month)}-${_two(d.day)}';
    final sb = StringBuffer()
      ..writeln('# 🐺 Читавук — карточки')
      ..writeln();
    final meta = <String>[
      if (source.trim().isNotEmpty) 'Источник: $source',
      'Экспортировано: $ds',
      'Карточек: ${vocab.length}',
    ];
    sb
      ..writeln('> ${meta.join(' · ')}')
      ..writeln()
      ..writeln('| № | Слово | Перевод | Лемма | Часть речи | Формы |')
      ..writeln('|---|-------|---------|-------|------------|-------|');

    for (var i = 0; i < vocab.length; i++) {
      final v = vocab[i];
      final word = _cell(v['word']);
      final translation = _cell(v['translation']);
      final lemma = _cell(v['lemma']);
      final pos = GrammarEngine.posShort(_cell(v['pos']));
      final forms = _formsToText(v['forms']);
      sb.writeln('| ${i + 1} | $word | $translation | $lemma | $pos | $forms |');
    }

    sb
      ..writeln()
      ..writeln('<!-- Файл можно редактировать вручную: добавляй строки '
          '«слово — перевод» и импортируй обратно в Читавук. -->');
    return sb.toString();
  }

  static String _two(int n) => n < 10 ? '0$n' : '$n';

  /// Экранируем символы, ломающие Markdown-таблицу.
  static String _cell(dynamic v) => (v ?? '')
      .toString()
      .replaceAll('\\', r'\\')
      .replaceAll('|', r'\|')
      .replaceAll('\n', ' ')
      .trim();

  static String _formsToText(dynamic formsJson) {
    final map = _decodeForms(formsJson);
    if (map.isEmpty) return '';
    return _cell(map.entries
        .map((e) => '${GrammarEngine.formKeyRu(e.key)}=${e.value}')
        .join('; '));
  }

  static Map<String, String> _decodeForms(dynamic formsJson) {
    if (formsJson is Map) {
      return formsJson.map((k, v) => MapEntry(k.toString(), v.toString()));
    }
    if (formsJson is String && formsJson.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(formsJson);
        if (decoded is Map) {
          return decoded.map((k, v) => MapEntry(k.toString(), v.toString()));
        }
      } catch (_) {}
    }
    return const {};
  }

  // ---------------------------------------------------------------------------
  // Импорт
  // ---------------------------------------------------------------------------
  static List<ParsedCard> parse(String content) {
    final cards = <ParsedCard>[];
    final seen = <String>{};
    Map<String, int>? colIdx;
    var headerSeen = false;

    for (final raw in content.split('\n')) {
      final line = raw.trim();
      if (line.isEmpty) continue;
      if (line.startsWith('#')) continue; // заголовки
      if (line.startsWith('>')) continue; // цитаты/мета
      if (line.startsWith('<!--')) continue; // комментарии
      if (_isTableSeparator(line)) continue; // |---|---|

      ParsedCard? card;
      if (line.startsWith('|')) {
        final cols = _splitTableRow(line);
        if (!headerSeen && _looksLikeHeader(cols)) {
          colIdx = _mapHeader(cols);
          headerSeen = true;
          continue;
        }
        card = colIdx != null
            ? _cardFromCols(cols, colIdx)
            : _cardFromPositional(cols);
      } else {
        card = _parseSimpleLine(line);
      }

      if (card == null) continue;
      final key = card.word.toLowerCase();
      if (key.isEmpty || seen.contains(key)) continue;
      seen.add(key);
      cards.add(card);
    }
    return cards;
  }

  static bool _isTableSeparator(String line) =>
      line.contains('-') && RegExp(r'^\|?[\s:|-]+\|?$').hasMatch(line);

  /// Разбивает строку Markdown-таблицы по неэкранированным «|», затем снимает
  /// экранирование «\|» → «|» и «\\» → «\».
  static List<String> _splitTableRow(String line) {
    var parts = line.split(RegExp(r'(?<!\\)\|'));
    if (parts.isNotEmpty && parts.first.trim().isEmpty) {
      parts = parts.sublist(1);
    }
    if (parts.isNotEmpty && parts.last.trim().isEmpty) {
      parts = parts.sublist(0, parts.length - 1);
    }
    return parts
        .map((p) => p.replaceAll(r'\|', '|').replaceAll(r'\\', '\\').trim())
        .toList();
  }

  static bool _looksLikeHeader(List<String> cols) {
    final lower = cols.map((c) => c.toLowerCase()).toList();
    return lower.any((c) => c == 'слово' || c == 'word') &&
        lower.any(
            (c) => c == 'перевод' || c == 'translation' || c == 'значение');
  }

  static Map<String, int> _mapHeader(List<String> cols) {
    final idx = <String, int>{};
    for (var i = 0; i < cols.length; i++) {
      final c = cols[i].toLowerCase();
      if (c == 'слово' || c == 'word') idx['word'] = i;
      if (c == 'перевод' || c == 'translation' || c == 'значение') {
        idx['translation'] = i;
      }
      if (c == 'лемма' || c == 'lemma') idx['lemma'] = i;
      if (c == 'часть речи' || c == 'pos' || c == 'часть') idx['pos'] = i;
      if (c == 'формы' || c == 'forms') idx['forms'] = i;
    }
    return idx;
  }

  static ParsedCard? _cardFromCols(List<String> cols, Map<String, int> idx) {
    String at(String key) {
      final i = idx[key];
      return (i != null && i >= 0 && i < cols.length) ? cols[i] : '';
    }

    final word = at('word');
    final tr = at('translation');
    if (word.isEmpty || tr.isEmpty) return null;
    return ParsedCard(
      word: word,
      translation: tr,
      lemma: at('lemma'),
      pos: at('pos'),
      forms: _parseForms(at('forms')),
    );
  }

  /// Таблица без распознанного заголовка: пропускаем ведущий номер, берём
  /// первые две содержательные колонки как слово и перевод.
  static ParsedCard? _cardFromPositional(List<String> cols) {
    var c = cols.where((e) => e.isNotEmpty).toList();
    if (c.isEmpty) return null;
    if (RegExp(r'^\d+$').hasMatch(c.first) && c.length > 2) {
      c = c.sublist(1);
    }
    if (c.length < 2) return null;
    return ParsedCard(
      word: c[0],
      translation: c[1],
      lemma: c.length > 2 ? c[2] : '',
      pos: c.length > 3 ? c[3] : '',
      forms: c.length > 4 ? _parseForms(c[4]) : const {},
    );
  }

  static const _simpleSeparators = [
    ' — ',
    ' – ',
    ' - ',
    ' | ',
    '\t',
    ' = ',
    ': '
  ];

  static ParsedCard? _parseSimpleLine(String line) {
    // убираем маркеры списка
    final s = line.replaceFirst(RegExp(r'^[-*+]\s+'), '');
    for (final sep in _simpleSeparators) {
      final i = s.indexOf(sep);
      if (i > 0) {
        final word = s.substring(0, i).trim();
        final tr = s.substring(i + sep.length).trim();
        if (word.isNotEmpty && tr.isNotEmpty && word.length <= 60) {
          return ParsedCard(word: word, translation: tr);
        }
      }
    }
    return null;
  }

  static Map<String, String> _parseForms(String s) {
    if (s.trim().isEmpty) return const {};
    final map = <String, String>{};
    for (final part in s.split(';')) {
      final p = part.trim();
      if (p.isEmpty) continue;
      var sepIdx = p.indexOf('=');
      if (sepIdx < 0) sepIdx = p.indexOf(':');
      if (sepIdx > 0) {
        map[p.substring(0, sepIdx).trim()] = p.substring(sepIdx + 1).trim();
      }
    }
    return map;
  }
}
