/// Словарь: поиск, метки и список сохранённых записей.
///
/// К сотне записей список по книгам перестаёт быть словарём. Из книги сюда
/// уходит и выделенная фраза целиком, поэтому первым делом запись делится на
/// слово и фразу — вперемешку они мешают и читать, и повторять. Дальше метки:
/// часть речи, тема, ход запоминания. Считаются они сами (см.
/// services/vocab_tags.dart) и показываются только те, что в словаре
/// действительно встретились: пустая метка обещает раздел, которого нет.
///
/// Тот же разбор на сайте — web/src/pages/Cards.tsx.
library;

import 'package:flutter/material.dart';

import '../services/user_db.dart';
import '../services/vocab_context.dart';
import '../services/vocab_tags.dart';
import '../utils/short_text.dart';
import 'flashcards_screen.dart';

/// Что показываем: всё, только слова или только фразы.
enum _Shape { all, word, phrase }

class _Entry {
  _Entry(this.row, this.tags, this.fields);

  final Map<String, dynamic> row;
  final List<VocabTag> tags;
  final List<String> fields;

  bool get isPhraseEntry => tags.first.id == 'фраза';
  String get book {
    final title = (row['book_title'] as String?)?.trim();
    return title == null || title.isEmpty ? 'Без книги' : title;
  }
}

class AllCardsScreen extends StatefulWidget {
  const AllCardsScreen({super.key});

  @override
  State<AllCardsScreen> createState() => _AllCardsScreenState();
}

class _AllCardsScreenState extends State<AllCardsScreen> {
  List<_Entry> _all = const [];
  final Set<int> _expanded = {};
  final Set<String> _picked = {};
  bool _loading = true;
  String _query = '';
  _Shape _shape = _Shape.all;

