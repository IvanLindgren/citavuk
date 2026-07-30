import 'dart:async';

import 'package:cross_file/cross_file.dart';
import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
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
import 'services/document_parser.dart';
import 'services/local_file.dart';
import 'services/notification_service.dart';
import 'widgets/update_dialog.dart';
import 'screens/onboarding_screen.dart';
import 'screens/all_cards_screen.dart';
import 'screens/book_reader_screen.dart';
import 'screens/grammar_cards_screen.dart';
import 'screens/home_shell.dart';
import 'screens/materials_screen.dart';
import 'screens/news_screen.dart';
import 'screens/public_library_screen.dart';
import 'screens/about_screen.dart';
import 'models/reader_settings.dart';
import 'state/app_settings.dart';
import 'theme/app_theme.dart';
import 'widgets/animated_widgets.dart';
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

  // Аккаунт и синхронизация. Сессия восстанавливается из локального хранилища
  // без обращения к сети: приложение обязано открываться офлайн.
  final api = ApiClient(baseUrl: settings.syncUrl);
  final auth = AuthService(api: api);
  await auth.load();
  CourseProgressStore.configure(api: api, auth: auth);
  CourseContentLoader.configure(api: api);
  final sync = SyncService(api: api, auth: auth);

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
        // Клиент нужен экранам, которые ходят на сервер напрямую (например,
        // загрузка материалов через прокси документов), а не только через
        // синхронизацию.
        Provider<ApiClient>.value(value: api),
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
    final recent = await UserDb.instance.getRecentWords(4);
    setState(() {
      _books = booksList;
      _recentWords = recent;
      _isLoading = false;
    });
  }

  Future<void> _importFile() async {
    // withData только на вебе. Там пути к файлу нет вовсе, а на телефоне этот
    // флаг заставляет плагин положить файл в память ЦЕЛИКОМ — и вдобавок
    // сохранить копию в кеш. Для книги на несколько десятков мегабайт это два
    // одновременных снимка файла в памяти, и Android убивал приложение прямо
    // при выборе книги. С путём файл читается один раз и одним куском.
    final result = await FilePicker.platform.pickFiles(
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
      final paragraphs =
          await DocumentParser.parseAny(name, bytes, _onParseProgress);
      await UserDb.instance.insertBook(name, path, paragraphs);
      await _loadBooks();
      if (!mounted) return;
      if (!LanguageDetector.isLikelySerbian(paragraphs)) {
        _showNonSerbianWarning();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Книга «$name» импортирована')),
        );
      }
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
      _snack('Не удалось скачать текст книги. Проверьте интернет '
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
          PopupMenuButton<String>(
            tooltip: 'Карточки и обновление',
            icon: const Icon(Icons.more_vert),
            onSelected: (v) {
              if (v == 'news') {
                Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const NewsScreen()));
              }
              if (v == 'materials') {
                Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const MaterialsScreen()));
              }
              if (v == 'publicLibrary') {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const PublicLibraryScreen()),
                );
              }
              if (v == 'video') _openVideoSite();
              if (v == 'grammar') _openGrammarReference();
              if (v == 'reminders') _openReminderDialog();
              if (v == 'theme') _toggleTheme();
              if (v == 'cards') _openAllCards();
              if (v == 'import') _importCards();
              if (v == 'export') _exportAllCards();
              if (v == 'refresh') _loadBooks();
              if (v == 'server') _openServerSettings();
              if (v == 'account') {
                Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const AccountScreen()));
              }
              if (v == 'about') {
                Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const AboutScreen()));
              }
            },
            itemBuilder: (_) => [
              if (compactAppBar) ...[
                const PopupMenuItem(
                  value: 'news',
                  child: ListTile(
                    leading: Icon(Icons.newspaper_outlined),
                    title: Text('Новости'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                const PopupMenuItem(
                  value: 'publicLibrary',
                  child: ListTile(
                    leading: Icon(Icons.local_library_outlined),
                    title: Text('Публичная библиотека'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                const PopupMenuItem(
                  value: 'materials',
                  child: ListTile(
                    leading: Icon(Icons.assignment_outlined),
                    title: Text('Материалы для поступления'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                const PopupMenuItem(
                  value: 'grammar',
                  child: ListTile(
                    leading: Icon(Icons.school_outlined),
                    title: Text('Справочник правил'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                if (NotificationService.instance.supported)
                  PopupMenuItem(
                    value: 'reminders',
                    child: ListTile(
                      leading: Icon(settings.notificationsEnabled
                          ? Icons.notifications_active
                          : Icons.notifications_none),
                      title: const Text('Напоминания'),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                PopupMenuItem(
                  value: 'theme',
                  child: ListTile(
                    leading: Icon(isDark ? Icons.light_mode : Icons.dark_mode),
                    title: Text(isDark ? 'Светлая тема' : 'Тёмная тема'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                const PopupMenuDivider(height: 8),
              ],
              PopupMenuItem(
                value: 'account',
                child: ListTile(
                  leading: Icon(context.watch<AuthService>().isSignedIn
                      ? Icons.cloud_done_outlined
                      : Icons.account_circle_outlined),
                  title: Text(context.watch<AuthService>().isSignedIn
                      ? 'Аккаунт и синхронизация'
                      : 'Войти и синхронизировать'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'video',
                child: ListTile(
                  leading: Icon(Icons.smart_display_outlined),
                  title: Text('Видео с субтитрами'),
                  subtitle: Text('Откроется в браузере'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'about',
                child: ListTile(
                  leading: Icon(Icons.info_outline),
                  title: Text('О приложении'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'server',
                child: ListTile(
                  leading: Icon(Icons.cloud_outlined),
                  title: Text('Сервер и словарь'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'cards',
                child: ListTile(
                  leading: Icon(Icons.style_outlined),
                  title: Text('Все слова и карточки'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'import',
                child: ListTile(
                  leading: Icon(Icons.download_outlined),
                  title: Text('Импорт карточек (.md)'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'export',
                child: ListTile(
                  leading: Icon(Icons.upload_file_outlined),
                  title: Text('Экспорт всех карточек'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'refresh',
                child: ListTile(
                  leading: Icon(Icons.refresh),
                  title: Text('Обновить'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          const OrnamentDivider(height: 22),
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
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
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
                    label: const Text('Тест DOCX'),
                    onPressed: () => _loadTestStory(
                        'assets/test_story.docx', 'Тестовая история (DOCX)'),
                  ),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.picture_as_pdf_outlined),
                    label: const Text('Тест PDF'),
                    onPressed: () => _loadTestStory(
                        'assets/test_story.pdf', 'Тестовая история (PDF)'),
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
  }

  Widget _buildList(ColorScheme scheme) {
    return Column(
      children: [
        if (_recentWords.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: InkWell(
              borderRadius: BorderRadius.circular(AppTheme.radiusCard),
              onTap: _openAllCards,
              child: WolfBubble(
                title: 'Здраво! С возвращением',
                // В словарь попадают и длинные фразы: показываем начало, а
                // целиком запись открывается в разделе слов.
                text: 'Недавно ты добавил: '
                    '${_recentWords.map((w) => shortPhrase(w)).join(', ')}. '
                    'Нажми, чтобы открыть все слова.',
                asset: Wolf.zdravo,
              ),
            ),
          ),
        _buildFreeLibrary(scheme),
        Expanded(child: _booksList(scheme)),
      ],
    );
  }

  Widget _buildFreeLibrary(ColorScheme scheme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Card(
        child: ListTile(
          leading: Icon(Icons.local_library_outlined,
              color: scheme.primary, size: 34),
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
      ),
    );
  }

  Widget _booksList(ColorScheme scheme) {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final b in _books) {
      final f = ((b['folder'] as String?) ?? '').trim();
      groups.putIfAbsent(f, () => []).add(b);
    }
    final folders = groups.keys.where((k) => k.isNotEmpty).toList()..sort();
    final showHeaders = folders.isNotEmpty;
    final order = [...folders, if (groups.containsKey('')) ''];

    final items = <Widget>[];
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
    return ListView(padding: const EdgeInsets.all(16), children: items);
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
