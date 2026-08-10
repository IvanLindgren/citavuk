/// «Ты против переводчика» — матч из трёх раундов по пять предложений.
///
/// Та же переделка, что на сайте (web/src/pages/TranslationDuel.tsx): фразы
/// идут по одной под часы, а разбор пяти переводов открывается по одному, с
/// паузой — пять сравнений, показанных разом, читатель пролистывает.
///
/// Оформление — обычные виджеты приложения и цвета темы. Была попытка сделать
/// из этого тёмную арену с неоном и искрами; выглядело как чужая игра,
/// вставленная в Читавук, и было выброшено. Азарт держат темп и звук.
///
/// Счёт бой не трогает. Кто выиграл предложение, решает Gemma или сам человек;
/// полосы показывают ровно это (правила — course/duel_score.dart).
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_client.dart';
import '../../services/duel_sounds.dart';
import '../../services/translation_game_service.dart';
import '../duel_score.dart';
import '../widgets/duel_arena.dart';

enum _Phase { setup, translate, choose, resolve, result, finished }

class TranslationDuelScreen extends StatefulWidget {
  const TranslationDuelScreen({super.key});

  @override
  State<TranslationDuelScreen> createState() => _TranslationDuelScreenState();
}

class _TranslationDuelScreenState extends State<TranslationDuelScreen> {
  static const _levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  static const _rounds = 3;

  /// Пауза, после которой темп считается сброшенным.
  static const _idle = Duration(milliseconds: 950);
  static const _tempoDecay = 24.0;
  static const _tempoPerChar = 1.5;
  static const _tempoPerWord = 8.0;

  /// Пауза между открытиями пар в разборе. Меньше — сливается.
  static const _reveal = Duration(milliseconds: 950);

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

  int _index = 0;
  int _heroScore = roundHp;
  int _foeScore = roundHp;
  double _tempo = 0;
  int _streak = 0;
  int _best = 0;
  double _timeLeft = sentenceSeconds.toDouble();
  DuelPose _pose = DuelPose.smug;
  int _shown = 0;
  int _style = 0;
  bool _muted = false;

  Timer? _tick;
  final List<Timer> _scene = [];
  DateTime _lastKey = DateTime.now();
  bool _alarmed = false;
  double _lockedTempo = 0;
  int _lastLength = 0;
  final _inputFocus = FocusNode();

  String get _translatorName =>
      _provider == 'deepl' ? 'DeepL' : 'Google Translate';

  List<TranslationGameSentence> get _sentences => _round?.sentences ?? const [];

  bool get _allFilled =>
      _answers.isNotEmpty &&
      _answers.every((controller) => controller.text.trim().isNotEmpty);

  /// В разборе счёт растёт вместе с открытыми парами, а не прыгает сразу.
  List<TranslationGameVerdict> get _revealed {
    final ordered = [
      for (var at = 0; at < _sentences.length; at++)
        if (_verdicts[at] != null) _verdicts[at]!,
    ];
    if (_phase != _Phase.resolve) return ordered;
    return ordered.take(_shown).toList();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _clearScene();
    _inputFocus.dispose();
    _disposeAnswers();
    super.dispose();
  }

  void _disposeAnswers() {
    for (final controller in _answers) {
      controller.dispose();
    }
    _answers = [];
  }

  void _later(Duration delay, VoidCallback run) {
    _scene.add(Timer(delay, () {
      if (mounted) run();
    }));
  }

  void _clearScene() {
    for (final timer in _scene) {
      timer.cancel();
    }
    _scene.clear();
  }

  // ---------------------------------------------------------------- ход игры

