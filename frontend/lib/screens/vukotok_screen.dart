import 'package:flutter/material.dart';

import '../models/micro_feed.dart';
import '../models/reader_settings.dart';
import '../models/word_analysis.dart';
import '../services/analysis_repository.dart';
import '../services/grammar_engine.dart';
import '../services/lexicon_db.dart';
import '../services/micro_feed_service.dart';
import '../services/reflexive.dart';
import '../services/user_db.dart';
import '../theme/app_theme.dart';
import '../utils/serbian_pronunciation.dart';
import '../utils/tokenizer.dart';
import '../widgets/reader_text.dart';
import '../widgets/wolf_mascot.dart';
import 'vukotok_comments.dart';

/// Раздел всегда тёмный — как кинозал: карточка занимает экран целиком, и
/// светлый пергамент вокруг неё соперничал бы с картинкой. Но тёмный он теперь
/// ночной темой приложения, а не собственной палитрой: раньше здесь жили свои
/// `0xFF100E0C` и `0xFF1C1814`, похожие на ночные цвета, но не равные им.
Widget vukotokTheme({required Widget child}) =>
    Theme(data: AppTheme.dark(), child: child);

/// Вукоток — лента коротких сербских текстов, которую листают как тикток.
///
/// Вместо видео здесь текст, и это меняет одно правило: карточка не листается
/// внутри себя. Полный текст открывается шторкой, а сама карточка держит ровно
/// столько, сколько помещается на экран, — иначе внутренняя прокрутка отбирает
/// вертикальный свайп у ленты, и переход к следующей карточке срабатывает через
/// раз (ровно это уже было на вебе).
class VukotokScreen extends StatefulWidget {
  const VukotokScreen({super.key});

  @override
  State<VukotokScreen> createState() => _VukotokScreenState();
}

class _VukotokScreenState extends State<VukotokScreen> {
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
          .load(exclude: reset ? const [] : _seen.toList());
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
  Widget build(BuildContext context) => vukotokTheme(child: _body(context));

