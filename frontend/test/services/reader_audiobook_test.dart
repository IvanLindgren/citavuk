import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/public_library_service.dart';
import 'package:srbski_read/services/reader_audiobook.dart';
import 'package:srbski_read/utils/pages.dart';
import 'package:srbski_read/models/book_block.dart';

void main() {
  test('«Вођа» из видео: реплики и подсветка следуют страницам по порядку', () {
    final source = PublicLibraryService.paragraphs(
        File('../web/public/public-library/texts/vodja.txt')
            .readAsStringSync());
    final pages = paginate(source);
    final cues = buildReaderAudioCues(source, pages);
    expect(pages.length, greaterThan(7));
    expect(cues.first.page, 0);
    var previous = 0;
    for (final cue in cues) {
      expect(cue.page, greaterThanOrEqualTo(previous));
      previous = cue.page;
      final shown = pages[cue.page].texts[cue.paragraph];
      expect(shown.substring(cue.start, cue.start + cue.text.length), cue.text);
      expect(
          source[cue.sourceParagraph]
              .substring(cue.sourceOffset, cue.sourceOffset + cue.text.length),
          cue.text);
      for (final ratio in [0.0, 0.25, 0.5, 0.75, 0.99]) {
        final token = cue.tokenAt(ratio);
        if (token < 0) continue;
        final marked = cue.tokens[token];
        expect(shown.substring(marked.start, marked.end), marked.text);
        expect(marked.start, greaterThanOrEqualTo(cue.start));
        expect(marked.start, lessThan(cue.start + cue.text.length));
      }
    }
    final seventh = cues[audioCueForPage(cues, 6)];
    expect(seventh.page, 6);
    expect(seventh.text, isNot(cues.first.text));
    final restored =
        cues[audioCueForPosition(cues, pages[6].start, pages[6].offset)];
    expect(restored.page, 6);
  });

  test('длинная глава, пустые абзацы и картинки сохраняют исходные координаты',
      () {
    final source = [
      'Прво поглавље. ' * 400,
      '',
      imageParagraph('https://citavuk.ru/img/test.webp'),
      'Друга глава. ' * 230
    ];
    final pages = paginate(source);
    final cues = buildReaderAudioCues(source, pages);
    for (final cue in cues) {
      expect(
          source[cue.sourceParagraph]
              .substring(cue.sourceOffset, cue.sourceOffset + cue.text.length),
          cue.text);
    }
    expect(cues.any((cue) => cue.sourceParagraph == 2), false);
    expect(cues.last.sourceParagraph, 3);
  });
}
