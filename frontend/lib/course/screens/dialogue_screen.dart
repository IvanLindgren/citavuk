import 'dart:async';
import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../utils/tokenizer.dart';
import '../../widgets/dialogue_stage.dart';
import '../models/progress.dart';
import '../state/course_controller.dart';

class DialogueScreen extends StatefulWidget {
  const DialogueScreen({super.key, required this.controller});

  final CourseController controller;

  @override
  State<DialogueScreen> createState() => _DialogueScreenState();
}

class _DialogueScreenState extends State<DialogueScreen> {
  final AudioPlayer _player = AudioPlayer();
  final ScrollController _scrollController = ScrollController();
  late final DialogueSpeech _speech = DialogueSpeech(_player);
  _Dialogue? _dialogue;
  DialogueProgress? _progress;
  Object? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _speech.dispose();
    _player.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final raw = await rootBundle
          .loadString('assets/course/dialogues/drinkit.json');
      final dialogue =
          _Dialogue.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      if (!mounted) return;
      setState(() {
        _dialogue = dialogue;
        _progress = widget.controller.dialogueProgress(dialogue.id);
      });
    } catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  Future<void> _choose(_DialogueChoice choice) async {
    final dialogue = _dialogue;
    if (dialogue == null || _saving) return;
    final next = dialogue.node(choice.next);
    if (next == null) return;
    final record = DialogueProgress(
      dialogueId: dialogue.id,
      status: next.isEnd ? 'completed' : 'inProgress',
      currentNodeId: next.id,
      choices: [...?_progress?.choices, choice.id],
      updatedAt: DateTime.now().toUtc(),
    );
    setState(() {
      _saving = true;
      _progress = record;
    });
    await widget.controller.saveDialogueProgress(record);
    if (!mounted) return;
    setState(() => _saving = false);
    _scrollToBottom();
    await _speech.speak(
      [
        DialogueLine(
            key: 'choice-${choice.id}',
            speaker: 'Čitavuk',
            text: choice.label,
            face: DialogueFace.citavuk,
            own: true),
        _lineOf(next),
      ],
      _redraw,
    );
  }

  Future<void> _restart() async {
    final dialogue = _dialogue;
    if (dialogue == null) return;
    await _speech.stop(_redraw);
    final record = DialogueProgress(
      dialogueId: dialogue.id,
      status: 'inProgress',
      currentNodeId: dialogue.startNodeId,
      choices: const [],
      updatedAt: DateTime.now().toUtc(),
    );
    setState(() => _progress = record);
    await widget.controller.saveDialogueProgress(record);
    if (_scrollController.hasClients) {
      _scrollController.jumpTo(0);
    }
  }

  void _redraw() {
    if (mounted) setState(() {});
  }

  /// Реплика собеседника: во встроенном диалоге состав участников известен
  /// заранее, поля `avatar`, как в уроках преподавателей, тут нет.
  DialogueLine _lineOf(_DialogueNode node) => DialogueLine(
        key: 'node-${node.id}',
        speaker: node.speaker,
        text: node.text,
        face: node.speaker == 'Čitavuk'
            ? DialogueFace.citavuk
            : node.speaker == 'Narator'
                ? DialogueFace.narrator
                : DialogueFace.marja,
      );

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _openWord(String sentence, Token token) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DialogueWordSheet(sentence: sentence, token: token),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dialogue = _dialogue;
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Игровой диалог')),
        body: const Center(child: Text('Не удалось открыть диалог.')),
      );
    }
    if (dialogue == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Игровой диалог')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final node = dialogue.node(
          _progress?.currentNodeId ?? dialogue.startNodeId,
        ) ??
        dialogue.node(dialogue.startNodeId)!;
    final history = dialogue.history(_progress?.choices ?? const []);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Дорога к Дринкиту'),
        actions: [
          if (_progress != null)
            IconButton(
              tooltip: 'Начать сначала',
              onPressed: _restart,
              icon: const Icon(Icons.replay),
            ),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 28),
              itemCount: history.length + 1,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return _DialogueHeader(
                    dialogue: dialogue,
                    status: _progress?.status,
                  );
                }
                final message = history[index - 1];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: DialogueBubble(
                    line: message,
                    speaking: _speech.speakingKey == message.key,
                    onSpeak: () => _speech.toggle(message, _redraw),
                    onWordTap: (token) => _openWord(message.text, token),
                  ),
                );
              },
            ),
          ),
        ),
      ),
      bottomNavigationBar: DialogueChoiceBar(
        title: 'ВЫБЕРИТЕ ОТВЕТ ЧИТАВУКА',
        enabled: !_saving,
        labels: [for (final choice in node.choices) choice.label],
        onChoose: (index) => _choose(node.choices[index]),
        footer: node.isEnd
            ? FilledButton.icon(
                onPressed: _restart,
                icon: const Icon(Icons.replay),
                label: const Text('Пройти ещё раз'),
              )
            : null,
      ),
    );
  }
}

