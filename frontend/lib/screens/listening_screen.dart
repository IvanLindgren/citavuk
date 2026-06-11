import 'package:flutter/material.dart';
import '../models/audio_lesson.dart';
import '../services/listening_service.dart';
import '../services/user_db.dart';
import '../widgets/animated_widgets.dart';
import '../widgets/eagle_mascot.dart';
import '../widgets/serbian_ornament.dart';
import 'listening_player_screen.dart';

/// Аудирование (бета): подборка аудио с субтитрами + озвучка своих текстов.
class ListeningScreen extends StatefulWidget {
  const ListeningScreen({super.key});

  @override
  State<ListeningScreen> createState() => _ListeningScreenState();
}

class _ListeningScreenState extends State<ListeningScreen> {
  late Future<List<AudioLesson>> _lessons;
  List<Map<String, dynamic>> _books = [];
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    _lessons = ListeningService.instance.getLessons();
    UserDb.instance.getBooks().then((b) {
      if (mounted) setState(() => _books = b);
    });
  }

  Future<void> _openBookAsLesson(Map<String, dynamic> book) async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      final id = book['id'] as int;
      final title = book['title'] as String;
      final paragraphs = await UserDb.instance.getBookContent(id);
      if (!mounted) return;
      if (paragraphs.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('В этой книге нет текста')));
        return;
      }
      final lesson = ListeningService.instance.lessonFromText(
        id: 'book-$id',
        title: title,
        paragraphs: paragraphs,
      );
      await Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => ListeningPlayerScreen(lesson: lesson)),
      );
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Text('Аудирование'),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: scheme.tertiary.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(10),
                border:
                    Border.all(color: scheme.tertiary.withValues(alpha: 0.5)),
              ),
              child: Text('БЕТА',
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.5,
                      color: scheme.tertiary)),
            ),
          ],
        ),
      ),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              const OrnamentDivider(height: 22),
              const EagleBubble(
                asset: Eagle.zdravo,
                title: 'Здраво! Я орёл Слухао',
                text: 'Тренируем понимание на слух: слушай сербский текст и '
                    'следи за подсветкой слов. Красным я помечаю то, что '
                    'труднее всего поймать ухом. Любое слово можно тут же '
                    'разобрать и забрать в словарь.',
              ),
              const SizedBox(height: 16),
              _sectionHeader(scheme, Icons.podcasts, 'Подборка'),
              FutureBuilder<List<AudioLesson>>(
                future: _lessons,
                builder: (context, snap) {
                  if (snap.connectionState == ConnectionState.waiting) {
                    return const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final items = snap.data ?? const <AudioLesson>[];
                  if (items.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
                      child: Text(
                        'Подборка подкастов и записей с субтитрами пополняется. '
                        'А пока Слухао озвучит любой твой текст — выбери книгу '
                        'или новость ниже.',
                        style: TextStyle(
                            fontSize: 13.5,
                            color: scheme.onSurface.withValues(alpha: 0.65)),
                      ),
                    );
                  }
                  return Column(
                    children: [
                      for (final (i, l) in items.indexed)
                        FadeSlideIn(
                          delay: Duration(milliseconds: 30 * i.clamp(0, 10)),
                          child: _lessonCard(
                            scheme,
                            icon: Icons.graphic_eq,
                            title: l.title,
                            subtitle: l.subtitle.isEmpty
                                ? '${l.cues.length} фраз'
                                : l.subtitle,
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (_) =>
                                      ListeningPlayerScreen(lesson: l)),
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
              const SizedBox(height: 16),
              _sectionHeader(
                  scheme, Icons.record_voice_over, 'Озвучить мой текст'),
              if (_books.isEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
                  child: Text(
                    'Импортируй книгу или открой новость на главной — она '
                    'появится здесь, и Слухао её озвучит.',
                    style: TextStyle(
                        fontSize: 13.5,
                        color: scheme.onSurface.withValues(alpha: 0.65)),
                  ),
                )
              else
                for (final (i, b) in _books.indexed)
                  FadeSlideIn(
                    delay: Duration(milliseconds: 25 * i.clamp(0, 12)),
                    child: _lessonCard(
                      scheme,
                      icon: Icons.menu_book,
                      title: b['title'] as String,
                      subtitle:
                          'озвучка текста · ${b['para_count'] ?? '?'} абзацев',
                      onTap: () => _openBookAsLesson(b),
                    ),
                  ),
            ],
          ),
          if (_opening)
            Container(
              color: Colors.black.withValues(alpha: 0.3),
              child: const Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }

  Widget _sectionHeader(ColorScheme scheme, IconData icon, String text) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 8, left: 2),
        child: Row(
          children: [
            Icon(icon, size: 18, color: scheme.secondary),
            const SizedBox(width: 6),
            Text(text,
                style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                    color: scheme.secondary)),
          ],
        ),
      );

  Widget _lessonCard(
    ColorScheme scheme, {
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        leading: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [scheme.secondary, scheme.primary],
            ),
          ),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
        title: Text(title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
        subtitle: Text(subtitle,
            style: TextStyle(
                fontSize: 12.5,
                color: scheme.onSurface.withValues(alpha: 0.6))),
        trailing: Icon(Icons.headphones, color: scheme.primary),
        onTap: onTap,
      ),
    );
  }
}
