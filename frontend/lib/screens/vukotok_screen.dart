import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'video_feed_screen.dart';

import '../models/definition.dart';
import '../models/micro_feed.dart';
import '../models/reader_settings.dart';
import '../models/word_analysis.dart';
import '../services/analysis_repository.dart';
import '../services/api_client.dart';
import '../services/definition_service.dart';
import '../services/grammar_engine.dart';
import '../services/lexicon_db.dart';
import '../services/micro_feed_service.dart';
import '../services/reflexive.dart';
import '../services/user_db.dart';
import '../utils/haptics.dart';
import '../utils/serbian_pronunciation.dart';
import '../utils/tokenizer.dart';
import '../widgets/animated_widgets.dart';
import '../widgets/definition_card.dart';
import '../widgets/reader_text.dart';
import '../widgets/wolf_mascot.dart';
import 'vukotok_comments.dart';

Color _feedInk(BuildContext context) => Theme.of(context).colorScheme.onSurface;
Color _feedBackdrop(BuildContext context, double alpha) =>
    Theme.of(context).colorScheme.surface.withValues(alpha: alpha);

/// Оболочка, текстовая лента и панели следуют общей теме приложения.
/// Видеокадр использует собственный чёрный фон оригинального плеера.
Widget vukotokTheme({required Widget child}) => Builder(builder: (context) {
      final theme = Theme.of(context);
      return Theme(
        data: theme,
        child: Material(color: theme.scaffoldBackgroundColor, child: child),
      );
    });

/// Вукоток — лента коротких сербских текстов, которую листают как тикток.
///
/// Вместо видео здесь текст, и это меняет одно правило: карточка не листается
/// внутри себя. Полный текст открывается шторкой, а сама карточка держит ровно
/// столько, сколько помещается на экран, — иначе внутренняя прокрутка отбирает
/// вертикальный свайп у ленты, и переход к следующей карточке срабатывает через
/// раз (ровно это уже было на вебе).
class VukotokScreen extends StatefulWidget {
  const VukotokScreen({super.key, this.active = true});
  final bool active;

  @override
  State<VukotokScreen> createState() => _VukotokScreenState();
}

class _VukotokScreenState extends State<VukotokScreen> {
  bool _video = false;
  bool _videoOpened = false;

  @override
  Widget build(BuildContext context) => vukotokTheme(
        child: Column(children: [
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
              child: _ModePill(
                video: _video,
                onChanged: (video) => setState(() {
                  _video = video;
                  _videoOpened |= video;
                }),
              ),
            ),
          ),
          // Верхний отступ под системной панелью уже отдан SafeArea выше: без
          // этого лента отступала от неё второй раз.
          Expanded(
            child: MediaQuery.removePadding(
              context: context,
              removeTop: true,
              child: IndexedStack(index: _video ? 1 : 0, children: [
                VukotokTextScreen(active: widget.active && !_video),
                if (_videoOpened)
                  VideoFeedScreen(active: widget.active && _video)
                else
                  const SizedBox.shrink(),
              ]),
            ),
          ),
        ]),
      );
}

/// Переключатель «Тексты / Видео»: одна плашка вместо кнопки на всю ширину.
class _ModePill extends StatelessWidget {
  const _ModePill({required this.video, required this.onChanged});
  final bool video;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget segment(bool value, IconData icon, String label) {
      final selected = video == value;
      return Semantics(
        button: true,
        selected: selected,
        label: label,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            if (!selected) {
              lightHaptic();
              onChanged(value);
            }
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: selected ? scheme.primary : Colors.transparent,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon,
                  size: 18,
                  color: selected ? scheme.onPrimary : scheme.onSurfaceVariant),
              const SizedBox(width: 6),
              Text(label,
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color:
                          selected ? scheme.onPrimary : scheme.onSurfaceVariant)),
            ]),
          ),
        ),
      );
    }

    return Center(
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: scheme.surfaceContainer,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          segment(false, Icons.article_outlined, 'Тексты'),
          segment(true, Icons.play_circle_outline, 'Видео'),
        ]),
      ),
    );
  }
}

class VukotokTextScreen extends StatefulWidget {
  const VukotokTextScreen({super.key, this.active = true});
  final bool active;
  @override
  State<VukotokTextScreen> createState() => _VukotokTextScreenState();
}

class _VukotokTextScreenState extends State<VukotokTextScreen> {
  final PageController _pages = PageController();
  final List<MicroFeedItem> _items = [];
  final Set<String> _seen = {};

