import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/community_lesson.dart';
import '../services/api_client.dart';
import '../services/community_lessons_service.dart';
import 'community_lesson_screen.dart';
import 'teacher_application_screen.dart';

class CommunityLessonsScreen extends StatefulWidget {
  const CommunityLessonsScreen({super.key});
  @override
  State<CommunityLessonsScreen> createState() => _CommunityLessonsScreenState();
}

class _CommunityLessonsScreenState extends State<CommunityLessonsScreen> {
  late CommunityLessonsService _service;
  List<CommunityLesson> _items = const [];
  bool _loading = true;
  String _error = '';
  String _level = '';
  String _type = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _service = CommunityLessonsService(context.read<ApiClient>());
    if (_loading && _items.isEmpty && _error.isEmpty) _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final items = await _service.list(level: _level, type: _type);
      if (mounted) setState(() => _items = items);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Уроки преподавателей'),
          actions: [
            IconButton(
              tooltip: 'Для преподавателей',
              icon: const Icon(Icons.co_present_outlined),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => const TeacherApplicationScreen()),
              ),
            ),
          ],
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _level,
                      decoration: const InputDecoration(
                          labelText: 'Уровень', isDense: true),
                      items: ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']
                          .map((value) => DropdownMenuItem(
                              value: value,
                              child: Text(value.isEmpty ? 'Все' : value)))
                          .toList(),
                      onChanged: (value) {
                        _level = value ?? '';
                        _load();
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _type,
                      decoration: const InputDecoration(
                          labelText: 'Направление', isDense: true),
                      items: const {
                        '': 'Все',
                        'lexicon': 'Лексика',
                        'grammar': 'Грамматика',
                        'speaking': 'Говорение',
                        'writing': 'Письмо'
                      }
                          .entries
                          .map((item) => DropdownMenuItem(
                              value: item.key, child: Text(item.value)))
                          .toList(),
                      onChanged: (value) {
                        _type = value ?? '';
                        _load();
                      },
                    ),
                  ),
                ],
              ),
            ),
            Expanded(child: _body()),
          ],
        ),
      );

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error.isNotEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('Повторить')),
            ],
          ),
        ),
      );
    }
    if (_items.isEmpty) {
      return const Center(child: Text('Уроков с такими фильтрами пока нет.'));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, index) {
          final lesson = _items[index];
          return Card(
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: lesson.coverUrl.isEmpty
                  ? CircleAvatar(child: Text(lesson.level))
                  : ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Image.network(
                        lesson.coverUrl,
                        width: 64,
                        height: 64,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) =>
                            CircleAvatar(child: Text(lesson.level)),
                      ),
                    ),
              title: Text(lesson.title,
                  maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '${lesson.authorName} · ${lesson.estimatedMinutes} мин\n${lesson.summary}',
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => CommunityLessonScreen(
                      service: _service, slug: lesson.slug),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
