import 'dart:convert';
import 'package:crypto/crypto.dart';

/// Старые переводы не имеют достоверной языковой метки: не смешиваем их
/// с новым кэшем и не удаляем. Формат таблицы при этом остаётся прежним.
String translationCacheKey(String word, {String source = 'sr'}) =>
    'translation-v2:${jsonEncode([
          source.trim().toLowerCase(),
          'ru',
          word.trim().toLowerCase()
        ])}';

/// Кэш хранит контекстные признаки: одно написание не определяет падеж.
/// Новая версия не читает старые записи, индексированные только словом.
String analysisCacheKey({
  required String token,
  required String sentence,
  required int start,
  required int end,
  required String backend,
}) =>
    'morph-v3:${sha256.convert(utf8.encode(jsonEncode([
          backend,
          sentence,
          start,
          end,
          token,
        ])))}';