  bool _loading = true;
  bool _loadingMore = false;
  bool _exhausted = false;
  String _error = '';
  bool _cyrillic = false;
  int _index = 0;
  MicroFeedPreferences? _preferences;
  bool _onboardingDismissed = false;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  /// Листает ровно на одну карточку: колесо, клавиши и кнопки на десктопе.
  void _step(int direction) {
    final next = _index + direction;
    if (next < 0 || next >= _items.length || !_pages.hasClients) return;
    _pages.animateToPage(next,
        duration: const Duration(milliseconds: 380),
        curve: Curves.easeOutCubic);
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is KeyUpEvent || !widget.active) return KeyEventResult.ignored;
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.arrowDown ||
        key == LogicalKeyboardKey.pageDown ||
        key == LogicalKeyboardKey.space) {
      _step(1);
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.arrowUp ||
        key == LogicalKeyboardKey.pageUp) {
      _step(-1);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  /// Следующая обложка грузится, пока читают текущую карточку: иначе она
  /// проявлялась бы уже на экране.
  void _warmUp(int index) {
    for (final i in [index + 1, index + 2]) {
      if (i >= _items.length || _items[i].imageUrl.isEmpty) continue;
      precacheImage(
        ResizeImage(NetworkImage(_items[i].imageUrl), width: 1080),
        context,
        onError: (_, __) {},
      );
    }
  }

  Future<void> _load({bool reset = false}) async {
    if (reset) {
      setState(() {
        _loading = true;
        _exhausted = false;
        _error = '';
      });
    } else {
      if (_loadingMore || _exhausted) return;
      setState(() => _loadingMore = true);
    }
    try {
      final page = await MicroFeedService.instance
          .load(exclude: reset ? [] : _seen.toList());
      if (!mounted) return;
      setState(() {
        if (reset) {
          _items.clear();
          _seen.clear();
        }
        final fresh =
            page.items.where((item) => !_seen.contains(item.id)).toList();
        if (fresh.isEmpty) _exhausted = true;
        for (final item in fresh) {
          _items.add(item);
          _seen.add(item.id);
        }
        if (page.preferences != null) _preferences = page.preferences;
        _error = '';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось загрузить ленту');
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => vukotokTheme(
        child: Builder(builder: (themedContext) => _body(themedContext)),
      );

  Widget _body(BuildContext context) {
    if (_loading) {
      // Лента грузится — волк ждёт вместе с тобой, а не спиннер в пустоте.
      return Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const WolfSticker(asset: Wolf.vukotok, size: 140, animate: false),
              const SizedBox(height: 16),
              ThinkingDots(color: _feedInk(context).withValues(alpha: .7)),
            ],
          ),
        ),
      );
    }

    // Анкета встаёт ДО ленты, а не поверх неё: спрашивать «что тебе интересно»
    // после первой карточки — значит спрашивать с опозданием.
    final prefs = _preferences;
    if (prefs != null && !prefs.onboarded && !_onboardingDismissed) {
      return VukotokOnboarding(
        preferences: prefs,
        onDone: (saved) {
          setState(() { _preferences = saved; _onboardingDismissed = true; });
          _load(reset: true);
        },
      );
    }

    if (_items.isEmpty) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const WolfSticker(asset: Wolf.zbunjen, size: 140),
                const SizedBox(height: 18),
                Text(
                  _error.isEmpty ? 'Вукоток пока пуст' : _error,
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () => _load(reset: true),
                  icon: const Icon(Icons.refresh),
                  label: const Text('Обновить'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final wide = MediaQuery.sizeOf(context).width >= 760;
    return Focus(
      autofocus: true,
      canRequestFocus: widget.active,
      onKeyEvent: _onKey,
      child: Scaffold(
        body: Stack(
          children: [
            // Мышью ленту тоже можно тянуть: по умолчанию на десктопе жест
            // мыши прокруткой не считается, и лента листалась только колесом.
            ScrollConfiguration(
              behavior: ScrollConfiguration.of(context).copyWith(
                dragDevices: {
                  PointerDeviceKind.touch,
                  PointerDeviceKind.mouse,
                  PointerDeviceKind.trackpad,
                  PointerDeviceKind.stylus,
                },
              ),
              child: PageView.builder(
                controller: _pages,
                scrollDirection: Axis.vertical,
                itemCount: _items.length,
                onPageChanged: (i) {
                  setState(() => _index = i);
                  _warmUp(i);
                  if (i >= _items.length - 2) _load();
                },
                itemBuilder: (context, i) => _VukotokCard(
                  key: ValueKey(_items[i].id),
                  item: _items[i],
                  cyrillic: _cyrillic,
                  active: widget.active && _index == i,
                ),
              ),
            ),
            _TopBar(
              cyrillic: _cyrillic,
              position: '${_index + 1} / ${_items.length}',
              onScript: () => setState(() => _cyrillic = !_cyrillic),
              onLiked: _showLiked,
            ),
            if (wide)
              Positioned(
                right: 20,
                top: 0,
                bottom: 0,
                child: Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    IconButton.filledTonal(
                      tooltip: 'Предыдущая карточка',
                      onPressed: _index > 0 ? () => _step(-1) : null,
                      icon: const Icon(Icons.keyboard_arrow_up),
                    ),
                    const SizedBox(height: 10),
                    IconButton.filledTonal(
                      tooltip: 'Следующая карточка',
                      onPressed:
                          _index < _items.length - 1 ? () => _step(1) : null,
                      icon: const Icon(Icons.keyboard_arrow_down),
                    ),
                  ]),
                ),
              ),
            if (_loadingMore)
              const Positioned(
                left: 16,
                bottom: 16,
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _showLiked() async {
    List<MicroFeedItem> items;
    try {
      items = await MicroFeedService.instance.liked();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content:
                  Text('Не удалось загрузить сохранённое. Попробуй ещё раз.')),
        );
      }
      return;
    }
    if (!mounted) return;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainer,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _LikedSheet(items: items, cyrillic: _cyrillic),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.cyrillic,
    required this.position,
    required this.onScript,
    required this.onLiked,
  });

  final bool cyrillic;
  final String position;
  final VoidCallback onScript;
  final VoidCallback onLiked;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: const EdgeInsets.only(top: 4),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xCC000000), Color(0x00000000)],
          ),
        ),
        child: Row(
          children: [
            const SizedBox(width: 16),
            Text(position,
                style: TextStyle(
                    color: _feedInk(context).withValues(alpha: .7),
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
            const Spacer(),
            IconButton(
              tooltip: 'Сохранённое',
              onPressed: onLiked,
              icon: Icon(Icons.favorite_border, color: _feedInk(context)),
            ),
            TextButton(
              onPressed: onScript,
              child: Text(cyrillic ? 'ЋИР' : 'LAT',
                  style: TextStyle(
                      color: _feedInk(context), fontWeight: FontWeight.w800)),
            ),
            const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }
}

/// Одна карточка ленты.
class _VukotokCard extends StatefulWidget {
  const _VukotokCard(
      {super.key,
      required this.item,
      required this.cyrillic,
      this.active = true});

  final MicroFeedItem item;
  final bool cyrillic;
  final bool active;

  @override
  State<_VukotokCard> createState() => _VukotokCardState();
}

class _VukotokCardState extends State<_VukotokCard>
    with WidgetsBindingObserver {
  late int _reaction = widget.item.reaction;
  late int _likes = widget.item.likesCount;
  late int _dislikes = widget.item.dislikesCount;
  late int _comments = widget.item.commentsCount;
  bool _justLiked = false;
  DateTime? _shownAt;
  Offset? _burstAt;
  int _burstId = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startView();
  }

  void _startView() {
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    if (!widget.active ||
        _shownAt != null ||
        (lifecycle != null && lifecycle != AppLifecycleState.resumed)) {
      return;
    }
    _shownAt = DateTime.now();
    MicroFeedService.instance.record(widget.item.id, 'view');
  }

  @override
  void didUpdateWidget(_VukotokCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active) {
      _startView();
    } else {
      _finishView();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startView();
    } else {
      _finishView();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _finishView();
    super.dispose();
  }

  void _finishView() {
    final shown = _shownAt;
    _shownAt = null;
    if (shown != null) {
      final dwell = DateTime.now().difference(shown).inMilliseconds;
      final words =
          widget.item.text(widget.cyrillic).split(RegExp(r'\s+')).length;
      final expected = (words / 180 * 60000 * .65).clamp(15000, 600000).toInt();
      if (dwell < 2000) {
        MicroFeedService.instance
            .record(widget.item.id, 'quick_skip', dwellMs: dwell);
      } else if (dwell >= expected) {
        MicroFeedService.instance
            .record(widget.item.id, 'complete', dwellMs: dwell);
      }
    }
  }

  Future<void> _react(int next) async {
    final previous = _reaction;
    final target = previous == next ? 0 : next;
    if (target == 1) lightHaptic();
    setState(() {
      _reaction = target;
      _likes += (target == 1 ? 1 : 0) - (previous == 1 ? 1 : 0);
      _dislikes += (target == -1 ? 1 : 0) - (previous == -1 ? 1 : 0);
      _justLiked = target == 1;
    });
    await MicroFeedService.instance.record(
      widget.item.id,
      target == 0 ? 'reaction_cleared' : (target == 1 ? 'like' : 'dislike'),
    );
    // Лайк — ещё и закладка, но об этом надо сказать: подсказка появляется
    // ровно тогда, когда её заслужили, и гаснет сама.
    if (target == 1) {
      await Future<void>.delayed(const Duration(seconds: 4));
      if (mounted) setState(() => _justLiked = false);
    }
  }

  /// Двойное касание — лайк, как в ленте, к которой все привыкли. Уже
  /// поставленный лайк повторное касание не снимает: случайный второй тап не
  /// должен отбирать то, что человек только что отметил.
  void _likeByTap() {
    setState(() => _burstId++);
    if (_reaction != 1) unawaited(_react(1));
  }

  Future<void> _openComments() async {
    // Счётчик обновляется по закрытию шторки: написал реплику — цифра на
    // карточке обязана сойтись с тем, что человек только что видел.
    final added = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainer,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => VukotokCommentsSheet(itemId: widget.item.id),
    );
    if (added != null && mounted) setState(() => _comments = added);
  }

  void _openFull() {
    MicroFeedService.instance.record(widget.item.id, 'read_more_clicked');
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainer,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) =>
          _FullTextSheet(item: widget.item, cyrillic: widget.cyrillic),
    );
  }

  Widget _cover(MicroFeedItem item, String title, bool wide) {
    if (item.imageUrl.isEmpty) return _PlainCover(title: title);
    Widget image = Image.network(
      item.imageUrl,
      fit: BoxFit.cover,
      cacheWidth: 1080,
      gaplessPlayback: true,
      // Обложка проявляется, а не выскакивает: пока она грузится, под ней
      // тёмный фон раздела.
      frameBuilder: (context, child, frame, sync) => AnimatedOpacity(
        opacity: frame != null || sync ? 1 : 0,
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeOut,
        child: child,
      ),
      errorBuilder: (_, __, ___) => _PlainCover(title: title),
    );
    // На широком экране карточка — телефон посреди окна, а не растянутая на
    // монитор картинка: обложка уходит в размытый фон.
    if (wide) {
      image = ImageFiltered(
        imageFilter: ImageFilter.blur(sigmaX: 26, sigmaY: 26),
        child: image,
      );
    }
    return image;
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final title = item.title(widget.cyrillic);
    final text = item.text(widget.cyrillic);
    final minutes =
        (text.split(RegExp(r'\s+')).length / 180).ceil().clamp(1, 99);

    return LayoutBuilder(builder: (context, constraints) {
      final wide = constraints.maxWidth >= 760;
      return Stack(
        fit: StackFit.expand,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onDoubleTapDown: (details) => _burstAt = details.localPosition,
            onDoubleTap: _likeByTap,
            child: _cover(item, title, wide),
          ),
          IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [
                    _feedBackdrop(context, .95),
                    _feedBackdrop(context, .72),
                    _feedBackdrop(context, wide ? .6 : .3),
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.center,
              child: ConstrainedBox(
                constraints:
                    BoxConstraints(maxWidth: wide ? 640 : double.infinity),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 56, 12, 16),
                  child: _content(item, title, text, minutes),
                ),
              ),
            ),
          ),
          if (_burstAt != null)
            Positioned(
              left: _burstAt!.dx - 56,
              top: _burstAt!.dy - 56,
              child: IgnorePointer(child: _HeartBurst(key: ValueKey(_burstId))),
            ),
          if (_justLiked)
            Positioned(
              left: 20,
              right: 20,
              bottom: 24,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: _feedInk(context).withValues(alpha: .95),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      'Сохранено — ищи в ♡ наверху',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.surface),
                    ),
                  ),
                ),
              ),
            ),
        ],
      );
    });
  }

  Widget _content(MicroFeedItem item, String title, String text, int minutes) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.end,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _Chip(
                      text:
                          microFeedCategories[item.category] ?? item.category),
                  Text('${item.cefr}, $minutes мин',
                      style: TextStyle(
                          color: _feedInk(context).withValues(alpha: .7),
                          fontSize: 12,
                          fontWeight: FontWeight.w700)),
                ],
              ),
              const SizedBox(height: 10),
              // Заголовок разбирается по словам наравне с текстом: это
              // самые заметные слова карточки, и молчать о них нельзя.
              _Tappable(sentence: title, fontSize: 24, bold: true),
              const SizedBox(height: 10),
              Flexible(
                child: _CardText(
                  text: text,
                  onReadMore: _openFull,
                ),
              ),
              const SizedBox(height: 10),
              if (item.attributionText.isNotEmpty)
                Text(item.attributionText,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style:
                        TextStyle(color: _feedInk(context).withValues(alpha: .54), fontSize: 11)),
            ],
          ),
        ),
        Column(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            _Action(
              icon: _reaction == 1 ? Icons.favorite : Icons.favorite_border,
              active: _reaction == 1,
              count: _likes,
              label: 'Нравится',
              onTap: () => _react(1),
            ),
            _Action(
              icon: _reaction == -1
                  ? Icons.thumb_down
                  : Icons.thumb_down_outlined,
              active: _reaction == -1,
              count: _dislikes,
              label: 'Не показывать похожее',
              onTap: () => _react(-1),
            ),
            // Обсуждение в приложении отсутствовало вовсе: на сайте оно
            // было, а здесь кнопки не существовало, и запросы ленты
            // уходили без токена сессии — писать всё равно было нечем.
            _Action(
              icon: Icons.mode_comment_outlined,
              active: false,
              count: _comments,
              label: 'Обсуждение',
              onTap: _openComments,
            ),
          ],
        ),
      ],
    );
  }
}