class _DialogueHeader extends StatelessWidget {
  const _DialogueHeader({required this.dialogue, required this.status});

  final _Dialogue dialogue;
  final String? status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final label = status == 'completed'
        ? 'Завершён'
        : status == 'inProgress'
            ? 'В процессе'
            : 'Не начат';
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 22),
      child: Column(
        children: [
          Text(
            'ИГРОВОЙ ДИАЛОГ · БЕТА',
            style: TextStyle(
              color: scheme.primary,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            dialogue.title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
          ),
          Text(
            dialogue.titleSr,
            style: TextStyle(
              fontSize: 17,
              color: scheme.onSurface.withValues(alpha: 0.62),
            ),
          ),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _Dialogue {
  const _Dialogue({
    required this.id,
    required this.title,
    required this.titleSr,
    required this.startNodeId,
    required this.nodes,
  });

  final String id;
  final String title;
  final String titleSr;
  final String startNodeId;
  final List<_DialogueNode> nodes;

  _DialogueNode? node(String id) {
    for (final item in nodes) {
      if (item.id == id) return item;
    }
    return null;
  }

  List<DialogueLine> history(List<String> choiceIds) {
    var current = node(startNodeId);
    if (current == null) return const [];
    final messages = <DialogueLine>[_line(current)];
    for (final choiceId in choiceIds) {
      _DialogueChoice? selected;
      for (final choice in current!.choices) {
        if (choice.id == choiceId) {
          selected = choice;
          break;
        }
      }
      if (selected == null) break;
      messages.add(DialogueLine(
        key: 'choice-${selected.id}',
        speaker: 'Čitavuk',
        text: selected.label,
        face: DialogueFace.citavuk,
        own: true,
      ));
      current = node(selected.next);
      if (current == null) break;
      messages.add(_line(current));
    }
    return messages;
  }

  static DialogueLine _line(_DialogueNode node) => DialogueLine(
        key: 'node-${node.id}',
        speaker: node.speaker,
        text: node.text,
        face: node.speaker == 'Čitavuk'
            ? DialogueFace.citavuk
            : node.speaker == 'Narator'
                ? DialogueFace.narrator
                : DialogueFace.marja,
      );

  factory _Dialogue.fromJson(Map<String, dynamic> json) => _Dialogue(
        id: '${json['id']}',
        title: '${json['title']}',
        titleSr: '${json['titleSr']}',
        startNodeId: '${json['startNodeId']}',
        nodes: ((json['nodes'] as List?) ?? const [])
            .map((value) =>
                _DialogueNode.fromJson((value as Map).cast<String, dynamic>()))
            .toList(growable: false),
      );
}

class _DialogueNode {
  const _DialogueNode({
    required this.id,
    required this.speaker,
    required this.text,
    required this.choices,
    required this.isEnd,
  });

  final String id;
  final String speaker;
  final String text;
  final List<_DialogueChoice> choices;
  final bool isEnd;

  factory _DialogueNode.fromJson(Map<String, dynamic> json) => _DialogueNode(
        id: '${json['id']}',
        speaker: '${json['speaker']}',
        text: '${json['text']}',
        choices: ((json['choices'] as List?) ?? const [])
            .map((value) => _DialogueChoice.fromJson(
                (value as Map).cast<String, dynamic>()))
            .toList(growable: false),
        isEnd: json['end'] == true,
      );
}

class _DialogueChoice {
  const _DialogueChoice({
    required this.id,
    required this.label,
    required this.next,
  });

  final String id;
  final String label;
  final String next;

  factory _DialogueChoice.fromJson(Map<String, dynamic> json) =>
      _DialogueChoice(
        id: '${json['id']}',
        label: '${json['label']}',
        next: '${json['next']}',
      );
}
