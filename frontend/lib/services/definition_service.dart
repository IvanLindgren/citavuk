import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/definition.dart';
import 'analysis_repository.dart';

/// Толкование слова с сервера Читавука.
///
/// Спрашивать надо начальную форму: словарь ведётся по заглавным словам, и
/// «нихилизму» в нём нет. Латиницу в кириллицу сервер переводит сам.
///
/// Слова в словаре может не быть — это обычный исход, а не сбой: словарь
/// толковый, в нём нет ни имён, ни свежих заимствований. Тогда возвращается
/// null и карточка просто не появляется, сообщать «не нашли» не о чем.
class DefinitionService {
  DefinitionService._();

  static final DefinitionService instance = DefinitionService._();

  String get _base => AnalysisRepository.translationUrl;

  static const _timeout = Duration(seconds: 12);

  /// Уже спрошенные слова, включая ненайденные.
  ///
  /// Повторный тап по слову — обычное дело при чтении, а ответ по слову не
  /// меняется. Память ограничена: карточка на каждое слово книги съела бы её
  /// незаметно.
  final Map<String, Definition?> _memo = {};
  static const _memoLimit = 200;

  Future<Definition?> lookup(String word) async {
    final key = word.trim().toLowerCase();
    if (key.isEmpty) return null;
    if (_memo.containsKey(key)) return _memo[key];

    Definition? entry;
    try {
      final base = _base.endsWith('/')
          ? _base.substring(0, _base.length - 1)
          : _base;
      final uri = Uri.parse(
          '$base/v1/definition?word=${Uri.encodeQueryComponent(word.trim())}');
      final response =
          await http.get(uri, headers: {'Accept': 'application/json'}).timeout(
              _timeout);
      if (response.statusCode == 200) {
        final parsed = Definition.fromJson(
            jsonDecode(utf8.decode(response.bodyBytes))
                as Map<String, dynamic>);
        // Статья без значений — то же, что её отсутствие: показывать нечего.
        if (parsed.senses.isNotEmpty) entry = parsed;
      }
    } catch (_) {
      // Молча: перевод уже показан, и ругаться на недоступность словаря
      // посреди чтения незачем. Неудачу не запоминаем — со связью повезёт.
      return null;
    }

    if (_memo.length >= _memoLimit) _memo.remove(_memo.keys.first);
    _memo[key] = entry;
    return entry;
  }
}