/// Сердце, вспыхивающее в точке двойного касания.
class _HeartBurst extends StatelessWidget {
  const _HeartBurst({super.key});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 750),
      builder: (context, t, _) {
        final scale = Curves.easeOutBack.transform((t * 2).clamp(0.0, 1.0));
        final opacity = t < .6 ? 1.0 : (1 - (t - .6) / .4).clamp(0.0, 1.0);
        return Opacity(
          opacity: opacity,
          child: Transform.translate(
            offset: Offset(0, -30 * t),
            child: Transform.scale(
              scale: .4 + .8 * scale,
              child: const Icon(Icons.favorite,
                  size: 112,
                  color: Color(0xFFE86A5B),
                  shadows: [Shadow(color: Colors.black54, blurRadius: 18)]),
            ),
          ),
        );
      },
    );
  }
}

/// Текст карточки: показывается целиком, если помещается.
///
/// Раньше он всегда резался `hookOf` на 46 словах, а карточка пишется на
/// 100–150 — то есть кнопка «Читать дальше» появлялась почти всегда, и текст
/// на минуту чтения нельзя было дочитать без второго тапа. Теперь помещается
/// ли он, решает замер: `TextPainter` считает высоту при той же ширине и том
/// же стиле, что и у настоящего абзаца.
///
/// Затемнение внизу и кнопка включаются только когда текст правда не влез, и
/// кнопка получает собственную высоту — раньше градиент гасил текст ровно там,
/// где начиналась кнопка, и она читалась как лежащая поверх строк.
class _CardText extends StatelessWidget {
  const _CardText({required this.text, required this.onReadMore});

