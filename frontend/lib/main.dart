import 'dart:async';

import 'package:cross_file/cross_file.dart';
import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'events/events_controller.dart';
import 'events/odyssey.dart';
import 'events/odyssey_content.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/db_init.dart';
import 'services/sync_service.dart';
import 'course/services/course_progress_store.dart';
import 'course/services/course_content_loader.dart';
import 'services/user_db.dart';
import 'screens/account_screen.dart';
import 'services/card_io.dart';
import 'services/analysis_repository.dart';
import 'services/announcements_controller.dart';
import 'services/daily_service.dart';
import 'services/document_parser.dart';
import 'services/document_translation_service.dart';
import 'services/local_file.dart';
import 'services/listening_service.dart';
import 'services/level_service.dart';
import 'services/roadmap_service.dart';
import 'services/profile_service.dart';
import 'services/notification_service.dart';
import 'widgets/update_dialog.dart';
import 'screens/onboarding_screen.dart';
import 'screens/all_cards_screen.dart';
import 'screens/book_reader_screen.dart';
import 'screens/grammar_cards_screen.dart';
import 'screens/home_shell.dart';
import 'screens/events_screen.dart';
import 'screens/materials_screen.dart';
import 'screens/news_screen.dart';
import 'screens/public_library_screen.dart';
import 'screens/community_lessons_screen.dart';
import 'screens/about_screen.dart';
import 'models/reader_settings.dart';
import 'state/app_settings.dart';
import 'theme/app_theme.dart';
import 'widgets/animated_widgets.dart';
import 'widgets/server_announcements.dart';
import 'widgets/import_language_dialog.dart';
import 'screens/palace_screen.dart';
import 'travel/travel_screen.dart';
import 'screens/daily_window.dart';
import 'screens/garden_screen.dart';
import 'widgets/more_menu_sheet.dart';
import 'widgets/radio_sheet.dart';
import 'widgets/serbian_ornament.dart';
import 'widgets/server_settings_sheet.dart';
import 'widgets/wolf_mascot.dart';
import 'utils/language_detector.dart';
import 'utils/short_text.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Контент под системными панелями: на Android иначе остаётся серая полоса
  // навигации, из-за которой приложение выглядит старым.
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  // Кросс-платформенная инициализация БД (десктоп — ffi, веб — wasm/IndexedDB,
  // мобильные — штатная фабрика).
  initDatabaseFactory();

  final settings = AppSettings();
  await settings.load();

  // Сервер разбора/перевода — из настроек (по умолчанию публичный HF Space).
  AnalysisRepository.baseUrl = settings.backendUrl;
  AnalysisRepository.translationUrl = settings.syncUrl;
  await ListeningService.instance.loadPreferences();

  // Аккаунт и синхронизация. Сессия восстанавливается из локального хранилища
  // без обращения к сети: приложение обязано открываться офлайн.
  final api = ApiClient(baseUrl: settings.syncUrl);
  final auth = AuthService(api: api);
  await auth.load();
  CourseProgressStore.configure(api: api, auth: auth);
  CourseContentLoader.configure(api: api);
  final sync = SyncService(api: api, auth: auth);
  final events = EventsController(api: api, auth: auth);
  final announcements = AnnouncementsController(api: api, auth: auth);
  // Локальный прогресс события нужен ещё до сети: от него зависит, показывать
  // ли награду-фон в настройках чтения.
  unawaited(events.refresh());
  unawaited(announcements.refresh().catchError(
        (Object error) => debugPrint('announcements: $error'),
      ));

  await NotificationService.instance.init();
  if (settings.notificationsEnabled) {
    await NotificationService.instance
        .scheduleDailyReminder(settings.reminderHour, settings.reminderMinute);
  }

  // Первая синхронизация запускается фоном и не задерживает запуск.
  if (auth.isSignedIn) {
    unawaited(sync.sync().catchError((_) => false));
  }

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: settings),
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: sync),
        ChangeNotifierProvider.value(value: events),
        ChangeNotifierProvider.value(value: announcements),
        // Клиент нужен экранам, которые ходят на сервер напрямую (например,
        // загрузка материалов через прокси документов), а не только через
        // синхронизацию.
        Provider<ApiClient>.value(value: api),
        // Уровень сербского и оценка сложности текста. Живут на аккаунте, а
        // не в разделе: спросили один раз — знают везде.
        Provider<LevelService>.value(value: LevelService(api: api)),
        // Дорожная карта: что учить на каждом уровне и как далеко человек
        // продвинулся. Карта открыта и гостю — вход нужен только для отметок.
        Provider<RoadmapService>.value(value: RoadmapService(api: api)),
        Provider<ProfileService>.value(value: ProfileService(api: api)),
        // Слова дня: набор собирает сервер и хранит сутки, поэтому окно,
        // сайт и виджет на рабочем столе показывают одно и то же.
        Provider<DailyService>.value(value: DailyService(api: api)),
      ],
      child: const ChitavukApp(),
    ),
  );
}

