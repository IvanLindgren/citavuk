import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/foundation.dart'
    show kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:file_picker/file_picker.dart';
import 'file_save.dart';
import 'markdown_cards.dart';
import 'user_db.dart';

/// Сохранение/загрузка карточек как Markdown-файла (.md).
class CardsIo {
  /// Сохраняет [vocab] в выбранный пользователем .md-файл.
  /// Возвращает путь к файлу или null (если отменено).
  static Future<String?> export({
    required List<Map<String, dynamic>> vocab,
    required String source,
  }) async {
    final md = MarkdownCards.export(vocab, source: source);
    final bytes = Uint8List.fromList(utf8.encode(md));
    final path = await FilePicker.platform.saveFile(
      dialogTitle: 'Сохранить карточки (.md)',
      fileName: 'chitavuk_${_slug(source)}.md',
      type: FileType.custom,
      allowedExtensions: const ['md'],
      bytes: bytes, // на мобильных платформах файл пишется сразу
    );
    if (path == null) return null;
    final p = path.toLowerCase().endsWith('.md') ? path : '$path.md';
    // На десктопе saveFile только возвращает путь — записываем файл сами.
    // На вебе/мобильных saveFile(bytes:) уже сохранил/скачал файл.
    final isDesktop = !kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.windows ||
            defaultTargetPlatform == TargetPlatform.linux ||
            defaultTargetPlatform == TargetPlatform.macOS);
    if (isDesktop) {
      await writeStringFile(p, md);
    }
    return p;
  }

  /// Импортирует карточки из выбранного .md/.txt в книгу [bookId].
  /// Возвращает (найдено, добавлено-новых) или null, если отменено.
  static Future<({int found, int added})?> import({required int bookId}) async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['md', 'markdown', 'txt'],
      withData: true,
    );
    if (res == null || res.files.isEmpty) return null;
    final bytes = res.files.first.bytes;
    if (bytes == null) return null;

    final content = utf8.decode(bytes, allowMalformed: true);
    final cards = MarkdownCards.parse(content);

    // Чтобы посчитать именно новые карточки.
    final existing = (await UserDb.instance.getVocabularyForBook(bookId))
        .map((v) => (v['word'] as String).toLowerCase())
        .toSet();

    var added = 0;
    for (final c in cards) {
      final isNew = !existing.contains(c.word.toLowerCase());
      await UserDb.instance.addVocabulary(
        bookId: bookId,
        word: c.word,
        lemma: c.lemma.isEmpty ? c.word.toLowerCase() : c.lemma,
        pos: c.pos,
        translation: c.translation,
        forms: c.forms,
      );
      if (isNew) {
        existing.add(c.word.toLowerCase());
        added++;
      }
    }
    return (found: cards.length, added: added);
  }

  static String _slug(String s) {
    final t = s
        .toLowerCase()
        .replaceAll(RegExp(r'\.(pdf|docx)$'), '')
        .replaceAll(RegExp(r'[^a-z0-9а-я]+'), '_')
        .replaceAll(RegExp(r'^_+|_+$'), '');
    return t.isEmpty ? 'cards' : t;
  }
}
