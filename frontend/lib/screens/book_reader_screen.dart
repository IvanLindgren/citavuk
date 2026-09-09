import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:provider/provider.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';
import '../events/events_controller.dart';
import '../events/reader_rewards.dart';
import '../models/book_block.dart';
import '../models/definition.dart';
import '../models/english_analysis.dart';
import '../models/grammar.dart';
import '../models/reader_settings.dart';
import '../models/sentence_analysis.dart';
import '../models/word_analysis.dart';
import '../services/analysis_repository.dart';
import '../services/announcements_controller.dart';
import '../services/definition_service.dart';
import '../services/grammar_engine.dart';
import '../services/interface_sounds.dart';
import '../services/listening_service.dart';
import '../services/page_turn_sound.dart';
import '../services/radio_service.dart';
import '../services/api_client.dart';
import '../models/level.dart';
import '../services/auth_service.dart';
import '../services/level_service.dart';
import '../services/share_service.dart';
import '../services/sync_service.dart';
import '../services/user_db.dart';
import '../state/app_settings.dart';
import '../utils/pages.dart';
import '../utils/haptics.dart';
import '../utils/serbian_pronunciation.dart';
import '../widgets/keep_awake.dart';
import '../utils/tokenizer.dart';
import '../widgets/animated_widgets.dart';
import '../widgets/book_block_view.dart';
import '../widgets/definition_card.dart';
import '../widgets/grammar_widgets.dart';
import '../widgets/radio_sheet.dart';
import '../widgets/reader_text.dart';
import '../widgets/shortcuts_sheet.dart';
import '../widgets/wolf_mascot.dart';
import '../course/widgets/mascot_view.dart';
import '../course/state/lesson_controller.dart';
import 'grammar_screen.dart';
import 'vocabulary_screen.dart';

part 'reader_share.dart';
part 'reader_discussion.dart';
part 'reader_settings_sheet.dart';
part 'word_analysis_sheet.dart';

class BookReaderScreen extends StatefulWidget {
  final int bookId;
  final String title;
  final List<String> paragraphs;
  final int initialParagraph;
  final String contentSha;
  final String sourceKey;

  /// Заглавная картинка (для новостных статей) — показывается над текстом на
  /// первой странице. Для обычных книг null.
  final String? leadImageUrl;

  const BookReaderScreen({
    super.key,
    required this.bookId,
    required this.title,
    required this.paragraphs,
    required this.initialParagraph,
    this.contentSha = '',
    this.sourceKey = '',
    this.leadImageUrl,
  });

  @override
  State<BookReaderScreen> createState() => _BookReaderScreenState();
}

class _BookReaderScreenState extends State<BookReaderScreen> {
  late PageController _pageController;
  final ItemScrollController _continuousController = ItemScrollController();
  final ItemPositionsListener _continuousPositions =
      ItemPositionsListener.create();
  final AudioPlayer _audiobookPlayer = AudioPlayer();
  final List<StreamSubscription<dynamic>> _audiobookSubscriptions = [];
  final List<List<String>> _pages = [];
  final List<_AudiobookCue> _audiobookCues = [];

  /// Индекс первого абзаца каждой страницы. Прогресс сохраняем в АБЗАЦАХ
  /// (last_para), а не в страницах: страница ~1500 символов и зависит от
  /// разбивки, а абзац стабилен — и главная считает процент по para_count.
  final List<int> _pageStartPara = [];
  final FocusNode _kbFocus = FocusNode();

  int _startPage = 0;
  int _visiblePage = 0;
  ReaderFlow? _lastFlow;
  bool _resumeHintVisible = false;
  String _discussionToken = '';
  bool _discussionOpen = false;
  bool _sharingBusy = false;
  bool _audiobookEnabled = false;
  bool _audiobookPlaying = false;
  int _audiobookCue = 0;
  int _audiobookToken = -1;
  Duration _audiobookDuration = Duration.zero;
  double _audiobookSpeed = 1;

  // Состояние выделения (страница/абзац/диапазон токенов).
  int? _selPage;
  int? _selPara;

  /// Ячейка таблицы, в которой нажали слово. null — слово в обычном абзаце.
  int? _selCell;
  int? _selStart;
  int? _selEnd;

  /// Текущий разбор слова. null — ничего не открыто.
  ///
  /// Один источник правды для нижней шторки (узкий экран) и боковой панели
  /// (широкий): смена значения меняет содержимое уже открытого слоя, а не
  /// плодит слои поверх друг друга.
  final ValueNotifier<_LookupEntry?> _lookup = ValueNotifier(null);
  bool _lookupSheetOpen = false;

  /// Последние просмотренные слова сеанса (до 10). Одинаковое слово в разных
  /// предложениях — разные записи: перевод зависит от контекста.
  final List<_LookupEntry> _lookupHistory = [];

  /// Первый абзац стартовой страницы — место остановки. Подсвечивается
  /// тихо (без баннера, сдвигающего текст) первые секунды после открытия.
  int? _resumePara;

  /// Предупреждает, если книга сильно выше уровня читателя.
  ///
  /// Оценка идёт по редкости слов: сколько текста укладывается в словарь
  /// ступени. Мера грубая и знает об этом — поэтому предупреждение
  /// срабатывает только при разрыве в две ступени. На ступень выше своего
  /// уровня читать как раз и полезно, и отговаривать от этого значит мешать
  /// единственному способу вырасти.
  ///
  /// И это предупреждение, а не запрет: книга уже открыта, полоска убирается
  /// одним нажатием и по этой книге больше не появляется.
  Future<void> _warnIfTooHard() async {
    if (!mounted) return;
    final reader = context.read<AuthService>().account?.serbianLevel ?? '';
    // Служба берётся до первого await: после него контекст может уже не
    // относиться к этому экрану.
    final levels = context.read<LevelService>();
    final calm = context.read<AppSettings>().reader.calm;
    if (reader.isEmpty || widget.paragraphs.length < 3) return;

    final key = 'citavuk_book_level_warned_${widget.bookId}';
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(key) ?? false) return;

    TextLevel level;
    try {
      level = await levels.estimate(widget.paragraphs);
    } catch (_) {
      // Оценка — украшение поверх чтения; молчание тут уместнее ошибки.
      return;
    }
    if (!mounted || !tooHardFor(level.level, reader)) return;

