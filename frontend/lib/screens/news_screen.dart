import 'dart:async';
import 'package:flutter/material.dart';
import '../models/news.dart';
import '../services/news_service.dart';
import '../services/user_db.dart';
import '../widgets/animated_widgets.dart';
import '../widgets/wolf_mascot.dart';
import 'book_reader_screen.dart';

/// Лента новостей/статей на сербском по темам. Карточки-превью; по тапу —
/// статья открывается как обычный документ (с разбором слов) + картинкой.
/// Лента обновляется автоматически: при возврате в приложение и раз в 5 минут
/// (тихо, без «моргания» списка).
class NewsScreen extends StatefulWidget {
  const NewsScreen({super.key});

  @override
  State<NewsScreen> createState() => _NewsScreenState();
}

class _NewsScreenState extends State<NewsScreen> with WidgetsBindingObserver {
  NewsTopic _topic = NewsTopic.all.first;
  List<NewsItem> _items = [];
  bool _loading = true;
  bool _opening = false;
  String? _error;
  DateTime? _updatedAt;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _timer = Timer.periodic(
        const Duration(minutes: 5), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _load(silent: true);
    }
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final topic = _topic.key;
    try {
      final items = await NewsService.instance.getNews(topic);
      if (!mounted || topic != _topic.key) return;
      setState(() {
        _items = items;
        _loading = false;
        _error = null;
        _updatedAt = DateTime.now();
      });
    } catch (e) {
      if (!mounted || topic != _topic.key) return;
      setState(() {
        _loading = false;
        if (_items.isEmpty) _error = '$e';
      });
    }
  }

  String _fmtTime(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  void _selectTopic(NewsTopic t) {
    if (t.key == _topic.key) return;
    setState(() {
      _topic = t;
      _items = [];
      _loading = true;
      _error = null;
    });
    _load();
  }

  Future<void> _openArticle(NewsItem item) async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      final article = await NewsService.instance.getArticle(item.link);
      var paras = article.paragraphs;
      if (paras.isEmpty) {
        paras = [
          if (item.summary.isNotEmpty) item.summary,
          'Открыть оригинал: ${item.link}',
        ];
      }
      final title = article.title.isNotEmpty ? article.title : item.title;
      final id = await UserDb.instance
          .upsertBook(title, item.link, paras, folder: '📰 Новости');
      final imageUrl =
          NewsService.instance.proxiedImage(article.image ?? item.image);
      if (!mounted) return;
      setState(() => _opening = false);
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => BookReaderScreen(
            bookId: id,
            title: title,
            paragraphs: paras,
            initialParagraph: 0,
            leadImageUrl: imageUrl,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _opening = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось открыть статью: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Новости'),
            if (_updatedAt != null)
              Text('обновлено ${_fmtTime(_updatedAt!)}',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.normal,
                      color: Colors.white.withValues(alpha: 0.8))),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Обновить',
            icon: const Icon(Icons.refresh),
            onPressed: () => _load(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Тонкий индикатор фонового обновления.
          SizedBox(
            height: 2,
            child: _loading && _items.isNotEmpty
                ? const LinearProgressIndicator(minHeight: 2)
                : null,
          ),
          // Темы.
          SizedBox(
            height: 52,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: NewsTopic.all.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final t = NewsTopic.all[i];
                return ChoiceChip(
                  label: Text('${t.emoji} ${t.label}'),
                  selected: t.key == _topic.key,
                  onSelected: (_) => _selectTopic(t),
                );
              },
            ),
          ),
          Expanded(child: _buildBody(scheme)),
        ],
      ),
    );
  }

  Widget _buildBody(ColorScheme scheme) {
    if (_loading && _items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_items.isEmpty) {
      return _errorState(
        scheme,
        _error == null
            ? 'Пока пусто. Потяни вниз, чтобы обновить.'
            : 'Не удалось загрузить новости. Проверь интернет и адрес сервера '
                '(меню «Сервер и словарь»), затем потяни вниз.',
      );
    }
    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: () => _load(),
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
            itemCount: _items.length,
            itemBuilder: (_, i) => FadeSlideIn(
              delay: Duration(milliseconds: 20 * (i.clamp(0, 10))),
              child: _newsCard(scheme, _items[i]),
            ),
          ),
        ),
        if (_opening)
          Container(
            color: Colors.black.withValues(alpha: 0.35),
            child: const Center(child: CircularProgressIndicator()),
          ),
      ],
    );
  }

  Widget _errorState(ColorScheme scheme, String text) {
    return ListView(
      children: [
        const SizedBox(height: 60),
        const Center(child: WolfSticker(asset: Wolf.rule, size: 130)),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Text(text,
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.7))),
        ),
        const SizedBox(height: 16),
        Center(
          child: OutlinedButton.icon(
            onPressed: () => _load(),
            icon: const Icon(Icons.refresh),
            label: const Text('Обновить'),
          ),
        ),
      ],
    );
  }

  Widget _newsCard(ColorScheme scheme, NewsItem item) {
    final img = NewsService.instance.proxiedImage(item.image);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _openArticle(item),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (img != null)
              Image.network(
                img,
                height: 170,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                loadingBuilder: (context, child, progress) {
                  if (progress == null) return child;
                  return Container(
                    height: 170,
                    color: scheme.surfaceContainerHighest,
                    alignment: Alignment.center,
                    child: const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  );
                },
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          height: 1.25,
                          color: scheme.onSurface)),
                  if (item.summary.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(item.summary,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 13,
                            color: scheme.onSurface.withValues(alpha: 0.7))),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(Icons.public,
                          size: 13,
                          color: scheme.onSurface.withValues(alpha: 0.5)),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(item.source,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 11.5,
                                color:
                                    scheme.onSurface.withValues(alpha: 0.55))),
                      ),
                      Icon(Icons.menu_book_rounded,
                          size: 15, color: scheme.primary),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