  Widget _body(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    // Анкета встаёт ДО ленты, а не поверх неё: спрашивать «что тебе интересно»
    // после первой карточки — значит спрашивать с опозданием.
    final prefs = _preferences;
    if (prefs != null && !prefs.onboarded) {
      return VukotokOnboarding(
        preferences: prefs,
        onDone: (saved) {
          setState(() => _preferences = saved);
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
                const WolfSticker(asset: Wolf.zdravo, size: 150),
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

    return Scaffold(
      body: Stack(
        children: [
          PageView.builder(
            controller: _pages,
            scrollDirection: Axis.vertical,
            itemCount: _items.length,
            onPageChanged: (i) {
              setState(() => _index = i);
              if (i >= _items.length - 2) _load();
            },
            itemBuilder: (context, i) => _VukotokCard(
              key: ValueKey(_items[i].id),
              item: _items[i],
              cyrillic: _cyrillic,
            ),
          ),
          _TopBar(
            cyrillic: _cyrillic,
            position: '${_index + 1} / ${_items.length}',
            onScript: () => setState(() => _cyrillic = !_cyrillic),
            onLiked: _showLiked,
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
    );
  }

  Future<void> _showLiked() async {
    final items = await MicroFeedService.instance.liked();
    if (!mounted) return;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: SerbColors.nightSurface,
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
        padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
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
            const Text('Вукоток',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w800)),
            const SizedBox(width: 10),
            Text(position,
                style: const TextStyle(color: Colors.white70, fontSize: 12)),
            const Spacer(),
            IconButton(
              tooltip: 'Сохранённое',
              onPressed: onLiked,
              icon: const Icon(Icons.favorite_border, color: Colors.white),
            ),
            TextButton(
              onPressed: onScript,
              child: Text(cyrillic ? 'ЋИР' : 'LAT',
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w800)),
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
  const _VukotokCard({super.key, required this.item, required this.cyrillic});

  final MicroFeedItem item;
  final bool cyrillic;

  @override
  State<_VukotokCard> createState() => _VukotokCardState();
}

class _VukotokCardState extends State<_VukotokCard> {
  late int _reaction = widget.item.reaction;
  late int _likes = widget.item.likesCount;
  late int _dislikes = widget.item.dislikesCount;
  late int _comments = widget.item.commentsCount;
  bool _justLiked = false;
  DateTime? _shownAt;

  @override
  void initState() {
    super.initState();
    _shownAt = DateTime.now();
    MicroFeedService.instance.record(widget.item.id, 'view');
  }

  @override
  void dispose() {
    final shown = _shownAt;
    if (shown != null) {
      final dwell = DateTime.now().difference(shown).inMilliseconds;
      final words = widget.item.text(widget.cyrillic).split(RegExp(r'\s+')).length;
      final expected = (words / 180 * 60000 * .65).clamp(15000, 600000).toInt();
      if (dwell < 2000) {
        MicroFeedService.instance
            .record(widget.item.id, 'quick_skip', dwellMs: dwell);
      } else if (dwell >= expected) {
        MicroFeedService.instance
            .record(widget.item.id, 'complete', dwellMs: dwell);
      }
    }
    super.dispose();
  }

  Future<void> _react(int next) async {
    final previous = _reaction;
    final target = previous == next ? 0 : next;
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

  Future<void> _openComments() async {
    // Счётчик обновляется по закрытию шторки: написал реплику — цифра на
    // карточке обязана сойтись с тем, что человек только что видел.
    final added = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      backgroundColor: SerbColors.nightSurface,
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
      backgroundColor: SerbColors.nightSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _FullTextSheet(item: widget.item, cyrillic: widget.cyrillic),
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final title = item.title(widget.cyrillic);
    final text = item.text(widget.cyrillic);
    final minutes = (text.split(RegExp(r'\s+')).length / 180).ceil().clamp(1, 99);

    return Stack(
      fit: StackFit.expand,
      children: [
        if (item.imageUrl.isNotEmpty)
          Image.network(item.imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const SizedBox.shrink())
        else
          _PlainCover(title: title),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.bottomCenter,
              end: Alignment.topCenter,
              colors: [Color(0xF2000000), Color(0xB8000000), Color(0x4D000000)],
            ),
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 64, 12, 16),
            child: Row(
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
                          _Chip(text: microFeedCategories[item.category] ?? item.category),
                          Text('${item.cefr} · $minutes мин',
                              style: const TextStyle(
                                  color: Colors.white70,
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
                            style: const TextStyle(
                                color: Colors.white54, fontSize: 11)),
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
            ),
          ),
        ),
        if (_justLiked)
          Positioned(
            left: 20,
            right: 20,
            bottom: 24,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .95),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Text(
                'Сохранено — ищи в ♡ наверху',
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
      ],
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
                  shaderCallback: (rect) => const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.white,
                      Colors.white,
                      Colors.transparent
                    ],
                    stops: [0, .82, 1],
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
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [SerbColors.nightSurface2, SerbColors.nightBg],
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
                        color: Colors.white.withValues(alpha: .06))),
              ),
              Align(
                alignment: const Alignment(0, -.46),
                child: WolfSticker(
                    asset: Wolf.zdravo, size: sticker, frame: false),
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
          color: Colors.black.withValues(alpha: .35),
          borderRadius: BorderRadius.circular(7),
          border: Border.all(color: Colors.white24),
        ),
        child: Text(text.toUpperCase(),
            style: const TextStyle(
                color: Colors.white,
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
                  color: active ? const Color(0xFFE86A5B) : Colors.white),
            ),
            // Ноль не показываем: три нуля на каждой карточке выглядят как
            // мёртвая лента, хотя означают лишь «ещё никто не нажимал».
            if (count > 0)
              Text('$count',
                  style: const TextStyle(
                      color: Colors.white70,
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
      textColor: Colors.white,
      highlightColor: const Color(0x66FFD37A),
      highlightTextColor: Colors.white,
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
    final target = reflexive?.onParticle == true ? reflexive!.verb : widget.token.text;
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
      word: reflexive?.lemma.isNotEmpty == true ? reflexive!.lemma : data.surface,
      lemma: reflexive?.lemma.isNotEmpty == true ? reflexive!.lemma : data.lemma,
      pos: data.upos,
      translation:
          (data.contextualTranslation?.trim().isNotEmpty ?? false)
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
          // Движок мог не узнать форму: тогда вместо «слово · » с висящей
          // точкой не показываем ничего.
          final subtitle = reflexive != null
              ? 'возвратный глагол${reflexive.lemma.isEmpty ? '' : ' · ${reflexive.lemma}'}'
              : data.lemma.trim().isEmpty
                  ? ''
                  : '${GrammarEngine.posShort(data.upos)} · ${data.lemma}';
          return SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  reflexive != null ? reflexive.phrase : data.surface,
                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800),
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
                  wolfSize: 104,
                ),
                if (hasContext) ...[
                  const SizedBox(height: 12),
                  Text('Словарное значение',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: .6,
                          color: scheme.onSurfaceVariant)),
                  const SizedBox(height: 4),
                  Text(general),
                ],
                if (reflexive != null) ...[
                  const SizedBox(height: 14),
                  _ReflexiveCard(reflexive: reflexive),
                ],
                // Разбора не будет — говорим об этом словом, а не пустотой на
                // месте, где обычно стоит грамматика.
                if (subtitle.isEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Эту форму Читавук в словаре не нашёл: перевод есть, '
                    'а разбора и склонения не будет.',
                    style: TextStyle(
                        fontSize: 13, color: scheme.onSurfaceVariant),
                  ),
                ],
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _saved ? null : () => _save(data),
                    child: Text(_saved ? 'Слово сохранено' : 'Добавить в словарь'),
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

    final (before, stressed, after) = SerbianPronunciation.splitAccented(written);
    return Text.rich(
      TextSpan(style: base, children: [
        TextSpan(text: before),
        TextSpan(
          text: stressed,
          style: TextStyle(fontWeight: FontWeight.w900, color: scheme.onSurface),
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
                  letterSpacing: .6,
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
                style: const TextStyle(color: Colors.white54, fontSize: 12)),
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
      return const Padding(
        padding: EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            WolfSticker(asset: Wolf.zdravo, size: 120),
            SizedBox(height: 14),
            Text('Пока пусто',
                style: TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w700)),
            SizedBox(height: 6),
            Text('Нажми ♡ на карточке — она окажется здесь.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white70)),
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
                style: const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w700)),
            subtitle: Text(
                '${microFeedCategories[item.category] ?? item.category} · ${item.cefr}',
                style: const TextStyle(color: Colors.white54)),
            trailing: const Icon(Icons.menu_book, color: Colors.white38),
            onTap: () {
              Navigator.of(context).pop();
              showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                backgroundColor: SerbColors.nightSurface,
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
  final Set<String> _categories = {};
  late String _level = widget.preferences.cefr;
  bool _saving = false;
  bool _failed = false;

  Future<void> _submit(List<String> chosen) async {
    setState(() {
      _saving = true;
      _failed = false;
    });
    final saved =
        await MicroFeedService.instance.savePreferences(chosen, _level);
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
      backgroundColor: SerbColors.nightBg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          children: [
            const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                WolfSticker(asset: Wolf.zdravo, size: 96, frame: false),
                SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Просто выбери то, что тебе интересно',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 22,
                              height: 1.2,
                              fontWeight: FontWeight.w800)),
                      SizedBox(height: 6),
                      Text('Ничего сложного!',
                          style: TextStyle(color: Colors.white70)),
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
                  style: const TextStyle(color: Colors.white54))
            else ...[
              const Text('Сербский сейчас',
                  style: TextStyle(
                      color: Colors.white70,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      letterSpacing: .6)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final entry in microFeedLevels.entries)
                    ChoiceChip(
                      selected: _level == entry.key,
                      label: Text('${entry.key} · ${entry.value}'),
                      onSelected: (_) => setState(() => _level = entry.key),
                    ),
                ],
              ),
            ],
            if (_failed) ...[
              const SizedBox(height: 14),
              const Text('Не удалось сохранить. Попробуй ещё раз.',
                  style: TextStyle(color: Color(0xFFFFB4AE))),
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
              onPressed: _saving ? null : () => _submit(const []),
              child: const Text('Показывай всё подряд'),
            ),
          ],
        ),
      ),
    );
  }
}