  void _startTick() {
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (!mounted || _phase != _Phase.translate) return;
      setState(() {
        if (DateTime.now().difference(_lastKey) > _idle) {
          _tempo = math.max(0, _tempo - _tempoDecay / 10);
          _streak = 0;
        }
        _timeLeft = math.max(0, _timeLeft - 0.1);
      });
      if (_timeLeft <= 6 && _timeLeft > 0 && !_alarmed) {
        _alarmed = true;
        DuelSounds.instance.play(DuelSound.alarm);
      }
      if (_timeLeft == 0) _intercept();
      _refreshPose();
    });
  }

  void _refreshPose() {
    if (_phase != _Phase.translate || _pose == DuelPose.hurt) return;
    final next = _timeLeft <= 6
        ? DuelPose.hurry
        : _streak >= 12
            ? DuelPose.rhythm
            : _streak > 0
                ? DuelPose.typing
                : DuelPose.smug;
    if (next != _pose) setState(() => _pose = next);
  }

  /// Время фразы вышло. Счёт это не трогает — сгорает темп.
  void _intercept() {
    DuelSounds.instance.play(DuelSound.guard);
    setState(() {
      _pose = DuelPose.hurt;
      _tempo *= clockDrain;
      _streak = 0;
      _timeLeft = sentenceSeconds.toDouble();
    });
    _alarmed = false;
    _later(const Duration(milliseconds: 700), () {
      if (_pose == DuelPose.hurt) setState(() => _pose = DuelPose.think);
    });
  }

  void _onType(String value) {
    final grew = value.length - _lastLength;
    final finishedWord = grew > 0 && value.endsWith(' ') && value.trim().isNotEmpty;
    _lastLength = value.length;
    if (grew <= 0) {
      _lastKey = DateTime.now();
      return;
    }

    final now = DateTime.now();
    final chained = now.difference(_lastKey) <= _idle;
    _lastKey = now;
    final run = (chained ? _streak : 0) + grew;

    setState(() {
      _streak = run;
      _best = math.max(_best, run);
      _tempo = math.min(
        100,
        _tempo + _tempoPerChar * grew + (finishedWord ? _tempoPerWord : 0),
      );
    });

    DuelSounds.instance.playKey(comboStep(run));
    if (isComboMilestone(run)) DuelSounds.instance.play(DuelSound.combo);
    _refreshPose();
  }

  void _goTo(int next) {
    if (next < 0 || next >= _sentences.length) return;
    setState(() {
      _index = next;
      _timeLeft = sentenceSeconds.toDouble();
      _lastLength = _answers[next].text.length;
    });
    _alarmed = false;
    _lastKey = DateTime.now();
    _inputFocus.requestFocus();
  }

  void _confirmSentence() {
    if (_answers[_index].text.trim().isEmpty) return;
    if (_index + 1 < _sentences.length) {
      _goTo(_index + 1);
      return;
    }
    if (!_allFilled) {
      final gap = _answers.indexWhere((item) => item.text.trim().isEmpty);
      if (gap >= 0) _goTo(gap);
      return;
    }
    _lockedTempo = _tempo;
    _tick?.cancel();
    setState(() => _phase = _Phase.choose);
  }

  /// Разбор: пары открываются по одной. Так видно, где вы взяли своё и где
  /// отдали; все пять разом — стена текста, которую пролистывают.
  void _runReveal(List<TranslationGameVerdict> list) {
    setState(() {
      _phase = _Phase.resolve;
      _shown = 0;
      _style = 0;
    });
    var hero = roundHp;
    var foe = roundHp;
    var total = 0;

    for (var order = 0; order < list.length; order++) {
      final verdict = list[order];
      _later(Duration(milliseconds: 300 + order * _reveal.inMilliseconds), () {
        final winner = switch (verdict.winner) {
          TranslationGameWinner.user => DuelWinner.user,
          TranslationGameWinner.translator => DuelWinner.translator,
          TranslationGameWinner.tie => DuelWinner.tie,
        };
        final blow = blowFor(winner, _lockedTempo);
        hero = math.max(0, hero - blow.toHero);
        foe = math.max(0, foe - blow.toFoe);
        total += blow.style;
        setState(() {
          _heroScore = hero;
          _foeScore = foe;
          _style = total;
          _shown = order + 1;
          _pose = switch (winner) {
            DuelWinner.user => DuelPose.strike,
            DuelWinner.translator => DuelPose.hurt,
            DuelWinner.tie => DuelPose.inspect,
          };
        });
        DuelSounds.instance.play(switch (winner) {
          DuelWinner.user => blow.crit ? DuelSound.crit : DuelSound.hit,
          DuelWinner.translator => DuelSound.hit,
          DuelWinner.tie => DuelSound.guard,
        });
      });
    }

    _later(Duration(milliseconds: 600 + list.length * _reveal.inMilliseconds), () {
      final outcome = roundOutcome(hero, foe);
      DuelSounds.instance.play(switch (outcome) {
        DuelWinner.user => DuelSound.victory,
        DuelWinner.translator => DuelSound.defeat,
        DuelWinner.tie => DuelSound.combo,
      });
      setState(() {
        _pose = switch (outcome) {
          DuelWinner.user => DuelPose.trophy,
          DuelWinner.translator => DuelPose.think,
          DuelWinner.tie => DuelPose.compare,
        };
        _phase = _Phase.result;
      });
    });
  }

  // ------------------------------------------------------------------- сеть

  Future<void> _startRound(int number) async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final result = await TranslationGameService(
        api: context.read<ApiClient>(),
      ).loadRound(level: _level, round: number, translator: _provider);
      if (!mounted) return;
      _disposeAnswers();
      _clearScene();
      setState(() {
        _round = result;
        _roundNumber = number;
        _answers = [
          for (var i = 0; i < result.sentences.length; i++) TextEditingController(),
        ];
        _verdicts.clear();
        _summary = '';
        _index = 0;
        _heroScore = roundHp;
        _foeScore = roundHp;
        _tempo = 0;
        _streak = 0;
        _best = 0;
        _shown = 0;
        _style = 0;
        _lastLength = 0;
        _timeLeft = sentenceSeconds.toDouble();
        _pose = DuelPose.taunt;
        _phase = _Phase.translate;
      });
      _alarmed = false;
      _lastKey = DateTime.now();
      DuelSounds.instance.play(DuelSound.start);
      _startTick();
      _inputFocus.requestFocus();
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _phase = _Phase.setup;
        });
      }
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
      _pose = DuelPose.study;
    });
    try {
      final result = await TranslationGameService(
        api: context.read<ApiClient>(),
      ).judge(
        round: round,
        answers: [for (final controller in _answers) controller.text.trim()],
      );
      if (!mounted) return;
      final sorted = [...result.verdicts]..sort((a, b) => a.index.compareTo(b.index));
      setState(() {
        _verdicts
          ..clear()
          ..addEntries(sorted.map((item) => MapEntry(item.index, item)));
        _summary = result.summary;
      });
      _runReveal(sorted);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _pose = DuelPose.think;
        });
      }
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
    if (_verdicts.length != _sentences.length) return;
    setState(() =>
        _summary = 'Ты сам сравнил точность и естественность пяти переводов.');
    _runReveal([
      for (var index = 0; index < _sentences.length; index++) _verdicts[index]!,
    ]);
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
      DuelSounds.instance.play(
          _userTotal >= _translatorTotal ? DuelSound.victory : DuelSound.defeat);
      setState(() => _phase = _Phase.finished);
    } else {
      _startRound(_roundNumber + 1);
    }
  }

  void _restart() {
    _tick?.cancel();
    _clearScene();
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

  // ------------------------------------------------------------------ показ

  @override
  Widget build(BuildContext context) => switch (_phase) {
        _Phase.setup => _buildSetup(),
        _Phase.finished => _buildFinished(),
        _ => _buildRound(),
      };

  AppBar _bar({String? title, VoidCallback? onClose}) => AppBar(
        title: Text(title ?? 'Ты против переводчика'),
        leading: onClose == null
            ? null
            : IconButton(
                tooltip: 'Выйти из матча',
                icon: const Icon(Icons.close),
                onPressed: onClose,
              ),
        actions: [
          IconButton(
            tooltip: _muted ? 'Включить звук' : 'Выключить звук',
            icon: Icon(_muted ? Icons.volume_off : Icons.volume_up),
            onPressed: () => setState(() {
              _muted = !_muted;
              DuelSounds.instance.enabled = !_muted;
            }),
          ),
        ],
      );

  Widget _buildSetup() {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: _bar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const DuelFighter(pose: DuelPose.taunt, width: 76),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Победи DeepL или Google Translate',
                        style: theme.textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    const Text(
                      'Три раунда по пять фраз. Сначала переводишь ты под часы, '
                      'затем открывается ответ машины.',
                      style: TextStyle(height: 1.45),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 26),
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
          const SizedBox(height: 22),
          const Text('Соперник', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'deepl', label: Text('DeepL')),
              ButtonSegment(value: 'google', label: Text('Google Translate')),
            ],
            selected: {_provider},
            onSelectionChanged: (value) => setState(() => _provider = value.first),
            showSelectedIcon: false,
          ),
          if (_error.isNotEmpty) _errorBox(_error),
          const SizedBox(height: 26),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            onPressed: _loading ? null : () => _startRound(1),
            icon: _loading
                ? const SizedBox.square(
                    dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.sports_martial_arts),
            label: const Text('Начать матч'),
          ),
        ],
      ),
    );
  }

  Widget _buildRound() {
    final theme = Theme.of(context);
    final sentence = _index < _sentences.length ? _sentences[_index] : null;
    final burning = _phase == _Phase.translate && _timeLeft <= 6;
    final outcome = roundOutcome(_heroScore, _foeScore);
    final revealed = _revealed;

    return Scaffold(
      appBar: _bar(
        title: '$_level · раунд $_roundNumber из $_rounds',
        onClose: _restart,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          DuelScoreBar(
            hero: _heroScore,
            foe: _foeScore,
            max: roundHp,
            wonHero:
                revealed.where((v) => v.winner == TranslationGameWinner.user).length,
            wonFoe: revealed
                .where((v) => v.winner == TranslationGameWinner.translator)
                .length,
            foeName: _translatorName,
          ),
          const SizedBox(height: 20),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DuelFighter(pose: _pose, width: 64),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _stageLabel(),
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 6),
                    if (_phase == _Phase.result)
                      Text(
                        switch (outcome) {
                          DuelWinner.user => 'Раунд твой',
                          DuelWinner.translator => 'Раунд за $_translatorName',
                          DuelWinner.tie => 'Раунд вничью',
                        },
                        style: theme.textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w800),
                      )
                    else
                      Text(
                        _phase == _Phase.translate
                            ? (sentence?.text ?? '')
                            : _phase == _Phase.resolve && _shown > 0
                                ? _sentences[_shown - 1].text
                                : 'Отметь, чей перевод точнее и живее, '
                                    'или доверь это Gemma 4.',
                        style: const TextStyle(
                            fontFamily: 'NotoSerif', fontSize: 18, height: 1.45),
                      ),
                  ],
                ),
              ),
            ],
          ),
          if (_phase == _Phase.translate) ...[
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: _timeLeft / sentenceSeconds,
                      minHeight: 4,
                      backgroundColor: theme.colorScheme.surfaceContainerHighest,
                      valueColor: AlwaysStoppedAnimation(
                        burning ? theme.colorScheme.primary : theme.dividerColor,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  '${_timeLeft.ceil()}',
                  style: TextStyle(
                    fontWeight: burning ? FontWeight.w800 : FontWeight.w400,
                    color: burning
                        ? theme.colorScheme.primary
                        : theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                IconButton(
                  onPressed: _index == 0 ? null : () => _goTo(_index - 1),
                  icon: const Icon(Icons.chevron_left),
                  tooltip: 'Предыдущая фраза',
                ),
                Expanded(
                  child: TextField(
                    controller: _answers[_index],
                    focusNode: _inputFocus,
                    onChanged: _onType,
                    onSubmitted: (_) => _confirmSentence(),
                    textInputAction: TextInputAction.done,
                    maxLength: 600,
                    decoration: const InputDecoration(
                      counterText: '',
                      hintText: 'Твой перевод на русский',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _confirmSentence,
                  child:
                      Text(_index + 1 < _sentences.length ? 'Дальше' : 'К разбору'),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Text('Темп',
                    style: TextStyle(
                        fontSize: 12, color: theme.colorScheme.onSurfaceVariant)),
                const SizedBox(width: 10),
                SizedBox(
                  width: 84,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: (_tempo / 100).clamp(0.0, 1.0),
                      minHeight: 4,
                      backgroundColor: theme.colorScheme.surfaceContainerHighest,
                      valueColor: const AlwaysStoppedAnimation(Color(0xFFC9A24B)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(_streak > 1 ? 'серия $_streak' : '',
                      style: TextStyle(
                          fontSize: 12, color: theme.colorScheme.onSurfaceVariant)),
                ),
                for (var at = 0; at < _sentences.length; at++)
                  Padding(
                    padding: const EdgeInsets.only(left: 4),
                    child: Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: at == _index
                            ? theme.colorScheme.primary
                            : _answers[at].text.trim().isNotEmpty
                                ? theme.colorScheme.primary.withValues(alpha: 0.35)
                                : theme.dividerColor,
                      ),
                    ),
                  ),
              ],
            ),
          ],
          if (_phase != _Phase.translate) ...[
            const SizedBox(height: 18),
            for (var at = 0; at < _sentences.length; at++)
              _pair(at, _phase != _Phase.resolve || at < _shown),
            if (_error.isNotEmpty) _errorBox(_error),
            if (_phase == _Phase.choose) ...[
              const SizedBox(height: 6),
              OutlinedButton.icon(
                style:
                    OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                onPressed:
                    _loading || !(_round?.judgeEnabled ?? false) ? null : _askGemma,
                icon: _loading
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.smart_toy_outlined),
                label: const Text('Спросить Gemma 4'),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                onPressed:
                    _verdicts.length == _sentences.length ? _finishManual : null,
                icon: const Icon(Icons.gavel),
                label: const Text('Принять мою оценку'),
              ),
            ],
            if (_phase == _Phase.result) _roundResult(),
          ],
        ],
      ),
    );
  }

  String _stageLabel() => switch (_phase) {
        _Phase.translate => 'ПЕРЕВЕДИТЕ НА РУССКИЙ',
        _Phase.choose => 'ЧЕЙ ПЕРЕВОД ЛУЧШЕ',
        _Phase.resolve => 'РАЗБОР РАУНДА',
        _Phase.result => 'РАУНД ОКОНЧЕН',
        _ => 'ДУЭЛЬ',
      };

  Widget _pair(int at, bool open) {
    final theme = Theme.of(context);
    final verdict = open ? _verdicts[at] : null;
    return AnimatedOpacity(
      opacity: open ? 1 : 0.35,
      duration: const Duration(milliseconds: 300),
      child: Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${at + 1}. ${_sentences[at].text}',
                  style: const TextStyle(
                      fontFamily: 'NotoSerif', fontSize: 16, height: 1.45)),
              const SizedBox(height: 12),
              _sideBox('Твой перевод', _answers[at].text, theme.colorScheme.primary,
                  verdict?.winner == TranslationGameWinner.user),
              const SizedBox(height: 8),
              _sideBox(
                  _translatorName,
                  _sentences[at].translatorTranslation,
                  duelMachineOf(context),
                  verdict?.winner == TranslationGameWinner.translator),
              if (_phase == _Phase.choose) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    _pick('Я', TranslationGameWinner.user, at),
                    const SizedBox(width: 8),
                    _pick('Ничья', TranslationGameWinner.tie, at),
                    const SizedBox(width: 8),
                    _pick(_translatorName, TranslationGameWinner.translator, at),
                  ],
                ),
              ],
              if (_phase == _Phase.result && verdict != null) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${_winnerLabel(verdict.winner)} · '
                    '${verdict.userScore.toStringAsFixed(1)} : '
                    '${verdict.translatorScore.toStringAsFixed(1)}. '
                    '${verdict.feedback}',
                    style: const TextStyle(fontSize: 13, height: 1.5),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _sideBox(String label, String text, Color color, bool won) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(11),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: won ? color.withValues(alpha: 0.07) : null,
          border: Border.all(
            color: won ? color : Theme.of(context).dividerColor,
            width: won ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 0.8,
                fontWeight: FontWeight.w800,
                color: won ? color : Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 5),
            Text(text, style: const TextStyle(fontSize: 15, height: 1.45)),
          ],
        ),
      );

  Widget _pick(String label, TranslationGameWinner winner, int at) {
    final active = _verdicts[at]?.winner == winner;
    return Expanded(
      child: active
          ? FilledButton(
              onPressed: () => _choose(at, winner),
              child: Text(label, overflow: TextOverflow.ellipsis))
          : OutlinedButton(
              onPressed: () => _choose(at, winner),
              child: Text(label, overflow: TextOverflow.ellipsis)),
    );
  }

  Widget _roundResult() {
    final theme = Theme.of(context);
    final (user, translator, _) = _roundScore;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 6),
        Wrap(
          spacing: 16,
          children: [
            Text('$user : $translator',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            if (_style > 0)
              Text('ранг ${rankOf(_style)}',
                  style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
            if (_best > 1)
              Text('лучшая серия $_best',
                  style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
          ],
        ),
        if (_summary.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(_summary,
              style: TextStyle(
                  height: 1.5, color: theme.colorScheme.onSurfaceVariant)),
        ],
        const SizedBox(height: 16),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          onPressed: _nextRound,
          icon: const Icon(Icons.arrow_forward),
          label:
              Text(_roundNumber == _rounds ? 'Завершить матч' : 'Следующий раунд'),
        ),
      ],
    );
  }

  Widget _buildFinished() {
    final theme = Theme.of(context);
    final won = _userTotal > _translatorTotal;
    final drawn = _userTotal == _translatorTotal;
    return Scaffold(
      appBar: _bar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
        children: [
          Center(
            child: DuelFighter(
              pose: won
                  ? DuelPose.trophy
                  : drawn
                      ? DuelPose.compare
                      : DuelPose.think,
              width: 120,
            ),
          ),
          const SizedBox(height: 18),
          Center(
            child: Text('Матч завершён',
                style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
          ),
          const SizedBox(height: 6),
          Center(
            child: Text(
              won
                  ? 'Победа за тобой'
                  : drawn
                      ? 'Ничья'
                      : '$_translatorName победил',
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineMedium
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 18),
          Center(
            child: Text.rich(
              TextSpan(children: [
                TextSpan(
                    text: '$_userTotal',
                    style: TextStyle(color: theme.colorScheme.primary)),
                TextSpan(
                    text: '  :  ',
                    style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                TextSpan(
                    text: '$_translatorTotal',
                    style: TextStyle(color: duelMachineOf(context))),
              ]),
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text('Ничьих: $_tiesTotal · всего 15 предложений',
                style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
          ),
          const SizedBox(height: 28),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            onPressed: _restart,
            icon: const Icon(Icons.refresh),
            label: const Text('Сыграть ещё'),
          ),
        ],
      ),
    );
  }

  Widget _errorBox(String text) => Padding(
        padding: const EdgeInsets.only(top: 14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.errorContainer,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(text,
              style:
                  TextStyle(color: Theme.of(context).colorScheme.onErrorContainer)),
        ),
      );

  String _winnerLabel(TranslationGameWinner winner) => switch (winner) {
        TranslationGameWinner.user => 'Лучше твой перевод',
        TranslationGameWinner.translator => 'Лучше $_translatorName',
        TranslationGameWinner.tie => 'Ничья',
      };
}
