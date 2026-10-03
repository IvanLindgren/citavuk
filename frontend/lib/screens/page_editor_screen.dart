import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/book_block.dart';
import '../services/api_client.dart';

/// Правка страницы книги: текст, оформление и картинки.
///
/// То же, что на сайте (web/src/components/PageEditor.tsx), и в том же формате
/// хранения: оформление — отрезками рядом с текстом, а не тегами в нём, чтобы
/// разбор слова по нажатию и перевод видели чистый текст.
///
/// Возвращает новые абзацы страницы или null, если правку отменили.
class PageEditorScreen extends StatefulWidget {
  const PageEditorScreen({super.key, required this.paragraphs});

  final List<String> paragraphs;

  @override
  State<PageEditorScreen> createState() => _PageEditorScreenState();
}

/// Поле абзаца, которое помнит оформление каждого знака.
///
/// Знаков на странице немного (около полутора тысяч), поэтому стиль хранится
/// по знаку, а не отрезками: правка текста и переключение стиля на выделении
/// тогда тривиальны, а в отрезки всё собирается только при сохранении.
class StyledTextController extends TextEditingController {
  StyledTextController(String text, List<TextStyleSpan> spans)
      : _styles = List.filled(text.length, '') {
    for (final span in spans) {
      for (var i = span.start; i < span.end && i < _styles.length; i++) {
        _styles[i] += span.style;
      }
    }
    _last = text;
    this.text = text;
    addListener(_follow);
  }

  List<String> _styles;
  String _last = '';

  /// Текст изменился — стили сдвигаются вместе с ним. Вставленное наследует
  /// стиль знака перед собой: набор внутри жирного слова продолжает жирный.
  void _follow() {
    final now = text;
    if (now == _last) return;
    var prefix = 0;
    final shortest = now.length < _last.length ? now.length : _last.length;
    while (prefix < shortest && now.codeUnitAt(prefix) == _last.codeUnitAt(prefix)) {
      prefix++;
    }
    var suffix = 0;
    while (suffix < shortest - prefix &&
        now.codeUnitAt(now.length - 1 - suffix) ==
            _last.codeUnitAt(_last.length - 1 - suffix)) {
      suffix++;
    }
    final inherited = prefix > 0 && prefix - 1 < _styles.length ? _styles[prefix - 1] : '';
    _styles = [
      ..._styles.sublist(0, prefix),
      ...List.filled(now.length - prefix - suffix, inherited),
      ..._styles.sublist(_styles.length - suffix),
    ];
    _last = now;
  }

  /// Включает стиль на выделении, а если он там уже везде — снимает.
  void toggle(String style) {
    final range = selection;
    if (!range.isValid || range.isCollapsed) return;
    final from = range.start;
    final to = range.end;
    final everywhere = [for (var i = from; i < to; i++) _styles[i].contains(style)].every((on) => on);
    for (var i = from; i < to; i++) {
      _styles[i] = everywhere ? _styles[i].replaceAll(style, '') : (_styles[i].contains(style) ? _styles[i] : _styles[i] + style);
    }
    notifyListeners();
  }

  void clearStyles() {
    final range = selection;
    if (!range.isValid || range.isCollapsed) return;
    for (var i = range.start; i < range.end; i++) {
      _styles[i] = '';
    }
    notifyListeners();
  }

  /// Абзац для хранения: текст без пробелов по краям и его отрезки стилей.
  String toParagraph() {
    final lead = text.length - text.trimLeft().length;
    final trimmed = text.trim();
    final spans = <TextStyleSpan>[];
    var start = 0;
    for (var i = 1; i <= trimmed.length; i++) {
      final here = i < trimmed.length ? _styles[lead + i] : null;
      if (here != _styles[lead + start]) {
        if (_styles[lead + start].isNotEmpty) {
          spans.add(TextStyleSpan(start, i, _styles[lead + start]));
        }
        start = i;
      }
    }
    return richParagraph(trimmed, spans);
  }

  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    final base = style ?? const TextStyle();
    final children = <TextSpan>[];
    var start = 0;
    for (var i = 1; i <= text.length; i++) {
      if (i < text.length && _styles[i] == _styles[start]) continue;
      final s = _styles[start];
      children.add(TextSpan(
        text: text.substring(start, i),
        style: base.copyWith(
          fontWeight: s.contains('b') ? FontWeight.w700 : null,
          fontStyle: s.contains('i') ? FontStyle.italic : null,
          decoration: s.contains('u') ? TextDecoration.underline : null,
          backgroundColor: s.contains('m') ? const Color(0xB3F6E27A) : null,
        ),
      ));
      start = i;
    }
    return TextSpan(style: base, children: children);
  }
}

sealed class _Item {}

class _TextItem extends _Item {
  _TextItem(this.controller) : focus = FocusNode();
  final StyledTextController controller;
  final FocusNode focus;
}

class _ImageItem extends _Item {
  _ImageItem(this.url, this.alt);
  final String url;
  final String alt;
}

class _RawItem extends _Item {
  _RawItem(this.paragraph);
  final String paragraph;
}

class _PageEditorScreenState extends State<PageEditorScreen> {
  late final List<_Item> _items = [
    for (final paragraph in widget.paragraphs) _itemOf(paragraph),
  ];
  _TextItem? _active;
  bool _uploading = false;

