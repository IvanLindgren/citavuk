import 'package:flutter/material.dart';

import '../models/level.dart';
import '../services/level_service.dart';
import '../widgets/wolf_mascot.dart';

/// Вопрос об уровне сербского — один раз, при первом входе.
///
/// Раньше уровень спрашивал Вукоток и хранил при устройстве: тот же человек
/// отвечал заново в приложении, в браузере и после переустановки, а остальные
/// разделы о его уровне не знали вовсе. Теперь ответ ложится на аккаунт.
///
/// Не знать своего уровня — обычное дело, и отвечать наугад незачем: рядом тест
/// на десять вопросов. Закрыть окно тоже можно: непрошеная анкета на входе —
/// хороший способ потерять человека, только что заведшего аккаунт.
///
/// Возвращает выбранный уровень либо null, если человек отложил вопрос.
Future<String?> showLevelPrompt(BuildContext context, LevelService levels) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _LevelPromptSheet(levels: levels),
  );
}

class _LevelPromptSheet extends StatefulWidget {
  const _LevelPromptSheet({required this.levels});

  final LevelService levels;

  @override
  State<_LevelPromptSheet> createState() => _LevelPromptSheetState();
}

class _LevelPromptSheetState extends State<_LevelPromptSheet> {
  bool _testing = false;
  bool _busy = false;
  String _error = '';

  List<LevelQuestion>? _questions;
  final Map<String, int> _answers = {};
  LevelTestResult? _result;

  Future<void> _declare(String level) async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final saved = await widget.levels.declare(level);
      if (!mounted) return;
      Navigator.of(context).pop(saved);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Не удалось сохранить уровень';
      });
    }
  }

  Future<void> _startTest() async {
    setState(() {
      _testing = true;
      _error = '';
    });
    try {
      final questions = await widget.levels.test();
      if (!mounted) return;
      setState(() => _questions = questions);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _testing = false;
        _error = 'Не удалось загрузить тест';
      });
    }
  }

  Future<void> _grade() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final result = await widget.levels.grade(_answers);
      if (!mounted) return;
      setState(() {
        _result = result;
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Не удалось проверить ответы';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: .85,
      minChildSize: .5,
      maxChildSize: .95,
      expand: false,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        children: [
          if (_result != null)
            ..._resultView(_result!)
          else if (_testing && _questions != null)
            ..._testView(_questions!)
          else
            ..._askView(),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(_error, style: const TextStyle(color: Color(0xFFB3261E))),
          ],
        ],
      ),
    );
  }

  List<Widget> _askView() => [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const WolfSticker(asset: Wolf.zdravo, size: 84, frame: false),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Насколько хорошо ты знаешь сербский?',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 6),
                  Text(
                    'Спрошу один раз. По ответу подберу ленту и предупрежу, '
                    'если книга окажется тяжеловата.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        for (final level in serbianLevels)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: OutlinedButton(
              onPressed: _busy ? null : () => _declare(level),
              child: Row(
                children: [
                  SizedBox(
                    width: 34,
                    child: Text(level,
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  Expanded(child: Text(serbianLevelNames[level] ?? '')),
                ],
              ),
            ),
          ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _busy ? null : _startTest,
          child: const Text('Не знаю — проверь меня'),
        ),
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('Потом'),
        ),
      ];

  List<Widget> _testView(List<LevelQuestion> questions) => [
        Text('Короткая проверка', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        Text(
          'Десять предложений с пропуском. Не знаешь — пропускай, это тоже ответ.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 18),
        for (var i = 0; i < questions.length; i++) ...[
          Text('${i + 1}. ${questions[i].prompt}',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(questions[i].hint,
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (var o = 0; o < questions[i].options.length; o++)
                ChoiceChip(
                  selected: _answers[questions[i].id] == o,
                  label: Text(questions[i].options[o]),
                  onSelected: (_) =>
                      setState(() => _answers[questions[i].id] = o),
                ),
            ],
          ),
          const SizedBox(height: 18),
        ],
        FilledButton(
          onPressed: _busy ? null : _grade,
          child: const Text('Узнать уровень'),
        ),
        TextButton(
          onPressed: _busy ? null : () => setState(() => _testing = false),
          child: const Text('Выбрать самому'),
        ),
      ];

  List<Widget> _resultView(LevelTestResult result) => [
        const Center(child: WolfSticker(asset: Wolf.zdravo, size: 110)),
        const SizedBox(height: 12),
        Center(
          child: Text('Верных ответов ${result.correct} из ${result.total}',
              style: Theme.of(context).textTheme.bodyMedium),
        ),
        const SizedBox(height: 6),
        Center(
          child: Text(result.level,
              style: Theme.of(context).textTheme.displaySmall),
        ),
        Center(
          child: Text(serbianLevelNames[result.level] ?? '',
              style: Theme.of(context).textTheme.bodyMedium),
        ),
        const SizedBox(height: 14),
        Text(
          'Уровень сохранён. Поменять его можно в настройках аккаунта в любой '
          'момент — это оценка, а не приговор.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 18),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(result.level),
          child: const Text('Понятно'),
        ),
      ];
}
