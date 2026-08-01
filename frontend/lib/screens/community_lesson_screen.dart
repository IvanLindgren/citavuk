import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/community_lesson.dart';
import '../models/reader_settings.dart';
import '../models/word_analysis.dart';
import '../services/analysis_repository.dart';
import '../services/api_client.dart';
import '../services/community_lessons_service.dart';
import '../utils/tokenizer.dart';
import '../widgets/reader_text.dart';

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
  final Map<String, String> _answers = {};
  final Map<String, String> _feedback = {};
  final Map<String, List<int>> _tileSelections = {};
  final Map<String, Map<int, String>> _matchingAnswers = {};
  final Map<String, Map<String, String>> _readingAnswers = {};
  final Map<String, Set<int>> _wordSelections = {};
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
              children: [_exercise(lesson, exercise, _exerciseIndex)])),
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
          child: _clickableText(text));
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
                            Expanded(child: _clickableText(item))
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

  Widget _clickableText(String text) {
    final scheme = Theme.of(context).colorScheme;
    return ReaderParagraph(
      text: text,
      settings: const ReaderSettings(
          fontSize: 17, lineHeight: 1.55, firstLineIndent: 0, justify: false),
      textColor: scheme.onSurface,
      highlightColor: scheme.primaryContainer,
      highlightTextColor: scheme.onPrimaryContainer,
      justify: false,
      firstLineIndent: 0,
      onTapWord: (_, token, __) => _showAnalysis(text, token),
    );
  }

  Future<void> _showAnalysis(String sentence, Token token) async {
    final future = AnalysisRepository.instance.analyzeToken(
        sentence: sentence,
        startOffset: token.start,
        endOffset: token.end,
        tokenText: token.text);
    if (!mounted) return;
    await showModalBottomSheet(
        context: context,
        showDragHandle: true,
        builder: (context) => Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
            child: FutureBuilder<WordAnalysis>(
                future: future,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const SizedBox(
                        height: 160,
                        child: Center(child: CircularProgressIndicator()));
                  }
                  if (snapshot.hasError) {
                    return const SizedBox(
                        height: 140,
                        child:
                            Center(child: Text('Не удалось разобрать слово.')));
                  }
                  final word = snapshot.data!;
                  return Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(word.surface,
                            style: Theme.of(context).textTheme.headlineSmall),
                        const SizedBox(height: 8),
                        Text(
                            word.contextualTranslation?.isNotEmpty == true
                                ? word.contextualTranslation!
                                : word.translation,
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        Text('Начальная форма: ${word.lemma}'),
                        if (word.upos.isNotEmpty)
                          Text('Часть речи: ${word.upos}')
                      ]);
                })));
  }

  Widget _exercise(
      CommunityLesson lesson, Map<String, dynamic> exercise, int index) {
    final id = exercise['id']?.toString() ?? 'exercise-$index';
    final type = exercise['type']?.toString() ?? '';
    final hint = exercise['hint']?.toString() ?? '';
    return Padding(
        padding: const EdgeInsets.symmetric(vertical: 18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Задание ${index + 1}',
              style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text(exercise['prompt']?.toString() ?? '',
              style: Theme.of(context).textTheme.titleLarge),
          if (hint.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Padding(
                  padding: EdgeInsets.only(top: 2, right: 6),
                  child: Icon(Icons.lightbulb_outline, size: 18)),
              Expanded(child: Text(hint))
            ])
          ],
          const SizedBox(height: 18),
          switch (type) {
            'multiple_choice' => _choiceExercise(exercise, id),
            'ending_picker' => _endingExercise(exercise, id),
            'sentence_builder' => _tileExercise(exercise, id, false),
            'letter_unscramble' => _tileExercise(exercise, id, true),
            'matching' => _matchingExercise(exercise, id),
            'fill_blank' => _fillBlankExercise(exercise, id),
            'image_description' => _writtenExercise(exercise, id, image: true),
            'reading_qa' => _readingExercise(exercise, id),
            'form_hunt' => _formHuntExercise(exercise, id),
            'teacher_letter' => _teacherLetterExercise(lesson, exercise, id),
            _ => _writtenExercise(exercise, id),
          },
          if ((_feedback[id] ?? '').isNotEmpty)
            Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_feedback[id]!,
                    style: TextStyle(
                        color: _feedback[id] == 'Верно'
                            ? Colors.green.shade700
                            : Theme.of(context).colorScheme.primary,
                        fontWeight: FontWeight.w600)))
        ]));
  }

  Widget _choiceExercise(Map<String, dynamic> exercise, String id) {
    final options = _strings(exercise['options']);
    final answer = _answers[id] ?? '';
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      ...options.map((option) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                  alignment: Alignment.centerLeft,
                  padding: const EdgeInsets.all(14)),
              icon: Icon(answer == option
                  ? Icons.radio_button_checked
                  : Icons.radio_button_off),
              label: Text(option),
              onPressed: () => setState(() {
                    _answers[id] = option;
                    _feedback.remove(id);
                  })))),
      Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.icon(
              icon: const Icon(Icons.check),
              label: const Text('Проверить'),
              onPressed: answer.isEmpty ? null : () => _check(exercise, id)))
    ]);
  }

  Widget _endingExercise(Map<String, dynamic> exercise, String id) {
    final options = _strings(exercise['options']);
    final selected = _answers[id] ?? '';
    final stem = exercise['stem']?.toString() ?? '';
    final contextText = exercise['context']?.toString() ?? '';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (contextText.isNotEmpty || stem.isNotEmpty)
        Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            child: Text(contextText.isEmpty
                ? '${stem}___'
                : contextText.replaceFirst('___', '${stem}___'))),
      const SizedBox(height: 12),
      Wrap(
          spacing: 8,
          runSpacing: 8,
          children: options
              .map((option) => ChoiceChip(
                  label: Text(option),
                  selected: selected == option,
                  onSelected: (_) => setState(() {
                        _answers[id] = option;
                        _feedback.remove(id);
                      })))
              .toList()),
      if (selected.isNotEmpty) ...[
        const SizedBox(height: 12),
        Text('Получается: $stem$selected')
      ],
      const SizedBox(height: 14),
      FilledButton.icon(
          icon: const Icon(Icons.check),
          label: const Text('Проверить'),
          onPressed: selected.isEmpty ? null : () => _check(exercise, id))
    ]);
  }

  Widget _tileExercise(Map<String, dynamic> exercise, String id, bool letters) {
    final source = letters
        ? [
            ...(exercise['answer']?.toString() ?? '')
                .runes
                .map(String.fromCharCode),
            ..._strings(exercise['distractors'])
          ]
        : [
            ..._strings(exercise['tokens']),
            ..._strings(exercise['distractors'])
          ];
    final tiles = source.reversed.toList();
    final selected = _tileSelections[id] ?? const <int>[];
    final value =
        selected.map((index) => tiles[index]).join(letters ? '' : ' ');
    _answers[id] = value;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
          constraints: const BoxConstraints(minHeight: 58),
          width: double.infinity,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              border: Border(
                  bottom: BorderSide(
                      width: 2, color: Theme.of(context).dividerColor))),
          child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: selected
                  .map((tileIndex) => ActionChip(
                      label: Text(tiles[tileIndex]),
                      onPressed: () => setState(() {
                            _tileSelections[id] = selected
                                .where((index) => index != tileIndex)
                                .toList();
                            _feedback.remove(id);
                          })))
                  .toList())),
      const SizedBox(height: 12),
      Wrap(
          spacing: 8,
          runSpacing: 8,
          children: List.generate(tiles.length, (tileIndex) {
            if (selected.contains(tileIndex)) return const SizedBox.shrink();
            return ActionChip(
                label: Text(tiles[tileIndex]),
                onPressed: () => setState(() {
                      _tileSelections[id] = [...selected, tileIndex];
                      _feedback.remove(id);
                    }));
          })),
      const SizedBox(height: 14),
      Row(children: [
        FilledButton.icon(
            icon: const Icon(Icons.check),
            label: const Text('Проверить'),
            onPressed: selected.isEmpty ? null : () => _check(exercise, id)),
        const SizedBox(width: 6),
        IconButton(
            tooltip: 'Начать заново',
            icon: const Icon(Icons.restart_alt),
            onPressed: selected.isEmpty
                ? null
                : () => setState(() {
                      _tileSelections[id] = [];
                      _answers[id] = '';
                      _feedback.remove(id);
                    }))
      ])
    ]);
  }

  Widget _matchingExercise(Map<String, dynamic> exercise, String id) {
    final pairs = _maps(exercise['pairs']);
    final rights = pairs
        .map((pair) => pair['right']?.toString() ?? '')
        .where((value) => value.isNotEmpty)
        .toList()
        .reversed
        .toList();
    final answers = _matchingAnswers[id] ?? <int, String>{};
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (var index = 0; index < pairs.length; index++)
        Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(children: [
              Expanded(child: Text(pairs[index]['left']?.toString() ?? '')),
              const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8),
                  child: Icon(Icons.arrow_forward, size: 18)),
              Expanded(
                  child: DropdownButton<String>(
                      isExpanded: true,
                      hint: const Text('Выберите'),
                      value: answers[index]?.isNotEmpty == true
                          ? answers[index]
                          : null,
                      items: rights
                          .map((right) => DropdownMenuItem(
                              value: right, child: Text(right)))
                          .toList(),
                      onChanged: (value) => setState(() {
                            _matchingAnswers[id] = {
                              ...answers,
                              index: value ?? ''
                            };
                            _feedback.remove(id);
                          })))
            ])),
      Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.icon(
              icon: const Icon(Icons.check),
              label: const Text('Проверить'),
              onPressed: pairs.isEmpty || answers.length < pairs.length
                  ? null
                  : () => _check(exercise, id)))
    ]);
  }

  Widget _fillBlankExercise(Map<String, dynamic> exercise, String id) {
    final contextText = exercise['context']?.toString() ?? '___';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          color: Theme.of(context).colorScheme.surfaceContainerLow,
          child: Text(contextText)),
      const SizedBox(height: 12),
      TextFormField(
          key: ValueKey('blank-$id'),
          initialValue: _answers[id],
          decoration: const InputDecoration(labelText: 'Слово в пропуске'),
          onChanged: (value) => setState(() {
                _answers[id] = value;
                _feedback.remove(id);
              })),
      const SizedBox(height: 14),
      FilledButton.icon(
          icon: const Icon(Icons.check),
          label: const Text('Проверить'),
          onPressed: (_answers[id] ?? '').trim().isEmpty
              ? null
              : () => _check(exercise, id))
    ]);
  }

  Widget _writtenExercise(Map<String, dynamic> exercise, String id,
      {bool image = false}) {
    final imageUrl = exercise['imageUrl']?.toString() ?? '';
    final contextText = exercise['context']?.toString() ?? '';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (image && imageUrl.isNotEmpty) ...[
        ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(imageUrl,
                width: double.infinity,
                height: 260,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox(
                    height: 120,
                    child: Center(child: Icon(Icons.broken_image_outlined))))),
        const SizedBox(height: 14)
      ],
      if (contextText.isNotEmpty) ...[
        Text(contextText, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 10)
      ],
      TextFormField(
          key: ValueKey('written-$id'),
          initialValue: _answers[id],
          minLines: 3,
          maxLines: 7,
          decoration: const InputDecoration(hintText: 'Ваш ответ'),
          onChanged: (value) => setState(() {
                _answers[id] = value;
                _feedback.remove(id);
              })),
      const SizedBox(height: 14),
      FilledButton.icon(
          icon: const Icon(Icons.check),
          label: const Text('Проверить'),
          onPressed: (_answers[id] ?? '').trim().isEmpty
              ? null
              : () => _check(exercise, id))
    ]);
  }

  Widget _readingExercise(Map<String, dynamic> exercise, String id) {
    final questions = _maps(exercise['questions']);
    final answers = _readingAnswers[id] ?? <String, String>{};
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          color: Theme.of(context).colorScheme.surfaceContainerLow,
          child: _clickableText(exercise['readingText']?.toString() ?? '')),
      const SizedBox(height: 18),
      for (var index = 0; index < questions.length; index++) ...[
        Text('${index + 1}. ${questions[index]['prompt'] ?? ''}',
            style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        ..._strings(questions[index]['options']).map((option) {
          final questionId = questions[index]['id']?.toString() ?? '$index';
          return Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: OutlinedButton.icon(
                  style:
                      OutlinedButton.styleFrom(alignment: Alignment.centerLeft),
                  icon: Icon(answers[questionId] == option
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off),
                  label: Text(option),
                  onPressed: () => setState(() {
                        _readingAnswers[id] = {...answers, questionId: option};
                        _feedback.remove(id);
                      })));
        }),
        const SizedBox(height: 10)
      ],
      FilledButton.icon(
          icon: const Icon(Icons.check),
          label: const Text('Проверить'),
          onPressed: questions.isEmpty || answers.length < questions.length
              ? null
              : () => _check(exercise, id))
    ]);
  }

  Widget _formHuntExercise(Map<String, dynamic> exercise, String id) {
    final words =
        SerbianTokenizer.tokenize(exercise['context']?.toString() ?? '')
            .where((token) => token.isWord)
            .toList();
    final selected = _wordSelections[id] ?? <int>{};
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          color: Theme.of(context).colorScheme.surfaceContainerLow,
          child: Wrap(
              spacing: 3,
              runSpacing: 6,
              children: List.generate(words.length, (index) {
                final active = selected.contains(index);
                return InkWell(
                    borderRadius: BorderRadius.circular(4),
                    onTap: () => setState(() {
                          _wordSelections[id] = active
                              ? ({...selected}..remove(index))
                              : {...selected, index};
                          _feedback.remove(id);
                        }),
                    child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 4, vertical: 2),
                        color: active
                            ? Theme.of(context).colorScheme.primaryContainer
                            : null,
                        child: Text(words[index].text)));
              }))),
      const SizedBox(height: 14),
      FilledButton.icon(
          icon: const Icon(Icons.check),
          label: const Text('Проверить'),
          onPressed: selected.isEmpty ? null : () => _check(exercise, id))
    ]);
  }

  Widget _teacherLetterExercise(
      CommunityLesson lesson, Map<String, dynamic> exercise, String id) {
    final criteria = exercise['criteria']?.toString() ?? '';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (criteria.isNotEmpty) ...[
        Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            child: Text('Критерии: $criteria')),
        const SizedBox(height: 12)
      ],
      TextFormField(
          key: ValueKey('letter-$id'),
          initialValue: _answers[id],
          minLines: 6,
          maxLines: 10,
          decoration:
              const InputDecoration(hintText: 'Напишите текст по-сербски'),
          onChanged: (value) => setState(() {
                _answers[id] = value;
                _feedback.remove(id);
              })),
      const SizedBox(height: 14),
      FilledButton.icon(
          icon: const Icon(Icons.send_outlined),
          label: const Text('Отправить преподавателю'),
          onPressed: (_answers[id] ?? '').trim().isEmpty
              ? null
              : () => _sendLetter(lesson, id))
    ]);
  }

  void _check(Map<String, dynamic> exercise, String id) {
    final type = exercise['type']?.toString() ?? '';
    final expected = _normalize(
        (exercise['referenceAnswer'] ?? exercise['answer'] ?? '').toString());
    var correct = false;
    var selfCheck = expected.isEmpty;

    if (type == 'matching') {
      final pairs = _maps(exercise['pairs']);
      final answers = _matchingAnswers[id] ?? const <int, String>{};
      correct = List.generate(pairs.length, (index) => index).every((index) =>
          _normalize(answers[index] ?? '') ==
          _normalize(pairs[index]['right']?.toString() ?? ''));
    } else if (type == 'reading_qa') {
      final questions = _maps(exercise['questions']);
      final answers = _readingAnswers[id] ?? const <String, String>{};
      correct = questions.every((question) {
        final questionId = question['id']?.toString() ?? '';
        return _normalize(answers[questionId] ?? '') ==
            _normalize(question['answer']?.toString() ?? '');
      });
    } else if (type == 'form_hunt') {
      final words =
          SerbianTokenizer.tokenize(exercise['context']?.toString() ?? '')
              .where((token) => token.isWord)
              .toList();
      final selected = _wordSelections[id] ?? const <int>{};
      final targets = _strings(exercise['targetWords']).map(_normalize).toSet();
      correct = List.generate(words.length, (index) => index).every((index) =>
          selected.contains(index) ==
          targets.contains(_normalize(words[index].text)));
    } else if (type == 'fill_blank') {
      final accepted = _strings(exercise['acceptedAnswers']);
      final values =
          (accepted.isEmpty ? [exercise['answer']?.toString() ?? ''] : accepted)
              .map(_normalize);
      correct = values.contains(_normalize(_answers[id] ?? ''));
    } else if (type == 'ending_picker') {
      final ending = _normalize(_answers[id] ?? '');
      final whole = _normalize(
          '${exercise['stem']?.toString() ?? ''}${_answers[id] ?? ''}');
      correct = ending == _normalize(exercise['answer']?.toString() ?? '') ||
          whole == _normalize(exercise['referenceAnswer']?.toString() ?? '');
    } else {
      correct = _normalize(_answers[id] ?? '') == expected;
      selfCheck =
          selfCheck || type == 'explain_word' || type == 'image_description';
    }

    setState(() {
      if (selfCheck) {
        _feedback[id] = expected.isEmpty
            ? 'Ответ сохранён для самопроверки.'
            : 'Сравните с примером: ${exercise['referenceAnswer'] ?? exercise['answer']}';
      } else {
        _feedback[id] = correct
            ? 'Верно'
            : expected.isEmpty
                ? 'Попробуйте ещё раз.'
                : 'Эталон: ${exercise['referenceAnswer'] ?? exercise['answer']}';
      }
    });
  }

  Future<void> _sendLetter(CommunityLesson lesson, String id) async {
    final answer = _answers[id]?.trim() ?? '';
    if (answer.isEmpty) {
      setState(() => _feedback[id] = 'Сначала напишите ответ.');
      return;
    }
    try {
      await widget.service.submitLetter(lesson, id, answer);
      if (mounted) {
        setState(() {
          _answers[id] = '';
          _feedback[id] = 'Работа отправлена преподавателю.';
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _feedback[id] = e.message);
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
                        _clickableText(node?['text']?.toString() ?? '')
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
  static String _normalize(String value) =>
      value.trim().toLowerCase().replaceFirst(RegExp(r'[.!?,;:]+$'), '');
  static String _typeLabel(String value) =>
      const {
        'lexicon': 'Лексика',
        'grammar': 'Грамматика',
        'speaking': 'Говорение',
        'writing': 'Письмо'
      }[value] ??
      value;
}
