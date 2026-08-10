import 'package:flutter/material.dart';

import '../course/services/serbian_text.dart';
import '../utils/tokenizer.dart';
import 'clickable_serbian_text.dart';

/// Проигрыватель упражнений — общий для уроков преподавателей и дорожной карты.
///
/// Формат заданий у них один (LessonExercise), и второй проигрыватель означал
/// бы, что каждый новый вид упражнения нужно писать во Flutter дважды. Раньше
/// эти виджеты были методами экрана урока; здесь они те же, но с ответами,
/// вынесенными наружу.
///
/// Задание показывается по одному, поэтому ответы живут не внутри виджета:
/// иначе переход к следующему заданию и обратно стирал бы написанное.
class ExerciseAnswers {
  /// Свободный ввод и выбранные варианты.
  final Map<String, String> text = {};

  /// Что показано человеку после проверки.
  final Map<String, String> feedback = {};

  /// Собранные плитки: порядок выбранных.
  final Map<String, List<int>> tiles = {};

  /// Соответствия: строка слева -> выбранное справа.
  final Map<String, Map<int, String>> matching = {};

  /// Ответы на вопросы к тексту.
  final Map<String, Map<String, String>> reading = {};

  /// Отмеченные слова в поиске форм.
  final Map<String, Set<int>> words = {};

  /// Задания, по которым проверка уже была. Нужны, чтобы исход уходил наружу
  /// один раз: повторные нажатия иначе набивали бы долю верных.
  final Set<String> checked = {};
}

class ExerciseView extends StatefulWidget {
  const ExerciseView({
    super.key,
    required this.exercise,
    required this.index,
    required this.answers,
    this.onLetter,
    this.onChecked,
  });

  final Map<String, dynamic> exercise;
  final int index;
  final ExerciseAnswers answers;

  /// Отправка письма преподавателю. null — вида «письмо» нет: вне урока
  /// отправлять работу некому.
  final Future<String?> Function(String id, String answer)? onLetter;

  /// Исход первой проверки задания.
  final ValueChanged<bool>? onChecked;

  @override
  State<ExerciseView> createState() => _ExerciseViewState();
}

class _ExerciseViewState extends State<ExerciseView> {
  @override
  Widget build(BuildContext context) =>
      _exercise(widget.exercise, widget.index);

