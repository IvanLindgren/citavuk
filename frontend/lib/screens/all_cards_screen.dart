/// Все сохранённые слова, сгруппированные по книгам.
///
/// В словарь попадают и выделенные фразы целиком, поэтому в списке показывается
/// только начало записи — полностью она раскрывается по нажатию.
library;

import 'package:flutter/material.dart';

import '../services/grammar_engine.dart';
import '../services/user_db.dart';
import '../utils/short_text.dart';
import 'flashcards_screen.dart';

class AllCardsScreen extends StatefulWidget {
  const AllCardsScreen({super.key});

  @override
  State<AllCardsScreen> createState() => _AllCardsScreenState();
}

class _AllCardsScreenState extends State<AllCardsScreen> {
  final Map<String, List<Map<String, dynamic>>> _byBook = {};
  final Set<int> _expanded = {};
  bool _loading = true;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await UserDb.instance.getVocabularyWithBooks();
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final row in rows) {
      final book = (row['book_title'] as String?)?.trim();
      grouped.putIfAbsent(book == null || book.isEmpty ? 'Без книги' : book,
          () => []).add(row);
    }
    if (!mounted) return;
    setState(() {
      _byBook
        ..clear()
        ..addAll(grouped);
      _loading = false;
    });
  }

  Map<String, List<Map<String, dynamic>>> get _filtered {
    final query = _query.trim().toLowerCase();
    if (query.isEmpty) return _byBook;

    final result = <String, List<Map<String, dynamic>>>{};
    for (final entry in _byBook.entries) {
      final matched = entry.value.where((row) {
        final word = (row['word'] as String? ?? '').toLowerCase();
        final translation =
            (row['translation'] as String? ?? '').toLowerCase();
        return word.contains(query) || translation.contains(query);
      }).toList();
      if (matched.isNotEmpty) result[entry.key] = matched;
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final groups = _filtered;
    final total = _byBook.values.fold<int>(0, (sum, list) => sum + list.length);

    return Scaffold(
      appBar: AppBar(
        title: Text(total > 0 ? 'Все слова · $total' : 'Все слова'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : total == 0
              ? _empty(scheme)
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                      child: TextField(
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search),
                          hintText: 'Поиск по словам и переводам',
                          isDense: true,
                        ),
                        onChanged: (value) => setState(() => _query = value),
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                        children: [
                          for (final entry in groups.entries)
                            _bookSection(scheme, entry.key, entry.value),
                          if (groups.isEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 40),
                              child: Center(
                                child: Text('Ничего не нашлось',
                                    style:
                                        Theme.of(context).textTheme.bodyMedium),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _empty(ColorScheme scheme) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.style_outlined,
                  size: 56, color: scheme.onSurfaceVariant),
              const SizedBox(height: 16),
              Text(
                'Здесь появятся слова, которые ты сохранишь из книг.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ],
          ),
        ),
      );

  Widget _bookSection(
      ColorScheme scheme, String book, List<Map<String, dynamic>> rows) {
    final bookId = rows.first['book_id'] as int?;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 8),
          child: Row(
            children: [
              Icon(Icons.menu_book_rounded, size: 18, color: scheme.secondary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(book,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(color: scheme.secondary)),
              ),
              Text('${rows.length}',
                  style: Theme.of(context).textTheme.bodySmall),
              if (bookId != null) ...[
                const SizedBox(width: 4),
                IconButton(
                  tooltip: 'Повторять слова этой книги',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.play_circle_outline, size: 20),
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          FlashcardsScreen(bookId: bookId, bookTitle: book),
                    ),
                  ).then((_) => _load()),
                ),
              ],
            ],
          ),
        ),
        for (final row in rows) _wordTile(scheme, row),
      ],
    );
  }

  Widget _wordTile(ColorScheme scheme, Map<String, dynamic> row) {
    final id = row['id'] as int;
    final word = row['word'] as String? ?? '';
    final translation = row['translation'] as String? ?? '';
    final pos = row['pos'] as String? ?? '';
    final open = _expanded.contains(id);
    final long = isLongPhrase(word) || isLongPhrase(translation, words: 6);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: long
            ? () => setState(
                () => open ? _expanded.remove(id) : _expanded.add(id))
            : null,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      open ? word : shortPhrase(word, words: 4),
                      style: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(color: scheme.primary),
                    ),
                  ),
                  if (pos.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Text(GrammarEngine.posShort(pos),
                          style: Theme.of(context).textTheme.labelSmall),
                    ),
                  if (long)
                    Icon(open ? Icons.expand_less : Icons.expand_more,
                        size: 18, color: scheme.onSurfaceVariant),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                open ? translation : shortPhrase(translation, words: 6),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