  final String text;
  final VoidCallback onReadMore;

  static const _fontSize = 16.5;
  static const _buttonBand = 52.0;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Замер идёт по тем же настройкам, что и настоящий абзац: разойдись
        // шрифт или межстрочный интервал — и решение «влезло или нет» стало бы
        // случайным.
        final s = cardTextSettings(_fontSize);
        final painter = TextPainter(
          text: TextSpan(
            text: text,
            style: TextStyle(
              fontFamily: s.font.family,
              fontSize: s.fontSize,
              height: s.lineHeight,
              letterSpacing: s.letterSpacing,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: constraints.maxWidth);

        if (painter.height <= constraints.maxHeight) {
          return _Tappable(sentence: text, fontSize: _fontSize);
        }

        final band = (constraints.maxHeight - _buttonBand).clamp(0.0, 4000.0);
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: band,
              child: ClipRect(
                child: ShaderMask(
                  shaderCallback: (rect) => LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [_feedInk(context), _feedInk(context), Colors.transparent],
                    stops: const [0, .82, 1],
                  ).createShader(rect),
                  blendMode: BlendMode.dstIn,
                  child: OverflowBox(
                    alignment: Alignment.topLeft,
                    minHeight: 0,
                    maxHeight: double.infinity,
                    child: _Tappable(sentence: text, fontSize: _fontSize),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.tonal(
              onPressed: onReadMore,
              child: const Text('Читать целиком'),
            ),
          ],
        );
      },
    );
  }
}