  Widget _exercise(Map<String, dynamic> exercise, int index) {
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
            'teacher_letter' when widget.onLetter != null =>
              _teacherLetterExercise(exercise, id),
            'word_drill' => _wordDrillExercise(exercise, id),
            'translator_duel' => _translatorDuelExercise(exercise, id),
            _ => _writtenExercise(exercise, id),
          },
          if ((widget.answers.feedback[id] ?? '').isNotEmpty)
            Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(widget.answers.feedback[id]!,
                    style: TextStyle(
                        color: widget.answers.feedback[id] == 'Верно'
                            ? Colors.green.shade700
                            : Theme.of(context).colorScheme.primary,
                        fontWeight: FontWeight.w600)))
        ]));
  }

  Widget _choiceExercise(Map<String, dynamic> exercise, String id) {
    final options = _strings(exercise['options']);
    final answer = widget.answers.text[id] ?? '';
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
                    widget.answers.text[id] = option;
                    widget.answers.feedback.remove(id);
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
    final selected = widget.answers.text[id] ?? '';
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
                        widget.answers.text[id] = option;
                        widget.answers.feedback.remove(id);
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
    final selected = widget.answers.tiles[id] ?? const <int>[];
    final value =
        selected.map((index) => tiles[index]).join(letters ? '' : ' ');
    widget.answers.text[id] = value;
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
                            widget.answers.tiles[id] = selected
                                .where((index) => index != tileIndex)
                                .toList();
                            widget.answers.feedback.remove(id);
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
                      widget.answers.tiles[id] = [...selected, tileIndex];
                      widget.answers.feedback.remove(id);
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
                      widget.answers.tiles[id] = [];
                      widget.answers.text[id] = '';
                      widget.answers.feedback.remove(id);
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
    final answers = widget.answers.matching[id] ?? <int, String>{};
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
                      hint: const Text('Выбери'),
                      value: answers[index]?.isNotEmpty == true
                          ? answers[index]
                          : null,
                      items: rights
                          .map((right) => DropdownMenuItem(
                              value: right, child: Text(right)))
                          .toList(),
                      onChanged: (value) => setState(() {
                            widget.answers.matching[id] = {
                              ...answers,
                              index: value ?? ''
                            };
                            widget.answers.feedback.remove(id);
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
          initialValue: widget.answers.text[id],
          decoration: const InputDecoration(labelText: 'Слово в пропуске'),
          onChanged: (value) => setState(() {
                widget.answers.text[id] = value;
                widget.answers.feedback.remove(id);
              })),
      const SizedBox(height: 14),
      FilledButton.icon(
          icon: const Icon(Icons.check),
          label: const Text('Проверить'),
          onPressed: (widget.answers.text[id] ?? '').trim().isEmpty
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
          initialValue: widget.answers.text[id],
          minLines: 3,
          maxLines: 7,
          decoration: const InputDecoration(hintText: 'Твой ответ'),
          onChanged: (value) => setState(() {
                widget.answers.text[id] = value;
                widget.answers.feedback.remove(id);
              })),
      const SizedBox(height: 14),
      FilledButton.icon(
          icon: const Icon(Icons.check),
          label: const Text('Проверить'),
          onPressed: (widget.answers.text[id] ?? '').trim().isEmpty
              ? null
              : () => _check(exercise, id))
    ]);
  }

  Widget _readingExercise(Map<String, dynamic> exercise, String id) {
    final questions = _maps(exercise['questions']);
    final answers = widget.answers.reading[id] ?? <String, String>{};
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          color: Theme.of(context).colorScheme.surfaceContainerLow,
          child: ClickableSerbianText(exercise['readingText']?.toString() ?? '')),
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
                        widget.answers.reading[id] = {...answers, questionId: option};
                        widget.answers.feedback.remove(id);
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
    final selected = widget.answers.words[id] ?? <int>{};
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
                          widget.answers.words[id] = active
                              ? ({...selected}..remove(index))
                              : {...selected, index};
                          widget.answers.feedback.remove(id);
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

  Widget _teacherLetterExercise(Map<String, dynamic> exercise, String id) {
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
          initialValue: widget.answers.text[id],
          minLines: 6,
          maxLines: 10,
          decoration:
              const InputDecoration(hintText: 'Напишите текст по-сербски'),
          onChanged: (value) => setState(() {
                widget.answers.text[id] = value;
                widget.answers.feedback.remove(id);
              })),
      const SizedBox(height: 14),
      FilledButton.icon(
          icon: const Icon(Icons.send_outlined),
          label: const Text('Отправить преподавателю'),
          onPressed: (widget.answers.text[id] ?? '').trim().isEmpty
              ? null
              : () => _sendLetter(id))
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
      final answers = widget.answers.matching[id] ?? const <int, String>{};
      correct = List.generate(pairs.length, (index) => index).every((index) =>
          _normalize(answers[index] ?? '') ==
          _normalize(pairs[index]['right']?.toString() ?? ''));
    } else if (type == 'reading_qa') {
      final questions = _maps(exercise['questions']);
      final answers = widget.answers.reading[id] ?? const <String, String>{};
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
      final selected = widget.answers.words[id] ?? const <int>{};
      final targets = _strings(exercise['targetWords']).map(_normalize).toSet();
      correct = List.generate(words.length, (index) => index).every((index) =>
          selected.contains(index) ==
          targets.contains(_normalize(words[index].text)));
    } else if (type == 'fill_blank') {
      final accepted = _strings(exercise['acceptedAnswers']);
      final values =
          (accepted.isEmpty ? [exercise['answer']?.toString() ?? ''] : accepted)
              .map(_normalize);
      correct = values.contains(_normalize(widget.answers.text[id] ?? ''));
    } else if (type == 'ending_picker') {
      final ending = _normalize(widget.answers.text[id] ?? '');
      final whole = _normalize(
          '${exercise['stem']?.toString() ?? ''}${widget.answers.text[id] ?? ''}');
      correct = ending == _normalize(exercise['answer']?.toString() ?? '') ||
          whole == _normalize(exercise['referenceAnswer']?.toString() ?? '');
    } else {
      correct = _normalize(widget.answers.text[id] ?? '') == expected;
      selfCheck =
          selfCheck || type == 'explain_word' || type == 'image_description';
    }

    if (widget.answers.checked.add(id)) {
      widget.onChecked?.call(selfCheck || correct);
    }

    setState(() {
      if (selfCheck) {
        widget.answers.feedback[id] = expected.isEmpty
            ? 'Ответ сохранён для самопроверки.'
            : 'Сравните с примером: ${exercise['referenceAnswer'] ?? exercise['answer']}';
      } else {
        widget.answers.feedback[id] = correct
            ? 'Верно'
            : expected.isEmpty
                ? 'Попробуй ещё раз.'
                : 'Эталон: ${exercise['referenceAnswer'] ?? exercise['answer']}';
      }
    });
  }
  Widget _wordDrillExercise(Map<String, dynamic> exercise, String id) {
    final pairs = _maps(exercise['pairs'])
        .where((pair) =>
            (pair['left']?.toString() ?? '').isNotEmpty &&
            (pair['right']?.toString() ?? '').isNotEmpty)
        .toList();
    if (pairs.isEmpty) return const Text('В задании нет слов.');
    final step = _drillStep.clamp(0, pairs.length - 1);
    final pair = pairs[step];
    final last = step + 1 >= pairs.length;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${step + 1} из ${pairs.length} · верных $_drillRight',
          style: Theme.of(context).textTheme.bodySmall),
      const SizedBox(height: 10),
      Text(pair['left']?.toString() ?? '',
          style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 10),
      TextFormField(
          key: ValueKey('drill-$id-$step'),
          initialValue: '',
          decoration: const InputDecoration(hintText: 'Слово по-сербски'),
          onChanged: (value) => widget.answers.text[id] = value),
      const SizedBox(height: 12),
      Row(children: [
        FilledButton(
            onPressed: () {
              final correct = _normalize(widget.answers.text[id] ?? '') ==
                  _normalize(pair['right']?.toString() ?? '');
              setState(() {
                if (correct) _drillRight += 1;
                widget.answers.feedback[id] = correct
                    ? 'Верно'
                    : 'Правильно: ${pair['right']}';
              });
              // Наружу уходит исход всего прогона, и только когда он окончен:
              // одно задание — одна отметка.
              if (last && widget.answers.checked.add(id)) {
                widget.onChecked?.call(_drillRight * 2 >= pairs.length);
              }
            },
            child: const Text('Проверить')),
        const SizedBox(width: 12),
        if (!last)
          OutlinedButton(
              onPressed: () => setState(() {
                    _drillStep = step + 1;
                    widget.answers.text[id] = '';
                    widget.answers.feedback[id] = '';
                  }),
              child: const Text('Дальше'))
        else
          Text('Готово: $_drillRight из ${pairs.length}',
              style: const TextStyle(fontWeight: FontWeight.w600))
      ])
    ]);
  }

  /// Игра против переводчика: своя версия фразы против машинной.
  ///
  /// Машинный перевод хранится в самом задании, а не запрашивается на лету:
  /// иначе «вы совпали с переводчиком» значило бы разное в разные дни.
  Widget _translatorDuelExercise(Map<String, dynamic> exercise, String id) {
    final machine = exercise['referenceAnswer']?.toString() ?? '';
    final shown = widget.answers.feedback[id]?.isNotEmpty ?? false;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          color: Theme.of(context).colorScheme.surfaceContainerLow,
          child: Text(exercise['context']?.toString() ?? '')),
      const SizedBox(height: 12),
      TextFormField(
          key: ValueKey('duel-$id'),
          initialValue: widget.answers.text[id],
          minLines: 3,
          maxLines: 6,
          decoration:
              const InputDecoration(hintText: 'Твой перевод на сербский'),
          onChanged: (value) => widget.answers.text[id] = value),
      const SizedBox(height: 12),
      FilledButton(
          onPressed: () => _check(exercise, id), child: const Text('Проверить')),
      if (shown && machine.isNotEmpty) ...[
        const SizedBox(height: 12),
        Text('Переводчик перевёл так:',
            style: Theme.of(context).textTheme.labelMedium),
        Text(machine)
      ]
    ]);
  }

  /// Где идёт прогон слов и сколько верных. Живёт в состоянии, а не в ответах:
  /// прогон проходится целиком за один показ задания.
  int _drillStep = 0;
  int _drillRight = 0;

  Future<void> _sendLetter(String id) async {
    final answer = widget.answers.text[id]?.trim() ?? '';
    if (answer.isEmpty) {
      setState(() => widget.answers.feedback[id] = 'Сначала напишите ответ.');
      return;
    }
    final error = await widget.onLetter?.call(id, answer);
    if (!mounted) return;
    setState(() {
      if (error == null) {
        widget.answers.text[id] = '';
        widget.answers.feedback[id] = 'Работа отправлена преподавателю.';
      } else {
        widget.answers.feedback[id] = error;
      }
    });
  }

  static List<Map<String, dynamic>> _maps(dynamic value) =>
      (value as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();

  static List<String> _strings(dynamic value) =>
      (value as List? ?? const []).map((item) => item.toString()).toList();

  // Правило пунктуации общее с курсом и с вебом: пропущенная запятая не
  // отменяет верный ответ (course/services/serbian_text.dart).
  static String _normalize(String value) =>
      stripAnswerPunctuation(value).toLowerCase();
}
