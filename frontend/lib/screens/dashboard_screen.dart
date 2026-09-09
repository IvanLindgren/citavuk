part of '../main.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<Map<String, dynamic>> _books = [];
  List<Map<String, dynamic>> _recentWords = [];
  String? _selectedFolder;
  String _bookQuery = '';
  final TextEditingController _bookSearchController = TextEditingController();
  bool _isLoading = true;
  double _loadProgress = 0.0;

  /// Книга, только что импортированная: подсвечивается появлением один раз.
  /// Остальные карточки при обновлениях списка не переигрывают анимацию —
  /// у каждой стабильный ключ, и состояние появления переживает пересборки.
  int? _freshBookId;

  /// Карточек ждёт повторения во всех книгах — для витрины «Продолжить».
  int _dueCount = 0;

  /// Волк встречает после перерыва вместо немой витрины повторения.
  /// Пересчитывается при каждой загрузке списка — вместе со сменой аккаунта.
  bool _greetReturn = false;

  /// Вечернее прощание симметрично встрече: повторять нечего, волк идёт
  /// читать, а человек — отдыхать. Раз в сутки, только вечером.
  bool _farewell = false;

  /// Сезонное приветствие (праздник или 1-е число): раз в сутки, поверх
  /// встречи и прощания — редкое важнее routine.
  SeasonalGreeting? _seasonal;

  /// Над окном держат файл — показываем, куда его можно бросить.
  bool _dragging = false;

  /// Идёт обновление: синхронизация плюс перечитывание списка книг.
  bool _syncing = false;

  /// Умеет ли сервер разбирать снимки. Кнопка, которая всегда отвечает
  /// отказом, хуже отсутствующей, поэтому съёмка показывается только когда
  /// раздел действительно настроен и человек вошёл.
  bool _photoScan = false;
  late final AuthService _authService;
  late String _accountScope;
  int _loadSerial = 0;

  String _scopeOf(AuthService auth) =>
      auth.isSignedIn ? 'user:${auth.account!.id}' : 'guest';

  @override
  void initState() {
    super.initState();
    _authService = context.read<AuthService>();
    _accountScope = _scopeOf(_authService);
    _authService.addListener(_onAuthChanged);
    _initAndLoad();
    // Приветствие при первом запуске: объясняем онлайн/офлайн и предлагаем
    // скачать словарь.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!context.read<AppSettings>().firstRunDone) {
        _runFirstLaunch();
        return;
      }
      if (context.read<AppSettings>().autoUpdateCheck) {
        checkForUpdates(context);
      }
      _checkPhotoScan();
    });
  }

  @override
  void dispose() {
    _authService.removeListener(_onAuthChanged);
    _bookSearchController.dispose();
    super.dispose();
  }

  void _onAuthChanged() {
    final nextScope = _scopeOf(_authService);
    if (nextScope == _accountScope) return;
    _accountScope = nextScope;
    _loadSerial++;
    _bookSearchController.clear();
    if (!mounted) return;
    setState(() {
      _books = [];
      _recentWords = [];
      _selectedFolder = null;
      _bookQuery = '';
      _dueCount = 0;
      _freshBookId = null;
      _photoScan = false;
      _isLoading = true;
    });
    unawaited(_reloadAfterAccountChange());
  }

  Future<void> _reloadAfterAccountChange() async {
    final scope = _accountScope;
    try {
      await _loadBooks();
      if (mounted && scope == _accountScope) await _checkPhotoScan();
    } catch (e) {
      if (!mounted || scope != _accountScope) return;
      setState(() => _isLoading = false);
      _snack('Ошибка базы данных: $e');
    }
  }

  /// Спрашивает сервер, включено ли распознавание снимков.
  Future<void> _checkPhotoScan() async {
    final auth = context.read<AuthService>();
    if (!auth.isSignedIn) return;
    final scope = _accountScope;
    final available = await PhotoScanService(api: auth.api).available();
    if (mounted &&
        scope == _accountScope &&
        auth.isSignedIn &&
        available != _photoScan) {
      setState(() => _photoScan = available);
    }
  }

  /// Снимок объявления, вывески или тетради — новой книгой.
  Future<void> _scanPhoto() async {
    final auth = context.read<AuthService>();
    final added = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) =>
            PhotoScanScreen(service: PhotoScanService(api: auth.api)),
      ),
    );
    if (added == true && mounted) await _loadBooks();
  }

  /// Первый запуск: показываем знакомство и, если человек выбрал аккаунт,
  /// сразу открываем вход — иначе про синхронизацию он узнаёт случайно.
  Future<void> _runFirstLaunch() async {
    final choice = await showOnboarding(context);
    if (mounted && choice == OnboardingChoice.account) {
      await Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const AccountScreen()),
      );
    }
    // Съёмка есть только у вошедшего, а вход бывает и здесь, и позже — из
    // «Обновить». Без этой проверки кнопка появлялась лишь при следующем
    // запуске.
    if (mounted) await _checkPhotoScan();
  }

  Future<void> _initAndLoad() async {
    final scope = _accountScope;
    final generation = UserDb.instance.generation;
    try {
      await UserDb.instance.database;
      await _loadBooks();
    } catch (e) {
      // Без catch ошибка открытия БД оставляла вечный спиннер на главной.
      if (!mounted ||
          scope != _accountScope ||
          generation != UserDb.instance.generation) {
        return;
      }
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Ошибка базы данных: $e')));
    }
  }

  /// Обновление прогресса импорта; безопасно к уходу с экрана (без setState
  /// после dispose — разбор PDF/DOCX продолжается в фоне).
  void _onParseProgress(double p) {
    if (mounted) setState(() => _loadProgress = p);
  }

  /// Перечитывает список книг.
  ///
  /// [quiet] — не подменять список спиннером. Нужно при обновлении
  /// потягиванием: там уже крутится своя стрелка, и второй индикатор посреди
  /// экрана выглядит так, будто библиотека пропала.
  Future<void> _loadBooks({bool quiet = false}) async {
    final serial = ++_loadSerial;
    final generation = UserDb.instance.generation;
    final scope = _accountScope;
    if (!quiet && mounted) setState(() => _isLoading = true);
    final List<Map<String, dynamic>> booksList;
    final List<Map<String, dynamic>> recent;
    final int due;
    try {
      booksList = await UserDb.instance.getBooks();
      // Берём с запасом: в словарь попадают и выделенные фразы, а в приветствие
      // идут только одиночные слова — обрывки «- Molim…» читаются как сбой.
      recent = await UserDb.instance.getRecentVocabulary(12);
      due = await UserDb.instance.getTotalDueCount();
    } catch (_) {
      if (serial != _loadSerial ||
          generation != UserDb.instance.generation ||
          scope != _accountScope) {
        return;
      }
      rethrow;
    }
    if (!mounted ||
        serial != _loadSerial ||
        generation != UserDb.instance.generation ||
        scope != _accountScope) {
      return;
    }
    setState(() {
      _books = booksList
          .map((book) => {...book, '_db_generation': generation})
          .toList();
      _recentWords = recent
          .where((row) => isSingleWord(row['word']?.toString() ?? ''))
          .take(5)
          .toList();
      if (_selectedFolder != null &&
          !_books.any((book) =>
              ((book['folder'] as String?) ?? '').trim() == _selectedFolder)) {
        _selectedFolder = null;
      }
      _dueCount = due;
      _isLoading = false;
    });
    unawaited(_maybeGreet(due, serial, generation, scope));
  }

  /// Встреча после перерыва, вечернее прощание и сезонное приветствие:
  /// метки ставятся всегда, а волк выходит только по одному поводу за раз.
  /// Сезонное — поверх всего (редкое важнее routine), дальше встреча
  /// (есть долги и был перерыв), последним — проводы (вечер, долгов нет).
  Future<void> _maybeGreet(
      int due, int serial, int generation, String scope) async {
    final settings = context.read<AppSettings>();
    final seasonal = seasonalGreeting(DateTime.now());
    var showSeasonal = false;
    if (seasonal != null) {
      showSeasonal = await settings.markSeasonal(seasonal.id);
      if (!mounted ||
          serial != _loadSerial ||
          generation != UserDb.instance.generation ||
          scope != _accountScope) {
        return;
      }
    }
    final hadBreak = await settings.markLibraryVisit();
    if (!mounted ||
        serial != _loadSerial ||
        generation != UserDb.instance.generation ||
        scope != _accountScope) {
      return;
    }
    var greet = !showSeasonal && hadBreak && due > 0;
    var farewell = false;
    if (!showSeasonal && !greet && due == 0 && _books.isNotEmpty) {
      farewell = await settings.markFarewell();
      if (!mounted ||
          serial != _loadSerial ||
          generation != UserDb.instance.generation ||
          scope != _accountScope) {
        return;
      }
    }
    setState(() {
      _seasonal = showSeasonal ? seasonal : null;
      _greetReturn = greet;
      _farewell = farewell;
    });
  }

  int? _bookGeneration(Map<String, dynamic> book) {
    final generation = book['_db_generation'] as int?;
    return generation == UserDb.instance.generation ? generation : null;
  }

  /// Обновление главного экрана: синхронизация с сервером и свежий список книг.
  ///
  /// Потянуть список сверху — привычный жест, и до сих пор он ничего не делал:
  /// книга, добавленная в браузере, появлялась на телефоне только после
  /// перезапуска приложения. Гостю синхронизировать нечего — ему обновляется
  /// только список.
  Future<void> _refreshAll() async {
    if (_syncing) return;
    setState(() => _syncing = true);
    try {
      final auth = context.read<AuthService>();
      if (auth.isSignedIn) {
        final ok = await context.read<SyncService>().sync();
        if (!ok && mounted) {
          final message = context.read<SyncService>().message;
          _toast(message.isEmpty ? 'Синхронизация не удалась' : message);
        }
      }
      await _loadBooks(quiet: true);
      await _checkPhotoScan();
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  void _toast(String text) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _importFile() async {
    // withData только на вебе. Там пути к файлу нет вовсе, а на телефоне этот
    // флаг заставляет плагин положить файл в память ЦЕЛИКОМ — и вдобавок
    // сохранить копию в кеш. Для книги на несколько десятков мегабайт это два
    // одновременных снимка файла в памяти, и Android убивал приложение прямо
    // при выборе книги. С путём файл читается один раз и одним куском.
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: DocumentParser.supportedExtensions,
      withData: kIsWeb,
    );
    if (result == null || result.files.isEmpty) return;

    final file = result.files.first;
    if (kIsWeb) {
      final bytes = file.bytes;
      if (bytes == null) return;
      await _importBytes(file.name, file.name, bytes);
      return;
    }

    final path = file.path;
    if (path == null) {
      // Пути нет — остаётся то, что плагин успел прочитать сам.
      final bytes = file.bytes;
      if (bytes == null) return;
      await _importBytes(file.name, file.name, bytes);
      return;
    }
    await _importPath(file.name, path);
  }

  /// Импорт файла по пути: байты читаются здесь и живут в одном экземпляре.
  ///
  /// Через XFile, а не dart:io: этот же экран собирается для веба, где dart:io
  /// нет вовсе. XFile — та же обёртка, которой приходят файлы, брошенные в окно.
  Future<void> _importPath(String name, String path) async {
    final Uint8List bytes;
    try {
      bytes = await XFile(path).readAsBytes();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось прочитать файл: $e')));
      return;
    }
    await _importBytes(name, path, bytes);
  }

  /// Общий путь импорта: и выбор файла, и перетаскивание в окно.
  Future<void> _importBytes(String name, String path, Uint8List bytes) async {
    setState(() {
      _isLoading = true;
      _loadProgress = 0.0;
    });
    try {
      var paragraphs =
          await DocumentParser.parseAny(name, bytes, _onParseProgress);
      if (!mounted) return;

      // Язык определяется до сохранения. Спросить после — значит либо оставить
      // в библиотеке лишнюю книгу на чужом языке, либо удалять и создавать её
      // заново, меняя адрес содержимого и путая синхронизацию.
      //
      // Проверка местная, без сети: приложение обязано импортировать книгу
      // офлайн, и обращение к серверу здесь сделало бы импорт зависимым от
      // связи. Перевод сети требует, но его человек уже выбирает сам.
      if (!LanguageDetector.isLikelySerbian(paragraphs)) {
        final translated = await _offerTranslation(name, paragraphs);
        if (translated == null) {
          setState(() => _isLoading = false);
          return;
        }
        paragraphs = translated;
      }

      final id = await UserDb.instance.insertBook(name, path, paragraphs);
      _freshBookId = id;
      await _loadBooks();
      if (!mounted) return;
      lightHaptic();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Книга «$name» импортирована'),
          action: SnackBarAction(
            label: 'Открыть',
            onPressed: () => _openFreshBook(id),
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Ошибка импорта: $e')));
      }
    }
  }

  /// Файлы, брошенные в окно приложения.
  Future<void> _onFilesDropped(DropDoneDetails details) async {
    setState(() => _dragging = false);
    final files =
        details.files.where((f) => DocumentParser.isSupported(f.name)).toList();
    if (files.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Открываются файлы: '
            '${DocumentParser.supportedExtensions.join(', ')}'),
      ));
      return;
    }
    for (final file in files) {
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      await _importBytes(file.name, file.path, bytes);
    }
  }

  /// Спрашивает, что делать с документом не на сербском.
  ///
  /// Возвращает абзацы для сохранения либо null, если импорт отменён. Отказ
  /// перевода — не ошибка импорта: книга сохраняется как есть, и об этом
  /// говорит выбор «оставить как есть».
  Future<List<String>?> _offerTranslation(
    String name,
    List<String> paragraphs,
  ) async {
    final auth = context.read<AuthService>();
    final service = DocumentTranslationService(auth.api);

    final choice = await showImportLanguageDialog(
      context,
      title: name,
      signedIn: auth.isSignedIn,
      loadQuota: () async {
        try {
          return await service.quota();
        } on ApiException {
          return null;
        }
      },
    );
    if (choice == null) return null;
    if (choice == ImportChoice.original) return paragraphs;
    if (!mounted) return paragraphs;

    // Полоса хода живёт в отдельном диалоге и перерисовывается своим
    // состоянием: перерисовывать ради неё весь экран библиотеки незачем.
    final progress = ValueNotifier<(double, String)>((0, ''));
    unawaited(showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: ValueListenableBuilder<(double, String)>(
          valueListenable: progress,
          builder: (_, value, __) =>
              TranslationProgressDialog(ratio: value.$1, note: value.$2),
        ),
      ),
    ));

    try {
      return await service.translate(
        title: name,
        paragraphs: paragraphs,
        onProgress: (ratio, note) => progress.value = (ratio, note),
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Перевод не удался: ${e.message}')));
      }
      // Непереведённая книга всё же лучше, чем никакой: текст уже разобран, а
      // предел на сегодня израсходован в любом случае.
      return paragraphs;
    } finally {
      // Диалог закрывается ПЕРЕД освобождением: пока он на экране, его
      // ValueListenableBuilder слушает этот же notifier.
      if (mounted) Navigator.of(context, rootNavigator: true).pop();
      progress.dispose();
    }
  }

  void _showNonSerbianWarning() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Похоже, это не сербский'),
        content: const Text(
          'Текст не распознан как сербский язык. Приложение предназначено для чтения на сербском — разбор грамматики и словарные формы могут работать некорректно. Будет доступен только автоматический перевод.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Понятно'),
          ),
        ],
      ),
    );
  }

  Future<void> _loadTestStory(String assetPath, String title) async {
    setState(() {
      _isLoading = true;
      _loadProgress = 0.0;
    });
    try {
      final data = await rootBundle.load(assetPath);
      final bytes =
          data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
      final paragraphs = assetPath.endsWith('.pdf')
          ? await DocumentParser.parsePdfWithProgress(bytes, _onParseProgress)
          : await DocumentParser.parseDocxWithProgress(bytes, _onParseProgress);

      await UserDb.instance.insertBook(title, assetPath, paragraphs);
      await _loadBooks();

      if (mounted) {
        if (!LanguageDetector.isLikelySerbian(paragraphs)) {
          _showNonSerbianWarning();
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Ошибка загрузки теста: $e')));
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _deleteBook(Map<String, dynamic> book) async {
    final generation = _bookGeneration(book);
    if (generation == null) return;
    final id = book['id'] as int;
    final title = book['title'] as String;
    await UserDb.instance.deleteBook(id, expectedGeneration: generation);
    if (generation != UserDb.instance.generation) return;
    _loadBooks();
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Книга «$title» удалена')));
    }
  }

  /// Разбирает исходный файл книги заново.
  ///
  /// Нужно после правок разбора: текст уже добавленных книг лежит в базе и сам
  /// по себе не обновится.
  Future<void> _reparseBook(Map<String, dynamic> book) async {
    final generation = _bookGeneration(book);
    if (generation == null) return;
    final id = book['id'] as int;
    final title = book['title'] as String;
    final path = (book['filepath'] as String?) ?? '';
    if (!DocumentParser.isSupported(path)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Исходный файл книги неизвестен')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
      _loadProgress = 0.0;
    });
    try {
      final Uint8List bytes;
      if (path.startsWith('assets/')) {
        final data = await rootBundle.load(path);
        bytes = data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
      } else {
        final data = await readLocalFile(path);
        if (data == null) throw Exception('файл не найден: $path');
        bytes = data;
      }

      final paragraphs =
          await DocumentParser.parseAny(path, bytes, _onParseProgress);
      if (generation != UserDb.instance.generation) return;
      await UserDb.instance
          .replaceBookContent(id, paragraphs, expectedGeneration: generation);
      await _loadBooks();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Книга «$title» перечитана')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось перечитать: $e')),
        );
      }
    }
  }

  /// Открывает только что импортированную книгу из снекбара. Книга уже в
  /// списке (импорт её туда положил) — ищем по id, чтобы не грузить лишнего.
  void _openFreshBook(int id) {
    Map<String, dynamic>? found;
    for (final book in _books) {
      if (book['id'] == id) {
        found = book;
        break;
      }
    }
    if (found != null && mounted) _openBook(found);
  }

  Future<void> _openBook(Map<String, dynamic> book) async {
    _playInterfaceSound(InterfaceSound.openBook);
    final generation = _bookGeneration(book);
    if (generation == null) return;
    final id = book['id'] as int;
    _freshBookId = null;
    final title = book['title'] as String;
    final lastPara = book['last_para'] as int? ?? 0;
    // Текст книги грузим по требованию (в списке его нет — экономим память).
    var paragraphs = await UserDb.instance
        .getBookContent(id, expectedGeneration: generation);
    if (generation != UserDb.instance.generation) return;

    // Книга пришла с другого устройства: метаданные синхронизировались, а текст
    // весом в мегабайты качается только сейчас. Без этого читалка открывалась
    // пустой с «Нет текста для отображения».
    final textMissing = (book['text_missing'] as int? ?? 0) == 1;
    if ((paragraphs.isEmpty || textMissing) && mounted) {
      final downloaded = await _downloadBookText(id);
      if (generation != UserDb.instance.generation) return;
      if (textMissing && downloaded.isEmpty) return;
      paragraphs = downloaded;
    }
    if (!mounted) return;

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BookReaderScreen(
          bookId: id,
          title: title,
          paragraphs: paragraphs,
          initialParagraph: lastPara,
          contentSha: book['content_sha'] as String? ?? '',
          sourceKey: book['filepath'] as String? ?? '',
        ),
      ),
    ).then((_) => _loadBooks());
  }

  /// Качает текст книги с сервера и объясняет, если не вышло.
  Future<List<String>> _downloadBookText(int id) async {
    final auth = context.read<AuthService>();
    if (!auth.isSignedIn) {
      _snack('Текст этой книги остался на другом устройстве. '
          'Войдите в аккаунт, чтобы скачать её.');
      return const [];
    }

    setState(() => _isLoading = true);
    final ok = await context.read<SyncService>().downloadContent(id);
    if (!mounted) return const [];
    setState(() => _isLoading = false);

    if (!ok) {
      _snack('Не удалось скачать текст книги. Проверь интернет '
          'и синхронизацию.');
      return const [];
    }
    return UserDb.instance.getBookContent(id);
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  void _openAllCards() {
    _playInterfaceSound(InterfaceSound.dealCards);
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AllCardsScreen()),
    ).then((_) => _loadBooks());
  }

  void _toggleTheme() {
    final settings = context.read<AppSettings>();
    final next = settings.reader.themeMode == AppThemeMode.dark
        ? AppThemeMode.light
        : AppThemeMode.dark;
    settings.update(settings.reader.copyWith(themeMode: next));
  }

  Future<void> _applyReminder() async {
    final s = context.read<AppSettings>();
    if (s.notificationsEnabled) {
      await NotificationService.instance
          .scheduleDailyReminder(s.reminderHour, s.reminderMinute);
    } else {
      await NotificationService.instance.cancelAll();
    }
  }

  Future<void> _openReminderDialog() async {
    final settings = context.read<AppSettings>();
    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            final enabled = settings.notificationsEnabled;
            final time = TimeOfDay(
                hour: settings.reminderHour, minute: settings.reminderMinute);
            return AlertDialog(
              title: const Row(
                children: [
                  Text('🐺  ', style: TextStyle(fontSize: 20)),
                  Expanded(child: Text('Напоминания')),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (!NotificationService.instance.supported)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Text(
                        'Напоминания появятся в мобильной версии приложения. '
                        'Время можно настроить уже сейчас.',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Напоминать повторять слова'),
                    value: enabled,
                    onChanged: (v) async {
                      if (v) {
                        await NotificationService.instance.requestPermission();
                      }
                      await settings.setReminder(enabled: v);
                      await _applyReminder();
                      setLocal(() {});
                      setState(() {});
                    },
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    enabled: enabled,
                    leading: const Icon(Icons.schedule),
                    title: const Text('Время'),
                    trailing: Text(time.format(ctx),
                        style: const TextStyle(fontWeight: FontWeight.bold)),
                    onTap: enabled
                        ? () async {
                            final picked = await showTimePicker(
                                context: ctx, initialTime: time);
                            if (picked != null) {
                              await settings.setReminder(
                                  enabled: true,
                                  hour: picked.hour,
                                  minute: picked.minute);
                              await _applyReminder();
                              setLocal(() {});
                              setState(() {});
                            }
                          }
                        : null,
                  ),
                ],
              ),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Готово')),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final settings = context.watch<AppSettings>();
    final isDark = settings.reader.themeMode == AppThemeMode.dark;
    final screenWidth = MediaQuery.sizeOf(context).width;
    // Дополнительные разделы доступны из одного меню на любой ширине.
    const compactAppBar = true;
    final showActionLabels = screenWidth >= 1100;

    final scaffold = Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        toolbarHeight: 68,
        title: const Row(
          children: [
            // Сам Читавук, а не эмодзи чужого волка.
            Expanded(
              child: Text(
                'Библиотека',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                softWrap: false,
              ),
            ),
          ],
        ),
        actions: [
          RadioAppBarButton(showLabel: showActionLabels),
          IconButton(
            tooltip: 'Сменить тему',
            icon: Icon(
                isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
            onPressed: _toggleTheme,
          ),
          // Обновление есть и жестом, и кнопкой: на планшете с мышью тянуть
          // список неудобно, а на телефоне жест находят не все.
          IconButton(
            tooltip: context.watch<AuthService>().isSignedIn
                ? 'Обновить и синхронизировать'
                : 'Обновить список книг',
            onPressed: _syncing ? null : _refreshAll,
            icon: _syncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
          ),
          const ServerNotificationButton(),
          IconButton(
            tooltip: 'Ещё',
            icon: const Icon(Icons.grid_view_rounded),
            onPressed: () => _openMoreMenu(compactAppBar, isDark),
          ),
        ],
      ),
      body: Column(
        children: [
          // Один тонкий акцент на экран: дальше рабочие области спокойные.
          Divider(height: 1, thickness: 1, color: scheme.outlineVariant),
          const ServerAnnouncementBanner(),
          const _EventBanner(),
          Expanded(
            child: _isLoading
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CircularProgressIndicator(
                          value: _loadProgress > 0 ? _loadProgress : null,
                        ),
                        if (_loadProgress > 0) ...[
                          const SizedBox(height: 16),
                          Text(
                            'Импорт и разметка: ${(_loadProgress * 100).round()}%',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: scheme.primary,
                            ),
                          ),
                        ],
                      ],
                    ),
                  )
                : RefreshIndicator(
                    // Потянуть сверху — самый привычный способ сказать
                    // «проверь, нет ли нового». Работает и на пустой
                    // библиотеке: книги могли появиться на другом устройстве.
                    onRefresh: _refreshAll,
                    child: _books.isEmpty
                        ? _buildEmpty(scheme)
                        : _buildList(scheme),
                  ),
          ),
        ],
      ),
      floatingActionButton: _books.isEmpty ? null : _addButtons(scheme),
    );

    // Перетаскивание работает на десктопе; на мобильных и в вебе DropTarget
    // просто ничего не ловит, поэтому обёртку можно ставить безусловно.
    return DropTarget(
      onDragEntered: (_) => setState(() => _dragging = true),
      onDragExited: (_) => setState(() => _dragging = false),
      onDragDone: _onFilesDropped,
      child: Stack(
        children: [
          scaffold,
          if (_dragging) _dropOverlay(scheme),
        ],
      ),
    );
  }

  /// Одна точка входа «завести книгу»: файл и снимок — это два способа
  /// одного действия, а не две разные кнопки.
  ///
  /// Съёмка раньше была значком в шапке, между обновлением и «ещё», и там её
  /// не находили. Книгу заводят из этого угла — снимок такой же способ её
  /// завести, как и файл.
  Widget _addButtons(ColorScheme scheme) => FloatingActionButton.extended(
        heroTag: 'import',
        icon: const Icon(Icons.add),
        label: const Text('Добавить'),
        onPressed: () => _showAddSheet(),
      );

  /// Выбор способа добавления книги. Обе функции сохранены: импорт файла
  /// и распознавание со снимка (второе — только если сервер подтвердил,
  /// что распознавание включено, и только у вошедшего).
  Future<void> _showAddSheet() => showModalBottomSheet<void>(
        context: context,
        builder: (sheetContext) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.upload_file_outlined),
                title: const Text('Импорт файла'),
                subtitle: Text(DocumentParser.supportedExtensions
                    .join(' · ')
                    .toUpperCase()),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _importFile();
                },
              ),
              if (_photoScan)
                ListTile(
                  leading: const Icon(Icons.photo_camera_outlined),
                  title: Text(photoScanAction),
                  subtitle: const Text('Распознать текст со снимка'),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _scanPhoto();
                  },
                ),
            ],
          ),
        ),
      );

  Widget _dropOverlay(ColorScheme scheme) => Positioned.fill(
        child: IgnorePointer(
          child: Container(
            color: scheme.scrim.withValues(alpha: 0.45),
            alignment: Alignment.center,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 28),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: scheme.primary, width: 2),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.file_download_outlined,
                      size: 52, color: scheme.primary),
                  const SizedBox(height: 12),
                  Text('Отпустите файл — откроем книгу',
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 6),
                  Text(DocumentParser.supportedExtensions.join(' · '),
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ),
        ),
      );

  Widget _buildEmpty(ColorScheme scheme) {
    // Приветствие, кнопки и карточка библиотеки на невысоком телефоне в экран
    // не помещаются, а `Center` обрезает их сразу с двух сторон и прокрутить
    // нечего — снаружи это выглядит как «всё съехало и не листается».
    // Пока места хватает, содержимое остаётся по центру, как было.
    return LayoutBuilder(
      builder: (context, constraints) {
        final minHeight = constraints.maxHeight - 48;
        return SingleChildScrollView(
          // Тянуть можно и здесь: содержимое короче экрана, и без этой физики
          // жест «обновить» на пустой библиотеке не срабатывает вовсе.
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
          child: ConstrainedBox(
            constraints:
                BoxConstraints(minHeight: minHeight > 0 ? minHeight : 0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const WolfBubble(
                  title: 'Здраво!',
                  text:
                      'Я волк Читавук. Импортируй книгу (PDF/DOCX) или открой тестовую историю — и начнём читать по-сербски.',
                  asset: Wolf.zdravo,
                ),
                const SizedBox(height: 28),
                FadeSlideIn(
                  delay: const Duration(milliseconds: 260),
                  child: Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    alignment: WrapAlignment.center,
                    children: [
                      ElevatedButton.icon(
                        icon: const Icon(Icons.add),
                        label: const Text('Добавить книгу'),
                        onPressed: _showAddSheet,
                      ),
                      OutlinedButton.icon(
                        icon: const Icon(Icons.text_snippet_outlined),
                        label: const Text('Открыть рассказ'),
                        onPressed: () => _loadTestStory(
                            'assets/test_story.docx', 'Сербский рассказ'),
                      ),
                      OutlinedButton.icon(
                        icon: const Icon(Icons.picture_as_pdf_outlined),
                        label: const Text('Тот же рассказ в PDF'),
                        onPressed: () => _loadTestStory(
                            'assets/test_story.pdf', 'Сербский рассказ (PDF)'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 32),
                _buildFreeLibrary(scheme),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Приветствие и публичная библиотека едут вместе со списком, а не висят
  /// над ним: закреплёнными они забирали верхнюю треть экрана у книг, ради
  /// которых приложение и открывают.
  ///
  /// Приветствие компактное и ничего не повторяет: список недавних слов из
  /// него убран, а слова к повторению — отдельное понятное действие ниже.
  Widget _buildList(ColorScheme scheme) {
    final continueBook = _continueBook();
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final desktop = width >= 900;
        final horizontal =
            desktop ? ((width - 1320) / 2).clamp(24.0, 72.0) : 16.0;
        final groups = <String, List<Map<String, dynamic>>>{};
        for (final book in _books) {
          final folder = ((book['folder'] as String?) ?? '').trim();
          groups.putIfAbsent(folder, () => []).add(book);
        }
        final folderNames = groups.keys.toList()
          ..sort((a, b) {
            if (a.isEmpty) return 1;
            if (b.isEmpty) return -1;
            return a.toLowerCase().compareTo(b.toLowerCase());
          });
        final normalizedQuery = _bookQuery.trim().toLowerCase();
        final searching = normalizedQuery.isNotEmpty;
        final selectedBooks = searching
            ? _books
                .where((book) => (book['title']?.toString() ?? '')
                    .toLowerCase()
                    .contains(normalizedQuery))
                .toList()
            : _selectedFolder == null
                ? const <Map<String, dynamic>>[]
                : groups[_selectedFolder] ?? const <Map<String, dynamic>>[];
        final columns = width >= 1120 ? 3 : (width >= 680 ? 2 : 1);

        return CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: EdgeInsets.fromLTRB(horizontal, 20, horizontal, 0),
              sliver: SliverToBoxAdapter(
                child: _libraryHero(
                  scheme,
                  continueBook: continueBook,
                  desktop: desktop,
                ),
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(horizontal, 24, horizontal, 12),
              sliver: SliverToBoxAdapter(
                child: _libraryHeading(
                  scheme,
                  groups,
                  searching: searching,
                  resultCount: selectedBooks.length,
                ),
              ),
            ),
            if (_selectedFolder == null && !searching)
              SliverPadding(
                padding: EdgeInsets.fromLTRB(horizontal, 0, horizontal, 104),
                sliver: SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 16,
                    crossAxisSpacing: 16,
                    childAspectRatio: desktop ? 1.7 : 1.55,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final folder = folderNames[index];
                      return FadeSlideIn(
                        delay: Duration(milliseconds: 45 * index.clamp(0, 6)),
                        offsetY: 8,
                        child: _folderCard(scheme, folder, groups[folder]!),
                      );
                    },
                    childCount: folderNames.length,
                  ),
                ),
              )
            else
              SliverPadding(
                padding: EdgeInsets.fromLTRB(horizontal, 0, horizontal, 104),
                sliver: SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 16,
                    crossAxisSpacing: 16,
                    childAspectRatio: desktop ? 1.46 : 1.35,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final book = selectedBooks[index];
                      final card = _bookShelfCard(scheme, book);
                      return book['id'] == _freshBookId
                          ? FadeSlideIn(
                              duration: AppMotion.card,
                              offsetY: AppMotion.cardShift,
                              child: card,
                            )
                          : card;
                    },
                    childCount: selectedBooks.length,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _libraryHero(
    ColorScheme scheme, {
    required Map<String, dynamic>? continueBook,
    required bool desktop,
  }) {
    final primary = <Widget>[
      if (continueBook != null) _continueCard(scheme, continueBook),
      if (_seasonal != null)
        _seasonalCard(scheme, _seasonal!)
      else ...[
        if (_dueCount > 0)
          _greetReturn ? _greetingCard(scheme) : _reviewCard(scheme),
        if (_dueCount == 0 && _farewell) _farewellCard(scheme),
      ],
    ];
    return Column(
      children: [
        if (primary.isNotEmpty)
          desktop
              ? Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < primary.length; i++) ...[
                      if (i > 0) const SizedBox(width: 16),
                      Expanded(child: primary[i]),
                    ],
                  ],
                )
              : Column(
                  children: [
                    for (final item in primary) ...[
                      SizedBox(width: double.infinity, child: item),
                      const SizedBox(height: 12),
                    ],
                  ],
                ),
        if (_recentWords.isNotEmpty) ...[
          const SizedBox(height: 18),
          _recentDeck(scheme),
        ],
      ],
    );
  }

  Widget _recentDeck(ColorScheme scheme) {
    final visible = _recentWords.take(3).toList();
    return Semantics(
      button: true,
      label: 'Недавно сохранённые слова. Открыть словарь',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _openAllCards,
          borderRadius: BorderRadius.circular(24),
          child: Container(
            constraints: const BoxConstraints(minHeight: 154),
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
            decoration: BoxDecoration(
              color: scheme.secondaryContainer.withValues(alpha: 0.54),
              borderRadius: BorderRadius.circular(24),
              border:
                  Border.all(color: scheme.secondary.withValues(alpha: 0.18)),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 132,
                  height: 112,
                  // Без искр: колода — навигация, а не момент победы. Искры
                  // переигрывались при каждом ребилде главной и мигали зря.
                  child: Stack(
                    clipBehavior: Clip.none,
                    alignment: Alignment.center,
                    children: [
                      for (var i = visible.length - 1; i >= 0; i--)
                        Transform.translate(
                          offset: Offset(i * 10 - 10, i * 4),
                          child: Transform.rotate(
                            angle: (i - 1) * 0.055,
                            child: Container(
                              width: 92,
                              height: 104,
                              padding: const EdgeInsets.all(10),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: i == 0
                                    ? scheme.surfaceContainerLowest
                                    : scheme.surfaceContainerLow,
                                borderRadius: BorderRadius.circular(15),
                                border:
                                    Border.all(color: scheme.outlineVariant),
                                boxShadow: [
                                  BoxShadow(
                                    color: scheme.shadow.withValues(alpha: .10),
                                    blurRadius: 10,
                                    offset: const Offset(0, 5),
                                  ),
                                ],
                              ),
                              child: Text(
                                visible[i]['word']?.toString() ?? '',
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800, fontSize: 14),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Твоя свежая колода',
                          style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 6),
                      Text(
                        visible.map((row) {
                          final word = row['word']?.toString() ?? '';
                          final translation =
                              row['translation']?.toString().trim() ?? '';
                          return translation.isEmpty
                              ? word
                              : '$word — $translation';
                        }).join('  ·  '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          height: 1.4,
                          color: scheme.onSecondaryContainer,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('Открыть словарь  →',
                          style: TextStyle(
                              color: scheme.secondary,
                              fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _libraryHeading(
    ColorScheme scheme,
    Map<String, List<Map<String, dynamic>>> groups, {
    required bool searching,
    required int resultCount,
  }) {
    final compact = MediaQuery.sizeOf(context).width < 600;
    final count = groups[_selectedFolder]?.length ?? 0;
    final title = searching
        ? 'Результаты поиска'
        : _selectedFolder == null
            ? 'Твоя библиотека'
            : _folderTitle(_selectedFolder!);
    final subtitle = searching
        ? '$resultCount ${_bookCountWord(resultCount)}'
        : _selectedFolder == null
            ? '${groups.length} коллекций · ${_books.length} книг'
            : '$count ${_bookCountWord(count)}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (_selectedFolder != null && !searching) ...[
              IconButton(
                tooltip: 'К папкам',
                onPressed: () => setState(() => _selectedFolder = null),
                icon: const Icon(Icons.arrow_back),
              ),
              const SizedBox(width: 4),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.headlineSmall),
                  Text(subtitle,
                      style: TextStyle(color: scheme.onSurfaceVariant)),
                ],
              ),
            ),
            if (_selectedFolder == null && !searching)
              compact
                  ? IconButton(
                      tooltip: 'Публичная библиотека',
                      onPressed: _openPublicLibrary,
                      icon: const Icon(Icons.local_library_outlined),
                    )
                  : TextButton.icon(
                      onPressed: _openPublicLibrary,
                      icon: const Icon(Icons.local_library_outlined),
                      label: const Text('Публичная библиотека'),
                    ),
          ],
        ),
        const SizedBox(height: 14),
        SearchBar(
          controller: _bookSearchController,
          hintText: 'Найти книгу во всех папках',
          leading: const Icon(Icons.search),
          trailing: [
            if (_bookQuery.isNotEmpty)
              IconButton(
                tooltip: 'Очистить поиск',
                onPressed: () {
                  _bookSearchController.clear();
                  setState(() => _bookQuery = '');
                },
                icon: const Icon(Icons.close),
              ),
          ],
          onChanged: (value) => setState(() => _bookQuery = value),
        ),
      ],
    );
  }

  void _openPublicLibrary() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const PublicLibraryScreen()),
    ).then((_) => _loadBooks());
  }

  String _folderTitle(String folder) => folder.isEmpty ? 'Без папки' : folder;

  String _bookCountWord(int count) {
    final mod100 = count % 100;
    final mod10 = count % 10;
    if (mod100 >= 11 && mod100 <= 14) return 'книг';
    if (mod10 == 1) return 'книга';
    if (mod10 >= 2 && mod10 <= 4) return 'книги';
    return 'книг';
  }

  Widget _folderCard(
      ColorScheme scheme, String folder, List<Map<String, dynamic>> books) {
    final previews = books.take(4).toList();
    return Material(
      color: scheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(22),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          _playInterfaceSound(InterfaceSound.openCollection);
          setState(() => _selectedFolder = folder);
        },
        child: Container(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Align(
                  alignment: Alignment.bottomLeft,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (var i = 0; i < previews.length; i++)
                        Expanded(
                          child: Container(
                            height: 55.0 + (i % 3) * 11,
                            margin: EdgeInsets.only(right: i == 3 ? 0 : 5),
                            decoration: BoxDecoration(
                              color: _bookColor(
                                  previews[i]['title']?.toString() ?? '',
                                  scheme),
                              borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(5)),
                              border: Border.all(
                                  color: scheme.surfaceContainerLowest,
                                  width: 1.5),
                            ),
                          ),
                        ),
                      if (previews.isEmpty)
                        Icon(Icons.auto_stories_outlined,
                            size: 54, color: scheme.primary),
                    ],
                  ),
                ),
              ),
              Container(height: 7, color: scheme.primaryContainer),
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(Icons.folder_open_rounded,
                      size: 20, color: scheme.secondary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(_folderTitle(folder),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 17)),
                  ),
                  Text('${books.length}',
                      style: TextStyle(color: scheme.onSurfaceVariant)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _bookColor(String title, ColorScheme scheme) {
    const colors = [
      SerbColors.serbRed,
      SerbColors.indigo,
      Color(0xFF8B5E3C),
      Color(0xFF5E7048),
      Color(0xFF7A4054),
    ];
    final hash = title.runes.fold<int>(0, (value, rune) => value * 31 + rune);
    final base = colors[hash.abs() % colors.length];
    return scheme.brightness == Brightness.dark
        ? Color.lerp(base, Colors.white, .12)!
        : base;
  }

  Widget _bookShelfCard(ColorScheme scheme, Map<String, dynamic> book) {
    final title = book['title']?.toString() ?? 'Без названия';
    final lastPara = book['last_para'] as int? ?? 0;
    final paraCount = book['para_count'] as int? ?? 0;
    final progress = paraCount <= 0 ? 0.0 : (lastPara + 1) / paraCount;
    return Material(
      color: scheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(22),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _openBook(book),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Row(
            children: [
              Container(
                width: 96,
                margin: const EdgeInsets.all(14),
                padding: const EdgeInsets.fromLTRB(10, 14, 10, 12),
                decoration: BoxDecoration(
                  color: _bookColor(title, scheme),
                  borderRadius: const BorderRadius.only(
                    topRight: Radius.circular(10),
                    bottomRight: Radius.circular(10),
                    topLeft: Radius.circular(3),
                    bottomLeft: Radius.circular(3),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: scheme.shadow.withValues(alpha: .18),
                      blurRadius: 9,
                      offset: const Offset(4, 5),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      height: 3,
                      color: Colors.white.withValues(alpha: .55),
                    ),
                    Text(
                      title.replaceAll(RegExp(r'\.[^.]+$'), ''),
                      textAlign: TextAlign.center,
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        height: 1.2,
                      ),
                    ),
                    Icon(Icons.menu_book_rounded,
                        color: Colors.white.withValues(alpha: .78), size: 20),
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(0, 16, 4, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800, fontSize: 16)),
                          ),
                          _bookMenu(book),
                        ],
                      ),
                      const Spacer(),
                      Text(
                        paraCount <= 0
                            ? 'Текст ещё загружается'
                            : '${(progress * 100).round()}% · стр. ${lastPara + 1} из $paraCount',
                        style: TextStyle(
                            fontSize: 12, color: scheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: progress,
                          minHeight: 6,
                          backgroundColor:
                              scheme.primary.withValues(alpha: .12),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text('Открыть книгу  →',
                          style: TextStyle(
                              color: scheme.primary,
                              fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _bookMenu(Map<String, dynamic> book) => PopupMenuButton<String>(
        tooltip: 'Действия с книгой',
        onSelected: (value) {
          if (value == 'rename') _renameBook(book);
          if (value == 'move') _moveBook(book);
          if (value == 'reparse') _reparseBook(book);
          if (value == 'delete') _deleteBook(book);
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'rename', child: Text('Переименовать')),
          PopupMenuItem(value: 'move', child: Text('В папку…')),
          PopupMenuItem(value: 'reparse', child: Text('Перечитать файл')),
          PopupMenuItem(value: 'delete', child: Text('Удалить')),
        ],
      );

  /// Слова к повторению — отдельное действие, а не строка внутри приветствия.
  Widget _reviewCard(ColorScheme scheme) => Card(
        child: ListTile(
          leading: Icon(Icons.history_edu_outlined, color: scheme.primary),
          title: Text('К повторению: $_dueCount'),
          subtitle: const Text('Слова ждут своей очереди'),
          trailing: const Icon(Icons.chevron_right),
          onTap: _openAllCards,
        ),
      );

  /// Волк встречает после перерыва — вместо немой витрины повторения.
  /// Встреча одноразовая: прыжок при появлении, дальше волк стоит спокойно
  /// (см. `greet` в WolfBubble), а следующий визит без перерыва снова немой.
  Widget _greetingCard(ColorScheme scheme) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Слова заждались',
                style: text.labelSmall?.copyWith(color: scheme.secondary)),
            const SizedBox(height: 6),
            const WolfBubble(
              title: 'С возвращением!',
              text: 'Заглядывал без тебя в словарь — повторим?',
              asset: Wolf.zdravo,
              wolfSize: WolfSize.compact,
              greet: true,
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.tonalIcon(
                onPressed: _openAllCards,
                icon: const Icon(Icons.history_edu_outlined),
                label: Text('К повторению: $_dueCount'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Вечернее прощание: повторять нечего, волк идёт читать, а человек —
  /// отдыхать. Без кнопок и без прыжков: ночь — время спокойствия.
  /// Показывается раз в сутки, только вечером (см. markFarewell).
  Widget _farewellCard(ColorScheme scheme) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Вечер',
                style: text.labelSmall?.copyWith(color: scheme.secondary)),
            const SizedBox(height: 6),
            const WolfBubble(
              title: 'На сегодня всё!',
              text: 'Повторять нечего — я почитаю, а ты отдыхай. '
                  'Новые слова подойдут к утру.',
              asset: Wolf.cita,
              wolfSize: WolfSize.compact,
              animate: false,
            ),
          ],
        ),
      ),
    );
  }

  /// Сезонное приветствие: праздник или 1-е число. Встречает прыжком
  /// (редкий повод — можно), а при долгах рядом кладёт и кнопку повторения,
  /// чтобы праздник не отменял учёбу.
  Widget _seasonalCard(ColorScheme scheme, SeasonalGreeting greeting) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(greeting.tag,
                style: text.labelSmall?.copyWith(color: scheme.secondary)),
            const SizedBox(height: 6),
            WolfBubble(
              title: greeting.title,
              text: greeting.text,
              asset: greeting.asset,
              wolfSize: WolfSize.compact,
              greet: true,
            ),
            if (_dueCount > 0) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.tonalIcon(
                  onPressed: _openAllCards,
                  icon: const Icon(Icons.history_edu_outlined),
                  label: Text('К повторению: $_dueCount'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Книга, которую читают сейчас: начата, но не дочитана. Список идёт от
  /// новых к старым — первая подходящая и есть текущая.
  Map<String, dynamic>? _continueBook() {
    for (final book in _books) {
      final last = book['last_para'] as int? ?? 0;
      final total = book['para_count'] as int? ?? 0;
      if (last <= 0) continue;
      if (total > 0 && last + 1 >= total) continue;
      return book;
    }
    return null;
  }

  /// Витрина «Продолжить»: нейтральная карточка (песочной плашки больше нет —
  /// большая розовая заливка читалась как ошибка), название, прогресс
  /// и компактная кнопка «Читать». Слова к повторению живут отдельно,
  /// в [_reviewCard].
  Widget _continueCard(ColorScheme scheme, Map<String, dynamic> book) {
    final title = book['title'] as String;
    final lastPara = book['last_para'] as int? ?? 0;
    final paraCount = book['para_count'] as int? ?? 0;
    final progress =
        paraCount <= 0 ? 0 : ((lastPara + 1) / paraCount * 100).round();
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Продолжить чтение',
                style: text.labelSmall?.copyWith(color: scheme.secondary)),
            const SizedBox(height: 2),
            Text(title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: text.titleMedium),
            const SizedBox(height: 4),
            Text('Прочитано $progress% · стр. ${lastPara + 1} из $paraCount',
                style: text.bodySmall),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: paraCount <= 0 ? 0 : (lastPara + 1) / paraCount,
                minHeight: 5,
              ),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.icon(
                onPressed: () => _openBook(book),
                icon: const Icon(Icons.play_arrow),
                label: const Text('Читать'),
                style: FilledButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFreeLibrary(ColorScheme scheme) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: _freeLibraryCard(scheme),
      );

  Widget _freeLibraryCard(ColorScheme scheme) {
    return Card(
      child: ListTile(
        leading:
            Icon(Icons.local_library_outlined, color: scheme.primary, size: 34),
        title: const Text(
          'Публичная библиотека',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: const Text(
          'Классика и фольклор в общественном достоянии',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const PublicLibraryScreen()),
        ).then((_) => _loadBooks()),
      ),
    );
  }

  Future<void> _renameBook(Map<String, dynamic> book) async {
    final generation = _bookGeneration(book);
    if (generation == null) return;
    final controller = TextEditingController(text: book['title'] as String);
    final newTitle = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Переименовать'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Название книги'),
          onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Отмена')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, controller.text.trim()),
              child: const Text('Сохранить')),
        ],
      ),
    );
    if (newTitle != null && newTitle.isNotEmpty) {
      if (generation != UserDb.instance.generation) return;
      await UserDb.instance.renameBook(book['id'] as int, newTitle,
          expectedGeneration: generation);
      _loadBooks();
    }
  }

  Future<void> _moveBook(Map<String, dynamic> book) async {
    final generation = _bookGeneration(book);
    if (generation == null) return;
    final current = ((book['folder'] as String?) ?? '').trim();
    final folders = _books
        .map((b) => ((b['folder'] as String?) ?? '').trim())
        .where((f) => f.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    final controller = TextEditingController();
    var selected = current;

    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('В папку'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                children: [
                  ChoiceChip(
                    label: const Text('Без папки'),
                    selected: selected.isEmpty,
                    onSelected: (_) => setLocal(() => selected = ''),
                  ),
                  ...folders.map((f) => ChoiceChip(
                        label: Text(f),
                        selected: selected == f,
                        onSelected: (_) => setLocal(() => selected = f),
                      )),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                decoration: const InputDecoration(
                    labelText: 'Новая папка', isDense: true),
                onChanged: (_) => setLocal(() {}),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Отмена')),
            TextButton(
              onPressed: () {
                final typed = controller.text.trim();
                Navigator.pop(ctx, typed.isNotEmpty ? typed : selected);
              },
              child: const Text('Сохранить'),
            ),
          ],
        ),
      ),
    );
    if (result != null) {
      if (generation != UserDb.instance.generation) return;
      await UserDb.instance.setBookFolder(book['id'] as int, result,
          expectedGeneration: generation);
      _loadBooks();
    }
  }

  /// Справочник грамматических правил. Сам курс живёт в отдельной вкладке
  /// нижней навигации (master-prompt §26).
  /// Меню «ещё»: разделы вместо плоского списка из четырнадцати строк.
  ///
  /// Часть пунктов дублирует кнопки верхней панели и показывается только там,
  /// где панель узкая и этих кнопок нет, — иначе одно и то же действие
  /// предлагается дважды на одном экране.
  void _openMoreMenu(bool compactAppBar, bool isDark) {
    final signedIn = context.read<AuthService>().isSignedIn;

    void open(Widget screen) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    }

    showMoreMenu(context, [
      MoreMenuSection('ЧИТАТЬ', [
        if (compactAppBar) ...[
          MoreMenuItem(
            label: 'Публичная библиотека',
            icon: Icons.local_library_outlined,
            onTap: () => open(const PublicLibraryScreen()),
          ),
          MoreMenuItem(
            label: 'Новости',
            icon: Icons.newspaper_outlined,
            onTap: () => open(const NewsScreen()),
          ),
          MoreMenuItem(
            label: 'Материалы',
            icon: Icons.assignment_outlined,
            onTap: () => open(const MaterialsScreen()),
          ),
        ],
        MoreMenuItem(
          label: 'Видео с субтитрами',
          note: 'Откроется в браузере',
          icon: Icons.smart_display_outlined,
          onTap: _openVideoSite,
        ),
      ]),
      MoreMenuSection('УЧИТЬСЯ', [
        if (signedIn)
          MoreMenuItem(
              label: 'Урок дня',
              note: 'Твоя персональная колода',
              icon: Icons.style_outlined,
              onTap: () => open(const PersonalLessonsScreen())),
        // Окно приходит само раз в день, но вернуться к сегодняшним словам
        // человек может в любой момент — доучить или перечитать текст.
        if (signedIn)
          MoreMenuItem(
            label: 'Слова дня',
            note: 'Десять слов и текст с ними',
            icon: Icons.auto_awesome_outlined,
            onTap: () => showDailyWindow(
              context,
              context.read<DailyService>(),
              sync: context.read<SyncService>(),
            ),
          ),
        if (compactAppBar)
          MoreMenuItem(
            label: 'Справочник правил',
            icon: Icons.school_outlined,
            onTap: _openGrammarReference,
          ),
        MoreMenuItem(
          label: 'Уроки преподавателей',
          icon: Icons.cast_for_education_outlined,
          onTap: () => open(const CommunityLessonsScreen()),
        ),
        MoreMenuItem(
          label: 'Дворец памяти',
          icon: Icons.castle_outlined,
          onTap: () => open(const PalaceScreen()),
        ),
        MoreMenuItem(
          label: 'Путешествие',
          note: 'Слова по местам города',
          icon: Icons.map_outlined,
          onTap: () => open(const TravelScreen()),
        ),
        // Динары считает сервер по занятиям, поэтому сад есть только у
        // вошедшего: гостю показывать нечего.
        if (signedIn)
          MoreMenuItem(
            label: 'Сад Читавука',
            note: 'Цветы за занятия',
            icon: Icons.local_florist_outlined,
            onTap: () => open(const GardenScreen()),
          ),
        MoreMenuItem(
          label: 'Все слова и карточки',
          icon: Icons.style_outlined,
          onTap: _openAllCards,
        ),
      ]),
      MoreMenuSection('КАРТОЧКИ', [
        MoreMenuItem(
          label: 'Импорт (.md)',
          icon: Icons.download_outlined,
          onTap: _importCards,
        ),
        MoreMenuItem(
          label: 'Экспорт всех',
          icon: Icons.upload_file_outlined,
          onTap: _exportAllCards,
        ),
      ]),
      MoreMenuSection('ПРИЛОЖЕНИЕ', [
        MoreMenuItem(
          label: context.read<AppSettings>().interfaceSoundEnabled
              ? 'Выключить звуки интерфейса'
              : 'Включить звуки интерфейса',
          icon: Icons.volume_up_outlined,
          onTap: () {
            final settings = context.read<AppSettings>();
            final enabled = !settings.interfaceSoundEnabled;
            InterfaceSounds.instance.enabled = enabled;
            unawaited(settings.setInterfaceSoundEnabled(enabled));
          },
        ),
        MoreMenuItem(
          label: signedIn ? 'Аккаунт' : 'Войти',
          note: signedIn ? 'и синхронизация' : null,
          icon: signedIn ? Icons.cloud_done_outlined : Icons.login,
          onTap: () => open(const AccountScreen()),
        ),
        if (compactAppBar) ...[
          if (NotificationService.instance.supported)
            MoreMenuItem(
              label: 'Напоминания',
              icon: NotificationService.instance.supported &&
                      context.read<AppSettings>().notificationsEnabled
                  ? Icons.notifications_active
                  : Icons.notifications_none,
              onTap: _openReminderDialog,
            ),
          MoreMenuItem(
            label: isDark ? 'Светлая тема' : 'Тёмная тема',
            icon: isDark ? Icons.light_mode : Icons.dark_mode,
            onTap: _toggleTheme,
          ),
        ],
        MoreMenuItem(
          label: 'Сервер и словарь',
          icon: Icons.cloud_outlined,
          onTap: _openServerSettings,
        ),
        MoreMenuItem(
          label: 'Обновить',
          note: signedIn ? 'и синхронизировать' : null,
          icon: Icons.refresh,
          onTap: _refreshAll,
        ),
        MoreMenuItem(
          label: 'О приложении',
          icon: Icons.info_outline,
          onTap: () => open(const AboutScreen()),
        ),
      ]),
    ]);
  }

  void _openGrammarReference() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const GrammarCardsScreen()),
    );
  }

  void _playInterfaceSound(InterfaceSound sound) {
    InterfaceSounds.instance.enabled =
        context.read<AppSettings>().interfaceSoundEnabled;
    unawaited(InterfaceSounds.instance.play(sound));
  }

  void _openServerSettings() {
    showServerSettings(context);
  }

  /// Видео с сербскими субтитрами живут на отдельном сайте, поэтому открываются
  /// в браузере, а не внутри приложения.
  Future<void> _openVideoSite() async {
    const url = 'https://serbiansubtitles.online/';
    final opened = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось открыть $url')),
      );
    }
  }

  Future<void> _exportAllCards() async {
    try {
      final vocab = await UserDb.instance.getAllVocabulary();
      if (!mounted) return;
      if (vocab.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Пока нет слов для экспорта — добавь их из книги')));
        return;
      }
      final path = await CardsIo.export(vocab: vocab, source: 'все книги');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            path == null ? 'Экспорт отменён' : 'Все карточки сохранены: $path'),
      ));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Ошибка экспорта: $e')));
      }
    }
  }

  Future<void> _importCards() async {
    try {
      final bookId =
          await UserDb.instance.ensureBook('📋 Импортированные карточки');
      final r = await CardsIo.import(bookId: bookId);
      if (!mounted) return;
      if (r == null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Импорт отменён')));
        return;
      }
      await _loadBooks();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(r.found == 0
            ? 'В файле не нашлось карточек'
            : 'Импортировано: ${r.added} новых из ${r.found}. '
                'Ищи их в книге «Импортированные карточки».'),
      ));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Ошибка импорта: $e')));
      }
    }
  }
}