class _PlainCover extends StatelessWidget {
  const _PlainCover({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    final letter = title.trim().isEmpty ? 'Ч' : title.trim()[0];
    // Стикер и буква стоят долями высоты, а не на фиксированных 90 и 120
    // пикселях: на высоком телефоне между ними и текстом открывалась чёрная
    // пустота в пол-экрана. Градиент добивает остальное — ровная заливка
    // читалась как «ничего не загрузилось».
    return LayoutBuilder(
      builder: (context, constraints) {
        final sticker = (constraints.maxWidth * .46).clamp(120.0, 210.0);
        return DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Theme.of(context).colorScheme.surfaceContainerHighest, Theme.of(context).colorScheme.surface],
            ),
          ),
          child: Stack(
            children: [
              Align(
                alignment: const Alignment(0, -.62),
                child: Text(letter,
                    style: TextStyle(
                        fontSize: sticker * 1.1,
                        height: 1,
                        fontWeight: FontWeight.w900,
                        color: _feedInk(context).withValues(alpha: .06))),
              ),
              Align(
                alignment: const Alignment(0, -.46),
                child: Icon(Icons.auto_stories_outlined,
                    size: sticker * .5, color: _feedInk(context).withValues(alpha: .12)),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(7),
          border: Border.all(color: _feedInk(context).withValues(alpha: .24)),
        ),
        child: Text(text.toUpperCase(),
            style: TextStyle(
                color: _feedInk(context),
                fontSize: 11,
                fontWeight: FontWeight.w800)),
      );
}

class _Action extends StatelessWidget {
  const _Action({
    required this.icon,
    required this.active,
    required this.count,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final bool active;
  final int count;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(
          children: [
            IconButton(
              tooltip: label,
              onPressed: onTap,
              icon: Icon(icon,
                  color: active ? const Color(0xFFE86A5B) : _feedInk(context)),
            ),
            // Ноль не показываем: три нуля на каждой карточке выглядят как
            // мёртвая лента, хотя означают лишь «ещё никто не нажимал».
            if (count > 0)
              Text('$count',
                  style: TextStyle(
                      color: _feedInk(context).withValues(alpha: .7),
                      fontSize: 12,
                      fontWeight: FontWeight.w700)),
          ],
        ),
      );
}

/// Настройки абзаца карточки. Одни и те же для отрисовки и для замера.
ReaderSettings cardTextSettings(double fontSize) => ReaderSettings(
      fontSize: fontSize,
      lineHeight: 1.4,
      firstLineIndent: 0,
      paragraphSpacing: 0,
    );

/// Текст, в котором можно нажать любое слово.
class _Tappable extends StatelessWidget {
  const _Tappable({
    required this.sentence,
    this.fontSize = 16,
    this.bold = false,
  });

  final String sentence;
  final double fontSize;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return ReaderParagraph(
      text: sentence,
      settings: cardTextSettings(fontSize),
      textColor: _feedInk(context),
      highlightColor: const Color(0x66FFD37A),
      highlightTextColor: _feedInk(context),
      onTapWord: (index, token, tokens) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => VukotokWordSheet(sentence: sentence, token: token),
      ),
    );
  }
}

/// Разбор слова: перевод, форма, ударение и частица «se».
class VukotokWordSheet extends StatefulWidget {
  const VukotokWordSheet({
    super.key,
    required this.sentence,
    required this.token,
  });

