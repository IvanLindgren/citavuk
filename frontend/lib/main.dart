import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'services/user_db.dart';
import 'services/document_parser.dart';
import 'services/notification_service.dart';
import 'screens/book_reader_screen.dart';
import 'screens/grammar_cards_screen.dart';
import 'models/reader_settings.dart';
import 'state/app_settings.dart';
import 'theme/app_theme.dart';
import 'widgets/serbian_ornament.dart';
import 'widgets/wolf_mascot.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!kIsWeb && (Platform.isWindows || Platform.isLinux)) {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  }

  final settings = AppSettings();
  await settings.load();

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
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _initAndLoad();
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Книга «$name» импортирована")),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Ошибка импорта: $e')));
      }
      setState(() => _isLoading = false);
    }
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
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Ошибка загрузки теста: $e')));
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
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadBooks),
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
            Wrap(
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
        Expanded(child: _booksList(scheme)),
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
    for (final f in order) {
      if (showHeaders) {
        items.add(_sectionHeader(
            scheme, f.isEmpty ? 'Без папки' : f, groups[f]!.length));
      }
      for (final b in groups[f]!) {
        items.add(_bookCard(scheme, b));
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
}
