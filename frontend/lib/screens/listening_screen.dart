import 'package:flutter/material.dart';

import '../models/audio_lesson.dart';
import '../services/listening_service.dart';
import '../services/user_db.dart';
import '../widgets/animated_widgets.dart';
import '../widgets/eagle_mascot.dart';
import 'listening_player_screen.dart';

/// Тематическая медиатека сербской речи и озвучки собственных книг.
class ListeningScreen extends StatefulWidget {
  const ListeningScreen({super.key});

  @override
  State<ListeningScreen> createState() => _ListeningScreenState();
}

class _ListeningScreenState extends State<ListeningScreen> {
  late Future<List<AudioLesson>> _lessons;
  List<Map<String, dynamic>> _books = [];
  bool _opening = false;
  String _topic = 'Все';

  static const _topics = ['Все', 'Разговоры', 'Еда', 'Культура', 'Учёба'];

  @override
  void initState() {
    super.initState();
    _lessons = ListeningService.instance.getLessons();
    UserDb.instance.getBooks().then((books) {
      if (mounted) setState(() => _books = books);
    });
  }

  Future<void> _openBookAsLesson(Map<String, dynamic> book) async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      final id = book['id'] as int;
      final title = book['title'] as String;
      final paragraphs = await UserDb.instance.getBookContent(id);
      if (!mounted) return;
      if (paragraphs.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('В этой книге нет текста')),
        );
        return;
      }
      final lesson = ListeningService.instance.lessonFromText(
        id: 'book-$id',
        title: title,
        paragraphs: paragraphs,
      );
      await _open(lesson);
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  String _topicOf(AudioLesson lesson) {
    return ListeningService.topicOf(lesson.title);
  }

  String _lessonSubtitle(AudioLesson lesson) {
    final transcript =
        lesson.transcriptUrl != null ? 'с расшифровкой' : 'без расшифровки';
    final duration = lesson.durationSec > 0
        ? '${(lesson.durationSec / 60).round()} мин'
        : '';
    return [
      if (lesson.subtitle.isNotEmpty) lesson.subtitle,
      if (duration.isNotEmpty) duration,
      transcript,
    ].join(' · ');
  }

  Future<void> _open(AudioLesson lesson) => Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => ListeningPlayerScreen(lesson: lesson)),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Слушание'),
        actions: [
          IconButton(
            tooltip: 'Обновить подборку',
            onPressed: () => setState(
              () => _lessons = ListeningService.instance.getLessons(),
            ),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Stack(
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final width = constraints.maxWidth;
              final horizontal = width >= 1500
                  ? (width - 1420) / 2
                  : (width >= 900 ? 28.0 : 16.0);
              final columns = width >= 1250 ? 3 : (width >= 720 ? 2 : 1);
              return FutureBuilder<List<AudioLesson>>(
                future: _lessons,
                builder: (context, snapshot) {
                  final all = snapshot.data ?? const <AudioLesson>[];
                  final filtered = _topic == 'Все'
                      ? all
                      : all.where((item) => _topicOf(item) == _topic).toList();
                  return CustomScrollView(
                    slivers: [
                      SliverPadding(
                        padding:
                            EdgeInsets.fromLTRB(horizontal, 22, horizontal, 0),
                        sliver: SliverToBoxAdapter(child: _intro()),
                      ),
                      SliverPadding(
                        padding:
                            EdgeInsets.fromLTRB(horizontal, 24, horizontal, 12),
                        sliver: SliverToBoxAdapter(child: _topicBar(all)),
                      ),
                      if (snapshot.connectionState == ConnectionState.waiting)
                        const SliverToBoxAdapter(
                          child: Padding(
                            padding: EdgeInsets.all(40),
                            child: Center(child: CircularProgressIndicator()),
                          ),
                        )
                      else if (snapshot.hasError)
                        SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(children: [
                              const Text(
                                  'Не удалось загрузить записи. Проверь соединение и попробуй ещё раз.'),
                              const SizedBox(height: 12),
                              OutlinedButton.icon(
                                onPressed: () => setState(() => _lessons =
                                    ListeningService.instance.getLessons()),
                                icon: const Icon(Icons.refresh),
                                label: const Text('Повторить'),
                              ),
                            ]),
                          ),
                        )
                      else if (filtered.isEmpty)
                        const SliverPadding(
                          padding: EdgeInsets.fromLTRB(24, 18, 24, 36),
                          sliver: SliverToBoxAdapter(
                            child: Text('В этой подборке пока нет записей.'),
                          ),
                        )
                      else
                        SliverPadding(
                          padding: EdgeInsets.fromLTRB(
                              horizontal, 0, horizontal, 32),
                          sliver: SliverGrid(
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: columns,
                              mainAxisSpacing: 14,
                              crossAxisSpacing: 14,
                              childAspectRatio: width < 720 ? 2.45 : 2.05,
                            ),
                            delegate: SliverChildBuilderDelegate(
                              (context, index) {
                                final lesson = filtered[index];
                                return FadeSlideIn(
                                  delay: Duration(
                                      milliseconds: 35 * index.clamp(0, 8)),
                                  offsetY: 8,
                                  child: _episodeCard(lesson),
                                );
                              },
                              childCount: filtered.length,
                            ),
                          ),
                        ),
                      SliverPadding(
                        padding:
                            EdgeInsets.fromLTRB(horizontal, 0, horizontal, 12),
                        sliver: SliverToBoxAdapter(child: _myBooksHeading()),
                      ),
                      if (_books.isEmpty)
                        SliverPadding(
                          padding: EdgeInsets.fromLTRB(
                              horizontal, 0, horizontal, 32),
                          sliver: const SliverToBoxAdapter(
                            child: Text('Импортируй книгу в библиотеку — '
                                'Слухао сможет озвучить её по абзацам.'),
                          ),
                        )
                      else
                        SliverPadding(
                          padding: EdgeInsets.fromLTRB(
                              horizontal, 0, horizontal, 40),
                          sliver: SliverGrid(
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: columns,
                              mainAxisSpacing: 12,
                              crossAxisSpacing: 12,
                              childAspectRatio: width < 720 ? 3.2 : 2.65,
                            ),
                            delegate: SliverChildBuilderDelegate(
                              (context, index) => _bookCard(_books[index]),
                              childCount: _books.length,
                            ),
                          ),
                        ),
                    ],
                  );
                },
              );
            },
          ),
          if (_opening)
            ColoredBox(
              color: Colors.black.withValues(alpha: .3),
              child: const Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }

  Widget _intro() {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 22, 16),
      decoration: BoxDecoration(
        color: scheme.secondaryContainer.withValues(alpha: .46),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.secondary.withValues(alpha: .18)),
      ),
      child: Row(
        children: [
          const EagleSticker(asset: Eagle.slusa, size: 86),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Сербский на слух', style: theme.textTheme.headlineSmall),
                const SizedBox(height: 5),
                Text(
                  'Выбери тему, слушай живую речь и открывай расшифровку. '
                  'Незнакомое слово можно разобрать прямо в плеере.',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      height: 1.4, color: scheme.onSecondaryContainer),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _topicBar(List<AudioLesson> lessons) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Подборки', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final topic in _topics)
              FilterChip(
                label: Text(topic == 'Все'
                    ? 'Все · ${lessons.length}'
                    : '$topic · ${lessons.where((l) => _topicOf(l) == topic).length}'),
                selected: _topic == topic,
                onSelected: (_) => setState(() => _topic = topic),
              ),
          ],
        ),
      ],
    );
  }

  Widget _episodeCard(AudioLesson lesson) {
    final scheme = Theme.of(context).colorScheme;
    final topic = _topicOf(lesson);
    return Material(
      color: scheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _open(lesson),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(color: scheme.outlineVariant),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            children: [
              Container(
                width: 66,
                height: double.infinity,
                decoration: BoxDecoration(
                  color: scheme.secondary,
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(Icons.graphic_eq_rounded,
                    color: scheme.onSecondary, size: 32),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(topic.toUpperCase(),
                        style: TextStyle(
                            fontSize: 10,
                            letterSpacing: .8,
                            fontWeight: FontWeight.w800,
                            color: scheme.secondary)),
                    const SizedBox(height: 5),
                    Text(lesson.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 15.5,
                            height: 1.25,
                            fontWeight: FontWeight.w800)),
                    const Spacer(),
                    Text(_lessonSubtitle(lesson),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12, color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.play_circle_fill_rounded,
                  color: scheme.primary, size: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _myBooksHeading() => Row(
        children: [
          Icon(Icons.record_voice_over_rounded,
              color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 9),
          Text('Озвучить мою книгу',
              style: Theme.of(context).textTheme.titleLarge),
        ],
      );

  Widget _bookCard(Map<String, dynamic> book) {
    final scheme = Theme.of(context).colorScheme;
    final title = book['title']?.toString() ?? 'Без названия';
    return Material(
      color: scheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _openBookAsLesson(book),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border.all(color: scheme.outlineVariant),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            children: [
              Icon(Icons.auto_stories_rounded, color: scheme.primary, size: 30),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                    Text('${book['para_count'] ?? 0} абзацев',
                        style: TextStyle(
                            fontSize: 12, color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}
