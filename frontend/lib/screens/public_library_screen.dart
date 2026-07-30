import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/public_library.dart';
import '../services/file_save.dart';
import '../services/public_library_service.dart';
import '../services/user_db.dart';
import 'book_reader_screen.dart';

class PublicLibraryScreen extends StatefulWidget {
  const PublicLibraryScreen({super.key});

  @override
  State<PublicLibraryScreen> createState() => _PublicLibraryScreenState();
}

class _PublicLibraryScreenState extends State<PublicLibraryScreen> {
  late final Future<List<PublicLibraryItem>> _catalog =
      PublicLibraryService.loadCatalog();
  String _genre = 'Все';
  String _query = '';
  String? _busyId;

  Future<void> _open(PublicLibraryItem item) async {
    setState(() => _busyId = item.id);
    try {
      final source = 'public:${item.id}';
      final books = await UserDb.instance.getBooks();
      final existing = books.where((book) => book['filepath'] == source);
      int id;
      List<String> paragraphs;
      int lastParagraph;
      if (existing.isNotEmpty) {
        final book = existing.first;
        id = book['id'] as int;
        lastParagraph = book['last_para'] as int? ?? 0;
        paragraphs = await UserDb.instance.getBookContent(id);
      } else {
        final text = await PublicLibraryService.loadText(item);
        paragraphs = PublicLibraryService.paragraphs(text);
        id = await UserDb.instance.insertBook(item.title, source, paragraphs);
        await UserDb.instance.setBookFolder(id, 'Публичная библиотека');
        lastParagraph = 0;
      }
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => BookReaderScreen(
            bookId: id,
            title: item.title,
            paragraphs: paragraphs,
            initialParagraph: lastParagraph,
          ),
        ),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось открыть материал: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _download(PublicLibraryItem item) async {
    try {
      final text = await PublicLibraryService.loadText(item);
      final bytes = Uint8List.fromList(utf8.encode(text));
      final selected = await FilePicker.platform.saveFile(
        dialogTitle: 'Скачать текст',
        fileName: '${_safeName(item.title)}.txt',
        type: FileType.custom,
        allowedExtensions: const ['txt'],
        bytes: bytes,
      );
      if (selected == null) return;
      final path =
          selected.toLowerCase().endsWith('.txt') ? selected : '$selected.txt';
      final desktop = !kIsWeb &&
          (defaultTargetPlatform == TargetPlatform.windows ||
              defaultTargetPlatform == TargetPlatform.linux ||
              defaultTargetPlatform == TargetPlatform.macOS);
      if (desktop) await writeStringFile(path, text);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Текст сохранён')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось скачать: $error')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Публичная библиотека')),
      body: FutureBuilder<List<PublicLibraryItem>>(
        future: _catalog,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _ErrorState(error: '${snapshot.error}');
          }
          final items = snapshot.data ?? const [];
          final genres = <String>{'Все', ...items.map((item) => item.genre)};
          final needle = _query.trim().toLowerCase();
          final visible = items
              .where((item) =>
                  (_genre == 'Все' || item.genre == _genre) &&
                  (needle.isEmpty ||
                      '${item.title} ${item.author} ${item.kind}'
                          .toLowerCase()
                          .contains(needle)))
              .toList(growable: false);

          return CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Сербская классика и фольклор в общественном достоянии. '
                        'Полный текст загружается только после выбора книги.',
                        style: TextStyle(color: scheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        onChanged: (value) => setState(() => _query = value),
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search),
                          hintText: 'Название или автор',
                        ),
                      ),
                      const SizedBox(height: 12),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            for (final genre in genres)
                              Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: ChoiceChip(
                                  label: Text(genre),
                                  selected: _genre == genre,
                                  onSelected: (_) =>
                                      setState(() => _genre = genre),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverGrid.builder(
                  itemCount: visible.length,
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 310,
                    mainAxisExtent: 545,
                    crossAxisSpacing: 14,
                    mainAxisSpacing: 14,
                  ),
                  itemBuilder: (context, index) {
                    final item = visible[index];
                    return _PublicBookCard(
                      item: item,
                      busy: _busyId == item.id,
                      disabled: _busyId != null,
                      onOpen: () => _open(item),
                      onDownload: () => _download(item),
                      onSource: item.sourceUrls.isEmpty
                          ? null
                          : () => launchUrl(
                                Uri.parse(item.sourceUrls.first),
                                mode: LaunchMode.externalApplication,
                              ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  static String _safeName(String value) =>
      value.replaceAll(RegExp(r'[<>:"/\\|?*]'), '_');
}

class _PublicBookCard extends StatelessWidget {
  const _PublicBookCard({
    required this.item,
    required this.busy,
    required this.disabled,
    required this.onOpen,
    required this.onDownload,
    this.onSource,
  });

  final PublicLibraryItem item;
  final bool busy;
  final bool disabled;
  final VoidCallback onOpen;
  final VoidCallback onDownload;
  final VoidCallback? onSource;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: SizedBox(
              width: double.infinity,
              child: Image.network(
                item.coverUrl,
                fit: BoxFit.cover,
                cacheWidth: 620,
                errorBuilder: (_, __, ___) => ColoredBox(
                  color: scheme.surfaceContainerHighest,
                  child: const Center(
                    child: Icon(Icons.menu_book_outlined, size: 56),
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    _Tag(item.genre),
                    _Tag(item.kind),
                    _Tag(item.level),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  item.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                Text(
                  item.author,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: disabled ? null : onOpen,
                        icon: busy
                            ? const SizedBox.square(
                                dimension: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.menu_book_outlined),
                        label: const Text('Читать'),
                      ),
                    ),
                    IconButton(
                      onPressed: onDownload,
                      tooltip: 'Скачать TXT',
                      icon: const Icon(Icons.download_outlined),
                    ),
                    if (onSource != null)
                      IconButton(
                        onPressed: onSource,
                        tooltip: 'Источник и лицензия',
                        icon: const Icon(Icons.open_in_new),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          child: Text(text, style: const TextStyle(fontSize: 10)),
        ),
      );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error});
  final String error;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 52),
              const SizedBox(height: 12),
              const Text('Каталог не загрузился'),
              const SizedBox(height: 6),
              Text(error, textAlign: TextAlign.center),
            ],
          ),
        ),
      );
}