class ChitavukApp extends StatelessWidget {
  const ChitavukApp({super.key});

  @override
  Widget build(BuildContext context) {
    final themeMode = context.watch<AppSettings>().reader.themeMode;
    return MaterialApp(
      title: 'Читавук',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode.material,
      home: const HomeShell(reading: DashboardScreen()),
    );
  }
}

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<Map<String, dynamic>> _books = [];
  List<String> _recentWords = [];
  bool _isLoading = true;
  double _loadProgress = 0.0;

  /// Над окном держат файл — показываем, куда его можно бросить.
  bool _dragging = false;

  @override
  void initState() {
    super.initState();
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
    });
  }

  /// Первый запуск: показываем знакомство и, если человек выбрал аккаунт,
  /// сразу открываем вход — иначе про синхронизацию он узнаёт случайно.
  Future<void> _runFirstLaunch() async {
    final choice = await showOnboarding(context);
    if (!mounted || choice != OnboardingChoice.account) return;
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AccountScreen()),
    );
  }

  Future<void> _initAndLoad() async {
    try {
      await UserDb.instance.database;
      await _loadBooks();
    } catch (e) {
      // Без catch ошибка открытия БД оставляла вечный спиннер на главной.
      if (!mounted) return;
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

  Future<void> _loadBooks() async {
    setState(() => _isLoading = true);
    final booksList = await UserDb.instance.getBooks();
    // Берём с запасом: в словарь попадают и выделенные фразы, а в приветствие
    // идут только одиночные слова — обрывки «- Molim…» читаются как сбой.
    final recent = await UserDb.instance.getRecentWords(12);
    setState(() {
      _books = booksList;
      _recentWords = recent.where(isSingleWord).take(4).toList();
      _isLoading = false;
    });
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

      await UserDb.instance.insertBook(name, path, paragraphs);
      await _loadBooks();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Книга «$name» импортирована')),
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

  Future<void> _deleteBook(int id, String title) async {
    await UserDb.instance.deleteBook(id);
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
      await UserDb.instance.replaceBookContent(id, paragraphs);
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

  Future<void> _openBook(Map<String, dynamic> book) async {
    final id = book['id'] as int;
    final title = book['title'] as String;
    final lastPara = book['last_para'] as int? ?? 0;
    // Текст книги грузим по требованию (в списке его нет — экономим память).
    var paragraphs = await UserDb.instance.getBookContent(id);

    // Книга пришла с другого устройства: метаданные синхронизировались, а текст
    // весом в мегабайты качается только сейчас. Без этого читалка открывалась
    // пустой с «Нет текста для отображения».
    if (paragraphs.isEmpty && mounted) {
      paragraphs = await _downloadBookText(id);
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
    final compactAppBar = screenWidth < 600;
    final showActionLabels = screenWidth >= 920;

    final scaffold = Scaffold(
      appBar: AppBar(
        titleSpacing: 8,
        title: const Row(
          children: [
            // Сам Читавук, а не эмодзи чужого волка.
            _AppLogo(),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'Читавук',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                softWrap: false,
              ),
            ),
          ],
        ),
        actions: [
          RadioAppBarButton(showLabel: showActionLabels),
          if (!compactAppBar)
            _DashboardAction(
              showLabel: showActionLabels,
              label: 'Новости',
              tooltip: 'Новости на сербском',
              icon: Icons.newspaper_outlined,
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const NewsScreen()),
              ),
            ),
          if (!compactAppBar)
            _DashboardAction(
              showLabel: showActionLabels,
              label: 'Уроки',
              tooltip: 'Уроки преподавателей',
              icon: Icons.cast_for_education_outlined,
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => const CommunityLessonsScreen()),
              ),
            ),
          if (!compactAppBar)
            _DashboardAction(
              showLabel: showActionLabels,
              label: 'Публичная',
              tooltip: 'Публичная библиотека',
              icon: Icons.local_library_outlined,
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const PublicLibraryScreen()),
              ),
            ),
          // «Слушание» и «Курс сербского» живут в нижней навигации, поэтому
          // в верхней панели их больше нет.
          if (!compactAppBar) ...[
            _DashboardAction(
              showLabel: showActionLabels,
              label: 'Материалы',
              tooltip: 'Материалы для поступления',
              icon: Icons.assignment_outlined,
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const MaterialsScreen()),
              ),
            ),
            _DashboardAction(
              showLabel: showActionLabels,
              label: 'Справочник',
              tooltip: 'Справочник грамматических правил',
              icon: Icons.school_outlined,
              onPressed: _openGrammarReference,
            ),
            // Напоминания показываются только там, где они действительно
            // работают: на десктопе плагин уведомлений отключён.
            if (NotificationService.instance.supported)
              IconButton(
                tooltip: 'Напоминания о повторении',
                icon: Icon(settings.notificationsEnabled
                    ? Icons.notifications_active
                    : Icons.notifications_none),
                onPressed: _openReminderDialog,
              ),
            IconButton(
              tooltip: 'Сменить тему',
              icon: Icon(isDark ? Icons.light_mode : Icons.dark_mode),
              onPressed: _toggleTheme,
            ),
          ],
          const ServerNotificationButton(),
          IconButton(
            tooltip: 'Ещё',
            icon: const Icon(Icons.more_vert),
            onPressed: () => _openMoreMenu(compactAppBar, isDark),
          ),
        ],
      ),
      body: Column(
        children: [
          const OrnamentDivider(height: 22),
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
                : _books.isEmpty
                    ? _buildEmpty(scheme)
                    : _buildList(scheme),
          ),
        ],
      ),
      floatingActionButton: _books.isNotEmpty
          ? FloatingActionButton.extended(
              icon: const Icon(Icons.add),
              label: const Text('Импорт'),
              onPressed: _importFile,
            )
          : null,
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
                        label: const Text('Импорт PDF/DOCX'),
                        onPressed: _importFile,
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
  Widget _buildList(ColorScheme scheme) {
    return _booksList(scheme, header: [
      if (_recentWords.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppTheme.radiusCard),
            onTap: _openAllCards,
            child: WolfBubble(
              title: 'Здраво! С возвращением',
              text: 'Недавно ты добавил: '
                  '${_recentWords.map((w) => shortPhrase(w)).join(', ')}. '
                  'Нажми, чтобы открыть все слова.',
              asset: Wolf.zdravo,
            ),
          ),
        ),
      Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: _freeLibraryCard(scheme),
      ),
    ]);
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

  Widget _booksList(ColorScheme scheme, {List<Widget> header = const []}) {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final b in _books) {
      final f = ((b['folder'] as String?) ?? '').trim();
      groups.putIfAbsent(f, () => []).add(b);
    }
    final folders = groups.keys.where((k) => k.isNotEmpty).toList()..sort();
    final showHeaders = folders.isNotEmpty;
    final order = [...folders, if (groups.containsKey('')) ''];

    final items = <Widget>[...header];
    var cardIndex = 0;
    for (final f in order) {
      if (showHeaders) {
        items.add(_sectionHeader(
            scheme, f.isEmpty ? 'Без папки' : f, groups[f]!.length));
      }
      for (final b in groups[f]!) {
        items.add(FadeSlideIn(
          delay: Duration(milliseconds: 28 * (cardIndex.clamp(0, 12))),
          child: _bookCard(scheme, b),
        ));
        cardIndex++;
      }
    }
    // Снизу запас под FAB «Импорт» — иначе он лежит на последней карточке.
    return ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96), children: items);
  }

  Widget _sectionHeader(ColorScheme scheme, String name, int count) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 8, left: 4),
        child: Row(
          children: [
            Icon(Icons.folder_rounded, size: 18, color: scheme.secondary),
            const SizedBox(width: 6),
            Text(name,
                style: TextStyle(
                    fontWeight: FontWeight.bold, color: scheme.secondary)),
            const SizedBox(width: 6),
            Text('($count)',
                style: TextStyle(
                    color: scheme.onSurface.withValues(alpha: 0.5),
                    fontSize: 12)),
          ],
        ),
      );

  Widget _bookCard(ColorScheme scheme, Map<String, dynamic> book) {
    final id = book['id'] as int;
    final title = book['title'] as String;
    final lastPara = book['last_para'] as int? ?? 0;
    final isPdf = title.toLowerCase().endsWith('.pdf');
    // Число абзацев берём из лёгкой колонки para_count — НЕ декодируем весь текст
    // книги ради прогресс-бара (раньше это грузило все книги в память).
    final paraCount = book['para_count'] as int? ?? 0;
    final progress = paraCount == 0 ? 0.0 : (lastPara + 1) / paraCount;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        leading: Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [scheme.primary, scheme.secondary],
            ),
          ),
          child: Icon(isPdf ? Icons.picture_as_pdf : Icons.menu_book,
              color: Colors.white),
        ),
        title: Text(title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                  '${(progress * 100).round()}% · стр. ${lastPara + 1} из $paraCount',
                  style: TextStyle(
                      fontSize: 12,
                      color: scheme.onSurface.withValues(alpha: 0.6))),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 5,
                  backgroundColor: scheme.primary.withValues(alpha: 0.15),
                ),
              ),
            ],
          ),
        ),
        trailing: PopupMenuButton<String>(
          onSelected: (v) {
            if (v == 'rename') {
              _renameBook(book);
            } else if (v == 'move') {
              _moveBook(book);
            } else if (v == 'reparse') {
              _reparseBook(book);
            } else if (v == 'delete') {
              _deleteBook(id, title);
            }
          },
          itemBuilder: (_) => const [
            PopupMenuItem(
                value: 'rename',
                child: ListTile(
                    leading: Icon(Icons.edit_outlined),
                    title: Text('Переименовать'))),
            PopupMenuItem(
                value: 'move',
                child: ListTile(
                    leading: Icon(Icons.drive_file_move_outlined),
                    title: Text('В папку…'))),
            PopupMenuItem(
                value: 'reparse',
                child: ListTile(
                    leading: Icon(Icons.refresh),
                    title: Text('Перечитать файл'))),
            PopupMenuItem(
                value: 'delete',
                child: ListTile(
                    leading: Icon(Icons.delete_outline),
                    title: Text('Удалить'))),
          ],
        ),
        onTap: () => _openBook(book),
      ),
    );
  }

  Future<void> _renameBook(Map<String, dynamic> book) async {
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
      await UserDb.instance.renameBook(book['id'] as int, newTitle);
      _loadBooks();
    }
  }

  Future<void> _moveBook(Map<String, dynamic> book) async {
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
      await UserDb.instance.setBookFolder(book['id'] as int, result);
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
          icon: Icons.refresh,
          onTap: _loadBooks,
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

/// Значок приложения в шапке.
class _AppLogo extends StatelessWidget {
  const _AppLogo();

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(7),
      child: Image.asset(
        'assets/imgs/citavuk_icon.png',
        width: 28,
        height: 28,
        filterQuality: FilterQuality.medium,
      ),
    );
  }
}

class _DashboardAction extends StatelessWidget {
  final bool showLabel;
  final String label;
  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;

  const _DashboardAction({
    required this.showLabel,
    required this.label,
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (!showLabel) {
      return IconButton(
        tooltip: tooltip,
        icon: Icon(icon),
        onPressed: onPressed,
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: TextButton.icon(
        onPressed: onPressed,
        style: TextButton.styleFrom(
          foregroundColor: scheme.primary,
          backgroundColor: scheme.primary.withValues(alpha: 0.08),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: BorderSide(color: scheme.primary.withValues(alpha: 0.25)),
          ),
          textStyle: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
        icon: Icon(icon, size: 18),
        label: Text(label),
      ),
    );
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
