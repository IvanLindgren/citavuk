import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/community_lesson.dart';
import '../services/api_client.dart';
import '../services/community_lessons_service.dart';
import '../widgets/clickable_serbian_text.dart';
import '../widgets/exercise_player.dart';

enum _LessonStage { theory, practice, dialogue, complete }

class CommunityLessonScreen extends StatefulWidget {
  const CommunityLessonScreen(
      {super.key, required this.service, this.slug, this.token});
  final CommunityLessonsService service;
  final String? slug;
  final String? token;

  @override
  State<CommunityLessonScreen> createState() => _CommunityLessonScreenState();
}

class _CommunityLessonScreenState extends State<CommunityLessonScreen> {
  late Future<CommunityLesson> _lesson;
  /// Ответы живут вне виджета задания: задания показываются по одному, и
  /// переход к следующему и обратно иначе стирал бы написанное.
  final ExerciseAnswers _answers = ExerciseAnswers();
  String? _dialogueNode;
  _LessonStage _stage = _LessonStage.theory;
  int _exerciseIndex = 0;

  @override
  void initState() {
    super.initState();
    _lesson = widget.token != null
        ? widget.service.getUnlisted(widget.token!)
        : widget.service.getPublic(widget.slug ?? '');
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<CommunityLesson>(
        future: _lesson,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Scaffold(
                body: Center(child: CircularProgressIndicator()));
          }
          if (snapshot.hasError) {
            return Scaffold(
                appBar: AppBar(),
                body: Center(
                    child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(snapshot.error is ApiException
                            ? (snapshot.error! as ApiException).message
                            : 'Не удалось открыть урок.'))));
          }
          final lesson = snapshot.data!;
          final theory = _maps(lesson.content['theory']);
          final exercises = _maps(lesson.content['exercises']);
          final dialogue = lesson.content['dialogue'] is Map
              ? Map<String, dynamic>.from(lesson.content['dialogue'] as Map)
              : null;
          return Scaffold(
              appBar: AppBar(
                  title: Text(lesson.title,
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  bottom: _stage == _LessonStage.practice &&
                          exercises.isNotEmpty
                      ? PreferredSize(
                          preferredSize: const Size.fromHeight(4),
                          child: LinearProgressIndicator(
                              minHeight: 4,
                              value: (_exerciseIndex + 1) / exercises.length))
                      : null),
              body: SafeArea(
                  child: switch (_stage) {
                _LessonStage.theory =>
                  _theoryStage(lesson, theory, exercises, dialogue),
                _LessonStage.practice =>
                  _practiceStage(lesson, exercises, dialogue),
                _LessonStage.dialogue => _dialogueStage(dialogue, exercises),
                _LessonStage.complete => _completeStage(exercises),
              }));
        },
      );

  Widget _theoryStage(CommunityLesson lesson, List<Map<String, dynamic>> theory,
      List<Map<String, dynamic>> exercises, Map<String, dynamic>? dialogue) {
    return SelectionArea(
        child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 32),
            children: [
          if (lesson.coverUrl.isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: AspectRatio(
                aspectRatio: 16 / 7,
                child: Image.network(
                  lesson.coverUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
          Wrap(spacing: 8, runSpacing: 6, children: [
            Chip(label: Text(lesson.level)),
            Chip(label: Text(_typeLabel(lesson.lessonType))),
            Chip(label: Text('${lesson.estimatedMinutes} мин'))
          ]),
          const SizedBox(height: 12),
          Text(lesson.title, style: Theme.of(context).textTheme.headlineMedium),
          if (lesson.summary.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(lesson.summary, style: Theme.of(context).textTheme.bodyLarge)
          ],
          const SizedBox(height: 8),
          Text(lesson.authorName,
              style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w600)),
          const Divider(height: 40),
          ...theory.map(_theoryBlock),
          const Divider(height: 40),
          Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                  icon: const Icon(Icons.arrow_forward),
                  label: Text(exercises.isNotEmpty
                      ? 'Перейти к практике'
                      : dialogue != null
                          ? 'Перейти к диалогу'
                          : 'Завершить урок'),
                  onPressed: () => setState(() {
                        if (exercises.isNotEmpty) {
                          _stage = _LessonStage.practice;
                          _exerciseIndex = 0;
                        } else if (dialogue != null) {
                          _stage = _LessonStage.dialogue;
                        } else {
                          _stage = _LessonStage.complete;
                        }
                      })))
        ]));
  }

  Widget _practiceStage(CommunityLesson lesson,
      List<Map<String, dynamic>> exercises, Map<String, dynamic>? dialogue) {
    if (exercises.isEmpty) {
      return const Center(child: Text('В этом уроке пока нет заданий.'));
    }
    final exercise = exercises[_exerciseIndex.clamp(0, exercises.length - 1)];
    return Column(children: [
      Padding(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 4),
          child: Row(children: [
            TextButton.icon(
                icon: const Icon(Icons.menu_book_outlined),
                label: const Text('К теории'),
                onPressed: () => setState(() => _stage = _LessonStage.theory)),
            const Spacer(),
            Text('Задание ${_exerciseIndex + 1} из ${exercises.length}',
                style: Theme.of(context).textTheme.bodySmall)
          ])),
      Expanded(
          child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 4, 18, 20),
              children: [
                ExerciseView(
                  key: ValueKey(exercise['id'] ?? _exerciseIndex),
                  exercise: exercise,
                  index: _exerciseIndex,
                  answers: _answers,
                  onLetter: (id, answer) => _sendLetter(lesson, id, answer),
                )
              ])),
      Padding(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 16),
          child: Row(children: [
            OutlinedButton.icon(
                icon: const Icon(Icons.arrow_back),
                label: const Text('Назад'),
                onPressed: _exerciseIndex == 0
                    ? null
                    : () => setState(() => _exerciseIndex--)),
            const Spacer(),
            FilledButton.icon(
                icon: const Icon(Icons.arrow_forward),
                label: Text(_exerciseIndex < exercises.length - 1
                    ? 'Дальше'
                    : dialogue != null
                        ? 'К диалогу'
                        : 'Завершить'),
                onPressed: () => setState(() {
                      if (_exerciseIndex < exercises.length - 1) {
                        _exerciseIndex++;
                      } else {
                        _stage = dialogue != null
                            ? _LessonStage.dialogue
                            : _LessonStage.complete;
                      }
                    }))
          ]))
    ]);
  }

  Widget _dialogueStage(
      Map<String, dynamic>? dialogue, List<Map<String, dynamic>> exercises) {
    return ListView(
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 32),
        children: [
          Row(children: [
            Text('Диалог', style: Theme.of(context).textTheme.headlineSmall),
            const Spacer(),
            TextButton(
                onPressed: () => setState(() {
                      _stage = exercises.isEmpty
                          ? _LessonStage.theory
                          : _LessonStage.practice;
                      if (exercises.isNotEmpty) {
                        _exerciseIndex = exercises.length - 1;
                      }
                    }),
                child: const Text('Назад'))
          ]),
          const SizedBox(height: 8),
          if (dialogue == null)
            const Text('Диалог пока пуст.')
          else
            _dialogue(dialogue),
          const SizedBox(height: 24),
          Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                  icon: const Icon(Icons.check),
                  label: const Text('Завершить урок'),
                  onPressed: () =>
                      setState(() => _stage = _LessonStage.complete)))
        ]);
  }

  Widget _completeStage(List<Map<String, dynamic>> exercises) {
    return Center(
        child: SingleChildScrollView(
            padding: const EdgeInsets.all(28),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.check_circle_outline,
                  size: 72, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 18),
              Text('Урок пройден',
                  style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              const Text('Теория прочитана, практика завершена.',
                  textAlign: TextAlign.center),
              const SizedBox(height: 24),
              Wrap(alignment: WrapAlignment.center, spacing: 10, children: [
                OutlinedButton(
                    onPressed: () =>
                        setState(() => _stage = _LessonStage.theory),
                    child: const Text('Повторить теорию')),
                if (exercises.isNotEmpty)
                  FilledButton(
                      onPressed: () => setState(() {
                            _exerciseIndex = 0;
                            _stage = _LessonStage.practice;
                          }),
                      child: const Text('Повторить практику'))
              ])
            ])));
  }

  Widget _theoryBlock(Map<String, dynamic> block) {
    final type = block['type']?.toString() ?? '';
    final text = block['text']?.toString() ?? '';
    if (type == 'heading') {
      return Padding(
          padding: const EdgeInsets.only(top: 18, bottom: 8),
          child: Text(text, style: Theme.of(context).textTheme.headlineSmall));
    }
    if (type == 'paragraph' || type == 'quote') {
      return Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: type == 'quote'
              ? const EdgeInsets.only(left: 14)
              : EdgeInsets.zero,
          decoration: type == 'quote'
              ? BoxDecoration(
                  border: Border(
                      left: BorderSide(
                          width: 3,
                          color: Theme.of(context).colorScheme.primary)))
              : null,
          child: ClickableSerbianText(text));
    }
    if (type == 'image') {
      return Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: Column(children: [
            ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.network(block['url']?.toString() ?? '',
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const SizedBox(
                        height: 120,
                        child:
                            Center(child: Icon(Icons.broken_image_outlined))))),
            if ((block['caption']?.toString() ?? '').isNotEmpty)
              Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(block['caption'].toString(),
                      textAlign: TextAlign.center))
          ]));
    }
    if (type == 'video') {
      return Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: OutlinedButton.icon(
              icon: const Icon(Icons.play_circle_outline),
              label: Text(block['title']?.toString().isNotEmpty == true
                  ? block['title'].toString()
                  : 'Открыть видео'),
              onPressed: () {
                final uri = Uri.tryParse(block['url']?.toString() ?? '');
                if (uri != null) {
                  launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              }));
    }
    if (type == 'list') {
      return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Column(
              children: _strings(block['items'])
                  .map((item) => Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Padding(
                                padding: EdgeInsets.only(top: 5, right: 8),
                                child: Icon(Icons.circle, size: 6)),
                            Expanded(child: ClickableSerbianText(item))
                          ]))
                  .toList()));
    }
    if (type == 'table') {
      final rows = (block['rows'] as List? ?? const [])
          .whereType<List>()
          .map((row) => row.map((cell) => cell.toString()).toList())
          .toList();
      if (rows.isEmpty) return const SizedBox.shrink();
      return Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                  columns: rows.first
                      .map((cell) => DataColumn(
                          label: Text(cell,
                              style: const TextStyle(
                                  fontWeight: FontWeight.bold))))
                      .toList(),
                  rows: rows
                      .skip(1)
                      .map((row) => DataRow(
                          cells: List.generate(
                              rows.first.length,
                              (index) => DataCell(
                                  Text(index < row.length ? row[index] : '')))))
                      .toList())));
    }
    return const SizedBox.shrink();
  }

  /// Отправляет работу преподавателю. Возвращает текст ошибки либо null.
  Future<String?> _sendLetter(
      CommunityLesson lesson, String id, String answer) async {
    try {
      await widget.service.submitLetter(lesson, id, answer);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Widget _dialogue(Map<String, dynamic> dialogue) {
    final nodes = _maps(dialogue['nodes']);
    if (nodes.isEmpty) return const Text('Диалог пока пуст.');
    _dialogueNode ??=
        dialogue['startId']?.toString() ?? nodes.first['id']?.toString();
    final node = nodes.cast<Map<String, dynamic>?>().firstWhere(
        (item) => item?['id']?.toString() == _dialogueNode,
        orElse: () => nodes.first);
    final choices = _maps(node?['choices']);
    return Padding(
        padding: const EdgeInsets.only(top: 14),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(node?['speaker']?.toString() ?? '',
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.primary,
                                fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        ClickableSerbianText(node?['text']?.toString() ?? '')
                      ]))),
          ...choices.map((choice) => Padding(
              padding: const EdgeInsets.only(top: 8),
              child: OutlinedButton(
                  onPressed: () => setState(
                      () => _dialogueNode = choice['nextId']?.toString()),
                  child: Text(choice['label']?.toString() ?? 'Продолжить'))))
        ]));
  }

  static List<Map<String, dynamic>> _maps(dynamic value) =>
      (value as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
  static List<String> _strings(dynamic value) =>
      (value as List? ?? const []).map((item) => item.toString()).toList();
  static String _typeLabel(String value) =>
      const {
        'lexicon': 'Лексика',
        'grammar': 'Грамматика',
        'speaking': 'Говорение',
        'writing': 'Письмо'
      }[value] ??
      value;
}
