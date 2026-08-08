import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_client.dart';
import '../../services/translation_game_service.dart';

enum _Phase { setup, translate, choose, result, finished }

class TranslationDuelScreen extends StatefulWidget {
  const TranslationDuelScreen({super.key});

  @override
  State<TranslationDuelScreen> createState() => _TranslationDuelScreenState();
}

class _TranslationDuelScreenState extends State<TranslationDuelScreen> {
  static const _levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  static const _rounds = 3;

  String _level = 'A2';
  String _provider = 'deepl';
  int _roundNumber = 1;
  int _userTotal = 0;
  int _translatorTotal = 0;
  int _tiesTotal = 0;
  TranslationGameRound? _round;
  List<TextEditingController> _answers = [];
  final Map<int, TranslationGameVerdict> _verdicts = {};
  _Phase _phase = _Phase.setup;
  String _summary = '';
  String _error = '';
  bool _loading = false;

  String get _translatorName =>
      _provider == 'deepl' ? 'DeepL' : 'Google Translate';

  bool get _allFilled =>
      _answers.length == 5 &&
      _answers.every((controller) => controller.text.trim().isNotEmpty);

  @override
  void dispose() {
    _disposeAnswers();
    super.dispose();
  }

  void _disposeAnswers() {
    for (final controller in _answers) {
      controller.dispose();
    }
    _answers = [];
  }

