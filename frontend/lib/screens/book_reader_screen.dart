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
import '../events/events_controller.dart';
import '../events/reader_rewards.dart';
import '../models/book_block.dart';
import '../models/english_analysis.dart';
import '../models/grammar.dart';
import '../models/reader_settings.dart';
import '../models/word_analysis.dart';
import '../services/analysis_repository.dart';
import '../services/announcements_controller.dart';
import '../services/grammar_engine.dart';
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
import '../utils/serbian_pronunciation.dart';
import '../widgets/keep_awake.dart';
import '../utils/tokenizer.dart';
import '../widgets/animated_widgets.dart';
import '../widgets/book_block_view.dart';
import '../widgets/grammar_widgets.dart';
import '../widgets/radio_sheet.dart';
import '../widgets/reader_text.dart';
import '../widgets/shortcuts_sheet.dart';
import '../widgets/wolf_mascot.dart';
import 'grammar_screen.dart';
import 'vocabulary_screen.dart';

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
        leading: const WolfSticker(asset: Wolf.zadumch, size: 44, frame: false),
        content: Text(
          'Читавук думает, что книга сейчас будет для вас тяжеловата! '
          'Она рассчитана на уровень: ${level.level}, а ваш уровень: $reader. '
          'Это просто предупреждение, вы можете читать книгу в любом случае.',
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
    _pageController = PageController(initialPage: startPage);
    if (widget.sourceKey.startsWith('share:')) {
      _discussionToken = widget.sourceKey.substring('share:'.length);
      _discussionOpen = true;
    }
    if (startPage > 0) {
      _resumeHintVisible = true; // лапка-указатель «вы остановились здесь»
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
    if (!_pageController.hasClients || _pages.isEmpty) return;
    final cur = _pageController.page?.round() ?? _startPage;
    _jumpTo(cur + delta);
  }

  void _jumpTo(int target) {
    if (!_pageController.hasClients || _pages.isEmpty) return;
    final cur = _pageController.page?.round() ?? _startPage;
    final clamped = target.clamp(0, _pages.length - 1);
    if (clamped == cur) return;
    _pageController.animateToPage(clamped,
        duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
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
      Navigator.of(context).maybePop();
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
    if (!_pageController.hasClients || _audiobookCues.isEmpty) return;
    final cue = _audiobookCues[_audiobookCue];
    final page = _pageForPara(cue.paragraph);
    _pageController.animateToPage(
      page,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
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
    _pageController.dispose();
    _kbFocus.dispose();
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
    setState(() {
      _selPage = pageIndex;
      _selPara = pIndex;
      _selCell = null;
      _selStart = tokenIndex;
      _selEnd = tokenIndex;
    });
    _showAnalysisSheet(token, _pages[pageIndex][pIndex]);
  }

  /// Слово внутри ячейки таблицы.
  ///
  /// Контекстом служит текст самой ячейки, а не абзац: абзац здесь — служебная
  /// метка таблицы, и разбор по ней выбрал бы неверный язык и неверное
  /// значение слова. Номер ячейки нужен подсветке: без него одинаковое слово
  /// подсветилось бы сразу во всех ячейках таблицы.
  void _onTapCellWord(int pageIndex, int pIndex, int cellIndex, String cellText,
      int tokenIndex, Token token) {
    setState(() {
      _selPage = pageIndex;
      _selPara = pIndex;
      _selCell = cellIndex;
      _selStart = tokenIndex;
      _selEnd = tokenIndex;
    });
    _showAnalysisSheet(token, cellText);
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
      _showAnalysisSheet(
        Token(
          text: phrase,
          start: tokens[start].start,
          end: tokens[end].end,
          isWord: true,
        ),
        _pages[pageIndex][pIndex],
      );
    }
  }

  void _onPhraseSelectionCancel() {
    _clearSelection();
  }

  void _showAnalysisSheet(Token token, String sentence) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      // Фон рисует сама панель (реактивно к теме) — иначе при переключении
      // тёмной темы фон оставался светлым, а текст становился невидимым.
      backgroundColor: Colors.transparent,
      builder: (_) => WordAnalysisSheet(
        bookId: widget.bookId,
        sentence: sentence,
        token: token,
      ),
    ).then((_) => _clearSelection());
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

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final settings = context.watch<AppSettings>().reader;

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

    // До первого layout контроллер ещё не привязан — берём стартовую страницу
    // (а не initialParagraph: это индекс абзаца и он может превышать число страниц).
    final pageNum = _pages.isEmpty
        ? 0
        : ((_pageController.hasClients
                    ? _pageController.page?.round()
                    : null) ??
                _startPage) +
            1;

    // Экран не гаснет, пока книга открыта, — см. widgets/keep_awake.dart.
    return KeepAwake(
      child: Scaffold(
        backgroundColor: reward?.background ?? customBg,
        appBar: AppBar(
          title: Text('${widget.title}  ($pageNum/${_pages.length})',
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
              tooltip: 'Настройки чтения',
              icon: const Icon(Icons.text_fields),
              onPressed: _openReaderSettings,
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
                            child: PageView.builder(
                              controller: _pageController,
                              itemCount: _pages.length,
                              onPageChanged: (i) {
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
                                  padding:
                                      const EdgeInsets.fromLTRB(40, 18, 40, 60),
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
                                                widget.leadImageUrl != null)
                                              _leadImage(),
                                            if (pageIndex == _startPage &&
                                                _resumeHintVisible)
                                              _resumeHint(
                                                  scheme, settings.fontSize),
                                            ...List.generate(paras.length,
                                                (pIndex) {
                                              final isSel =
                                                  _selPage == pageIndex &&
                                                      _selPara == pIndex;
                                              final globalPara =
                                                  _pageStartPara[pageIndex] +
                                                      pIndex;
                                              final isAudiobook =
                                                  _audiobookEnabled &&
                                                      _audiobookCues
                                                          .isNotEmpty &&
                                                      _audiobookCues[
                                                                  _audiobookCue]
                                                              .paragraph ==
                                                          globalPara &&
                                                      _audiobookToken >= 0;
                                              // Картинка и таблица — те же абзацы, но
                                              // с меткой в начале (models/book_block).
                                              final block =
                                                  parseBookBlock(paras[pIndex]);
                                              if (block.kind ==
                                                  BookBlockKind.image) {
                                                return BookImageView(
                                                  url: block.url,
                                                  caption: block.text,
                                                  textColor: textColor,
                                                  fontSize: settings.fontSize,
                                                );
                                              }
                                              if (block.kind ==
                                                  BookBlockKind.table) {
                                                return BookTableView(
                                                  rows: block.rows,
                                                  settings: settings,
                                                  textColor: textColor,
                                                  highlightColor:
                                                      scheme.primary,
                                                  highlightTextColor:
                                                      scheme.onPrimary,
                                                  selectedCell:
                                                      isSel ? _selCell : null,
                                                  selectedToken:
                                                      isSel ? _selStart : null,
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
                                              }
                                              return Padding(
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
                                                  justify: settings.justify,
                                                  firstLineIndent:
                                                      settings.firstLineIndent,
                                                  dragToSelect: dragToSelect,
                                                  onTapWord:
                                                      (ti, token, tokens) =>
                                                          _onTapWord(
                                                              pageIndex,
                                                              pIndex,
                                                              ti,
                                                              token,
                                                              tokens),
                                                  onPhraseSelectionStart: (ti) =>
                                                      _onPhraseSelectionStart(
                                                          pageIndex,
                                                          pIndex,
                                                          ti),
                                                  onPhraseSelectionUpdate: (ti) =>
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
                                            }),
                                            if (_discussionToken.isNotEmpty &&
                                                !showWolfAside)
                                              Center(
                                                child: _discussionWolf(),
                                              ),
                                            if (_discussionToken.isNotEmpty &&
                                                _discussionOpen) ...[
                                              const SizedBox(height: 12),
                                              _DiscussionPanel(
                                                key: ValueKey(
                                                    '$_discussionToken:${_pageStartPara[pageIndex]}'),
                                                token: _discussionToken,
                                                paragraph:
                                                    _pageStartPara[pageIndex],
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
                          _buildArrow(scheme, left: true),
                          _buildArrow(scheme, left: false),
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
            'assets/imgs/citavuk_zadumch.png',
            width: 118,
            cacheWidth: 236,
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

  Widget _resumeHint(ColorScheme scheme, double fontSize) {
    // Лапка масштабируется вместе с текстом и «покачивается», указывая на
    // абзац, с которого продолжаем читать.
    final pawH = (fontSize * 2.6).clamp(46.0, 96.0);
    return FadeSlideIn(
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.fromLTRB(6, 6, 16, 6),
        decoration: BoxDecoration(
          color: scheme.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.primary.withValues(alpha: 0.30)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            FloatingBob(
              amplitude: 5,
              child: Image.asset(Wolf.ukaz, height: pawH),
            ),
            const SizedBox(width: 4),
            Flexible(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Вы остановились здесь',
                      style: TextStyle(
                          fontStyle: FontStyle.italic,
                          color: scheme.primary,
                          fontSize: 15,
                          fontWeight: FontWeight.w700)),
                  Text('Продолжаем с этого абзаца',
                      style: TextStyle(
                          fontSize: 12,
                          color: scheme.onSurface.withValues(alpha: 0.6))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
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

class _ShareSheet extends StatefulWidget {
  const _ShareSheet({
    required this.share,
    required this.onLinkCopied,
  });

  final BookShare share;
  final VoidCallback onLinkCopied;

  @override
  State<_ShareSheet> createState() => _ShareSheetState();
}

class _ShareSheetState extends State<_ShareSheet> {
  bool _copied = false;

  Future<void> _copy({bool unlockDiscussion = true}) async {
    await Clipboard.setData(ClipboardData(text: widget.share.url));
    if (unlockDiscussion) widget.onLinkCopied();
    if (mounted) setState(() => _copied = true);
  }

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
        mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось открыть приложение')),
      );
    }
  }

  Future<void> _instagram() async {
    await _copy(unlockDiscussion: false);
    await _open('https://www.instagram.com/');
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final text = '«${widget.share.title}» — читаю в Читавуке';
    final encodedUrl = Uri.encodeComponent(widget.share.url);
    final encodedText = Uri.encodeComponent(text);
    final combined = Uri.encodeComponent('$text ${widget.share.url}');
    final socials = <({
      String label,
      FaIconData icon,
      String? url,
      Future<void> Function()? action
    })>[
      (
        label: 'Telegram',
        icon: FontAwesomeIcons.telegram,
        url: 'https://t.me/share/url?url=$encodedUrl&text=$encodedText',
        action: null,
      ),
      (
        label: 'ВКонтакте',
        icon: FontAwesomeIcons.vk,
        url: 'https://vk.com/share.php?url=$encodedUrl&title=$encodedText',
        action: null,
      ),
      (
        label: 'WhatsApp',
        icon: FontAwesomeIcons.whatsapp,
        url: 'https://wa.me/?text=$combined',
        action: null,
      ),
      (
        label: 'Viber',
        icon: FontAwesomeIcons.viber,
        url: 'viber://forward?text=$combined',
        action: null,
      ),
      (
        label: 'Threads',
        icon: FontAwesomeIcons.threads,
        url: 'https://www.threads.net/intent/post?text=$combined',
        action: null,
      ),
      (
        label: 'Instagram',
        icon: FontAwesomeIcons.instagram,
        url: null,
        action: _instagram,
      ),
    ];

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Поделиться книгой',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              'В каталог она не попадает, она будет только у вас и тому кому вы скинете',
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (final social in socials)
                  SizedBox.square(
                    dimension: 48,
                    child: IconButton.filledTonal(
                      tooltip: social.label,
                      onPressed: () {
                        if (social.action != null) {
                          social.action!();
                        } else if (social.url != null) {
                          _open(social.url!);
                        }
                      },
                      icon: FaIcon(social.icon, size: 20),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: SelectableText(
                    widget.share.url,
                    maxLines: 1,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                IconButton.filledTonal(
                  tooltip: 'Скопировать ссылку',
                  onPressed: _copy,
                  icon: const Icon(Icons.link),
                ),
              ],
            ),
            if (_copied)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Ссылка скопирована. Волк ждёт рядом со страницей.',
                  style: TextStyle(
                    color: Colors.green,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _DiscussionPanel extends StatefulWidget {
  const _DiscussionPanel({
    super.key,
    required this.token,
    required this.paragraph,
  });

  final String token;
  final int paragraph;

  @override
  State<_DiscussionPanel> createState() => _DiscussionPanelState();
}

class _DiscussionPanelState extends State<_DiscussionPanel> {
  final _controller = TextEditingController();
  List<BookComment>? _comments;
  bool _sending = false;
  String _error = '';

  ShareService get _service => ShareService(context.read<ApiClient>());

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final comments = await _service.comments(widget.token, widget.paragraph);
      if (mounted) setState(() => _comments = comments);
    } catch (_) {
      if (mounted) setState(() => _comments = const []);
    }
  }

  Future<void> _send() async {
    final body = _controller.text.trim();
    if (body.isEmpty) return;
    setState(() {
      _sending = true;
      _error = '';
    });
    try {
      final comment =
          await _service.addComment(widget.token, widget.paragraph, body);
      if (!mounted) return;
      setState(() {
        _comments = [...?_comments, comment];
        _controller.clear();
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _delete(BookComment comment) async {
    await _service.deleteComment(comment.id);
    if (mounted) {
      setState(() => _comments =
          _comments?.where((item) => item.id != comment.id).toList());
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = context.watch<AuthService>().isSignedIn;
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Обсуждение этой страницы',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                ),
                const Text(
                  'само по-сербски',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (_comments == null)
              const Center(child: CircularProgressIndicator())
            else if (_comments!.isEmpty)
              Text(
                'Здесь пока тихо. Напишите первым.',
                style: TextStyle(color: scheme.onSurfaceVariant),
              )
            else
              for (final comment in _comments!)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(comment.author,
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text(comment.body),
                  trailing: comment.mine
                      ? IconButton(
                          tooltip: 'Убрать сообщение',
                          onPressed: () => _delete(comment),
                          icon: const Icon(Icons.delete_outline),
                        )
                      : null,
                ),
            if (signedIn) ...[
              const SizedBox(height: 10),
              TextField(
                controller: _controller,
                minLines: 2,
                maxLines: 5,
                maxLength: 1000,
                decoration: const InputDecoration(
                  hintText: 'Napišite nešto o ovoj strani…',
                ),
              ),
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_error,
                      style: TextStyle(color: scheme.error, fontSize: 12)),
                ),
              FilledButton.icon(
                onPressed: _sending ? null : _send,
                icon: _sending
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send_outlined),
                label: const Text('Отправить'),
              ),
            ] else
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  'Войдите в аккаунт, чтобы писать.',
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Верхняя полоса нижней панели: «ручка» по центру + явный крестик «закрыть»
/// справа (на жестовой навигации Pixel свайпом закрыть бывает неочевидно).
Widget _sheetHandleBar(BuildContext context, ColorScheme scheme) {
  return SizedBox(
    height: 44,
    child: Stack(
      children: [
        Align(
          alignment: Alignment.topCenter,
          child: Container(
            margin: const EdgeInsets.only(top: 8),
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: scheme.onSurface.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: IconButton(
            tooltip: 'Закрыть',
            visualDensity: VisualDensity.compact,
            icon: Icon(Icons.close,
                color: scheme.onSurface.withValues(alpha: 0.65)),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ),
      ],
    ),
  );
}

/// Нижняя панель настроек чтения: шрифт, размер, межстрочный, трекинг,
/// bionic-режим и тема. Меняет глобальные настройки в реальном времени.
class ReaderSettingsSheet extends StatelessWidget {
  const ReaderSettingsSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final appSettings = context.watch<AppSettings>();
    final s = appSettings.reader;

    void set(ReaderSettings next) => context.read<AppSettings>().update(next);

    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _sheetHandleBar(context, scheme),
              const SizedBox(height: 8),
              Text('Настройки чтения',
                  style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: scheme.onSurface)),
              const SizedBox(height: 16),
              _label('Шрифт', scheme),
              Wrap(
                spacing: 8,
                children: ReaderFont.values
                    .map((f) => ChoiceChip(
                          label: Text(f.label),
                          selected: s.font == f,
                          onSelected: (_) => set(s.copyWith(font: f)),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 14),
              _slider(
                context,
                'Размер: ${s.fontSize.round()}',
                s.fontSize,
                14,
                32,
                (v) => set(s.copyWith(fontSize: v)),
              ),
              _slider(
                context,
                'Межстрочный: ${s.lineHeight.toStringAsFixed(2)}',
                s.lineHeight,
                1.2,
                2.4,
                (v) => set(s.copyWith(lineHeight: v)),
              ),
              _slider(
                context,
                'Трекинг: ${s.letterSpacing.toStringAsFixed(1)}',
                s.letterSpacing,
                0,
                3,
                (v) => set(s.copyWith(letterSpacing: v)),
              ),
              const SizedBox(height: 6),
              _label('Выделение основы слова (быстрое чтение)', scheme),
              Wrap(
                spacing: 8,
                children: BionicLevel.values
                    .map((b) => ChoiceChip(
                          label: Text(b.label),
                          selected: s.bionic == b,
                          onSelected: (_) => set(s.copyWith(bionic: b)),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 16),
              _label('Тема', scheme),
              Wrap(
                spacing: 8,
                children: AppThemeMode.values
                    .map((m) => ChoiceChip(
                          label: Text(m.label),
                          selected: s.themeMode == m,
                          onSelected: (_) => set(s.copyWith(themeMode: m)),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 16),
              _label('Вёрстка страницы', scheme),
              _slider(
                context,
                s.fullWidth
                    ? 'Ширина колонки: вся ширина'
                    : 'Ширина колонки: ${s.maxWidth.round()}',
                s.maxWidth,
                360,
                1100,
                (v) => set(s.copyWith(maxWidth: v)),
              ),
              _slider(
                context,
                'Отступ между абзацами: ${s.paragraphSpacing.round()}',
                s.paragraphSpacing,
                4,
                40,
                (v) => set(s.copyWith(paragraphSpacing: v)),
              ),
              _slider(
                context,
                'Красная строка: ${s.firstLineIndent.round()}',
                s.firstLineIndent,
                0,
                48,
                (v) => set(s.copyWith(firstLineIndent: v)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Выравнивание по ширине'),
                value: s.justify,
                onChanged: (v) => set(s.copyWith(justify: v)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Шелест при перелистывании'),
                value: s.pageTurnSound,
                onChanged: (v) => set(s.copyWith(pageTurnSound: v)),
              ),
              // Настройка живёт в AppSettings, а не в ReaderSettings: она
              // действует и в плеере, а тот про настройки чтения не знает.
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Не гасить экран'),
                subtitle: const Text(
                    'В читалке и при прослушивании. Расходует батарею.'),
                value: context.watch<AppSettings>().keepScreenOn,
                onChanged: (v) =>
                    context.read<AppSettings>().setKeepScreenOn(v),
              ),
              const SizedBox(height: 12),
              _label('Фон страницы', scheme),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _bgSwatch(context, s, 0),
                  for (final c in _bgPresets) _bgSwatch(context, s, c),
                ],
              ),
              // Фоны-награды показываются, только когда они открыты текущим
              // аккаунтом: чужая награда на общем устройстве видна быть не должна.
              ..._rewardSection(context, s, scheme),
              const SizedBox(height: 10),
              Text('Свой оттенок',
                  style: TextStyle(
                      fontSize: 13,
                      color: scheme.onSurface.withValues(alpha: 0.7))),
              Slider(
                value: _hueOf(s.bgColor),
                min: 0,
                max: 360,
                onChanged: (h) => set(s.copyWith(
                    bgColor: HSVColor.fromAHSV(1, h, 0.16, 0.97)
                        .toColor()
                        .toARGB32())),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static const _bgPresets = [
    0xFFF3E9D2, // пергамент
    0xFFF4ECD8, // сепия
    0xFFFFFDF7, // тёплый белый
    0xFFE9E9E6, // светло-серый
    0xFFE2EFE3, // мятный
    0xFFE3ECF5, // небесный
    0xFFF5E6E8, // розовый
    0xFFEDE7F4, // лавандовый
    0xFF201A14, // тёмный
    0xFF000000, // чёрный
  ];

  double _hueOf(int argb) =>
      argb == 0 ? 0 : HSVColor.fromColor(Color(argb)).hue;

  /// Фоны-награды. Пустой список — раздела нет вовсе: обещать награду, которой
  /// у человека ещё нет, в настройках незачем, для этого есть экран событий.
  List<Widget> _rewardSection(
      BuildContext context, ReaderSettings s, ColorScheme scheme) {
    final rewards = [
      ...context.watch<EventsController>().rewards,
      for (final entry
          in context.watch<AnnouncementsController>().rewardAssets.entries)
        serverReaderReward(entry.key, entry.value),
    ];
    if (rewards.isEmpty) return const [];
    return [
      const SizedBox(height: 14),
      _label('Фон из события', scheme),
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final reward in rewards) _rewardSwatch(context, s, reward),
        ],
      ),
    ];
  }

  Widget _rewardSwatch(
      BuildContext context, ReaderSettings s, ReaderReward reward) {
    final scheme = Theme.of(context).colorScheme;
    final selected = s.bgTexture == reward.id;
    final rewardImage = reward.image;
    return Tooltip(
      message: reward.label,
      child: GestureDetector(
        onTap: () => context
            .read<AppSettings>()
            .update(s.copyWith(bgTexture: selected ? '' : reward.id)),
        child: Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: reward.background,
            shape: BoxShape.circle,
            image: rewardImage == null
                ? null
                : DecorationImage(
                    image: rewardImage,
                    repeat: ImageRepeat.repeat,
                    alignment: Alignment.topLeft,
                    opacity: reward.opacity < 0.25 ? 0.35 : reward.opacity,
                  ),
            border: Border.all(
              color: selected
                  ? scheme.primary
                  : scheme.onSurface.withValues(alpha: 0.2),
              width: selected ? 3 : 1,
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (reward.isNetworkSvg)
                ClipOval(
                  child: SvgPicture.network(
                    reward.networkAsset,
                    fit: BoxFit.cover,
                    placeholderBuilder: (_) => const SizedBox.shrink(),
                  ),
                ),
              if (selected)
                const Center(
                  child: Icon(Icons.check, size: 18, color: Colors.black87),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _bgSwatch(BuildContext context, ReaderSettings s, int argb) {
    final scheme = Theme.of(context).colorScheme;
    // Текстура рисуется поверх цвета, поэтому выбор обычного фона её снимает —
    // иначе нажатие на цвет выглядело бы как «ничего не произошло».
    final selected = s.bgColor == argb && s.bgTexture.isEmpty;
    final color = argb == 0 ? scheme.surface : Color(argb);
    return GestureDetector(
      onTap: () => context
          .read<AppSettings>()
          .update(s.copyWith(bgColor: argb, bgTexture: '')),
      child: Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(
            color: selected
                ? scheme.primary
                : scheme.onSurface.withValues(alpha: 0.2),
            width: selected ? 3 : 1,
          ),
        ),
        child: argb == 0
            ? Icon(Icons.format_color_reset,
                size: 18, color: scheme.onSurface.withValues(alpha: 0.6))
            : (selected
                ? Icon(Icons.check,
                    size: 18,
                    color: color.computeLuminance() > 0.5
                        ? Colors.black54
                        : Colors.white)
                : null),
      ),
    );
  }

  Widget _label(String text, ColorScheme scheme) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: scheme.onSurface.withValues(alpha: 0.7))),
      );

  Widget _slider(BuildContext context, String label, double value, double min,
      double max, ValueChanged<double> onChanged) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 13, color: scheme.onSurface)),
        Slider(
          value: value.clamp(min, max),
          min: min,
          max: max,
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class WordAnalysisSheet extends StatefulWidget {
  final int bookId;
  final String sentence;
  final Token token;

  const WordAnalysisSheet({
    super.key,
    required this.bookId,
    required this.sentence,
    required this.token,
  });

  @override
  State<WordAnalysisSheet> createState() => _WordAnalysisSheetState();
}

class _WordAnalysisSheetState extends State<WordAnalysisSheet> {
  late Future<WordAnalysis> _future;
  final AudioPlayer _ttsPlayer = AudioPlayer();
  bool _isSaved = false;
  bool _speaking = false;
  String _voice = ListeningService.instance.voice;

  /// Что уйдёт в словарь: начальная форма или словоформа из текста.
  /// По умолчанию начальная — это словарная статья, и повторять её карточкой
  /// полезнее, чем одну случайную форму.
  bool _saveLemma = true;

  @override
  void initState() {
    super.initState();
    _future = AnalysisRepository.instance.analyzeToken(
      sentence: widget.sentence,
      startOffset: widget.token.start,
      endOffset: widget.token.end,
      tokenText: widget.token.text,
    );
    _ttsPlayer.onPlayerStateChanged.listen((state) {
      if (mounted) setState(() => _speaking = state == PlayerState.playing);
    });
    _future.then((data) => _playPronunciation(data.isEnglish ? 'en' : 'sr'));
  }

  Future<void> _playPronunciation([String lang = 'sr']) async {
    await _ttsPlayer.stop();
    await _ttsPlayer.play(UrlSource(
      ListeningService.instance.ttsUrl(widget.token.text, lang: lang),
    ));
  }

  @override
  void dispose() {
    _ttsPlayer.dispose();
    super.dispose();
  }

  /// Короткое описание формы: «мн. ч.», «3 л. ед., презент».
  /// Пустое, если слово и так начальная форма.
  static String formLabelOf(WordAnalysis data) {
    if (data.english != null) return data.english!.formLabel;
    if (data.feats.isEmpty) return '';
    final facts = GrammarEngine.humanFacts(data.upos, data.feats);
    return facts.map((f) => f.value).join(', ');
  }

  /// Есть ли из чего выбирать: словоформа отличается от начальной формы.
  static bool hasFormChoice(WordAnalysis data) =>
      !data.isPhrase &&
      data.lemma.isNotEmpty &&
      data.surface.toLowerCase() != data.lemma.toLowerCase();

  Future<void> _save(WordAnalysis data, {required bool asLemma}) async {
    String translation = data.translation;
    final ctx = data.contextualTranslation?.trim();
    final gen = data.translation.trim();
    if (ctx != null &&
        ctx.isNotEmpty &&
        ctx.toLowerCase() != gen.toLowerCase()) {
      translation = 'В тексте: $ctx\nВ общем: $gen';
    }

    // При сохранении словоформы в карточку кладётся ещё и разбор этой формы:
    // иначе через неделю непонятно, почему в словаре «svira», а не «svirati».
    final forms = Map<String, dynamic>.from(data.forms);
    final label = formLabelOf(data);
    if (!asLemma && label.isNotEmpty) {
      forms['форма в тексте'] = label;
      forms['начальная форма'] = data.lemma;
    }

    await UserDb.instance.addVocabulary(
      bookId: widget.bookId,
      word: asLemma && data.lemma.isNotEmpty ? data.lemma : data.surface,
      lemma: data.lemma,
      pos: data.upos,
      translation: translation,
      forms: forms,
    );
    setState(() => _isSaved = true);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Padding(
        // Отступ снизу складывается из клавиатуры и системной навигации.
        // Приложение рисует под строку навигации (edgeToEdge), и без второго
        // слагаемого низ панели — кнопка «в словарь», таблица форм — уезжал под
        // кнопки Android. На Android 15 режим edge-to-edge включён всегда,
        // поэтому это видно у всех.
        //
        // MediaQuery.padding уже вычитает viewInsets, так что при открытой
        // клавиатуре слагаемые не складываются дважды.
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 8,
          bottom: MediaQuery.of(context).viewInsets.bottom +
              MediaQuery.of(context).padding.bottom +
              24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _sheetHandleBar(context, scheme),
            Flexible(
              child: FutureBuilder<WordAnalysis>(
                future: _future,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const SizedBox(
                      height: 220,
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  if (snapshot.hasError || !snapshot.hasData) {
                    return SizedBox(
                      height: 180,
                      child: Center(
                        child: Text('Ошибка при анализе',
                            style: TextStyle(color: scheme.error)),
                      ),
                    );
                  }

                  final data = snapshot.data!;
                  final surface = data.surface;
                  final lemma = data.lemma;
                  final upos = data.upos;
                  final feats = data.feats;
                  final forms = data.forms;
                  final translation = data.translation;
                  final isOffline = data.isOffline;
                  final isPhrase = data.isPhrase;

                  // Контекстный перевод (для этого предложения) — главный; «общий»
                  // перевод слова показываем мельче ниже, если он отличается.
                  final ctx = data.contextualTranslation?.trim();
                  final gen = translation.trim();
                  final hasContext = ctx != null &&
                      ctx.isNotEmpty &&
                      ctx.toLowerCase() != gen.toLowerCase();
                  final primaryTranslation =
                      hasContext ? ctx : (gen.isNotEmpty ? gen : translation);

                  // Авто-подсказка: если это предлог (или фраза, начинающаяся с
                  // предлога) — показываем, каким падежом он управляет. Для не-предлогов
                  // список пустой, и карточка не появляется.
                  final prepWord = isPhrase
                      ? surface.trim().split(RegExp(r'\s+')).first
                      : surface;
                  final government =
                      GrammarEngine.prepositionGovernment(prepWord);

                  return SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Flexible(
                                        child: Text(surface,
                                            style: TextStyle(
                                                fontSize: 24,
                                                fontWeight: FontWeight.bold,
                                                color: scheme.onSurface)),
                                      ),
                                      IconButton(
                                        tooltip: 'Произнести слово',
                                        onPressed: () => _playPronunciation(
                                            data.isEnglish ? 'en' : 'sr'),
                                        icon: Icon(_speaking
                                            ? Icons.stop_circle_outlined
                                            : Icons.volume_up_outlined),
                                      ),
                                      if (!data.isEnglish)
                                        PopupMenuButton<String>(
                                          tooltip: 'Выбрать диктора',
                                          initialValue: _voice,
                                          onSelected: (voice) async {
                                            await ListeningService.instance
                                                .setVoice(voice);
                                            if (!mounted) return;
                                            setState(() => _voice = voice);
                                            await _playPronunciation('sr');
                                          },
                                          itemBuilder: (_) => [
                                            for (final entry in ListeningService
                                                .serbianVoices.entries)
                                              PopupMenuItem(
                                                value: entry.key,
                                                child: Text(entry.value),
                                              ),
                                          ],
                                          icon: const Icon(
                                              Icons.record_voice_over_outlined),
                                        ),
                                    ],
                                  ),
                                  // Ударение выделяется жирным прямо в
                                  // транскрипции. Подпись словами («ударение не
                                  // на последнем слоге») — это рассуждение о
                                  // произношении, а не само произношение.
                                  if (!isPhrase && !data.isEnglish)
                                    Builder(builder: (context) {
                                      final (before, stressed, after) =
                                          SerbianPronunciation.ipaParts(
                                              surface);
                                      final style = TextStyle(
                                        color: scheme.onSurface
                                            .withValues(alpha: 0.65),
                                        fontSize: 13,
                                      );
                                      return Text.rich(
                                        TextSpan(
                                          style: style,
                                          children: [
                                            TextSpan(text: before),
                                            TextSpan(
                                              text: stressed,
                                              style: TextStyle(
                                                fontWeight: FontWeight.bold,
                                                color: scheme.onSurface,
                                              ),
                                            ),
                                            TextSpan(text: after),
                                          ],
                                        ),
                                      );
                                    }),
                                  const SizedBox(height: 6),
                                  Wrap(
                                    spacing: 8,
                                    crossAxisAlignment:
                                        WrapCrossAlignment.center,
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(
                                          color: isPhrase
                                              ? scheme.secondary
                                              : scheme.primary,
                                          borderRadius:
                                              BorderRadius.circular(6),
                                        ),
                                        child: Text(
                                            isPhrase
                                                ? 'фраза'
                                                : GrammarEngine.posShort(upos),
                                            style: const TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.bold,
                                                color: Colors.white)),
                                      ),
                                      if (!isPhrase)
                                        Text('нач. форма: $lemma',
                                            style: TextStyle(
                                                color: scheme.onSurface
                                                    .withValues(alpha: 0.6),
                                                fontSize: 13)),
                                      if (isOffline)
                                        Icon(Icons.wifi_off,
                                            size: 14,
                                            color: scheme.onSurface
                                                .withValues(alpha: 0.5)),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            // Когда есть из чего выбирать (форма ≠ начальная
                            // форма), сохранение живёт в блоке выбора ниже —
                            // двух кнопок «в словарь» в одной карточке быть
                            // не должно.
                            if (!hasFormChoice(data))
                              ElevatedButton.icon(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: _isSaved
                                      ? scheme.surfaceContainerHighest
                                      : scheme.primary,
                                  foregroundColor: _isSaved
                                      ? scheme.onSurface
                                      : scheme.onPrimary,
                                ),
                                icon: Icon(
                                    _isSaved ? Icons.check : Icons.bookmark_add,
                                    size: 18),
                                label:
                                    Text(_isSaved ? 'В словаре' : 'В словарь'),
                                onPressed: _isSaved
                                    ? null
                                    : () => _save(data, asLemma: true),
                              ),
                          ],
                        ),
                        const SizedBox(height: 18),
                        if (data.isEnglish) ...[
                          _englishNotice(scheme),
                          const SizedBox(height: 14),
                        ],
                        WolfBubble(
                          title: hasContext ? 'В этом тексте' : 'Перевод',
                          text: primaryTranslation,
                          asset: data.isEnglish ? Wolf.english : Wolf.gram,
                        ),
                        if (hasContext) ...[
                          const SizedBox(height: 10),
                          _generalTranslationCard(scheme, gen),
                        ],
                        if (isPhrase && data.phraseInsight != null) ...[
                          const SizedBox(height: 14),
                          _phraseGrammarCard(scheme, data.phraseInsight!),
                        ],
                        if (government.isNotEmpty) ...[
                          const SizedBox(height: 14),
                          PrepositionGovernmentCard(
                              preposition: prepWord, government: government),
                        ],
                        if (data.isEnglish) ...[
                          const SizedBox(height: 18),
                          _englishGrammar(scheme, data.english!),
                        ],
                        if (!data.isEnglish &&
                            !isPhrase &&
                            const {
                              'NOUN',
                              'PROPN',
                              'ADJ',
                              'VERB',
                              'AUX',
                              'PRON'
                            }.contains(upos)) ...[
                          const SizedBox(height: 12),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: OutlinedButton.icon(
                              icon: const Text('🐺',
                                  style: TextStyle(fontSize: 16)),
                              label: const Text('Почему так?'),
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => GrammarScreen(
                                      word: surface,
                                      lemma: lemma,
                                      upos: upos,
                                      feats: feats,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ],
                        if (feats.isNotEmpty &&
                            !isPhrase &&
                            !data.isEnglish) ...[
                          const SizedBox(height: 18),
                          _section('Грамматика', scheme),
                          const SizedBox(height: 6),
                          _chips(
                            GrammarEngine.humanFacts(upos, feats)
                                .map((f) => '${f.label}: ${f.value}')
                                .toList(),
                            scheme,
                            scheme.secondary,
                          ),
                        ],
                        if (hasFormChoice(data)) ...[
                          const SizedBox(height: 18),
                          _saveChoice(context, scheme, data),
                        ],
                        if (forms.isNotEmpty &&
                            !isPhrase &&
                            !data.isEnglish) ...[
                          const SizedBox(height: 18),
                          _section('Основные формы', scheme),
                          const SizedBox(height: 6),
                          _chips(
                            forms.entries
                                .map((e) =>
                                    '${GrammarEngine.formKeyRu(e.key)}: ${e.value}')
                                .toList(),
                            scheme,
                            scheme.primary,
                          ),
                        ],
                        const SizedBox(height: 8),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Объяснение, почему сербская читалка разбирает английское слово.
  Widget _englishNotice(ColorScheme scheme) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.tertiary.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.tertiary.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.translate, size: 16, color: scheme.tertiary),
              const SizedBox(width: 6),
              Text('Кажется, это английское слово.',
                  style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.bold,
                      color: scheme.tertiary)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Хоть основное предназначение для Читавука это анализ сербских '
            'слов, но без международного языка общения не могут обойтись даже '
            'материалы с основой на сербском.\n'
            'Да и очень много учебников сербского содержат английский как '
            'основной язык-посредник.\n'
            'Читавук постарался — и отчаянно проанализировал слово с чашечкой '
            'зеленого чая.',
            style: TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: scheme.onSurface.withValues(alpha: 0.8)),
          ),
          const SizedBox(height: 8),
          Text(
            '(А для обучения английскому всё же лучше выбрать другой ресурс, '
            'к примеру, знаменитую зеленую сову.)',
            style: TextStyle(
                fontSize: 11.5,
                height: 1.35,
                fontStyle: FontStyle.italic,
                color: scheme.onSurface.withValues(alpha: 0.6)),
          ),
        ],
      ),
    );
  }

  /// Разбор английской формы: часть речи, признаки и «почему так».
  Widget _englishGrammar(ColorScheme scheme, EnglishAnalysis english) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _section('Разбор формы', scheme),
        const SizedBox(height: 6),
        _chips(
          [
            for (final fact in english.facts) '${fact.label}: ${fact.value}',
            if (english.formLabel.isNotEmpty) 'Форма: ${english.formLabel}',
          ],
          scheme,
          scheme.secondary,
        ),
        if (english.why.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(english.why,
              style: TextStyle(
                  fontSize: 12.5,
                  height: 1.4,
                  color: scheme.onSurface.withValues(alpha: 0.75))),
        ],
        // Омоним: «saw» — и прошедшее от «see», и «пила». Молчать об этом
        // нельзя, иначе разбор выглядит уверенной ошибкой.
        if (english.alsoLemma) ...[
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, size: 13, color: scheme.tertiary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '«${english.surface}» бывает и самостоятельным словом — '
                  'здесь показан разбор формы.',
                  style: TextStyle(
                      fontSize: 11.5,
                      fontStyle: FontStyle.italic,
                      color: scheme.onSurface.withValues(alpha: 0.6)),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  /// Выбор, что уходит в словарь: словоформа из текста или начальная форма.
  ///
  /// Спрашиваем каждый раз, а не прячем в настройки: выбор зависит от слова.
  /// Неправильный глагол полезнее запомнить формой, а незнакомое
  /// существительное — словарной статьёй.
  Widget _saveChoice(
      BuildContext context, ColorScheme scheme, WordAnalysis data) {
    final label = formLabelOf(data);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _section('Добавить в словарь', scheme),
          const SizedBox(height: 8),
          _saveOption(
            selected: !_saveLemma,
            title: data.surface,
            subtitle: label.isEmpty ? 'форма из текста' : 'форма — $label',
            scheme: scheme,
            onTap: () => setState(() => _saveLemma = false),
          ),
          const SizedBox(height: 6),
          _saveOption(
            selected: _saveLemma,
            title: data.lemma,
            subtitle: 'начальная форма',
            scheme: scheme,
            onTap: () => setState(() => _saveLemma = true),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor:
                    _isSaved ? scheme.surfaceContainerHighest : scheme.primary,
                foregroundColor: _isSaved ? scheme.onSurface : scheme.onPrimary,
              ),
              icon: Icon(_isSaved ? Icons.check : Icons.bookmark_add, size: 18),
              label: Text(_isSaved ? 'Слово сохранено' : 'Сохранить'),
              onPressed:
                  _isSaved ? null : () => _save(data, asLemma: _saveLemma),
            ),
          ),
        ],
      ),
    );
  }

  Widget _saveOption({
    required bool selected,
    required String title,
    required String subtitle,
    required ColorScheme scheme,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: _isSaved ? null : onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              size: 20,
              color: selected
                  ? scheme.primary
                  : scheme.onSurface.withValues(alpha: 0.4),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: title,
                      style: TextStyle(
                        fontSize: 15,
                        fontFamily: 'NotoSerif',
                        fontWeight: FontWeight.bold,
                        color: scheme.onSurface,
                      ),
                    ),
                    TextSpan(
                      text: '  ·  $subtitle',
                      style: TextStyle(
                        fontSize: 12.5,
                        color: scheme.onSurface.withValues(alpha: 0.65),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Грамматика выделенной фразы: составное время (перфекат/футур/потенцијал)
  /// и энклитики с объяснением порядка (закон Ваккернагеля).
  Widget _phraseGrammarCard(ColorScheme scheme, PhraseInsight insight) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.secondary.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.secondary.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.account_tree_outlined,
                  size: 16, color: scheme.secondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(insight.title,
                    style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.bold,
                        color: scheme.secondary)),
              ),
            ],
          ),
          if (insight.parts.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...insight.parts.map((p) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.label,
                          style: TextStyle(
                              fontSize: 14,
                              fontFamily: 'NotoSerif',
                              fontWeight: FontWeight.bold,
                              color: scheme.primary)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text('— ${p.value}',
                            style: TextStyle(
                                fontSize: 13,
                                color:
                                    scheme.onSurface.withValues(alpha: 0.8))),
                      ),
                    ],
                  ),
                )),
          ],
          const SizedBox(height: 6),
          Text(insight.note,
              style: TextStyle(
                  fontSize: 11.5,
                  height: 1.35,
                  fontStyle: FontStyle.italic,
                  color: scheme.onSurface.withValues(alpha: 0.65))),
        ],
      ),
    );
  }

  /// «Общий» (внеконтекстный) перевод слова + пометка, что значение зависит
  /// от контекста. Показывается под основным (контекстным) переводом.
  Widget _generalTranslationCard(ColorScheme scheme, String general) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.onSurface.withValues(alpha: 0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.public,
                  size: 14, color: scheme.onSurface.withValues(alpha: 0.5)),
              const SizedBox(width: 6),
              Text('В общем (вне контекста)',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: scheme.onSurface.withValues(alpha: 0.55))),
            ],
          ),
          const SizedBox(height: 3),
          Text(general,
              style: TextStyle(
                  fontSize: 15,
                  color: scheme.onSurface.withValues(alpha: 0.85))),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, size: 13, color: scheme.tertiary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Точное значение зависит от контекста — выше перевод именно '
                  'для этого предложения.',
                  style: TextStyle(
                      fontSize: 11.5,
                      fontStyle: FontStyle.italic,
                      color: scheme.onSurface.withValues(alpha: 0.6)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _section(String text, ColorScheme scheme) => Text(text,
      style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: scheme.onSurface.withValues(alpha: 0.6)));

  Widget _chips(List<String> items, ColorScheme scheme, Color border) => Wrap(
        spacing: 8,
        runSpacing: 6,
        children: items
            .map((t) => Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: border.withValues(alpha: 0.4)),
                  ),
                  child: Text(t,
                      style: TextStyle(fontSize: 12, color: scheme.onSurface)),
                ))
            .toList(),
      );
}