  _Item _itemOf(String paragraph) {
    final block = parseBookBlock(paragraph);
    switch (block.kind) {
      case BookBlockKind.text:
        return _text(block.text, block.spans);
      case BookBlockKind.image:
        return _ImageItem(block.url, block.text);
      case BookBlockKind.table:
        // Таблицы правкой страницы не меняются: остаются как были.
        return _RawItem(paragraph);
    }
  }

  _TextItem _text(String text, List<TextStyleSpan> spans) {
    final item = _TextItem(StyledTextController(text, spans));
    item.focus.addListener(() {
      if (item.focus.hasFocus) _active = item;
    });
    return item;
  }

  @override
  void dispose() {
    for (final item in _items.whereType<_TextItem>()) {
      item.controller.dispose();
      item.focus.dispose();
    }
    super.dispose();
  }

  void _format(String style) {
    final item = _active;
    if (item == null) return;
    style.isEmpty ? item.controller.clearStyles() : item.controller.toggle(style);
  }

  Future<void> _addImage(int index) async {
    final api = context.read<ApiClient>();
    final messenger = ScaffoldMessenger.of(context);
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 2000);
    if (picked == null) return;
    setState(() => _uploading = true);
    try {
      final bytes = await picked.readAsBytes();
      final result = await api.postFile('/v1/books/media/image',
          field: 'file', bytes: bytes, filename: picked.name, mime: picked.mimeType ?? 'image/jpeg');
      final url = result is Map ? result['url'] as String? ?? '' : '';
      if (url.isEmpty) throw ApiException('Не удалось загрузить картинку.');
      if (mounted) setState(() => _items.insert(index, _ImageItem(url, '')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Не удалось загрузить картинку. Попробуй ещё раз.')));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _save() {
    final out = <String>[];
    for (final item in _items) {
      switch (item) {
        case _TextItem(:final controller):
          final paragraph = controller.toParagraph();
          if (parseBookBlock(paragraph).text.trim().isNotEmpty) out.add(paragraph);
        case _ImageItem(:final url, :final alt):
          out.add(imageParagraph(url, alt));
        case _RawItem(:final paragraph):
          out.add(paragraph);
      }
    }
    Navigator.of(context).pop(out);
  }

  Widget _adder(int index) {
    final scheme = Theme.of(context).colorScheme;
    return Row(mainAxisAlignment: MainAxisAlignment.center, children: [
      TextButton.icon(
        onPressed: () => setState(() => _items.insert(index, _text('', const []))),
        icon: const Icon(Icons.add, size: 16),
        label: const Text('Абзац'),
        style: TextButton.styleFrom(foregroundColor: scheme.onSurfaceVariant),
      ),
      TextButton.icon(
        onPressed: _uploading ? null : () => _addImage(index),
        icon: const Icon(Icons.add_photo_alternate_outlined, size: 16),
        label: Text(_uploading ? 'Загружаю…' : 'Картинка'),
        style: TextButton.styleFrom(foregroundColor: scheme.onSurfaceVariant),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Кнопка не забирает фокус у поля: иначе пропало бы выделение.
    Widget tool(String tooltip, Widget icon, String style) => Tooltip(
          message: tooltip,
          child: Focus(
            canRequestFocus: false,
            descendantsAreFocusable: false,
            child: IconButton(onPressed: () => _format(style), icon: icon),
          ),
        );
    return Scaffold(
      appBar: AppBar(
        title: const Text('Правка страницы'),
        actions: [
          TextButton(onPressed: _uploading ? null : _save, child: const Text('Готово')),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            tool('Жирный', const Icon(Icons.format_bold), 'b'),
            tool('Курсив', const Icon(Icons.format_italic), 'i'),
            tool('Подчёркнутый', const Icon(Icons.format_underlined), 'u'),
            tool('Маркер', const Icon(Icons.border_color_outlined), 'm'),
            tool('Убрать оформление', const Icon(Icons.format_clear), ''),
          ]),
        ),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            _adder(0),
            for (var i = 0; i < _items.length; i++) ...[
              Stack(clipBehavior: Clip.none, children: [
                switch (_items[i]) {
                  _TextItem(:final controller, :final focus) => TextField(
                      controller: controller,
                      focusNode: focus,
                      maxLines: null,
                      // Enter не разрывает абзац: абзацы добавляются кнопкой.
                      keyboardType: TextInputType.text,
                      textInputAction: TextInputAction.done,
                      style: theme.textTheme.bodyLarge?.copyWith(fontSize: 18, height: 1.5),
                      decoration: const InputDecoration(border: OutlineInputBorder()),
                    ),
                  _ImageItem(:final url) => ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.network(url, height: 200, fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => const SizedBox(height: 60, child: Center(child: Icon(Icons.broken_image_outlined)))),
                    ),
                  _RawItem() => Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        border: Border.all(color: theme.colorScheme.outlineVariant),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text('Таблица остаётся как есть.', style: theme.textTheme.bodySmall),
                    ),
                },
                if (_items[i] is! _RawItem)
                  Positioned(
                    right: -6,
                    top: -10,
                    child: IconButton.filledTonal(
                      visualDensity: VisualDensity.compact,
                      tooltip: _items[i] is _ImageItem ? 'Удалить картинку' : 'Удалить абзац',
                      icon: const Icon(Icons.delete_outline, size: 18),
                      onPressed: () => setState(() => _items.removeAt(i)),
                    ),
                  ),
              ]),
              _adder(i + 1),
            ],
          ],
        ),
      ),
    );
  }
}