    await prefs.setBool(key, true);
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.showMaterialBanner(
      MaterialBanner(
        leading: WolfSticker(
            asset: Wolf.zadumch, size: 52, frame: false, animate: !calm),
        content: Text(
          'Читавук думает, что книга сейчас будет для тебя тяжеловата! '
          'Она рассчитана на уровень: ${level.level}, а твой уровень: $reader. '
          'Это просто предупреждение, читать её можно в любом случае.',
        ),
        actions: [
          TextButton(
            onPressed: messenger.hideCurrentMaterialBanner,
            child: const Text('Понятно'),
          ),
        ],
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    _chunkParagraphs();
    _buildAudiobookCues();
    // initialParagraph — индекс абзаца; находим страницу, содержащую его.
    // (Старые сохранения хранили индекс страницы — он меньше либо равен
    // индексу абзаца, поэтому в худшем случае откроемся чуть раньше.)
    final startPage =
        _pages.isEmpty ? 0 : _pageForPara(widget.initialParagraph);
    _startPage = startPage;
    _visiblePage = startPage;
    _pageController = PageController(initialPage: startPage);
    _continuousPositions.itemPositions.addListener(_onContinuousPositions);
    if (widget.sourceKey.startsWith('share:')) {
      _discussionToken = widget.sourceKey.substring('share:'.length);
      _discussionOpen = true;
    }
    if (startPage > 0) {
      _resumeHintVisible = true; // тихая подсветка «ты остановился здесь»
      _resumePara =
          startPage < _pageStartPara.length ? _pageStartPara[startPage] : null;
      Future.delayed(const Duration(seconds: 5), () {
        if (mounted) setState(() => _resumeHintVisible = false);
      });
    }
    // Музыка для чтения: восстанавливаем выбор станции и при первом заходе
    // спрашиваем, любит ли пользователь читать под музыку.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final s = context.read<AppSettings>();
      RadioService.instance
          .configure(stationIndex: s.musicStation, volume: s.musicVolume);
      if (!s.musicPrompted) showMusicPrompt(context);
      unawaited(_warnIfTooHard());
    });
    _audiobookSubscriptions.addAll([
      _audiobookPlayer.onPlayerStateChanged.listen((state) {
        if (mounted) {
          setState(() => _audiobookPlaying = state == PlayerState.playing);
        }
      }),
      _audiobookPlayer.onDurationChanged.listen((duration) {
        _audiobookDuration = duration;
      }),
      _audiobookPlayer.onPositionChanged.listen(_onAudiobookPosition),
      _audiobookPlayer.onPlayerComplete.listen((_) => _nextAudiobookCue()),
    ]);
    unawaited(_restoreAudiobook());
  }

  void _goToPage(int delta) {
    if (_pages.isEmpty) return;
    final flow = context.read<AppSettings>().reader.flow;
    final cur = flow == ReaderFlow.scroll
        ? _visiblePage
        : (_pageController.hasClients
            ? _pageController.page?.round() ?? _startPage
            : _startPage);
    _jumpTo(cur + delta);
  }

  void _jumpTo(int target) {
    if (_pages.isEmpty) return;
    final flow = context.read<AppSettings>().reader.flow;
    final cur = flow == ReaderFlow.scroll
        ? _visiblePage
        : (_pageController.hasClients
            ? _pageController.page?.round() ?? _startPage
            : _startPage);
    final clamped = target.clamp(0, _pages.length - 1);
    if (clamped == cur) return;
    if (flow == ReaderFlow.scroll) {
      if (_continuousController.isAttached) {
        _continuousController.scrollTo(
          index: clamped,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
        );
      }
    } else if (_pageController.hasClients) {
      _pageController.animateToPage(clamped,
          duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    }
  }

  void _onContinuousPositions() {
    if (!mounted ||
        context.read<AppSettings>().reader.flow != ReaderFlow.scroll) {
      return;
    }
    final visible = _continuousPositions.itemPositions.value
        .where((item) => item.itemTrailingEdge > 0)
        .toList()
      ..sort((a, b) => a.itemLeadingEdge.compareTo(b.itemLeadingEdge));
    if (visible.isEmpty) return;
    final anchored = visible.where((item) => item.itemLeadingEdge <= 0.28);
    final next =
        anchored.isNotEmpty ? anchored.last.index : visible.first.index;
    if (next == _visiblePage) return;
    _visiblePage = next;
    final paragraph = next < _pageStartPara.length ? _pageStartPara[next] : 0;
    unawaited(UserDb.instance.updateBookProgress(widget.bookId, paragraph));
    _selPage = null;
    _selPara = null;
    _selStart = null;
    _selEnd = null;
    setState(() {});
  }

  void _changeFontSize(double delta) {
    final settings = context.read<AppSettings>();
    final s = settings.reader;
    settings
        .update(s.copyWith(fontSize: (s.fontSize + delta).clamp(14.0, 32.0)));
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent e) {
    if (e is! KeyDownEvent) return KeyEventResult.ignored;
    final k = e.logicalKey;
    final shift = HardwareKeyboard.instance.isShiftPressed;
    final flow = context.read<AppSettings>().reader.flow;

    if (flow == ReaderFlow.scroll &&
        (k == LogicalKeyboardKey.arrowRight ||
            k == LogicalKeyboardKey.arrowLeft ||
            k == LogicalKeyboardKey.pageDown ||
            k == LogicalKeyboardKey.pageUp ||
            k == LogicalKeyboardKey.space ||
            k == LogicalKeyboardKey.home ||
            k == LogicalKeyboardKey.end)) {
      return KeyEventResult.ignored;
    }

    if (k == LogicalKeyboardKey.arrowRight ||
        k == LogicalKeyboardKey.pageDown ||
        (k == LogicalKeyboardKey.space && !shift)) {
      _goToPage(1);
    } else if (k == LogicalKeyboardKey.arrowLeft ||
        k == LogicalKeyboardKey.pageUp ||
        (k == LogicalKeyboardKey.space && shift)) {
      _goToPage(-1);
    } else if (k == LogicalKeyboardKey.home) {
      _jumpTo(0);
    } else if (k == LogicalKeyboardKey.end) {
      _jumpTo(_pages.length - 1);
    } else if (k == LogicalKeyboardKey.equal || k == LogicalKeyboardKey.add) {
      _changeFontSize(1);
    } else if (k == LogicalKeyboardKey.minus ||
        k == LogicalKeyboardKey.numpadSubtract) {
      _changeFontSize(-1);
    } else if (k == LogicalKeyboardKey.keyS || k == LogicalKeyboardKey.f2) {
      _openReaderSettings();
    } else if (k == LogicalKeyboardKey.keyD) {
      _openVocabulary();
    } else if (k == LogicalKeyboardKey.f1 ||
        k == LogicalKeyboardKey.slash ||
        k == LogicalKeyboardKey.question) {
      showShortcutsSheet(context, ReaderShortcuts.reader);
    } else if (k == LogicalKeyboardKey.escape) {
      // Открыт разбор слова — первым делом закрываем его, а не книгу.
      if (_lookup.value != null) {
        _closeLookup();
      } else {
        Navigator.of(context).maybePop();
      }
    } else {
      return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  /// Раскладывает книгу по страницам (см. utils/pages.dart).
  ///
  /// Разбиение вынесено в отдельный файл и повторено в вебе знак в знак: одна
  /// и та же книга должна листаться одинаково на телефоне и в браузере.
  void _chunkParagraphs() {
    for (final page in paginate(widget.paragraphs)) {
      _pages.add(page.texts);
      _pageStartPara.add(page.start);
    }
  }

  void _buildAudiobookCues() {
    final sentence = RegExp(r'[^.!?…]+[.!?…]*');
    for (var para = 0; para < widget.paragraphs.length; para++) {
      final block = parseBookBlock(widget.paragraphs[para]);
      if (block.kind != BookBlockKind.text) continue;
      for (final match in sentence.allMatches(block.text)) {
        final raw = match.group(0) ?? '';
        final text = raw.trim();
        if (text.isEmpty) continue;
        final leading = raw.length - raw.trimLeft().length;
        _audiobookCues.add(_AudiobookCue(
          text: text,
          paragraph: para,
          start: match.start + leading,
        ));
      }
    }
  }

  String get _audiobookKey => 'citavuk_audiobook_${widget.bookId}';

  Future<void> _restoreAudiobook() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted ||
        _audiobookCues.isEmpty ||
        prefs.getBool('${_audiobookKey}_enabled') != true) {
      return;
    }
    final cue = prefs.getInt('${_audiobookKey}_cue') ?? 0;
    final speed = prefs.getDouble('${_audiobookKey}_speed') ?? 1;
    setState(() {
      _audiobookEnabled = true;
      _audiobookCue = cue.clamp(0, _audiobookCues.length - 1);
      _audiobookSpeed = speed.clamp(0.7, 1.8);
    });
    if (_audiobookEnabled) _showAudiobookCue();
  }

  Future<void> _persistAudiobook() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('${_audiobookKey}_enabled', _audiobookEnabled);
    await prefs.setInt('${_audiobookKey}_cue', _audiobookCue);
    await prefs.setDouble('${_audiobookKey}_speed', _audiobookSpeed);
  }

  Future<void> _toggleAudiobook() async {
    if (_audiobookCues.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('В этой книге нет текста для озвучки.')),
      );
      return;
    }
    setState(() => _audiobookEnabled = true);
    _showAudiobookCue();
    await _persistAudiobook();
    await _playAudiobookCue(_audiobookCue);
  }

  Future<void> _playAudiobookCue(int index) async {
    if (_audiobookCues.isEmpty) return;
    _audiobookCue = index.clamp(0, _audiobookCues.length - 1);
    _audiobookToken = -1;
    _showAudiobookCue();
    await _persistAudiobook();
    await _audiobookPlayer.stop();
    await _audiobookPlayer.play(UrlSource(
      ListeningService.instance.ttsUrl(_audiobookCues[_audiobookCue].text),
    ));
    await _audiobookPlayer.setPlaybackRate(_audiobookSpeed);
  }

  void _showAudiobookCue() {
    if (_audiobookCues.isEmpty) return;
    final cue = _audiobookCues[_audiobookCue];
    final page = _pageForPara(cue.paragraph);
    _jumpTo(page);
    unawaited(UserDb.instance.updateBookProgress(widget.bookId, cue.paragraph));
    if (mounted) setState(() {});
  }

  void _onAudiobookPosition(Duration position) {
    if (!_audiobookEnabled || _audiobookDuration.inMilliseconds <= 0) return;
    final cue = _audiobookCues[_audiobookCue];
    final ratio = (position.inMilliseconds / _audiobookDuration.inMilliseconds)
        .clamp(0.0, 0.999);
    final char = cue.start + (cue.text.length * ratio).floor();
    final tokens = SerbianTokenizer.tokenize(widget.paragraphs[cue.paragraph]);
    var tokenIndex = -1;
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].isWord && char >= tokens[i].start && char < tokens[i].end) {
        tokenIndex = i;
        break;
      }
    }
    if (tokenIndex != _audiobookToken && mounted) {
      setState(() => _audiobookToken = tokenIndex);
    }
  }

  Future<void> _nextAudiobookCue() async {
    if (_audiobookCue + 1 >= _audiobookCues.length) {
      if (mounted) setState(() => _audiobookPlaying = false);
      return;
    }
    await _playAudiobookCue(_audiobookCue + 1);
  }

  Future<void> _closeAudiobook() async {
    await _audiobookPlayer.stop();
    if (mounted) {
      setState(() {
        _audiobookEnabled = false;
        _audiobookToken = -1;
      });
    }
    await _persistAudiobook();
  }

  /// Страница, содержащая абзац [para].
  int _pageForPara(int para) {
    for (var i = _pageStartPara.length - 1; i >= 0; i--) {
      if (_pageStartPara[i] <= para) return i;
    }
    return 0;
  }

  @override
  void dispose() {
    for (final subscription in _audiobookSubscriptions) {
      subscription.cancel();
    }
    _audiobookPlayer.dispose();
    _continuousPositions.itemPositions.removeListener(_onContinuousPositions);
    _pageController.dispose();
    _kbFocus.dispose();
    _lookup.dispose();
    super.dispose();
  }

  void _clearSelection() {
    setState(() {
      _selPage = null;
      _selPara = null;
      _selStart = null;
      _selEnd = null;
    });
  }

  void _onTapWord(int pageIndex, int pIndex, int tokenIndex, Token token,
      List<Token> tokens) {
    // Обычный режим — одно слово.
    _openLookup(
      page: pageIndex,
      para: pIndex,
      start: tokenIndex,
      end: tokenIndex,
      token: token,
      sentence: _pages[pageIndex][pIndex],
    );
  }

  /// Слово внутри ячейки таблицы.
  ///
  /// Контекстом служит текст самой ячейки, а не абзац: абзац здесь — служебная
  /// метка таблицы, и разбор по ней выбрал бы неверный язык и неверное
  /// значение слова. Номер ячейки нужен подсветке: без него одинаковое слово
  /// подсветилось бы сразу во всех ячейках таблицы.
  void _onTapCellWord(int pageIndex, int pIndex, int cellIndex, String cellText,
      int tokenIndex, Token token) {
    _openLookup(
      page: pageIndex,
      para: pIndex,
      cell: cellIndex,
      start: tokenIndex,
      end: tokenIndex,
      token: token,
      sentence: cellText,
    );
  }

  void _onPhraseSelectionStart(int pageIndex, int pIndex, int tokenIndex) {
    HapticFeedback.mediumImpact();
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Row(
          children: [
            Icon(Icons.linear_scale, color: Colors.white),
            SizedBox(width: 8),
            Text('Выделение фразы...'),
          ],
        ),
        duration: Duration(milliseconds: 1500),
        behavior: SnackBarBehavior.floating,
      ),
    );
    setState(() {
      _selPage = pageIndex;
      _selPara = pIndex;
      _selStart = tokenIndex;
      _selEnd = tokenIndex;
    });
  }

  void _onPhraseSelectionUpdate(int pageIndex, int pIndex, int tokenIndex) {
    if (_selPage == pageIndex && _selPara == pIndex) {
      if (_selEnd != tokenIndex) {
        setState(() {
          _selEnd = tokenIndex;
        });
      }
    }
  }

  void _onPhraseSelectionEnd() {
    if (_selPage != null &&
        _selPara != null &&
        _selStart != null &&
        _selEnd != null) {
      final pageIndex = _selPage!;
      final pIndex = _selPara!;
      var start = _selStart!;
      var end = _selEnd!;
      if (start > end) {
        final t = start;
        start = end;
        end = t;
      }
      final tokens = SerbianTokenizer.tokenize(_pages[pageIndex][pIndex]);
      final phrase = tokens.sublist(start, end + 1).map((t) => t.text).join();
      _openLookup(
        page: pageIndex,
        para: pIndex,
        start: start,
        end: end,
        token: Token(
          text: phrase,
          start: tokens[start].start,
          end: tokens[end].end,
          isWord: true,
        ),
        sentence: _pages[pageIndex][pIndex],
      );
    }
  }

  void _onPhraseSelectionCancel() {
    _clearSelection();
  }

  /// На широком экране разбор живёт в боковой панели поверх текста: книга не
  /// затемняется и строка не скачет. На узком — в нижней шторке.
  bool get _wideLookup =>
      MediaQuery.sizeOf(context).width >= _lookupPanelBreakpoint;

  /// Открывает разбор слова. Подсветка ставится сразу (синхронно), данные
  /// подтянутся. Открытый слой не дублируется: новое слово заменяет
  /// содержимое уже открытого.
  void _openLookup({
    required int page,
    required int para,
    int? cell,
    required int start,
    required int end,
    required Token token,
    required String sentence,
  }) {
    setState(() {
      _selPage = page;
      _selPara = para;
      _selCell = cell;
      _selStart = start;
      _selEnd = end;
    });
    final entry = _LookupEntry(
      page: page,
      para: para,
      cell: cell,
      start: start,
      end: end,
      sentence: sentence,
      token: token,
    );
    if (_lookupHistory.isEmpty || _lookupHistory.last.key != entry.key) {
      _lookupHistory.add(entry);
      while (_lookupHistory.length > _lookupHistoryLimit) {
        _lookupHistory.removeAt(0);
      }
    }
    _lookup.value = entry;
    if (!_wideLookup && !_lookupSheetOpen) _showLookupSheet();
  }

  /// Закрывает разбор: на узком экране уводит шторку, на широком гасит
  /// панель. Фокус возвращается в текст, чтобы стрелки снова листали.
  void _closeLookup() {
    if (_wideLookup) {
      _lookup.value = null;
      _clearSelection();
    } else if (_lookupSheetOpen) {
      Navigator.of(context).pop();
    } else {
      _lookup.value = null;
      _clearSelection();
    }
    _kbFocus.requestFocus();
  }

  /// Назад по истории просмотров сеанса: панель/шторка остаётся открытой,
  /// содержимое заменяется предыдущим разбором.
  void _backLookup() {
    if (_lookupHistory.length < 2) return;
    _lookupHistory.removeLast();
    final prev = _lookupHistory.last;
    setState(() {
      _selPage = prev.page;
      _selPara = prev.para;
      _selCell = prev.cell;
      _selStart = prev.start;
      _selEnd = prev.end;
    });
    _lookup.value = prev;
  }

  void _showLookupSheet() {
    _lookupSheetOpen = true;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      // Фон рисует сама панель (реактивно к теме) — иначе при переключении
      // тёмной темы фон оставался светлым, а текст становился невидимым.
      backgroundColor: Colors.transparent,
      builder: (_) => ValueListenableBuilder<_LookupEntry?>(
        valueListenable: _lookup,
        builder: (_, entry, __) {
          if (entry == null) return const SizedBox.shrink();
          return WordAnalysisSheet(
            key: ValueKey(entry.key),
            bookId: widget.bookId,
            sentence: entry.sentence,
            token: entry.token,
            canGoBack: _lookupHistory.length > 1,
            onBack: _backLookup,
            onClose: () => Navigator.of(context).pop(),
          );
        },
      ),
    ).then((_) {
      _lookupSheetOpen = false;
      _lookup.value = null;
      _clearSelection();
    });
  }

  void _openVocabulary() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => VocabularyScreen(
          bookId: widget.bookId,
          bookTitle: widget.title,
        ),
      ),
    );
  }

  void _openReaderSettings() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const ReaderSettingsSheet(),
    );
  }

  Future<void> _openShareSheet() async {
    final auth = context.read<AuthService>();
    final syncService = context.read<SyncService>();
    final shareService = ShareService(context.read<ApiClient>());
    if (!auth.isSignedIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Войдите в аккаунт, чтобы поделиться книгой'),
        ),
      );
      return;
    }
    setState(() => _sharingBusy = true);
    try {
      var meta = await UserDb.instance.getBookShareMeta(widget.bookId);
      if (meta == null) throw ApiException('Книга не найдена');
      if (meta.contentSha.isEmpty) {
        await syncService.sync(uploadContent: true);
        meta = await UserDb.instance.getBookShareMeta(widget.bookId);
      }
      final sha = meta?.contentSha ?? '';
      if (sha.isEmpty || sha == 'too-large') {
        throw ApiException(
          'Текст ещё не выгружен. Запустите синхронизацию и повторите.',
        );
      }
      final share = await shareService.create(
        contentSha: sha,
        title: widget.title,
        paragraphs: widget.paragraphs.length,
      );
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (sheetContext) => _ShareSheet(
          share: share,
          onLinkCopied: () {
            if (mounted) {
              setState(() {
                _discussionToken = share.token;
                _discussionOpen = true;
              });
            }
          },
        ),
      );
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось создать ссылку: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _sharingBusy = false);
    }
  }

  Widget _buildReaderPage({
    required BuildContext context,
    required int pageIndex,
    required ReaderSettings settings,
    required ColorScheme scheme,
    required Color textColor,
    required bool dragToSelect,
    required bool continuous,
  }) {
    final paras = _pages[pageIndex];
    final compact = MediaQuery.sizeOf(context).width < 600;
    final horizontalPadding = compact ? 16.0 : 40.0;
    final showDiscussion = _discussionToken.isNotEmpty &&
        (!continuous || pageIndex == _visiblePage);

    final content = LayoutBuilder(
      builder: (context, constraints) {
        final showWolfAside = constraints.maxWidth >= 900 && showDiscussion;
        final textColumn = ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: settings.fullWidth ? double.infinity : settings.maxWidth,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (pageIndex == 0 && widget.leadImageUrl != null) _leadImage(),
              ...List.generate(paras.length, (pIndex) {
                final isSel = _selPage == pageIndex && _selPara == pIndex;
                final globalPara = _pageStartPara[pageIndex] + pIndex;
                final isAudiobook = _audiobookEnabled &&
                    _audiobookCues.isNotEmpty &&
                    _audiobookCues[_audiobookCue].paragraph == globalPara &&
                    _audiobookToken >= 0;
                final block = parseBookBlock(paras[pIndex]);
                late final Widget body;
                if (block.kind == BookBlockKind.image) {
                  body = BookImageView(
                    url: block.url,
                    caption: block.text,
                    textColor: textColor,
                    fontSize: settings.fontSize,
                  );
                } else if (block.kind == BookBlockKind.table) {
                  body = BookTableView(
                    rows: block.rows,
                    settings: settings,
                    textColor: textColor,
                    highlightColor: scheme.primary,
                    highlightTextColor: scheme.onPrimary,
                    selectedCell: isSel ? _selCell : null,
                    selectedToken: isSel ? _selStart : null,
                    onTapWord: (cellIndex, cellText, ti, token, tokens) =>
                        _onTapCellWord(
                      pageIndex,
                      pIndex,
                      cellIndex,
                      cellText,
                      ti,
                      token,
                    ),
                  );
                } else {
                  body = Padding(
                    padding: EdgeInsets.only(bottom: settings.paragraphSpacing),
                    child: ReaderParagraph(
                      text: block.text,
                      settings: settings,
                      textColor: textColor,
                      highlightColor: scheme.primary,
                      highlightTextColor: scheme.onPrimary,
                      selStart: isSel
                          ? _selStart
                          : isAudiobook
                              ? _audiobookToken
                              : null,
                      selEnd: isSel
                          ? _selEnd
                          : isAudiobook
                              ? _audiobookToken
                              : null,
                      justify: settings.justify,
                      firstLineIndent: settings.firstLineIndent,
                      dragToSelect: dragToSelect,
                      onTapWord: (ti, token, tokens) =>
                          _onTapWord(pageIndex, pIndex, ti, token, tokens),
                      onPhraseSelectionStart: (ti) =>
                          _onPhraseSelectionStart(pageIndex, pIndex, ti),
                      onPhraseSelectionUpdate: (ti) =>
                          _onPhraseSelectionUpdate(pageIndex, pIndex, ti),
                      onPhraseSelectionEnd: _onPhraseSelectionEnd,
                      onPhraseSelectionCancel: _onPhraseSelectionCancel,
                    ),
                  );
                }
                return _resumeGlow(
                    globalPara: globalPara, scheme: scheme, child: body);
              }),
              if (showDiscussion && !showWolfAside)
                Center(child: _discussionWolf()),
              if (showDiscussion && _discussionOpen) ...[
                const SizedBox(height: 12),
                _DiscussionPanel(
                  key: ValueKey(
                      '$_discussionToken:${_pageStartPara[pageIndex]}'),
                  token: _discussionToken,
                  paragraph: _pageStartPara[pageIndex],
                ),
              ],
            ],
          ),
        );
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Flexible(child: textColumn),
            if (showWolfAside) ...[
              const SizedBox(width: 10),
              SizedBox(width: 120, child: _discussionWolf()),
            ],
          ],
        );
      },
    );

    final padding = EdgeInsets.fromLTRB(
      horizontalPadding,
      continuous && pageIndex > 0 ? 0 : 18,
      horizontalPadding,
      continuous && pageIndex < _pages.length - 1
          ? settings.paragraphSpacing
          : 60,
    );
    if (continuous) return Padding(padding: padding, child: content);
    return SingleChildScrollView(padding: padding, child: content);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final settings = context.watch<AppSettings>().reader;
    final previousFlow = _lastFlow;
    if (previousFlow != null && previousFlow != settings.flow) {
      final target = previousFlow == ReaderFlow.pages
          ? (_pageController.hasClients
              ? _pageController.page?.round() ?? _visiblePage
              : _visiblePage)
          : _visiblePage;
      _visiblePage = target;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (settings.flow == ReaderFlow.scroll &&
            _continuousController.isAttached) {
          _continuousController.jumpTo(index: target);
        } else if (settings.flow == ReaderFlow.pages &&
            _pageController.hasClients) {
          _pageController.jumpToPage(target);
        }
      });
    }
    _lastFlow = settings.flow;

    // На десктопе/вебе нет «долгого нажатия» мышью, а drag конфликтует с
    // листанием. Поэтому там выделяем фразу обычным «зажать и вести» мышью
    // (страницы листаются кнопками/клавишами/колесом), а на телефоне —
    // долгим нажатием с протягиванием.
    final platform = Theme.of(context).platform;
    final dragToSelect = kIsWeb ||
        platform == TargetPlatform.windows ||
        platform == TargetPlatform.linux ||
        platform == TargetPlatform.macOS;

    // Фон-награда (событие) главнее выбранного цвета: это отдельная текстура со
    // своим цветом текста. Доступность проверяется по текущему аккаунту —
    // сохранённый в настройках id ещё не означает право на награду.
    final eventReward =
        context.watch<EventsController>().hasReward(settings.bgTexture)
            ? readerRewardById(settings.bgTexture)
            : null;
    final serverAsset = context
        .watch<AnnouncementsController>()
        .rewardAssets[settings.bgTexture];
    final reward = eventReward ??
        (serverAsset == null
            ? null
            : serverReaderReward(settings.bgTexture, serverAsset));

    // Пользовательский фон чтения (если выбран) + контрастный цвет текста.
    final customBg = settings.bgColor != 0 ? Color(settings.bgColor) : null;
    final textColor = reward != null
        ? reward.text
        : customBg != null
            ? (customBg.computeLuminance() > 0.5
                ? const Color(0xFF20160E)
                : const Color(0xFFECE3D2))
            : scheme.onSurface;
    final compactAppBar = MediaQuery.sizeOf(context).width < 720;

    // До первого layout контроллер ещё не привязан — берём стартовую страницу
    // (а не initialParagraph: это индекс абзаца и он может превышать число страниц).
    final pageNum = _pages.isEmpty
        ? 0
        : (settings.flow == ReaderFlow.scroll
                ? _visiblePage
                : ((_pageController.hasClients
                        ? _pageController.page?.round()
                        : null) ??
                    _startPage)) +
            1;

    // Экран не гаснет, пока книга открыта, — см. widgets/keep_awake.dart.
    return KeepAwake(
      child: Scaffold(
        backgroundColor: reward?.background ?? customBg,
        appBar: AppBar(
          title: Text('${widget.title}  ($pageNum/${_pages.length})',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style:
                  const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          actions: [
            const RadioAppBarButton(),
            IconButton(
              tooltip: 'Аудиокнига',
              icon: const Icon(Icons.headphones_outlined),
              onPressed: _toggleAudiobook,
            ),
            IconButton(
              tooltip: 'Настройки чтения',
              icon: const Icon(Icons.text_fields),
              onPressed: _openReaderSettings,
            ),
            if (!compactAppBar) ...[
              IconButton(
                tooltip: 'Поделиться книгой',
                icon: _sharingBusy
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const FaIcon(FontAwesomeIcons.paperPlane, size: 18),
                onPressed: _sharingBusy ? null : _openShareSheet,
              ),
              IconButton(
                tooltip: 'Словарь книги',
                icon: const Icon(Icons.folder_open),
                onPressed: _openVocabulary,
              ),
              IconButton(
                tooltip: 'Горячие клавиши и жесты (F1)',
                icon: const Icon(Icons.keyboard_outlined),
                onPressed: () =>
                    showShortcutsSheet(context, ReaderShortcuts.reader),
              ),
            ] else
              PopupMenuButton<String>(
                tooltip: 'Ещё',
                onSelected: (value) {
                  switch (value) {
                    case 'share':
                      if (!_sharingBusy) unawaited(_openShareSheet());
                      break;
                    case 'vocabulary':
                      _openVocabulary();
                      break;
                    case 'shortcuts':
                      showShortcutsSheet(context, ReaderShortcuts.reader);
                      break;
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'share',
                    child: ListTile(
                      leading: Icon(Icons.send_outlined),
                      title: Text('Поделиться'),
                    ),
                  ),
                  PopupMenuItem(
                    value: 'vocabulary',
                    child: ListTile(
                      leading: Icon(Icons.folder_open),
                      title: Text('Словарь книги'),
                    ),
                  ),
                  PopupMenuItem(
                    value: 'shortcuts',
                    child: ListTile(
                      leading: Icon(Icons.keyboard_outlined),
                      title: Text('Горячие клавиши'),
                    ),
                  ),
                ],
              ),
          ],
        ),
        body: DecoratedBox(
          decoration: reward == null
              ? const BoxDecoration()
              : rewardDecorationFor(reward),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (reward?.isNetworkSvg == true)
                IgnorePointer(
                  child: SvgPicture.network(
                    reward!.networkAsset,
                    fit: BoxFit.cover,
                    placeholderBuilder: (_) => const SizedBox.shrink(),
                  ),
                ),
              _pages.isEmpty
                  ? const Center(child: Text('Нет текста для отображения'))
                  : Focus(
                      focusNode: _kbFocus,
                      autofocus: true,
                      onKeyEvent: _onKey,
                      child: Stack(
                        children: [
                          ScrollConfiguration(
                            behavior: const _DragScrollBehavior(),
                            child: settings.flow == ReaderFlow.scroll
                                ? ScrollablePositionedList.builder(
                                    itemCount: _pages.length,
                                    initialScrollIndex: _startPage,
                                    itemScrollController: _continuousController,
                                    itemPositionsListener: _continuousPositions,
                                    itemBuilder: (context, pageIndex) =>
                                        _buildReaderPage(
                                      context: context,
                                      pageIndex: pageIndex,
                                      settings: settings,
                                      scheme: scheme,
                                      textColor: textColor,
                                      dragToSelect: dragToSelect,
                                      continuous: true,
                                    ),
                                  )
                                : PageView.builder(
                                    controller: _pageController,
                                    itemCount: _pages.length,
                                    onPageChanged: (i) {
                                      _visiblePage = i;
                                      // Сохраняем индекс ПЕРВОГО АБЗАЦА страницы (см. _pageStartPara).
                                      UserDb.instance.updateBookProgress(
                                          widget.bookId,
                                          i < _pageStartPara.length
                                              ? _pageStartPara[i]
                                              : 0);
                                      PageTurnSound.instance
                                        ..enabled = settings.pageTurnSound
                                        ..play();
                                      _clearSelection();
                                      setState(() {});
                                    },
                                    itemBuilder: (context, pageIndex) {
                                      final paras = _pages[pageIndex];
                                      return SingleChildScrollView(
                                        padding: EdgeInsets.fromLTRB(
                                          MediaQuery.sizeOf(context).width < 600
                                              ? 16
                                              : 40,
                                          18,
                                          MediaQuery.sizeOf(context).width < 600
                                              ? 16
                                              : 40,
                                          60,
                                        ),
                                        child: LayoutBuilder(
                                          builder: (context, constraints) {
                                            final showWolfAside =
                                                constraints.maxWidth >= 900 &&
                                                    _discussionToken.isNotEmpty;
                                            final content = ConstrainedBox(
                                              constraints: BoxConstraints(
                                                maxWidth: settings.fullWidth
                                                    ? double.infinity
                                                    : settings.maxWidth,
                                              ),
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  if (pageIndex == 0 &&
                                                      widget.leadImageUrl !=
                                                          null)
                                                    _leadImage(),
                                                  ...List.generate(paras.length,
                                                      (pIndex) {
                                                    final isSel =
                                                        _selPage == pageIndex &&
                                                            _selPara == pIndex;
                                                    final globalPara =
                                                        _pageStartPara[
                                                                pageIndex] +
                                                            pIndex;
                                                    final isAudiobook =
                                                        _audiobookEnabled &&
                                                            _audiobookCues
                                                                .isNotEmpty &&
                                                            _audiobookCues[
                                                                        _audiobookCue]
                                                                    .paragraph ==
                                                                globalPara &&
                                                            _audiobookToken >=
                                                                0;
                                                    // Картинка и таблица — те же абзацы, но
                                                    // с меткой в начале (models/book_block).
                                                    final block =
                                                        parseBookBlock(
                                                            paras[pIndex]);
                                                    late final Widget body;
                                                    if (block.kind ==
                                                        BookBlockKind.image) {
                                                      body = BookImageView(
                                                        url: block.url,
                                                        caption: block.text,
                                                        textColor: textColor,
                                                        fontSize:
                                                            settings.fontSize,
                                                      );
                                                    } else if (block.kind ==
                                                        BookBlockKind.table) {
                                                      body = BookTableView(
                                                        rows: block.rows,
                                                        settings: settings,
                                                        textColor: textColor,
                                                        highlightColor:
                                                            scheme.primary,
                                                        highlightTextColor:
                                                            scheme.onPrimary,
                                                        selectedCell: isSel
                                                            ? _selCell
                                                            : null,
                                                        selectedToken: isSel
                                                            ? _selStart
                                                            : null,
                                                        onTapWord: (cellIndex,
                                                                cellText,
                                                                ti,
                                                                token,
                                                                tokens) =>
                                                            _onTapCellWord(
                                                                pageIndex,
                                                                pIndex,
                                                                cellIndex,
                                                                cellText,
                                                                ti,
                                                                token),
                                                      );
                                                    } else {
                                                      body = Padding(
                                                        padding: EdgeInsets.only(
                                                            bottom: settings
                                                                .paragraphSpacing),
                                                        child: ReaderParagraph(
                                                          text: block.text,
                                                          settings: settings,
                                                          textColor: textColor,
                                                          highlightColor:
                                                              scheme.primary,
                                                          highlightTextColor:
                                                              scheme.onPrimary,
                                                          selStart: isSel
                                                              ? _selStart
                                                              : isAudiobook
                                                                  ? _audiobookToken
                                                                  : null,
                                                          selEnd: isSel
                                                              ? _selEnd
                                                              : isAudiobook
                                                                  ? _audiobookToken
                                                                  : null,
                                                          justify:
                                                              settings.justify,
                                                          firstLineIndent: settings
                                                              .firstLineIndent,
                                                          dragToSelect:
                                                              dragToSelect,
                                                          onTapWord: (ti, token,
                                                                  tokens) =>
                                                              _onTapWord(
                                                                  pageIndex,
                                                                  pIndex,
                                                                  ti,
                                                                  token,
                                                                  tokens),
                                                          onPhraseSelectionStart:
                                                              (ti) =>
                                                                  _onPhraseSelectionStart(
                                                                      pageIndex,
                                                                      pIndex,
                                                                      ti),
                                                          onPhraseSelectionUpdate:
                                                              (ti) =>
                                                                  _onPhraseSelectionUpdate(
                                                                      pageIndex,
                                                                      pIndex,
                                                                      ti),
                                                          onPhraseSelectionEnd:
                                                              _onPhraseSelectionEnd,
                                                          onPhraseSelectionCancel:
                                                              _onPhraseSelectionCancel,
                                                        ),
                                                      );
                                                    }
                                                    return _resumeGlow(
                                                        globalPara: globalPara,
                                                        scheme: scheme,
                                                        child: body);
                                                  }),
                                                  if (_discussionToken
                                                          .isNotEmpty &&
                                                      !showWolfAside)
                                                    Center(
                                                      child: _discussionWolf(),
                                                    ),
                                                  if (_discussionToken
                                                          .isNotEmpty &&
                                                      _discussionOpen) ...[
                                                    const SizedBox(height: 12),
                                                    _DiscussionPanel(
                                                      key: ValueKey(
                                                          '$_discussionToken:${_pageStartPara[pageIndex]}'),
                                                      token: _discussionToken,
                                                      paragraph: _pageStartPara[
                                                          pageIndex],
                                                    ),
                                                  ],
                                                ],
                                              ),
                                            );
                                            return Row(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              mainAxisAlignment:
                                                  MainAxisAlignment.center,
                                              children: [
                                                Flexible(child: content),
                                                if (showWolfAside) ...[
                                                  const SizedBox(width: 10),
                                                  SizedBox(
                                                    width: 120,
                                                    child: _discussionWolf(),
                                                  ),
                                                ],
                                              ],
                                            );
                                          },
                                        ),
                                      );
                                    },
                                  ),
                          ),
                          if (settings.flow == ReaderFlow.pages &&
                              MediaQuery.sizeOf(context).width >= 600) ...[
                            _buildArrow(scheme, left: true),
                            _buildArrow(scheme, left: false),
                          ],
                          // Плашка места остановки и панель разбора висят
                          // поверх текста: вёрстку не трогают, строка не скачет.
                          if (_resumeHintVisible && !settings.calm)
                            Positioned(
                              top: 10,
                              left: 0,
                              right: 0,
                              child: Center(child: _resumePill(scheme)),
                            ),
                          ValueListenableBuilder<_LookupEntry?>(
                            valueListenable: _lookup,
                            builder: (_, entry, __) {
                              if (entry == null ||
                                  MediaQuery.sizeOf(context).width <
                                      _lookupPanelBreakpoint) {
                                return const SizedBox.shrink();
                              }
                              return Positioned(
                                right: _lookupPanelMargin,
                                top: _lookupPanelMargin,
                                bottom: _lookupPanelMargin,
                                width: _lookupPanelWidth,
                                child: _lookupPanel(entry),
                              );
                            },
                          ),
                        ],
                      ),
                    ),
            ],
          ),
        ),
        bottomNavigationBar:
            _audiobookEnabled ? _buildAudiobookPlayer(scheme) : null,
      ),
    );
  }

  Widget _buildAudiobookPlayer(ColorScheme scheme) {
    final cue = _audiobookCues[_audiobookCue];
    return SafeArea(
      top: false,
      child: Material(
        color: scheme.surfaceContainer,
        elevation: 10,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 4, 6),
          child: Row(
            children: [
              IconButton(
                tooltip: 'Предыдущая фраза',
                onPressed: _audiobookCue > 0
                    ? () => _playAudiobookCue(_audiobookCue - 1)
                    : null,
                icon: const Icon(Icons.skip_previous),
              ),
              IconButton.filled(
                tooltip: _audiobookPlaying ? 'Пауза' : 'Продолжить',
                onPressed: () async {
                  if (_audiobookPlaying) {
                    await _audiobookPlayer.pause();
                  } else if (_audiobookPlayer.state == PlayerState.paused) {
                    await _audiobookPlayer.resume();
                  } else {
                    await _playAudiobookCue(_audiobookCue);
                  }
                },
                icon: Icon(_audiobookPlaying ? Icons.pause : Icons.play_arrow),
              ),
              IconButton(
                tooltip: 'Следующая фраза',
                onPressed: _audiobookCue + 1 < _audiobookCues.length
                    ? _nextAudiobookCue
                    : null,
                icon: const Icon(Icons.skip_next),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(cue.text,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: 'Диктор и скорость',
                onSelected: (value) async {
                  if (value.startsWith('voice:')) {
                    await ListeningService.instance
                        .setVoice(value.substring('voice:'.length));
                    if (_audiobookPlaying) {
                      await _playAudiobookCue(_audiobookCue);
                    } else if (mounted) {
                      setState(() {});
                    }
                    return;
                  }
                  final speed = double.parse(value.substring('speed:'.length));
                  setState(() => _audiobookSpeed = speed);
                  await _audiobookPlayer.setPlaybackRate(speed);
                  await _persistAudiobook();
                },
                itemBuilder: (_) => [
                  const PopupMenuItem<String>(
                    enabled: false,
                    child: Text('Диктор',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                  for (final entry in ListeningService.serbianVoices.entries)
                    CheckedPopupMenuItem<String>(
                      value: 'voice:${entry.key}',
                      checked: ListeningService.instance.voice == entry.key,
                      child: Text(entry.value),
                    ),
                  const PopupMenuDivider(),
                  const PopupMenuItem<String>(
                    enabled: false,
                    child: Text('Скорость',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                  for (final speed in const [
                    0.7,
                    0.85,
                    1.0,
                    1.15,
                    1.3,
                    1.5,
                    1.8
                  ])
                    CheckedPopupMenuItem<String>(
                      value: 'speed:$speed',
                      checked: _audiobookSpeed == speed,
                      child: Text('${speed}x'),
                    ),
                ],
                icon: const Icon(Icons.record_voice_over_outlined),
              ),
              IconButton(
                tooltip: 'Закрыть плеер',
                onPressed: _closeAudiobook,
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _discussionWolf() => Tooltip(
        message: 'Обсуждение этой страницы',
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => setState(() => _discussionOpen = !_discussionOpen),
          child: Image.asset(
            'assets/imgs/citavuk_zadumch.webp',
            width: 118,
            cacheWidth: mascotCacheWidth(context, 118),
            semanticLabel: 'Обсуждение этой страницы',
          ),
        ),
      );

  Widget _leadImage() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Image.network(
          widget.leadImageUrl!,
          fit: BoxFit.cover,
          width: double.infinity,
          loadingBuilder: (context, child, progress) {
            if (progress == null) return child;
            return Container(
              height: 200,
              alignment: Alignment.center,
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: const CircularProgressIndicator(),
            );
          },
          errorBuilder: (_, __, ___) => const SizedBox.shrink(),
        ),
      ),
    );
  }

  /// Тихая подсветка места остановки: только фон абзаца, гаснущий за три
  /// секунды. Ничего не вставляется и не убирается из вёрстки, поэтому
  /// страница не сдвигается ни при появлении, ни при исчезновении.
  Widget _resumeGlow({
    required int globalPara,
    required ColorScheme scheme,
    required Widget child,
  }) {
    if (!_resumeHintVisible || globalPara != _resumePara) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 1, end: 0),
      duration: const Duration(seconds: 3),
      builder: (_, value, c) => DecoratedBox(
        decoration: BoxDecoration(
          color: scheme.primary.withValues(alpha: 0.10 * value),
          borderRadius: BorderRadius.circular(8),
        ),
        child: c,
      ),
      child: child,
    );
  }

  /// Плашка «Ты остановился здесь»: висит поверх текста и тоже ничего не
  /// сдвигает. В спокойном режиме её нет — остаётся только подсветка абзаца.
  Widget _resumePill(ColorScheme scheme) {
    return Material(
      color: scheme.primaryContainer,
      elevation: 3,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 7, 14, 7),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset(Wolf.ukaz, height: 22),
            const SizedBox(width: 6),
            Text('Ты остановился здесь',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: scheme.onPrimaryContainer)),
          ],
        ),
      ),
    );
  }

  /// Боковая панель разбора для широкого экрана: висит поверх текста справа,
  /// книгу не затемняет и вёрстку не трогает — строка остаётся на месте.
  /// Смена слова меняет содержимое (коротким появлением), панель не
  /// закрывается.
  Widget _lookupPanel(_LookupEntry entry) {
    final scheme = Theme.of(context).colorScheme;
    return Focus(
      onKeyEvent: _onPanelKey,
      child: Material(
        color: scheme.surface,
        elevation: 8,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: scheme.onSurface.withValues(alpha: 0.12)),
          ),
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
          child: Column(
            children: [
              _lookupNavRow(
                scheme: scheme,
                canGoBack: _lookupHistory.length > 1,
                onBack: _backLookup,
                onClose: _closeLookup,
              ),
              Expanded(
                child: AnimatedSwitcher(
                  duration: AppMotion.card,
                  transitionBuilder: cardTransitionBuilder,
                  child: WordAnalysisBody(
                    key: ValueKey(entry.key),
                    request: WordLookupRequest(
                      bookId: widget.bookId,
                      sentence: entry.sentence,
                      token: entry.token,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Клавиши внутри панели: Escape закрывает её, остальное (стрелки листания,
  /// размер шрифта) работает как в тексте — фокус ушёл в панель, а чинить
  /// листание надо.
  KeyEventResult _onPanelKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    if (event.logicalKey == LogicalKeyboardKey.escape) {
      _closeLookup();
      return KeyEventResult.handled;
    }
    return _onKey(node, event);
  }

  Widget _buildArrow(ColorScheme scheme, {required bool left}) {
    // Кнопки нельзя ставить у самой кромки экрана. На Android с жестовой
    // навигацией полоса шириной около двух десятков точек по краям отдана
    // системному жесту «назад»: нажатие там до приложения не доходит вовсе, и
    // кнопка выглядит нерабочей. Отступ берём у самой системы, а не константой,
    // потому что у разных прошивок полоса разной ширины.
    final gestures = MediaQuery.of(context).systemGestureInsets;
    final inset = (left ? gestures.left : gestures.right) + 6;

    return Positioned(
      left: left ? inset : null,
      right: left ? null : inset,
      top: 0,
      bottom: 0,
      child: Center(
        child: Material(
          color: scheme.surface.withValues(alpha: 0.75),
          shape: const CircleBorder(),
          elevation: 2,
          child: IconButton(
            iconSize: 28,
            tooltip: left ? 'Предыдущая страница' : 'Следующая страница',
            icon: Icon(left ? Icons.chevron_left : Icons.chevron_right),
            color: scheme.primary,
            onPressed: () => _goToPage(left ? -1 : 1),
          ),
        ),
      ),
    );
  }
}

class _AudiobookCue {
  const _AudiobookCue({
    required this.text,
    required this.paragraph,
    required this.start,
  });

  final String text;
  final int paragraph;
  final int start;
}

/// Ширина экрана, с которой разбор слова живёт в боковой панели, а не
/// в шторке. Совпадает с порогом боковой колонки обсуждения (900).
const _lookupPanelBreakpoint = 900.0;

/// Размеры панели разбора: фиксированная ширина у правого края.
const _lookupPanelWidth = 384.0;
const _lookupPanelMargin = 12.0;

/// Сколько последних просмотренных слов помнит сеанс чтения.
const _lookupHistoryLimit = 10;

/// Одно просмотренное слово: где нажали и что разбирали. Хранится и
/// выделение (для возврата подсветки), и предложение (для контекста):
/// одинаковое слово в разных местах — разные записи.
class _LookupEntry {
  const _LookupEntry({
    required this.page,
    required this.para,
    required this.cell,
    required this.start,
    required this.end,
    required this.sentence,
    required this.token,
  });

  final int page;
  final int para;
  final int? cell;
  final int start;
  final int end;
  final String sentence;
  final Token token;

  String get key => '$sentence\n${token.text}@${token.start}-${token.end}';
}

/// Прокрутка/листание читалки.
///
/// На телефоне листаем пальцем (touch). На десктопе/вебе НЕ листаем мышью и
/// трекпадом drag-ом — этот жест отдан под выделение фразы «зажать и вести»;
/// страницы там листаются кнопками/клавишами, а текст крутится колесом.
class _DragScrollBehavior extends MaterialScrollBehavior {
  const _DragScrollBehavior();
  @override
  Set<PointerDeviceKind> get dragDevices {
    final desktop = kIsWeb ||
        defaultTargetPlatform == TargetPlatform.windows ||
        defaultTargetPlatform == TargetPlatform.linux ||
        defaultTargetPlatform == TargetPlatform.macOS;
    if (desktop) {
      return {PointerDeviceKind.touch, PointerDeviceKind.stylus};
    }
    return {
      PointerDeviceKind.touch,
      PointerDeviceKind.stylus,
      PointerDeviceKind.trackpad,
    };
  }
}