  final String sentence;
  final Token token;

  @override
  State<VukotokWordSheet> createState() => _VukotokWordSheetState();
}

class _VukotokWordSheetState extends State<VukotokWordSheet> {
  late final Future<WordAnalysis> _analysis;
  Reflexive? _reflexive;
  Map<String, String>? _accent;

  /// Толкование начальной формы. Спрашивается после разбора: словарь ведётся
  /// по заглавным словам, и начальная форма известна только из него.
  Future<Definition?>? _definition;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    _analysis = AnalysisRepository.instance.analyzeToken(
      sentence: widget.sentence,
      startOffset: widget.token.start,
      endOffset: widget.token.end,
      tokenText: widget.token.text,
    );
    _analysis.then((data) {
      if (!mounted || data.isEnglish || data.isPhrase) return;
      final lemma = data.lemma.trim();
      if (lemma.isEmpty) return;
      setState(() => _definition = DefinitionService.instance.lookup(lemma));
    });
    _loadExtras();
  }

  Future<void> _loadExtras() async {
    final reflexive = await attachSe(
      sentence: widget.sentence,
      start: widget.token.start,
      end: widget.token.end,
      surface: widget.token.text,
    );
    // У частицы «se» своего ударения нет — она безударная, и показывать нужно
    // ударение глагола пары.
    final target =
        reflexive?.onParticle == true ? reflexive!.verb : widget.token.text;
    final accent = await LexiconDb.instance.accent(target);
    if (!mounted) return;
    setState(() {
      _reflexive = reflexive;
      _accent = accent;
    });
  }

  Future<void> _save(WordAnalysis data) async {
    final bookId = await UserDb.instance.ensureBook('Вукоток');
    final reflexive = _reflexive;
    await UserDb.instance.addVocabulary(
      bookId: bookId,
      word:
          reflexive?.lemma.isNotEmpty == true ? reflexive!.lemma : data.surface,
      lemma:
          reflexive?.lemma.isNotEmpty == true ? reflexive!.lemma : data.lemma,
      pos: data.upos,
      translation: (data.contextualTranslation?.trim().isNotEmpty ?? false)
          ? data.contextualTranslation!.trim()
          : data.translation,
      forms: data.forms,
    );
    if (mounted) setState(() => _saved = true);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final reflexive = _reflexive;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
      ),
      padding: EdgeInsets.fromLTRB(
          20, 14, 20, MediaQuery.paddingOf(context).bottom + 20),
      child: FutureBuilder<WordAnalysis>(
        future: _analysis,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(
                height: 220, child: Center(child: CircularProgressIndicator()));
          }
          final data = snapshot.data;
          if (data == null) {
            return const SizedBox(
              height: 180,
              child: Center(child: Text('Не удалось перевести слово')),
            );
          }
          // Контекстный перевод главный, словарный — ниже и мельче, но только
          // если он отличается: два одинаковых перевода подряд выглядят сбоем.
          final contextual = data.contextualTranslation?.trim() ?? '';
          final general = data.translation.trim();
          final hasContext = contextual.isNotEmpty &&
              contextual.toLowerCase() != general.toLowerCase();
          final primary = hasContext
              ? contextual
              : (general.isNotEmpty ? general : contextual);
          // Движок мог не узнать форму: тогда вместо «слово, » с висящей
          // точкой не показываем ничего.
          final subtitle = reflexive != null
              ? 'возвратный глагол${reflexive.lemma.isEmpty ? '' : ', ${reflexive.lemma}'}'
              : data.lemma.trim().isEmpty
                  ? ''
                  : '${GrammarEngine.posShort(data.upos)}, ${data.lemma}';
          return SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  reflexive != null ? reflexive.phrase : data.surface,
                  style: const TextStyle(
                      fontSize: 26, fontWeight: FontWeight.w800),
                ),
                if (_accent != null) ...[
                  const SizedBox(height: 4),
                  _AccentLine(accent: _accent!, fallback: data.surface),
                ],
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(subtitle,
                      style: TextStyle(color: scheme.onSurfaceVariant)),
                ],
                const SizedBox(height: 16),
                // Перевод говорит сам Читавук — ровно как в читалке. Иначе в
                // Вукотоке маскота нет вовсе, а карточка при неудачном разборе
                // остаётся почти пустой.
                WolfBubble(
                  title: hasContext ? 'В этом предложении' : 'Перевод',
                  text: primary.isEmpty ? 'Перевода нет' : primary,
                  asset: Wolf.gram,
                  wolfSize: 120,
                ),
                if (hasContext) ...[
                  const SizedBox(height: 12),
                  Text('Словарное значение',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                          color: scheme.onSurfaceVariant)),
                  const SizedBox(height: 4),
                  Text(general),
                ],
                if (_definition != null)
                  FutureBuilder<Definition?>(
                    future: _definition,
                    builder: (context, snap) {
                      final entry = snap.data;
                      if (entry == null) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: DefinitionCard(entry),
                      );
                    },
                  ),
                if (reflexive != null) ...[
                  const SizedBox(height: 14),
                  _ReflexiveCard(reflexive: reflexive),
                ],
                // Начальную форму подсказала нейросеть: слова нет в словаре
                // форм. Падеж и склонение всё равно посчитаны по правилам.
                if (data.generated) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Этого слова нет в словаре Читавука: начальную форму '
                    'подсказала нейросеть, а падеж и склонение построены по '
                    'правилам языка.',
                    style: TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        fontStyle: FontStyle.italic,
                        color: scheme.onSurfaceVariant),
                  ),
                ],
                // Разбора не будет — говорим об этом словом, а не пустотой на
                // месте, где обычно стоит грамматика.
                if (subtitle.isEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Эту форму Читавук в словаре не нашёл: перевод есть, '
                    'а разбора и склонения не будет.',
                    style:
                        TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
                  ),
                ],
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _saved ? null : () => _save(data),
                    child:
                        Text(_saved ? 'Слово сохранено' : 'Добавить в словарь'),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Ударение: жирным сама ударная буква, а не подпись словами.