  /// Найденные в книгах примеры: id записи -> предложение.
  final Map<int, String> _examples = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await UserDb.instance.getVocabularyWithBooks();
    // Метки считаются один раз на запись, а не при каждом наборе буквы: их
    // бывают сотни, а поиск идёт по каждому нажатию клавиши.
    final entries = [
      for (final row in rows)
        _Entry(
          row,
          tagsFor(
            word: row['word'] as String? ?? '',
            lemma: row['lemma'] as String? ?? '',
            pos: row['pos'] as String? ?? '',
            reps: (row['reps'] as num?)?.toInt() ?? 0,
            intervalDays: (row['interval_days'] as num?)?.toInt() ?? 0,
            ease: (row['ease'] as num?)?.toDouble() ?? 2.5,
          ),
          [
            row['word'] as String? ?? '',
            row['translation'] as String? ?? '',
          ],
        ),
    ];
    if (!mounted) return;
    setState(() {
      _all = entries;
      _loading = false;
    });
    _findExamples();
  }

  /// Примеры из книг — после того, как список уже показан.
  ///
  /// Книга за книгой, а не запись за записью: текст читается один раз, от него
  /// остаётся по одному предложению на слово, и в памяти не задерживается ни
  /// одна книга целиком. Ждать этого список не должен — примеров может не быть
  /// вовсе, а словарь нужен сразу.
  Future<void> _findExamples() async {
    final byBook = <int, List<_Entry>>{};
    for (final entry in _all) {
      final bookId = entry.row['book_id'] as int?;
      if (bookId != null && !entry.isPhraseEntry) {
        byBook.putIfAbsent(bookId, () => []).add(entry);
      }
    }

    for (final book in byBook.entries) {
      final paragraphs = await UserDb.instance.getBookContent(book.key);
      if (!mounted) return;
      if (paragraphs.isEmpty) continue;
      final sentences = findSentences(
        paragraphs,
        book.value.map((e) => e.row['word'] as String? ?? ''),
      );
      final found = {
        for (final entry in book.value)
          if (sentences[entry.row['word'] as String? ?? ''] case final s?)
            entry.row['id'] as int: s,
      };
      if (found.isEmpty) continue;
      setState(() => _examples.addAll(found));
    }
  }

  List<_Entry> get _searched {
    final byShape = switch (_shape) {
      _Shape.all => _all,
      _Shape.word => _all.where((e) => !e.isPhraseEntry),
      _Shape.phrase => _all.where((e) => e.isPhraseEntry),
    };
    return byShape.where((e) => matchesQuery(e.fields, _query)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final searched = _searched;
    // Метки складываются, а не пересекаются: «глагол» и «еда» вместе означают
    // «покажи и то, и другое». Пересечение на разных разрядах почти всегда
    // пусто, и человек решил бы, что фильтр сломан.
    final visible = _picked.isEmpty
        ? searched
        : searched
            .where((e) => e.tags.any((t) => _picked.contains(t.id)))
            .toList();

    final words = _all.where((e) => !e.isPhraseEntry).length;
    final grouped = <String, List<_Entry>>{};
    for (final entry in visible) {
      grouped.putIfAbsent(entry.book, () => []).add(entry);
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_all.isEmpty ? 'Словарь' : 'Словарь · ${_all.length}'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _all.isEmpty
              ? _empty(scheme)
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                      child: TextField(
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search),
                          hintText: 'Поиск по слову и переводу',
                          isDense: true,
                        ),
                        onChanged: (value) => setState(() => _query = value),
                      ),
                    ),
                    _shapeRow(scheme, words),
                    _tagRow(scheme, tagCounts(searched.map((e) => e.tags))),
                    if (_narrowed && visible.isNotEmpty) _reviewButton(visible),
                    Expanded(
                      child: visible.isEmpty
                          ? _nothing()
                          : ListView(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                              children: [
                                for (final group in grouped.entries)
                                  _bookSection(scheme, group.key, group.value),
                              ],
                            ),
                    ),
                  ],
                ),
    );
  }

  /// Сужен ли словарь. Предлагать «повторить отобранное» на всём словаре
  /// значит предлагать то же самое, что уже делает обычное повторение.
  bool get _narrowed =>
      _picked.isNotEmpty || _shape != _Shape.all || _query.trim().isNotEmpty;

  /// Чем сужен словарь — этой же строкой подписан заход повторения.
  String get _selectionLabel {
    final parts = <String>[
      if (_shape == _Shape.word) 'слова',
      if (_shape == _Shape.phrase) 'фразы',
      for (final id in _picked) '#$id',
      if (_query.trim().isNotEmpty) '«${_query.trim()}»',
    ];
    return parts.isEmpty ? 'весь словарь' : parts.join(' · ');
  }

  Widget _reviewButton(List<_Entry> entries) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
        child: SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            icon: const Icon(Icons.play_arrow_rounded),
            label: Text('Повторить отобранное · ${entries.length}'),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => FlashcardsScreen(
                  // Отобранное собрано из разных книг, поэтому книги у захода
                  // нет: очередь приходит готовой, а bookId в ней не участвует.
                  bookId: -1,
                  bookTitle: '',
                  cards: [for (final entry in entries) entry.row],
                  focusLabel: _selectionLabel,
                ),
              ),
            ).then((_) => _load()),
          ),
        ),
      );

  Widget _shapeRow(ColorScheme scheme, int words) => SizedBox(
        height: 44,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          children: [
            _shapeChip(scheme, 'Всё', _all.length, _Shape.all),
            _shapeChip(scheme, 'Слова', words, _Shape.word),
            _shapeChip(scheme, 'Фразы', _all.length - words, _Shape.phrase),
          ],
        ),
      );

  Widget _shapeChip(
          ColorScheme scheme, String label, int count, _Shape shape) =>
      Padding(
        padding: const EdgeInsets.only(right: 6),
        child: ChoiceChip(
          label: Text('$label · $count'),
          selected: _shape == shape,
          onSelected: (_) => setState(() => _shape = shape),
        ),
      );

  Widget _tagRow(ColorScheme scheme, List<TagCount> chips) {
    if (chips.isEmpty) return const SizedBox(height: 4);
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          for (final chip in chips)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                label: Text('${chip.tag.id} · ${chip.count}'),
                selected: _picked.contains(chip.tag.id),
                visualDensity: VisualDensity.compact,
                side: BorderSide(color: _toneOf(scheme, chip.tag.kind)),
                onSelected: (on) => setState(() {
                  if (on) {
                    _picked.add(chip.tag.id);
                  } else {
                    _picked.remove(chip.tag.id);
                  }
                }),
              ),
            ),
          if (_picked.isNotEmpty)
            TextButton(
              onPressed: () => setState(_picked.clear),
              child: const Text('снять метки'),
            ),
        ],
      ),
    );
  }

  /// Цвет метки по разряду: тема, часть речи и ход запоминания различимы сразу.
  Color _toneOf(ColorScheme scheme, TagKind kind) => switch (kind) {
        TagKind.topic => scheme.primary,
        TagKind.freq => scheme.secondary,
        TagKind.progress => scheme.tertiary,
        _ => scheme.outlineVariant,
      };

  /// Предложение из книги, в котором слово встретилось.
  ///
  /// Записи словаря хранят слово и перевод, но не то место, откуда слово взято,
  /// а перевод без него через месяц не значит уже ничего: «kraj» — и «конец», и
  /// «край». Книга лежит рядом (см. services/vocab_context.dart).
  Widget _example(ColorScheme scheme, String sentence) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Container(
        padding: const EdgeInsets.only(left: 8),
        decoration: BoxDecoration(
          border: Border(
            left: BorderSide(
                color: scheme.primary.withValues(alpha: 0.4), width: 2),
          ),
        ),
        child: Text(sentence,
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(fontFamily: 'NotoSerif', height: 1.4)),
      ),
    );
  }

  /// Где это слово пригодится.
  ///
  /// Сохранённое слово перестаёт быть строкой в списке: у него есть место, где
  /// им пользуются. Место названо по-сербски — его и придётся прочитать на
  /// вывеске.
  Widget _placeHint(ColorScheme scheme, String word) {
    final place = placeOf(word);
    if (place == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Icon(Icons.place_outlined, size: 14, color: scheme.onSurfaceVariant),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              'Пригодится здесь: ${place.sr} — ${place.ru}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .labelSmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }

  Widget _nothing() => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'Ничего не нашлось. Попробуй другое слово или сними метки.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
      );

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

  Widget _bookSection(ColorScheme scheme, String book, List<_Entry> entries) {
    final bookId = entries.first.row['book_id'] as int?;
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
              Text('${entries.length}',
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
        for (final entry in entries) _wordTile(scheme, entry),
      ],
    );
  }

  Widget _wordTile(ColorScheme scheme, _Entry entry) {
    final id = entry.row['id'] as int;
    final word = entry.row['word'] as String? ?? '';
    final translation = entry.row['translation'] as String? ?? '';
    final open = _expanded.contains(id);
    final example = _examples[id];
    // Раскрывать есть смысл, если под сгибом что-то лежит: обрезанный текст,
    // пример из книги или место, где слово пригодится.
    final long = isLongPhrase(word) ||
        isLongPhrase(translation, words: 6) ||
        example != null ||
        placeOf(word) != null;

    // На карточке показываются тема, ходовитость и часть речи: вид записи виден
    // по ней самой, а ход запоминания — дело вкладки повторения.
    final shown = entry.tags
        .where((t) =>
            t.kind == TagKind.topic ||
            t.kind == TagKind.freq ||
            t.kind == TagKind.pos)
        .toList();

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: long
            ? () =>
                setState(() => open ? _expanded.remove(id) : _expanded.add(id))
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
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(color: scheme.primary),
                    ),
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
              if (shown.isNotEmpty) ...[
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    for (final tag in shown)
                      Text(
                        '#${tag.id}',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: _toneOf(scheme, tag.kind),
                            ),
                      ),
                  ],
                ),
              ],
              if (open && example != null) _example(scheme, example),
              if (open) _placeHint(scheme, word),
            ],
          ),
        ),
      ),
    );
  }
}
