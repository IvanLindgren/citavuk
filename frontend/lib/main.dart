import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'services/user_db.dart';
import 'services/card_io.dart';
import 'services/analysis_repository.dart';
import 'services/document_parser.dart';
import 'services/notification_service.dart';
import 'widgets/welcome_dialog.dart';
import 'screens/book_reader_screen.dart';
import 'screens/grammar_cards_screen.dart';
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

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!kIsWeb && (Platform.isWindows || Platform.isLinux)) {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  }

  final settings = AppSettings();
  await settings.load();

  // Сервер разбора/перевода — из настроек (по умолчанию публичный HF Space).
  AnalysisRepository.baseUrl = settings.backendUrl;

  await NotificationService.instance.init();
  if (settings.notificationsEnabled) {
    await NotificationService.instance
        .scheduleDailyReminder(settings.reminderHour, settings.reminderMinute);
  }

  runApp(
    ChangeNotifierProvider.value(value: settings, child: const ChitavukApp()),
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
      home: const DashboardScreen(),
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
  List<String> _libraryAssets = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _initAndLoad();
    _loadLibraryAssets();
    // Приветствие при первом запуске: объясняем онлайн/офлайн и предлагаем
    // скачать словарь.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!context.read<AppSettings>().firstRunDone) {
        showWelcomeDialog(context);
      }
    });
  }

  Future<void> _loadLibraryAssets() async {
    try {
      final manifestContent = await rootBundle.loadString('AssetManifest.json');
      final Map<String, dynamic> manifestMap = json.decode(manifestContent);
      final pdfs = manifestMap.keys
          .where((k) => k.startsWith('assets/library/') && (k.endsWith('.pdf') || k.endsWith('.docx')))
          .toList();
      setState(() {
        _libraryAssets = pdfs;
      });
    } catch (e) {
      // no library folder or manifest error
    }
  }

  Future<void> _initAndLoad() async {
    await UserDb.instance.database;
    await _loadBooks();
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
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'docx'],
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;

      final file = result.files.first;
      final bytes = file.bytes;
      if (bytes == null) return;

      final name = file.name;
      final path = file.path ?? name;
      setState(() => _isLoading = true);

      List<String> paragraphs;
      if (name.toLowerCase().endsWith('.pdf')) {
        paragraphs = DocumentParser.parsePdf(bytes);
      } else if (name.toLowerCase().endsWith('.docx')) {
        paragraphs = DocumentParser.parseDocx(bytes);
      } else {
        throw Exception('Неподдерживаемый формат');
      }

      await UserDb.instance.insertBook(name, path, paragraphs);
      await _loadBooks();
      if (mounted) {
        if (!LanguageDetector.isLikelySerbian(paragraphs)) {
          _showNonSerbianWarning();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Книга «$name» импортирована")),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Ошибка импорта: $e')));
      }
      setState(() => _isLoading = false);
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
    setState(() => _isLoading = true);
    try {
      final data = await rootBundle.load(assetPath);
      final bytes =
          data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
      final paragraphs = assetPath.endsWith('.pdf')
          ? DocumentParser.parsePdf(bytes)
          : DocumentParser.parseDocx(bytes);

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
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadLibraryStory(String assetPath, String title) async {
    setState(() => _isLoading = true);
    try {
      final data = await rootBundle.load(assetPath);
      final bytes =
          data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
      final paragraphs = assetPath.endsWith('.pdf')
          ? DocumentParser.parsePdf(bytes)
          : DocumentParser.parseDocx(bytes);

      final id = await UserDb.instance.insertBook(title, assetPath, paragraphs);
      await UserDb.instance.setBookFolder(id, 'Бесплатная библиотека');
      await _loadBooks();
      
      if (mounted) {
        if (!LanguageDetector.isLikelySerbian(paragraphs)) {
          _showNonSerbianWarning();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Книга «$title» добавлена в библиотеку")),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Ошибка загрузки: $e')));
      }
      setState(() => _isLoading = false);
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

  void _openBook(Map<String, dynamic> book) {
    final id = book['id'] as int;
    final title = book['title'] as String;
    final lastPara = book['last_para'] as int? ?? 0;
    List<String> paragraphs = [];
    try {
      paragraphs = List<String>.from(jsonDecode(book['content'] as String));
    } catch (_) {}

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BookReaderScreen(
          bookId: id,
          title: title,
          paragraphs: paragraphs,
          initialParagraph: lastPara,
        ),
      ),
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
                      if (v) await NotificationService.instance.requestPermission();
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
    final isDark = context.watch<AppSettings>().reader.themeMode == AppThemeMode.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Text('🐺', style: TextStyle(fontSize: 22)),
            SizedBox(width: 8),
            Text('Читавук'),
          ],
        ),
        actions: [
          const RadioAppBarButton(),
          IconButton(
            tooltip: 'Грамматика — карточки',
            icon: const Icon(Icons.school_outlined),
            onPressed: _openGrammarCards,
          ),
          IconButton(
            tooltip: 'Напоминания о повторении',
            icon: Icon(context.watch<AppSettings>().notificationsEnabled
                ? Icons.notifications_active
                : Icons.notifications_none),
            onPressed: _openReminderDialog,
          ),
          IconButton(
            tooltip: 'Сменить тему',
            icon: Icon(isDark ? Icons.light_mode : Icons.dark_mode),
            onPressed: _toggleTheme,
          ),
          PopupMenuButton<String>(
            tooltip: 'Карточки и обновление',
            icon: const Icon(Icons.more_vert),
            onSelected: (v) {
              if (v == 'import') _importCards();
              if (v == 'export') _exportAllCards();
              if (v == 'refresh') _loadBooks();
              if (v == 'server') _openServerSettings();
              if (v == 'about') {
                Navigator.push(context, MaterialPageRoute(builder: (_) => const AboutScreen()));
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'about',
                child: ListTile(
                  leading: Icon(Icons.info_outline),
                  title: Text('О приложении'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              PopupMenuItem(
                value: 'server',
                child: ListTile(
                  leading: Icon(Icons.cloud_outlined),
                  title: Text('Сервер и словарь'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              PopupMenuItem(
                value: 'import',
                child: ListTile(
                  leading: Icon(Icons.download_outlined),
                  title: Text('Импорт карточек (.md)'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              PopupMenuItem(
                value: 'export',
                child: ListTile(
                  leading: Icon(Icons.upload_file_outlined),
                  title: Text('Экспорт всех карточек'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              PopupMenuItem(
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
                ? const Center(child: CircularProgressIndicator())
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
  }

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
                  onPressed: () =>
                      _loadTestStory('assets/test_story.docx', 'Тестовая история (DOCX)'),
                ),
                OutlinedButton.icon(
                  icon: const Icon(Icons.picture_as_pdf_outlined),
                  label: const Text('Тест PDF'),
                  onPressed: () =>
                      _loadTestStory('assets/test_story.pdf', 'Тестовая история (PDF)'),
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
            child: WolfBubble(
              title: 'Здраво! С возвращением',
              text:
                  'Недавно ты добавил: ${_recentWords.join(', ')}. Загляни в карточки и повтори!',
              asset: Wolf.zdravo,
            ),
          ),
        _buildFreeLibrary(scheme),
        Expanded(child: _booksList(scheme)),
      ],
    );
  }

  Widget _buildFreeLibrary(ColorScheme scheme) {
    if (_libraryAssets.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Text('Бесплатная библиотека', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        ),
        SizedBox(
          height: 120,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: _libraryAssets.length,
            itemBuilder: (ctx, i) {
              final path = _libraryAssets[i];
              final filename = path.split('/').last;
              final name = filename.replaceAll('.pdf', '').replaceAll('.docx', '').replaceAll('_', ' ');
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 4),
                child: InkWell(
                  onTap: () {
                    if (_books.any((b) => ((b['folder'] as String?) ?? '').trim() == 'Бесплатная библиотека' && b['title'] == name)) {
                       ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Книга уже добавлена')));
                       return;
                    }
                    _loadLibraryStory(path, name);
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    width: 110,
                    padding: const EdgeInsets.all(8),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(path.endsWith('.pdf') ? Icons.picture_as_pdf : Icons.text_snippet, color: scheme.primary, size: 32),
                        const SizedBox(height: 8),
                        Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
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
                    color: scheme.onSurface.withValues(alpha: 0.5), fontSize: 12)),
          ],
        ),
      );

  Widget _bookCard(ColorScheme scheme, Map<String, dynamic> book) {
    final id = book['id'] as int;
    final title = book['title'] as String;
    final lastPara = book['last_para'] as int? ?? 0;
    final isPdf = title.toLowerCase().endsWith('.pdf');
    List<String> paragraphs = [];
    try {
      paragraphs = List<String>.from(jsonDecode(book['content'] as String));
    } catch (_) {}
    final progress =
        paragraphs.isEmpty ? 0.0 : (lastPara + 1) / paragraphs.length;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
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
                  '${(progress * 100).round()}% · стр. ${lastPara + 1} из ${paragraphs.length}',
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

  void _openGrammarCards() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const GrammarCardsScreen()),
    );
  }

  void _openServerSettings() {
    showServerSettings(context);
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
        content: Text(path == null
            ? 'Экспорт отменён'
            : 'Все карточки сохранены: $path'),
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
