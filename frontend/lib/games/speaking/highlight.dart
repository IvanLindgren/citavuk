import 'speaking_models.dart';

class TextPart {
  const TextPart(this.text, [this.mistake]);
  final String text;

  /// Индекс ошибки из ответа сервера, если фрагмент подсвечен.
  final int? mistake;
}

/// Режет текст на куски, помечая места ошибок. Сервер гарантирует, что
/// `original` встречается в тексте (без учёта регистра), но не где именно и
/// сколько раз: берётся первое ещё не занятое вхождение, а ошибки, которым места
/// не нашлось, остаются в списке без подсветки. Парная реализация:
/// `web/src/games/speaking/highlight.ts` — алгоритм должен совпадать.
List<TextPart> annotate(String text, List<SpeakingMistake> mistakes) {
  final lower = text.toLowerCase();
  final spans = <({int start, int end, int mistake})>[];
  for (var index = 0; index < mistakes.length; index++) {
    final needle = mistakes[index].original.toLowerCase();
    if (needle.isEmpty) continue;
    var from = 0;
    while (true) {
      final start = lower.indexOf(needle, from);
      if (start < 0) break;
      final end = start + needle.length;
      if (!spans.any((span) => start < span.end && end > span.start)) {
        spans.add((start: start, end: end, mistake: index));
        break;
      }
      from = start + 1;
    }
  }
  spans.sort((a, b) => a.start.compareTo(b.start));

  final parts = <TextPart>[];
  var cursor = 0;
  for (final span in spans) {
    if (span.start > cursor) parts.add(TextPart(text.substring(cursor, span.start)));
    parts.add(TextPart(text.substring(span.start, span.end), span.mistake));
    cursor = span.end;
  }
  if (cursor < text.length) parts.add(TextPart(text.substring(cursor)));
  return parts;
}