  Future<void> _startRound(int number) async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final result = await TranslationGameService(
        api: context.read<ApiClient>(),
      ).loadRound(
        level: _level,
        round: number,
        translator: _provider,
      );
      if (!mounted) return;
      _disposeAnswers();
      setState(() {
        _round = result;
        _roundNumber = number;
        _answers = [
          for (var i = 0; i < result.sentences.length; i++)
            TextEditingController(),
        ];
        _verdicts.clear();
        _summary = '';
        _phase = _Phase.translate;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _askGemma() async {
    final round = _round;
    if (round == null || !_allFilled) return;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final result = await TranslationGameService(
        api: context.read<ApiClient>(),
      ).judge(
        round: round,
        answers: [for (final controller in _answers) controller.text.trim()],
      );
      if (!mounted) return;
      setState(() {
        _verdicts
          ..clear()
          ..addEntries(
              result.verdicts.map((item) => MapEntry(item.index, item)));
        _summary = result.summary;
        _phase = _Phase.result;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _choose(int index, TranslationGameWinner winner) {
    setState(() {
      _verdicts[index] = TranslationGameVerdict(
        index: index,
        winner: winner,
        userScore: winner == TranslationGameWinner.user
            ? 10
            : winner == TranslationGameWinner.tie
                ? 8
                : 6,
        translatorScore: winner == TranslationGameWinner.translator
            ? 10
            : winner == TranslationGameWinner.tie
                ? 8
                : 6,
        feedback: 'Оценено вами.',
      );
    });
  }

  void _finishManual() {
    if (_verdicts.length != 5) return;
    setState(() {
      _summary = 'Вы сами сравнили точность и естественность пяти переводов.';
      _phase = _Phase.result;
    });
  }

  (int, int, int) get _roundScore {
    var user = 0;
    var translator = 0;
    var ties = 0;
    for (final verdict in _verdicts.values) {
      switch (verdict.winner) {
        case TranslationGameWinner.user:
          user++;
        case TranslationGameWinner.translator:
          translator++;
        case TranslationGameWinner.tie:
          ties++;
      }
    }
    return (user, translator, ties);
  }

  void _nextRound() {
    final (user, translator, ties) = _roundScore;
    setState(() {
      _userTotal += user;
      _translatorTotal += translator;
      _tiesTotal += ties;
    });
    if (_roundNumber == _rounds) {
      setState(() => _phase = _Phase.finished);
    } else {
      _startRound(_roundNumber + 1);
    }
  }

  void _restart() {
    _disposeAnswers();
    setState(() {
      _round = null;
      _roundNumber = 1;
      _userTotal = 0;
      _translatorTotal = 0;
      _tiesTotal = 0;
      _verdicts.clear();
      _summary = '';
      _error = '';
      _phase = _Phase.setup;
    });
  }

  @override
  Widget build(BuildContext context) => switch (_phase) {
        _Phase.setup => _buildSetup(),
        _Phase.finished => _buildFinished(),
        _ => _buildRound(),
      };

  Widget _buildSetup() {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Ты против переводчика')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: scheme.primary,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.sports_martial_arts, color: scheme.onPrimary),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Победите DeepL или Google Translate',
                        style: TextStyle(
                            fontSize: 23, fontWeight: FontWeight.w800)),
                    SizedBox(height: 6),
                    Text(
                      'Три раунда по пять фраз. Победителя выбираете вы или Gemma 4.',
                      style: TextStyle(height: 1.4),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          const Text('Уровень сербского',
              style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final level in _levels)
                ChoiceChip(
                  label: Text(level),
                  selected: _level == level,
                  onSelected: (_) => setState(() => _level = level),
                ),
            ],
          ),
          const SizedBox(height: 24),
          const Text('Соперник', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'deepl', label: Text('DeepL')),
              ButtonSegment(value: 'google', label: Text('Google Translate')),
            ],
            selected: {_provider},
            onSelectionChanged: (value) =>
                setState(() => _provider = value.first),
            showSelectedIcon: false,
          ),
          if (_error.isNotEmpty) _ErrorMessage(_error),
          const SizedBox(height: 28),
          FilledButton.icon(
            onPressed: _loading ? null : () => _startRound(1),
            icon: _loading
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sports_martial_arts),
            label: const Text('Начать матч'),
          ),
        ],
      ),
    );
  }

  Widget _buildRound() {
    final round = _round!;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text('$_level · раунд $_roundNumber из $_rounds'),
        leading: IconButton(
          tooltip: 'Выйти из матча',
          icon: const Icon(Icons.close),
          onPressed: _restart,
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 126),
        children: [
          LinearProgressIndicator(value: _roundNumber / _rounds, minHeight: 7),
          const SizedBox(height: 14),
          for (var index = 0; index < round.sentences.length; index++)
            Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        CircleAvatar(radius: 15, child: Text('${index + 1}')),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            round.sentences[index].text,
                            style: const TextStyle(
                                fontSize: 17,
                                height: 1.4,
                                fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    if (_phase == _Phase.translate)
                      TextField(
                        controller: _answers[index],
                        minLines: 2,
                        maxLines: 5,
                        maxLength: 1200,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          labelText: 'Ваш перевод',
                          alignLabelWithHint: true,
                          border: OutlineInputBorder(),
                        ),
                      )
                    else ...[
                      _TranslationBox(
                        label: 'Ваш перевод',
                        text: _answers[index].text,
                        highlighted: _verdicts[index]?.winner ==
                            TranslationGameWinner.user,
                      ),
                      const SizedBox(height: 8),
                      _TranslationBox(
                        label: _translatorName,
                        text: round.sentences[index].translatorTranslation,
                        highlighted: _verdicts[index]?.winner ==
                            TranslationGameWinner.translator,
                      ),
                    ],
                    if (_phase == _Phase.choose) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          for (final option in [
                            (TranslationGameWinner.user, 'Я'),
                            (TranslationGameWinner.tie, 'Ничья'),
                            (
                              TranslationGameWinner.translator,
                              _provider == 'deepl' ? 'DeepL' : 'Google'
                            ),
                          ])
                            Expanded(
                              child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 2),
                                child: OutlinedButton(
                                  style: OutlinedButton.styleFrom(
                                    backgroundColor:
                                        _verdicts[index]?.winner == option.$1
                                            ? scheme.primaryContainer
                                            : null,
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 3),
                                  ),
                                  onPressed: () => _choose(index, option.$1),
                                  child: Text(option.$2,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                    if (_phase == _Phase.result &&
                        _verdicts[index] != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: scheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '${_winnerLabel(_verdicts[index]!.winner)} · '
                          '${_verdicts[index]!.userScore.toStringAsFixed(1)} : '
                          '${_verdicts[index]!.translatorScore.toStringAsFixed(1)}. '
                          '${_verdicts[index]!.feedback}',
                          style: const TextStyle(height: 1.4),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          if (_error.isNotEmpty) _ErrorMessage(_error),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
          decoration: BoxDecoration(
            color: scheme.surface,
            border: Border(top: BorderSide(color: scheme.outlineVariant)),
          ),
          child: _buildRoundAction(round),
        ),
      ),
    );
  }

  Widget _buildRoundAction(TranslationGameRound round) {
    if (_phase == _Phase.translate) {
      return FilledButton.icon(
        onPressed:
            _allFilled ? () => setState(() => _phase = _Phase.choose) : null,
        icon: const Icon(Icons.visibility_outlined),
        label: const Text('Открыть перевод соперника'),
      );
    }
    if (_phase == _Phase.choose) {
      return Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: _loading || !round.judgeEnabled ? null : _askGemma,
              icon: _loading
                  ? const SizedBox.square(
                      dimension: 17,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.smart_toy_outlined),
              label: const Text('Gemma 4'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton(
              onPressed: _verdicts.length == 5 ? _finishManual : null,
              child: const Text('Моя оценка'),
            ),
          ),
        ],
      );
    }
    final (user, translator, _) = _roundScore;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Expanded(
              child:
                  Text(_summary, maxLines: 2, overflow: TextOverflow.ellipsis),
            ),
            const SizedBox(width: 8),
            Text('$user : $translator',
                style: const TextStyle(fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _nextRound,
          child: Text(
              _roundNumber == _rounds ? 'Завершить матч' : 'Следующий раунд'),
        ),
      ],
    );
  }

  Widget _buildFinished() {
    final winner = _userTotal > _translatorTotal
        ? 'Вы победили!'
        : _userTotal < _translatorTotal
            ? '$_translatorName победил'
            : 'Ничья';
    return Scaffold(
      appBar: AppBar(title: const Text('Матч завершён')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.sports_martial_arts, size: 64),
              const SizedBox(height: 20),
              Text(winner,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 30, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              Text('$_userTotal : $_translatorTotal',
                  style: const TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Text('Ничьих: $_tiesTotal · всего 15 предложений'),
              const SizedBox(height: 28),
              FilledButton.icon(
                onPressed: _restart,
                icon: const Icon(Icons.replay),
                label: const Text('Сыграть ещё'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _winnerLabel(TranslationGameWinner winner) => switch (winner) {
        TranslationGameWinner.user => 'Лучше ваш перевод',
        TranslationGameWinner.translator => 'Лучше $_translatorName',
        TranslationGameWinner.tie => 'Ничья',
      };
}

class _TranslationBox extends StatelessWidget {
  const _TranslationBox({
    required this.label,
    required this.text,
    required this.highlighted,
  });

  final String label;
  final String text;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: highlighted ? scheme.primaryContainer : null,
        border: Border.all(
          color: highlighted ? scheme.primary : scheme.outlineVariant,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: scheme.onSurfaceVariant,
              )),
          const SizedBox(height: 5),
          Text(text, style: const TextStyle(height: 1.4)),
        ],
      ),
    );
  }
}

class _ErrorMessage extends StatelessWidget {
  const _ErrorMessage(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 14),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.errorContainer,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(text),
      );
}
