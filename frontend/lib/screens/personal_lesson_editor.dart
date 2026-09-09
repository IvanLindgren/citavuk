import 'dart:convert';

import 'package:flutter/material.dart';

import '../models/personal_lesson.dart';
import '../services/api_client.dart';
import '../services/personal_service.dart';

class PersonalLessonEditor extends StatefulWidget {
  const PersonalLessonEditor(
      {super.key,
      required this.service,
      required this.planID,
      required this.lesson});
  final PersonalService service;
  final String planID;
  final PersonalLesson lesson;
  @override
  State<PersonalLessonEditor> createState() => _PersonalLessonEditorState();
}

class _PersonalLessonEditorState extends State<PersonalLessonEditor> {
  late final Map<String, dynamic> _draft =
      jsonDecode(jsonEncode(widget.lesson.content.toJson()))
          as Map<String, dynamic>;
  bool _busy = false;
  bool _dirty = false;
  bool _leaving = false;
  int _structure = 0;
  String? _error;
  void _change(VoidCallback action, {bool structure = false}) {
    setState(() { action(); _dirty = true; if (structure) _structure++; });
  }

  Future<void> _leave() async {
    if (_busy || _leaving) return;
    final discard = !_dirty || await showDialog<bool>(context: context,
      builder: (context) => AlertDialog(title: const Text('Оставить правки?'),
        content: const Text('Несохранённые изменения будут потеряны.'), actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Продолжить редактировать')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Уйти без сохранения')),
        ])) == true;
    if (!mounted || !discard) return;
    setState(() => _leaving = true);
    WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) Navigator.pop(context); });
  }
  Future<void> _save() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.service.edit(widget.planID, widget.lesson.card.day,
          widget.lesson.card.revision, _draft);
      if (mounted) {
        setState(() { _dirty = false; _leaving = true; });
        WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) Navigator.pop(context, true); });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = e is ApiException
            ? e.message
            : 'Не удалось сохранить. Правки остались на экране.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(String label, dynamic target, dynamic key,
          {int max = 1200, int lines = 2}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: TextFormField(
              key: ValueKey('$_structure:${identityHashCode(target)}:$key'),
              initialValue: target[key]?.toString() ?? '',
              enabled: !_busy,
              maxLength: max,
              minLines: lines,
              maxLines: lines == 1 ? 2 : 8,
              decoration:
                  InputDecoration(labelText: label, alignLabelWithHint: true),
              onChanged: (v) => _change(() => target[key] = v)));
  @override
  Widget build(BuildContext context) {
    final rules = _draft['rules'] as List,
        scheme = _draft['scheme'] as Map,
        exercises = _draft['exercises'] as List;
    return PopScope(canPop: _leaving || (!_dirty && !_busy),
      onPopInvokedWithResult: (didPop, result) { if (!didPop) _leave(); },
      child: Scaffold(
        appBar: AppBar(title: const Text('Твой вариант урока')),
        body: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1000),
                child: ListView(padding: const EdgeInsets.all(24), children: [
                  const Text(
                      'Изменения видишь только ты. Результат пройденного урока не меняется.'),
                  const SizedBox(height: 24),
                  _field('Название', _draft, 'title', max: 120, lines: 1),
                  _field('Тема', _draft, 'theme', max: 120, lines: 1),
                  _field('Материал урока', _draft, 'text',
                      max: 12000, lines: 6),
                  for (var i = 0; i < rules.length; i++) ...[
                    _field('Правило ${i + 1}', rules, i, max: 1500),
                    TextButton(onPressed: _busy || rules.length <= 1 ? null : () => _change(() => rules.removeAt(i), structure: true), child: const Text('Удалить правило')),
                  ],
                  TextButton.icon(onPressed: _busy || rules.length >= 8 ? null : () => _change(() => rules.add(''), structure: true), icon: const Icon(Icons.add), label: const Text('Добавить правило')),
                  _field('Название схемы', scheme, 'title', max: 160, lines: 1),
                  for (var i = 0; i < (scheme['columns'] as List).length; i++)
                    _field('Столбец ${i + 1}', scheme['columns'], i,
                        max: 100, lines: 1),
                  for (var i = 0; i < (scheme['rows'] as List).length; i++)
                    for (var j = 0; j < (scheme['columns'] as List).length; j++)
                      _field(
                          'Строка ${i + 1}: ${(scheme['columns'] as List)[j]}',
                          (scheme['rows'] as List)[i],
                          j,
                          max: 500,
                          lines: 1),
                  for (var i = 0; i < exercises.length; i++) ...[
                    Text('Задание ${i + 1}',
                        style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      key: ValueKey('kind:$_structure:$i'),
                      initialValue: exercises[i]['kind'] as String,
                      decoration: const InputDecoration(labelText: 'Тип задания'),
                      items: const [DropdownMenuItem(value: 'choice', child: Text('Выбор ответа')), DropdownMenuItem(value: 'fill', child: Text('Вставить слово')), DropdownMenuItem(value: 'translate', child: Text('Перевод'))],
                      onChanged: _busy ? null : (value) { if (value != null) _change(() {exercises[i]['kind'] = value; exercises[i]['options'] = value == 'choice' ? ['', ''] : []; exercises[i]['acceptedAnswers'] = [];}, structure: true); }),
                    _field('Вопрос', exercises[i], 'question'),
                    _field('Образец ответа', exercises[i], 'answer'),
                    _field('Подсказка', exercises[i], 'hint'),
                    for (var j = 0;
                        j <
                            ((exercises[i] as Map)['options'] as List? ?? [])
                                .length;
                        j++)
                      _field('Вариант ${j + 1}',
                          (exercises[i] as Map)['options'], j,
                          max: 500, lines: 1),
                    if (exercises[i]['kind'] != 'choice') ...[
                      for (var j = 0; j < ((exercises[i]['acceptedAnswers'] as List?) ?? []).length; j++) ...[
                        _field('Допустимый ответ ${j + 1}', exercises[i]['acceptedAnswers'], j),
                        TextButton(onPressed: _busy ? null : () => _change(() => (exercises[i]['acceptedAnswers'] as List).removeAt(j), structure: true), child: const Text('Удалить вариант ответа')),
                      ],
                      TextButton(onPressed: _busy || ((exercises[i]['acceptedAnswers'] as List?) ?? []).length >= 8 ? null : () => _change(() { exercises[i]['acceptedAnswers'] ??= <String>[]; (exercises[i]['acceptedAnswers'] as List).add(''); }, structure: true), child: const Text('Добавить допустимый ответ')),
                    ],
                    TextButton(onPressed: _busy || exercises.length <= 4 ? null : () => _change(() => exercises.removeAt(i), structure: true), child: const Text('Удалить задание')),
                  ],
                  OutlinedButton.icon(onPressed: _busy || exercises.length >= 8 ? null : () => _change(() => exercises.add({'kind': 'translate', 'question': '', 'answer': '', 'hint': '', 'options': <String>[], 'acceptedAnswers': <String>[]}), structure: true), icon: const Icon(Icons.add), label: const Text('Добавить задание')),
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Text(_error!)),
                  FilledButton(
                      onPressed: _busy ? null : _save,
                      child: Text(_busy ? 'Сохраняем…' : 'Сохранить')),
                ])))));
  }
}
