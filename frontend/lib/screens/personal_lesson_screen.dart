import 'dart:async';

import 'package:flutter/material.dart';

import '../models/personal_lesson.dart';
import '../services/api_client.dart';
import '../services/personal_service.dart';
import '../services/listening_service.dart';
import '../widgets/personal_playing_card.dart';
import 'listening_player_screen.dart';
import 'personal_lesson_editor.dart';

class PersonalLessonScreen extends StatefulWidget {
  const PersonalLessonScreen(
      {super.key,
      required this.service,
      required this.plan,
      required this.day});
  final PersonalService service;
  final PersonalPlan plan;
  final int day;
  @override
  State<PersonalLessonScreen> createState() => _PersonalLessonScreenState();
}

class _PersonalLessonScreenState extends State<PersonalLessonScreen> {
  PersonalLesson? _lesson;
  String? _error;
  bool _busy = false;
  List<String> _answers = [];
  Map<String, dynamic>? _result;
  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final l = await widget.service.lesson(widget.plan.id, widget.day);
      if (mounted) {
        setState(() {
          _lesson = l;
          _answers = List.filled(l.content.exercises.length, '');
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error =
            e is ApiException ? e.message : 'Не удалось загрузить урок.');
      }
    }
  }

  Future<void> _act(Future<void> Function() work) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await work();
    } catch (e) {
      if (mounted) {
        setState(() => _error = e is ApiException
            ? e.message
            : 'Не удалось сохранить. Твои ответы остались на экране.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _edit() async {
    final l = _lesson;
    if (l == null) return;
    final saved = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
            builder: (_) => PersonalLessonEditor(
                service: widget.service, planID: widget.plan.id, lesson: l)));
    if (mounted && saved == true) {
      setState(() => _result = null);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = _lesson, c = l?.content, scheme = Theme.of(context).colorScheme;
    Widget panel(List<Widget> children) => Container(
        margin: const EdgeInsets.symmetric(vertical: 12),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
            color: scheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: scheme.outlineVariant)),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start, children: children));
    Widget heading(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text(text, style: Theme.of(context).textTheme.headlineSmall));
    return Scaffold(
        appBar: AppBar(title: Text('Карта ${widget.day}'), actions: [
          IconButton(
              onPressed: _busy || l == null ? null : _edit,
              tooltip: 'Изменить свой урок',
              icon: const Icon(Icons.edit_outlined))
        ]),
        body: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1000),
                child: ListView(padding: const EdgeInsets.all(24), children: [
                  if (_error != null) ...[
                    Text(_error!),
                    TextButton(
                        onPressed: _load, child: const Text('Обновить урок'))
                  ],
                  if (c == null && _error == null)
                    const Center(child: CircularProgressIndicator()),
                  if (c != null && l != null) ...[
                    Wrap(
                        spacing: 12,
                        runSpacing: 10,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                  border:
                                      Border.all(color: scheme.outlineVariant),
                                  borderRadius: BorderRadius.circular(8)),
                              child: Text(
                                  '${personalSuit(c.kind)}  Карта ${widget.day}',
                                  style: TextStyle(
                                      fontFamily: 'Lora',
                                      color: scheme.primary,
                                      fontWeight: FontWeight.w700))),
                          Text(personalKinds[c.kind] ?? 'Урок',
                              style: TextStyle(color: scheme.onSurfaceVariant)),
                        ]),
                    heading(c.title),
                    Text(c.theme,
                        style: TextStyle(
                            color: scheme.onSurfaceVariant, fontSize: 17)),
                    if (l.card.edited) const Text('С твоими правками'),
                    panel([
                      if (c.kind == 'listening')
                        FilledButton.icon(
                          icon: const Icon(Icons.headphones),
                          label: const Text('Послушать текст'),
                          onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (_) => ListeningPlayerScreen(
                                      lesson: ListeningService.instance
                                          .lessonFromText(
                                              id: 'personal:${widget.plan.id}:${widget.day}',
                                              title: c.title,
                                              paragraphs: [c.text])))),
                        ),
                      SelectableText(c.text,
                          style: const TextStyle(fontSize: 19, height: 1.75)),
                      heading('Разберёмся'),
                      for (final rule in c.rules)
                        Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: SelectableText('• $rule',
                                style: const TextStyle(
                                    fontSize: 17, height: 1.6))),
                      heading(c.schemeTitle),
                      LayoutBuilder(
                          builder: (context, limits) => SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: SizedBox(
                                  width: limits.maxWidth < 550
                                      ? 550
                                      : limits.maxWidth,
                                  child: Table(
                                      border: TableBorder.all(
                                          color: scheme.outlineVariant),
                                      defaultVerticalAlignment:
                                          TableCellVerticalAlignment.middle,
                                      children: [
                                        TableRow(
                                            decoration: BoxDecoration(
                                                color: scheme
                                                    .surfaceContainerHighest),
                                            children: [
                                              for (final h in c.columns)
                                                Padding(
                                                    padding:
                                                        const EdgeInsets.all(
                                                            12),
                                                    child: Text(h,
                                                        style: const TextStyle(
                                                            fontWeight:
                                                                FontWeight
                                                                    .w700)))
                                            ]),
                                        for (final row in c.rows)
                                          TableRow(children: [
                                            for (final v in row)
                                              Padding(
                                                  padding:
                                                      const EdgeInsets.all(12),
                                                  child: SelectableText(v))
                                          ])
                                      ])))),
                    ]),
                    panel([
                      heading('Попробуй сам'),
                      for (var i = 0; i < c.exercises.length; i++)
                        Padding(
                            padding: const EdgeInsets.only(bottom: 28),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('${i + 1}. ${c.exercises[i].question}',
                                      style: const TextStyle(
                                          fontSize: 19,
                                          fontWeight: FontWeight.w600)),
                                  const SizedBox(height: 12),
                                  if (c.exercises[i].kind == 'choice')
                                    Wrap(
                                        spacing: 10,
                                        runSpacing: 10,
                                        children: [
                                          for (final o
                                              in c.exercises[i].options)
                                            ChoiceChip(
                                                label: Padding(
                                                    padding: const EdgeInsets
                                                        .symmetric(vertical: 8),
                                                    child: Text(o)),
                                                selected: _answers[i] == o,
                                                onSelected: _busy ||
                                                        _result != null
                                                    ? null
                                                    : (_) => setState(
                                                        () => _answers[i] = o))
                                        ])
                                  else
                                    TextFormField(
                                        key: ValueKey('${l.card.revision}:$i'),
                                        initialValue: _answers[i],
                                        enabled: !_busy && _result == null,
                                        minLines: 1,
                                        maxLines: 4,
                                        maxLength: 1500,
                                        autocorrect: false,
                                        decoration: const InputDecoration(
                                            labelText: 'Твой ответ'),
                                        onChanged: (v) =>
                                            setState(() => _answers[i] = v)),
                                  if (c.exercises[i].hint.isNotEmpty)
                                    ExpansionTile(
                                        tilePadding: EdgeInsets.zero,
                                        title: const Text('Подсказка'),
                                        children: [
                                          Align(
                                              alignment: Alignment.centerLeft,
                                              child: Text(c.exercises[i].hint))
                                        ]),
                                  if (_result != null)
                                    Text(
                                        'Образец ответа: ${c.exercises[i].answer}',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w600)),
                                ])),
                      FilledButton(
                          onPressed: _busy ||
                                  _result != null ||
                                  _answers.any((a) => a.trim().isEmpty)
                              ? null
                              : () => _act(() async {
                                    final result = await widget.service
                                        .complete(widget.plan.id, widget.day,
                                            l.card.revision, List.of(_answers));
                                    if (mounted) {
                                      setState(() => _result = result);
                                    }
                                  }),
                          child: const Text('Завершить урок'))
                    ]),
                    if (_result != null || l.card.completedAt != null)
                      panel([
                        heading(
                            'Урок пройден: ${_result?['score'] ?? l.card.score} из ${_result?['total'] ?? l.card.total}'),
                        if ((_result?['study'] as Map?)?['newDay'] == true)
                          Text(
                              'Огонь зажжён! Серия: ${(_result!['study'] as Map)['current']}. Заморозок осталось: ${(_result!['study'] as Map)['freezes']}.'),
                        const Text('Урок был полезен?'),
                        const SizedBox(height: 12),
                        Wrap(spacing: 12, children: [
                          for (final r in [1, -1])
                            OutlinedButton.icon(
                                onPressed: _busy
                                    ? null
                                    : () => _act(() async {
                                          await widget.service.rate(
                                              widget.plan.id, widget.day, r);
                                          if (mounted) {
                                            ScaffoldMessenger.of(this.context)
                                                .showSnackBar(const SnackBar(
                                                    content: Text(
                                                        'Спасибо за оценку!')));
                                          }
                                        }),
                                icon: Icon(r == 1
                                    ? Icons.thumb_up_outlined
                                    : Icons.thumb_down_outlined),
                                label: Text(r == 1 ? 'Да' : 'Не очень'))
                        ]),
                      ]),
                  ],
                ]))));
  }
}