class _AccentLine extends StatelessWidget {
  const _AccentLine({required this.accent, required this.fallback});

  final Map<String, String> accent;
  final String fallback;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final written = (accent['latin'] ?? '').isNotEmpty
        ? accent['latin']!
        : (accent['cyrillic'] ?? '');
    final ipa = accent['ipa'] ?? '';
    if (written.isEmpty && ipa.isEmpty) return const SizedBox.shrink();

    final base = TextStyle(fontSize: 14, color: scheme.onSurfaceVariant);
    if (written.isEmpty) return Text(ipa, style: base);

    final (before, stressed, after) =
        SerbianPronunciation.splitAccented(written);
    return Text.rich(
      TextSpan(style: base, children: [
        TextSpan(text: before),
        TextSpan(
          text: stressed,
          style:
              TextStyle(fontWeight: FontWeight.w900, color: scheme.onSurface),
        ),
        TextSpan(text: after),
        if (ipa.isNotEmpty) TextSpan(text: '  $ipa'),
      ]),
    );
  }
}

class _ReflexiveCard extends StatelessWidget {
  const _ReflexiveCard({required this.reflexive});
  final Reflexive reflexive;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Возвратный глагол',
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                  color: scheme.onSurfaceVariant)),
          const SizedBox(height: 6),
          Text(reflexive.meaning, style: const TextStyle(height: 1.4)),
          const SizedBox(height: 8),
          Text(reflexive.why,
              style: TextStyle(height: 1.4, color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// Полный текст карточки — шторкой поверх ленты.
class _FullTextSheet extends StatelessWidget {
  const _FullTextSheet({required this.item, required this.cyrillic});

  final MicroFeedItem item;
  final bool cyrillic;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: .88,
      minChildSize: .5,
      maxChildSize: .95,
      expand: false,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 32),
        children: [
          _Tappable(sentence: item.title(cyrillic), fontSize: 21, bold: true),
          const SizedBox(height: 14),
          _Tappable(sentence: item.text(cyrillic), fontSize: 17),
          const SizedBox(height: 18),
          if (item.attributionText.isNotEmpty)
            Text(item.attributionText,
                style: TextStyle(color: _feedInk(context).withValues(alpha: .54), fontSize: 12)),
        ],
      ),
    );
  }
}

class _LikedSheet extends StatelessWidget {
  const _LikedSheet({required this.items, required this.cyrillic});

  final List<MicroFeedItem> items;
  final bool cyrillic;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const WolfSticker(asset: Wolf.vukotok, size: 140),
            const SizedBox(height: 14),
            Text('Пока пусто',
                style: TextStyle(
                    color: _feedInk(context), fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text('Нажми ♡ на карточке — она окажется здесь.',
                textAlign: TextAlign.center,
                style: TextStyle(color: _feedInk(context).withValues(alpha: .7))),
          ],
        ),
      );
    }
    return DraggableScrollableSheet(
      initialChildSize: .8,
      expand: false,
      builder: (context, controller) => ListView.builder(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
        itemCount: items.length,
        itemBuilder: (context, i) {
          final item = items[i];
          return ListTile(
            title: Text(item.title(cyrillic),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: _feedInk(context), fontWeight: FontWeight.w700)),
            subtitle: Text(
                '${microFeedCategories[item.category] ?? item.category}, ${item.cefr}',
                style: TextStyle(color: _feedInk(context).withValues(alpha: .54))),
            trailing: Icon(Icons.menu_book, color: _feedInk(context).withValues(alpha: .38)),
            onTap: () {
              Navigator.of(context).pop();
              showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                backgroundColor: Theme.of(context).colorScheme.surfaceContainer,
                shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                ),
                builder: (_) => _FullTextSheet(item: item, cyrillic: cyrillic),
              );
            },
          );
        },
      ),
    );
  }
}