/// Баннер временного события над списком книг.
///
/// Событие ограничено по времени, поэтому баннер сам исчезает после окончания
/// окна: постоянного места в навигации ради месяца жизни он не занимает.
class _EventBanner extends StatelessWidget {
  const _EventBanner();

  @override
  Widget build(BuildContext context) {
    if (!odysseyAvailable()) return const SizedBox.shrink();

    final events = context.watch<EventsController>();
    final signedIn = context.watch<AuthService>().isSignedIn;
    final progress = events.odyssey;
    final percent = (progress.fraction * 100).round();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppTheme.radiusCard),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const EventsScreen()),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.radiusCard),
          child: Stack(
            children: [
              Positioned.fill(
                child: Image.asset(
                  OdysseyContent.coverAsset,
                  fit: BoxFit.cover,
                  color: Colors.black.withValues(alpha: 0.5),
                  colorBlendMode: BlendMode.darken,
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'СОБЫТИЕ · ДО 1 СЕНТЯБРЯ',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1,
                              color: Color(0xFFF2CA81),
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Одиссея',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            !signedIn
                                ? 'Войдите, чтобы участвовать'
                                : progress.rewardUnlocked
                                    ? 'Награда получена — можно перечитать'
                                    : percent > 0
                                        ? 'Пройдено $percent% · 24 песни'
                                        : '24 песни на сербской кириллице',
                            style: const TextStyle(
                                fontSize: 12.5, color: Color(0xFFE7DDCB)),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: Colors.white70),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
