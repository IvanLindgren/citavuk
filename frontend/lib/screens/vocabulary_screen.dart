import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/card_io.dart';
import '../services/grammar_engine.dart';
import '../services/user_db.dart';
import '../widgets/animated_widgets.dart';
import 'flashcards_screen.dart';

class VocabularyScreen extends StatefulWidget {
  final int bookId;
  final String bookTitle;

  const VocabularyScreen({
    super.key,
    required this.bookId,
    required this.bookTitle,
  });

  @override
  State<VocabularyScreen> createState() => _VocabularyScreenState();
}

class _VocabularyScreenState extends State<VocabularyScreen> {
  List<Map<String, dynamic>> _vocabItems = [];
  bool _isLoading = true;
  int _dueCount = 0;

  @override
  void initState() {
    super.initState();
    _loadVocab();
  }

  Future<void> _loadVocab() async {
    setState(() => _isLoading = true);
    final items =
        await UserDb.instance.getVocabularyForBook(widget.bookId);
    final due = await UserDb.instance.getDueCount(widget.bookId);
    setState(() {
      _vocabItems = items;
      _dueCount = due;
      _isLoading = false;
    });
  }

  void _openFlashcards() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FlashcardsScreen(
          bookId: widget.bookId,
          bookTitle: widget.bookTitle,
        ),
      ),
    ).then((_) => _loadVocab());
  }

  Future<void> _deleteItem(int id) async {
    await UserDb.instance.removeVocabulary(id);
    _loadVocab();
  }

  Future<void> _export() async {
    try {
      final path =
          await CardsIo.export(vocab: _vocabItems, source: widget.bookTitle);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(path == null
            ? 'Экспорт отменён'
            : 'Карточки сохранены в .md: $path'),
      ));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Ошибка экспорта: $e')));
      }
    }
  }

  Future<void> _import() async {
    try {
      final r = await CardsIo.import(bookId: widget.bookId);
      if (!mounted) return;
      if (r == null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Импорт отменён')));
        return;
      }
      await _loadVocab();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(r.found == 0
            ? 'В файле не нашлось карточек'
            : 'Импортировано: ${r.added} новых из ${r.found}'),
      ));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Ошибка импорта: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text('Словарь: ${widget.bookTitle}',
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
        actions: [
          TextButton.icon(
            onPressed: _vocabItems.isEmpty ? null : _openFlashcards,
            icon: const Icon(Icons.style, color: Colors.white),
            label: Text(
              _dueCount > 0 ? 'Карточки ($_dueCount)' : 'Карточки',
              style: const TextStyle(color: Colors.white),
            ),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: Colors.white),
            tooltip: 'Импорт / экспорт',
            onSelected: (v) {
              if (v == 'export') _export();
              if (v == 'import') _import();
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                value: 'export',
                enabled: _vocabItems.isNotEmpty,
                child: const ListTile(
                  leading: Icon(Icons.upload_file_outlined),
                  title: Text('Экспорт в .md'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'import',
                child: ListTile(
                  leading: Icon(Icons.download_outlined),
                  title: Text('Импорт из .md'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _vocabItems.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.folder_open_outlined,
                          size: 64, color: scheme.onSurface.withValues(alpha: 0.4)),
                      const SizedBox(height: 16),
                      Text('В этой папке пока нет слов',
                          style: TextStyle(
                              color: scheme.onSurface.withValues(alpha: 0.6),
                              fontSize: 16)),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _vocabItems.length,
                  itemBuilder: (context, index) {
                    final item = _vocabItems[index];
                    final id = item['id'] as int;
                    final word = item['word'] as String;
                    final lemma = item['lemma'] as String;
                    final pos = item['pos'] as String;
                    final translation = item['translation'] as String;

                    Map<String, dynamic> forms = {};
                    try {
                      forms = jsonDecode(item['forms'] as String);
                    } catch (_) {}

                    return FadeSlideIn(
                      delay: Duration(milliseconds: 24 * (index.clamp(0, 10))),
                      child: Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Text(word,
                                      style: TextStyle(
                                          fontSize: 20,
                                          fontWeight: FontWeight.bold,
                                          color: scheme.primary)),
                                ),
                                IconButton(
                                  icon: Icon(Icons.delete_outline,
                                      color: scheme.error),
                                  onPressed: () => _deleteItem(id),
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: scheme.secondary,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(GrammarEngine.posShort(pos),
                                      style: const TextStyle(
                                          fontSize: 12, color: Colors.white)),
                                ),
                                const SizedBox(width: 8),
                                Text('лемма: $lemma',
                                    style: TextStyle(
                                        color: scheme.onSurface.withValues(alpha: 0.6),
                                        fontSize: 14)),
                              ],
                            ),
                            Divider(height: 24, color: scheme.primary.withValues(alpha: 0.2)),
                            Text(translation,
                                style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w500,
                                    color: scheme.onSurface)),
                            if (forms.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Wrap(
                                spacing: 8,
                                runSpacing: 6,
                                children: forms.entries
                                    .map((e) => Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: scheme.surfaceContainerHighest,
                                            borderRadius: BorderRadius.circular(6),
                                            border: Border.all(
                                                color: scheme.primary.withValues(alpha: 0.3)),
                                          ),
                                          child: Text(
                                              '${GrammarEngine.formKeyRu(e.key)}: ${e.value}',
                                              style: TextStyle(
                                                  fontSize: 12,
                                                  color: scheme.onSurface)),
                                        ))
                                    .toList(),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  );
                  },
                ),
    );
  }
}