/// Анкета: что показывать в ленте.
///
/// Подбор строится по поведению, а поведения при первом заходе нет. Новому
/// читателю лента показывала «популярное вперемешку с лёгким» и ждала, пока он
/// налистает сигналов. На чужом языке это дорогая цена: карточка не
/// тридцатисекундный ролик, её читают минуту.
class VukotokOnboarding extends StatefulWidget {
  const VukotokOnboarding({
    super.key,
    required this.preferences,
    required this.onDone,
  });

  /// Что уже известно о читателе. Уровень оттуда — готовый ответ, а не
  /// подсказка: он задан один раз для всего приложения.
  final MicroFeedPreferences preferences;
  final void Function(MicroFeedPreferences) onDone;

  @override
  State<VukotokOnboarding> createState() => _VukotokOnboardingState();
}

class _VukotokOnboardingState extends State<VukotokOnboarding> {
  late final Set<String> _categories = widget.preferences.categories.toSet();
  late String _level = widget.preferences.cefr;
  bool _saving = false;
  bool _failed = false;
  String _saveError = '';

  Future<void> _submit(List<String> chosen) async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _failed = false;
    });
    MicroFeedPreferences? saved;
    try {
      saved = await MicroFeedService.instance.savePreferences(chosen, _level);
    } on ApiException catch (error) {
      _saveError = error.message;
    } catch (_) {
      _saveError = 'Не удалось сохранить ответы.';
    }
    if (!mounted) return;
    if (saved == null) {
      setState(() {
        _saving = false;
        _failed = true;
      });
      return;
    }
    widget.onDone(saved);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surface,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.interests_outlined, size: 40, color: _feedInk(context).withValues(alpha: .7)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Просто выбери то, что тебе интересно',
                          style: TextStyle(
                              color: _feedInk(context),
                              fontSize: 22,
                              height: 1.2,
                              fontWeight: FontWeight.w800)),
                      const SizedBox(height: 6),
                      Text('Ничего сложного!',
                          style: TextStyle(color: _feedInk(context).withValues(alpha: .7))),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 22),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final entry in microFeedCategories.entries)
                  FilterChip(
                    selected: _categories.contains(entry.key),
                    label: Text(entry.value),
                    tooltip: microFeedCategoryHints[entry.key],
                    onSelected: (on) => setState(() {
                      if (on) {
                        _categories.add(entry.key);
                      } else {
                        _categories.remove(entry.key);
                      }
                    }),
                  ),
              ],
            ),
            const SizedBox(height: 24),
            // Уровень спрашивается только у того, кого о нём ещё не спрашивали.
            // Вошедшему он известен по аккаунту, и второй вопрос значил бы, что
            // первый ответ никуда не записали.
            if (widget.preferences.levelFromAccount)
              Text('Уровень сербского беру из твоего аккаунта: $_level.',
                  style: TextStyle(color: _feedInk(context).withValues(alpha: .54)))
            else ...[
              Text('Сербский сейчас',
                  style: TextStyle(
                      color: _feedInk(context).withValues(alpha: .7),
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final entry in microFeedLevels.entries)
                    ChoiceChip(
                      selected: _level == entry.key,
                      label: Text('${entry.key}, ${entry.value}'),
                      onSelected: (_) => setState(() => _level = entry.key),
                    ),
                ],
              ),
            ],
            if (_failed) ...[
              const SizedBox(height: 14),
              Text('$_saveError Можно повторить или открыть ленту без сохранения интересов.',
                  style: const TextStyle(color: Color(0xFFFFB4AE))),
              TextButton(
                onPressed: _saving ? null : () => widget.onDone(MicroFeedPreferences(
                  categories: widget.preferences.categories,
                  cefr: widget.preferences.cefr,
                  onboarded: true,
                  levelFromAccount: widget.preferences.levelFromAccount,
                )),
                child: const Text('Продолжить без сохранения'),
              ),
            ],
            const SizedBox(height: 26),
            FilledButton(
              onPressed: _saving ? null : () => _submit(_categories.toList()),
              child: const Text('Открыть ленту'),
            ),
            const SizedBox(height: 8),
            // Отказ — тоже ответ, и записывается он так же. Иначе анкета
            // встречала бы человека при каждом заходе.
            TextButton(
              onPressed: _saving ? null : () => _submit([]),
              child: const Text('Показывай всё подряд'),
            ),
          ],
        ),
      ),
    );
  }
}
