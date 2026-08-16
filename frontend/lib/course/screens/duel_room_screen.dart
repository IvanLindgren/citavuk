/// Комната матча на несколько человек.
///
/// Живого канала нет: комната опрашивается раз в пару секунд, и всё, что
/// должно случиться само — кончился раунд, пора судить, — сервер делает в
/// момент опроса. Экран показывает ровно то же, что сайт: часы, стол, занавес
/// фазы и пьедестал в конце.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_client.dart';
import '../../services/duel_sounds.dart';
import '../../theme/app_theme.dart';
import '../services/duel_room_service.dart';
import '../widgets/duel_arena.dart';
import '../widgets/duel_stage.dart';
import '../widgets/duel_table.dart';

/// Пауза между открытиями пар в разборе.
const Duration _revealSpan = Duration(milliseconds: 950);

class DuelRoomScreen extends StatefulWidget {
  const DuelRoomScreen({super.key, required this.code, this.name = ''});

  final String code;

  /// Имя, под которым человек садится за стол.
  final String name;

  @override
  State<DuelRoomScreen> createState() => _DuelRoomScreenState();
}

class _DuelRoomScreenState extends State<DuelRoomScreen> {
  late final DuelRoomService _service =
      DuelRoomService(context.read<ApiClient>());

  DuelRoom? _room;
  final Map<String, TextEditingController> _answers = {};
  String _error = '';
  bool _offline = false;
  String _busy = '';

  /// Когда пришёл последний ответ: от него доигрываются часы между опросами.
  DateTime _received = DateTime.now();
  Timer? _poll;
  Timer? _tick;
  Timer? _draft;

  /// Фаза и раунд последнего занавеса: он привязан к ним, а не к каждому
  /// ответу сервера — комнату опрашивают каждые пару секунд.
  String _stage = '';
  ({String label, String title})? _curtain;

  /// Сколько пар разбора уже открыто.
  int _shown = 0;

  @override
  void initState() {
    super.initState();
    _open();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _tick?.cancel();
    _draft?.cancel();
    for (final controller in _answers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _open() async {
    await _service.restore();
    try {
      var room = await _service.load(widget.code);
      final me = room.me;
      if (me == null || !me.joined) {
        final name = widget.name.isNotEmpty
            ? widget.name
            : await _service.savedName();
        room = await _service.join(widget.code, name: name);
      }
      if (!mounted) return;
      _accept(room);
      _tick = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  void _accept(DuelRoom room) {
    setState(() {
      _room = room;
      _received = DateTime.now();
      _offline = false;
    });
    // Свой черновик с сервера подставляется только в пустые поля: то, что
    // человек печатает прямо сейчас, ответ опроса затирать не должен.
    for (final entry in room.answers.entries) {
      final controller =
          _answers.putIfAbsent(entry.key, () => TextEditingController());
      if (controller.text.isEmpty) controller.text = entry.value;
    }
    _announceStage(room);
    _schedulePoll(room);
  }

  void _announceStage(DuelRoom room) {
    final stage = '${room.phase}-${room.round}';
    final first = _stage.isEmpty;
    if (stage == _stage) return;
    _stage = stage;
    if (room.phase == DuelPhase.result) _shown = 0;
    if (first || room.phase == DuelPhase.lobby) return;

    switch (room.phase) {
      case DuelPhase.translate:
        DuelSounds.instance.play(DuelSound.start);
      case DuelPhase.vote:
        DuelSounds.instance.play(DuelSound.combo);
      case DuelPhase.result:
        DuelSounds.instance.play(DuelSound.hit);
        _revealNext();
      case DuelPhase.finished:
        DuelSounds.instance.play(
          _mine(room)?.place == 1 ? DuelSound.victory : DuelSound.defeat,
        );
      case _:
        break;
    }
    setState(() => _curtain = (label: _curtainLabel(room), title: _title(room)));
    Timer(curtainSpan, () {
      if (mounted) setState(() => _curtain = null);
    });
  }

  /// Разбор открывается по одной паре: пять сравнений разом пролистывают.
  void _revealNext() {
    Timer(_revealSpan, () {
      final room = _room;
      if (!mounted || room == null || room.phase != DuelPhase.result) return;
      if (_shown >= room.reveal.length) return;
      setState(() => _shown++);
      DuelSounds.instance.play(DuelSound.guard);
      _revealNext();
    });
  }

  DuelRoomStanding? _mine(DuelRoom room) {
    for (final row in room.standings) {
      if (row.id == room.you) return row;
    }
    return null;
  }

  /// Как часто опрашивать. В лобби и в финале спешить некуда.
  Duration? _pollEvery(DuelPhase phase) => switch (phase) {
        DuelPhase.finished => null,
        DuelPhase.lobby => const Duration(seconds: 3),
        DuelPhase.judging => const Duration(seconds: 2),
        _ => const Duration(seconds: 2),
      };

  void _schedulePoll(DuelRoom room) {
    _poll?.cancel();
    final delay = _pollEvery(room.phase);
    if (delay == null) return;
    _poll = Timer(delay, () async {
      if (!mounted) return;
      try {
        _accept(await _service.load(widget.code));
      } catch (_) {
        if (mounted) setState(() => _offline = true);
        _schedulePoll(room);
      }
    });
  }

  Future<void> _run(String label, Future<DuelRoom> Function() action) async {
    setState(() {
      _busy = label;
      _error = '';
    });
    try {
      _accept(await action());
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  /// Черновик уходит сам, пока человек печатает: переводы, отправленные только
  /// по кнопке «Сдать», пропадали целиком у того, кто не успел до звонка.
  void _onType() {
    _draft?.cancel();
    _draft = Timer(const Duration(seconds: 2), () async {
      final room = _room;
      if (room == null || room.phase != DuelPhase.translate) return;
      final answers = {
        for (final entry in _answers.entries)
          if (entry.value.text.trim().isNotEmpty) entry.key: entry.value.text,
      };
      if (answers.isEmpty) return;
      try {
        _accept(await _service.draft(widget.code, answers));
      } catch (_) {
        // Черновик — не действие человека: молчим и пробуем в следующий раз.
      }
    });
  }

  int get _secondsLeft {
    final room = _room;
    if (room == null) return 0;
    final since = DateTime.now().difference(_received);
    final left = room.secondsLeft - since.inSeconds;
    return left < 0 ? 0 : left;
  }

  void _leave() {
    final room = _room;
    if (room != null && room.you.isNotEmpty) {
      _service.leave(widget.code).ignore();
    }
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final room = _room;
    if (room == null) {
      return Scaffold(
        appBar: AppBar(title: Text('Комната ${widget.code}')),
        body: Center(
          child: _error.isEmpty
              ? const CircularProgressIndicator()
              : Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(_error, textAlign: TextAlign.center),
                ),
        ),
      );
    }

    final sentences = room.sentences.isEmpty ? 5 : room.sentences.length;
    final total = phaseSeconds(room.phase);

    final screen = Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: _leave,
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Выйти из комнаты',
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Комната ${room.code}',
                style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1,
                    color: SerbColors.serbRed)),
            Text(_title(room), style: const TextStyle(fontSize: 18)),
          ],
        ),
        actions: [
          if (room.deadline != null)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: DuelClock(seconds: _secondsLeft, total: total),
            ),
        ],
      ),
      body: Column(
        children: [
          if (room.deadline != null)
            LinearProgressIndicator(
              value: (_secondsLeft / total).clamp(0.0, 1.0),
              minHeight: 3,
              backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
              valueColor: AlwaysStoppedAnimation(
                switch (urgencyOf(_secondsLeft, total)) {
                  Urgency.hot => SerbColors.serbRed,
                  Urgency.warm => SerbColors.gold,
                  Urgency.calm => Theme.of(context).dividerColor,
                },
              ),
            ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                if (_error.isNotEmpty) _note(_error, error: true),
                if (_offline && _error.isEmpty)
                  _note('Связь пропала — комната обновится сама, как только вернётся.'),
                ..._phaseBody(room, sentences),
                const SizedBox(height: 24),
                _tableCard(room, sentences),
              ],
            ),
          ),
        ],
      ),
    );

    final curtain = _curtain;
    if (curtain == null) return screen;
    return Stack(
      children: [
        screen,
        Positioned.fill(
          child: PhaseCurtain(label: curtain.label, title: curtain.title),
        ),
      ],
    );
  }

  Widget _tableCard(DuelRoom room, int sentences) {
    final waiting = room.seated
        .where((player) =>
            player.joined &&
            !player.isMachine &&
            switch (room.phase) {
              DuelPhase.translate => !player.ready,
              DuelPhase.vote => !player.voted,
              _ => false,
            })
        .toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.groups_outlined,
                    color: Theme.of(context).colorScheme.onSurfaceVariant),
                const SizedBox(width: 8),
                const Text('За столом',
                    style: TextStyle(
                        fontFamily: 'Lora',
                        fontSize: 18,
                        fontWeight: FontWeight.bold)),
                const Spacer(),
                Text('${room.seated.length}/${room.seats}',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 14),
            DuelTable(room: room, sentences: sentences),
            if (waiting.isNotEmpty) ...[
              const Divider(height: 22),
              Text(
                'Ждём: ${waiting.map((player) => player.you ? 'тебя' : player.name).join(', ')}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _phaseBody(DuelRoom room, int sentences) => switch (room.phase) {
        DuelPhase.lobby => _lobby(room),
        DuelPhase.translate => _translate(room),
        DuelPhase.judging => [_judging(room)],
        DuelPhase.vote => _vote(room),
        DuelPhase.result => _result(room),
        DuelPhase.finished => _finished(room),
      };

  List<Widget> _lobby(DuelRoom room) {
    final ready = room.seated.where((player) => player.joined).length;
    return [
      const DuelFighter(pose: DuelPose.taunt, width: 96),
      const SizedBox(height: 12),
      Center(
        child: SelectableText(
          room.code,
          style: const TextStyle(
            fontFamily: 'Lora',
            fontSize: 34,
            fontWeight: FontWeight.bold,
            letterSpacing: 6,
          ),
        ),
      ),
      const SizedBox(height: 6),
      Center(
        child: Text(
          'Назови этот код тому, кого зовёшь за стол.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ),
      const SizedBox(height: 20),
      if (room.host) ...[
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy.isNotEmpty
                    ? null
                    : () => _run('machine',
                        () => _service.addMachine(room.code, 'deepl')),
                icon: const Icon(Icons.smart_toy_outlined),
                label: const Text('Посадить DeepL'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: _busy.isNotEmpty || ready < 2
              ? null
              : () => _run('start', () => _service.start(room.code)),
          icon: _busy == 'start'
              ? const SizedBox.square(
                  dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.play_arrow),
          label: Text(ready < 2 ? 'Ждём второго игрока' : 'Начать матч'),
        ),
      ] else
        Center(
          child: Text(
            'Матч начнёт тот, кто позвал.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
    ];
  }

  List<Widget> _translate(DuelRoom room) {
    final me = room.me;
    final done = me?.ready ?? false;
    return [
      Text('Переведи все фразы',
          style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 4),
      Text(
        'Чужих переводов до разбора не видно — только то, сколько фраз уже сдано.',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      const SizedBox(height: 16),
      for (var index = 0; index < room.sentences.length; index++)
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${index + 1}. ${room.sentences[index].text}',
                      style: const TextStyle(
                          fontFamily: 'NotoSerif', fontSize: 17, height: 1.45)),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _answers.putIfAbsent(
                      room.sentences[index].id,
                      () => TextEditingController(),
                    ),
                    enabled: !done,
                    onChanged: (_) => _onType(),
                    maxLines: null,
                    maxLength: 600,
                    decoration: const InputDecoration(
                      counterText: '',
                      hintText: 'Твой перевод',
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      FilledButton.icon(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
        onPressed: done || _busy.isNotEmpty
            ? null
            : () async {
                for (final sentence in room.sentences) {
                  final text = _answers[sentence.id]?.text.trim() ?? '';
                  if (text.isEmpty) continue;
                  await _run('answer',
                      () => _service.answer(room.code, sentence.id, text));
                }
                await _run('ready', () => _service.ready(room.code));
              },
        icon: const Icon(Icons.done_all),
        label: Text(done ? 'Сдано — ждём остальных' : 'Сдать переводы'),
      ),
    ];
  }

  Widget _judging(DuelRoom room) => Card(
        child: DuelWaiting(
          title: 'Gemma сравнивает переводы',
          text: 'Авторы скрыты даже от судьи: он видит только тексты под '
              'метками. Если судья промолчит, победителя выберете вы сами.',
          child: Column(
            children: [
              const DuelFighter(pose: DuelPose.compare, width: 96),
              ShuffleDeck(count: room.seated.length),
            ],
          ),
        ),
      );

  List<Widget> _vote(DuelRoom room) {
    final rest = room.ballot
        .where((item) => (room.votes[item.sentenceId] ?? '').isEmpty)
        .length;
    return [
      Text('Выбери лучший перевод',
          style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 4),
      Text(
        'Судья не ответил, поэтому решаете вы. Авторы откроются после голосования.',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      const SizedBox(height: 16),
      for (final item in room.ballot)
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.text,
                      style: const TextStyle(
                          fontFamily: 'Lora', fontSize: 17, height: 1.4)),
                  const SizedBox(height: 12),
                  for (final option in item.options)
                    _ballotOption(room, item, option),
                ],
              ),
            ),
          ),
        ),
      Center(
        child: Text(
          rest > 0 ? 'Осталось голосов: $rest' : 'Голоса отданы — ждём остальных.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ),
    ];
  }

  Widget _ballotOption(
    DuelRoom room,
    DuelBallotSentence item,
    DuelBallotOption option,
  ) {
    final choice = room.votes[item.sentenceId] ?? '';
    final mine = choice == option.alias;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: choice.isNotEmpty || _busy.isNotEmpty
            ? null
            : () => _run('vote', () {
                  DuelSounds.instance.play(DuelSound.hit);
                  return _service.vote(room.code, item.sentenceId, option.alias);
                }),
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 250),
          opacity: choice.isNotEmpty && !mine ? 0.45 : 1,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: mine ? SerbColors.serbRed.withValues(alpha: 0.1) : null,
              border: Border.all(
                color: mine
                    ? SerbColors.serbRed
                    : Theme.of(context).colorScheme.outlineVariant,
                width: mine ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                Expanded(child: Text(option.text)),
                if (mine)
                  const Icon(Icons.check_circle,
                      size: 20, color: SerbColors.serbRed),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _result(DuelRoom room) {
    return [
      Text('Раунд ${room.round} завершён',
          style: const TextStyle(
              fontWeight: FontWeight.bold, color: SerbColors.serbRed)),
      Text('Разбор переводов',
          style: Theme.of(context).textTheme.headlineSmall),
      if (room.summary.isNotEmpty) ...[
        const SizedBox(height: 8),
        Text(room.summary, style: Theme.of(context).textTheme.bodyMedium),
      ],
      const SizedBox(height: 16),
      for (final item in room.reveal.take(_shown))
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.text,
                      style: const TextStyle(
                          fontFamily: 'Lora', fontSize: 17, height: 1.4)),
                  const SizedBox(height: 12),
                  for (final answer in item.answers)
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        color: answer.won
                            ? SerbColors.gold.withValues(alpha: 0.1)
                            : null,
                        border: Border.all(
                          color: answer.won
                              ? SerbColors.gold
                              : Theme.of(context).colorScheme.outlineVariant,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  answer.you
                                      ? '${answer.name} · ты'
                                      : answer.name,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold),
                                ),
                              ),
                              if ((answer.score ?? 0) > 0)
                                Text(answer.score!.toStringAsFixed(1),
                                    style:
                                        Theme.of(context).textTheme.bodySmall),
                              if (answer.won)
                                const Padding(
                                  padding: EdgeInsets.only(left: 6),
                                  child: Icon(Icons.emoji_events,
                                      size: 16, color: SerbColors.gold),
                                ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(answer.text),
                        ],
                      ),
                    ),
                  if (item.feedback.isNotEmpty)
                    Text(item.feedback,
                        style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ),
        ),
      Center(
        child: Text(
          _shown < room.reveal.length
              ? 'Судья читает дальше…'
              : room.round < room.rounds
                  ? 'Следующий раунд начнётся сам.'
                  : 'Скоро откроется итог матча.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ),
    ];
  }

  List<Widget> _finished(DuelRoom room) {
    final mine = _mine(room);
    final won = mine?.place == 1;
    final rows = room.standings
        .take(3)
        .map((row) => DuelStanding(
              id: row.id,
              name: row.name,
              score: row.score,
              place: row.place,
              machine: row.isMachine,
            ))
        .toList();

    return [
      SizedBox(
        height: 320,
        child: Stack(
          children: [
            Column(
              children: [
                DuelFighter(
                  pose: won ? DuelPose.trophy : DuelPose.think,
                  width: 96,
                ),
                const SizedBox(height: 8),
                const Text('МАТЧ ЗАВЕРШЁН',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 2,
                        color: SerbColors.serbRed)),
                Text(
                  won
                      ? 'Ты победил'
                      : mine == null
                          ? 'Матч окончен'
                          : 'В следующий раз получится',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 16),
                Expanded(child: Podium(rows: rows, you: room.you)),
              ],
            ),
            if (won) const Positioned.fill(child: Confetti()),
          ],
        ),
      ),
      const SizedBox(height: 12),
      for (final row in room.standings.skip(3))
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(
            children: [
              Text('${row.place}. ${row.name}',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              const Spacer(),
              Text('${row.score}'),
            ],
          ),
        ),
      const SizedBox(height: 16),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
        onPressed: _leave,
        child: const Text('Сыграть ещё'),
      ),
    ];
  }

  Widget _note(String text, {bool error = false}) => Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: error
              ? Theme.of(context).colorScheme.errorContainer
              : Theme.of(context).colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(text),
      );

  String _title(DuelRoom room) => switch (room.phase) {
        DuelPhase.lobby => 'Собираем игроков',
        DuelPhase.translate => 'Раунд ${room.round} из ${room.rounds}',
        DuelPhase.judging => 'Судья читает',
        DuelPhase.vote => 'Голосование',
        DuelPhase.result => 'Результат раунда',
        DuelPhase.finished => 'Матч завершён',
      };

  String _curtainLabel(DuelRoom room) => switch (room.phase) {
        DuelPhase.translate => 'Поехали',
        DuelPhase.vote => 'Судья промолчал',
        DuelPhase.result => 'Разбор',
        DuelPhase.finished => 'Финал',
        _ => 'Комната',
      };
}
