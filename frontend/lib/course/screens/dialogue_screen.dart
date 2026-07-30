import 'dart:async';
import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../models/reader_settings.dart';
import '../../models/word_analysis.dart';
import '../../services/analysis_repository.dart';
import '../../services/listening_service.dart';
import '../../services/user_db.dart';
import '../../services/grammar_engine.dart';
import '../../utils/tokenizer.dart';
import '../../widgets/reader_text.dart';
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
  _Dialogue? _dialogue;
  DialogueProgress? _progress;
  Object? _error;
  bool _saving = false;
  String? _speakingKey;
  int _speechRun = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _speechRun++;
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
    await _speakSequence([
      (key: 'choice-${choice.id}', text: choice.label),
      (key: 'node-${next.id}', text: next.text),
    ]);
  }

  Future<void> _restart() async {
    final dialogue = _dialogue;
    if (dialogue == null) return;
    await _stopSpeech();
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

  Future<void> _toggleSpeech(_DialogueMessage message) async {
    if (_speakingKey == message.key) {
      await _stopSpeech();
      return;
    }
    await _speakSequence([(key: message.key, text: message.text)]);
  }

  Future<void> _stopSpeech() async {
    _speechRun++;
    await _player.stop();
    if (mounted) setState(() => _speakingKey = null);
  }

  Future<void> _speakSequence(
      List<({String key, String text})> messages) async {
    final run = ++_speechRun;
    await _player.stop();
    for (final message in messages) {
      if (!mounted || run != _speechRun) return;
      setState(() => _speakingKey = message.key);
      try {
        final completed = _player.onPlayerComplete.first;
        await _player.play(
          UrlSource(ListeningService.instance.ttsUrl(message.text)),
        );
        await completed.timeout(const Duration(minutes: 2));
      } catch (_) {
        // Недоступная озвучка не должна блокировать сам диалог.
      }
    }
    if (mounted && run == _speechRun) {
      setState(() => _speakingKey = null);
    }
  }

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
      builder: (_) => _DialogueWordSheet(sentence: sentence, token: token),
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
                  child: _DialogueBubble(
                    message: message,
                    speaking: _speakingKey == message.key,
                    onSpeak: () => _toggleSpeech(message),
                    onWordTap: (token) => _openWord(message.text, token),
                  ),
                );
              },
            ),
          ),
        ),
      ),
      bottomNavigationBar: _DialogueActions(
        node: node,
        saving: _saving,
        onChoice: _choose,
        onRestart: _restart,
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

class _DialogueBubble extends StatelessWidget {
  const _DialogueBubble({
    required this.message,
    required this.speaking,
    required this.onSpeak,
    required this.onWordTap,
  });

  final _DialogueMessage message;
  final bool speaking;
  final VoidCallback onSpeak;
  final void Function(Token token) onWordTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (message.speaker == 'Narator') {
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 20),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Column(
          children: [
            _SpeakerLine(
              label: 'Рассказчик',
              speaking: speaking,
              onSpeak: onSpeak,
            ),
            const SizedBox(height: 8),
            _InteractiveReplica(text: message.text, onWordTap: onWordTap),
          ],
        ),
      );
    }

    final citavuk = message.speaker == 'Čitavuk';
    final avatar = ClipRRect(
      borderRadius: BorderRadius.circular(15),
      child: Image.asset(
        citavuk
            ? 'assets/imgs/citavuk_icon.png'
            : 'assets/imgs/marja_spilberic.png',
        width: 54,
        height: 54,
        fit: BoxFit.cover,
        alignment: Alignment.topCenter,
      ),
    );
    final bubble = Flexible(
      child: Container(
        padding: const EdgeInsets.fromLTRB(15, 11, 15, 14),
        decoration: BoxDecoration(
          color: citavuk
              ? scheme.primaryContainer.withValues(alpha: 0.42)
              : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(citavuk ? 18 : 5),
            bottomRight: Radius.circular(citavuk ? 5 : 18),
          ),
          border: Border.all(
            color: citavuk
                ? scheme.primary.withValues(alpha: 0.3)
                : scheme.outlineVariant,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SpeakerLine(
              label: message.speaker,
              speaking: speaking,
              onSpeak: onSpeak,
            ),
            const SizedBox(height: 7),
            _InteractiveReplica(text: message.text, onWordTap: onWordTap),
          ],
        ),
      ),
    );

    return Row(
      mainAxisAlignment:
          citavuk ? MainAxisAlignment.end : MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: citavuk
          ? [bubble, const SizedBox(width: 9), avatar]
          : [avatar, const SizedBox(width: 9), bubble],
    );
  }
}

class _SpeakerLine extends StatelessWidget {
  const _SpeakerLine({
    required this.label,
    required this.speaking,
    required this.onSpeak,
  });

  final String label;
  final bool speaking;
  final VoidCallback onSpeak;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Text(
            label.toUpperCase(),
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: scheme.primary,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 4),
        IconButton(
          visualDensity: VisualDensity.compact,
          constraints: const BoxConstraints.tightFor(width: 34, height: 34),
          tooltip: speaking ? 'Остановить' : 'Прослушать',
          onPressed: onSpeak,
          icon: Icon(speaking ? Icons.stop_rounded : Icons.volume_up_rounded),
          color: scheme.primary,
          iconSize: 21,
        ),
      ],
    );
  }
}

class _InteractiveReplica extends StatelessWidget {
  const _InteractiveReplica({required this.text, required this.onWordTap});

  final String text;
  final void Function(Token token) onWordTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ReaderParagraph(
      text: text,
      settings: const ReaderSettings(
        fontSize: 18,
        lineHeight: 1.45,
        letterSpacing: 0,
        justify: false,
        firstLineIndent: 0,
      ),
      textColor: scheme.onSurface,
      highlightColor: scheme.primaryContainer,
      highlightTextColor: scheme.onPrimaryContainer,
      justify: false,
      firstLineIndent: 0,
      onTapWord: (_, token, __) => onWordTap(token),
    );
  }
}

class _DialogueActions extends StatelessWidget {
  const _DialogueActions({
    required this.node,
    required this.saving,
    required this.onChoice,
    required this.onRestart,
  });

  final _DialogueNode node;
  final bool saving;
  final Future<void> Function(_DialogueChoice choice) onChoice;
  final VoidCallback onRestart;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface.withValues(alpha: 0.97),
      elevation: 16,
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.42,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 740),
                child: node.isEnd
                    ? FilledButton.icon(
                        onPressed: onRestart,
                        icon: const Icon(Icons.replay),
                        label: const Text('Пройти ещё раз'),
                      )
                    : Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'ВЫБЕРИТЕ ОТВЕТ ЧИТАВУКА',
                            style: TextStyle(
                              color: scheme.onSurface.withValues(alpha: 0.6),
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 8),
                          for (var i = 0; i < node.choices.length; i++) ...[
                            _ChoiceButton(
                              index: i,
                              choice: node.choices[i],
                              enabled: !saving,
                              onPressed: () => onChoice(node.choices[i]),
                            ),
                            if (i + 1 < node.choices.length)
                              const SizedBox(height: 8),
                          ],
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ChoiceButton extends StatelessWidget {
  const _ChoiceButton({
    required this.index,
    required this.choice,
    required this.enabled,
    required this.onPressed,
  });

  final int index;
  final _DialogueChoice choice;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(15),
      child: InkWell(
        onTap: enabled ? onPressed : null,
        borderRadius: BorderRadius.circular(15),
        child: Container(
          constraints: const BoxConstraints(minHeight: 54),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(15),
            border: Border.all(color: scheme.primary.withValues(alpha: 0.3)),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 15,
                backgroundColor: scheme.primary,
                foregroundColor: scheme.onPrimary,
                child: Text('${index + 1}'),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  choice.label,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DialogueWordSheet extends StatefulWidget {
  const _DialogueWordSheet({required this.sentence, required this.token});

  final String sentence;
  final Token token;

  @override
  State<_DialogueWordSheet> createState() => _DialogueWordSheetState();
}

class _DialogueWordSheetState extends State<_DialogueWordSheet> {
  late final Future<WordAnalysis> _analysis;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    _analysis = AnalysisRepository.instance.analyzeToken(
      sentence: widget.sentence,
      startOffset: widget.token.start,
      endOffset: widget.token.end,
      tokenText: widget.token.text,
    );
  }

  Future<void> _save(WordAnalysis data) async {
    final bookId = await UserDb.instance.ensureBook('Игровые диалоги');
    final contextual = data.contextualTranslation?.trim();
    var translation = data.translation.trim();
    if (contextual != null &&
        contextual.isNotEmpty &&
        contextual.toLowerCase() != translation.toLowerCase()) {
      translation = 'В диалоге: $contextual\nВ общем: $translation';
    }
    await UserDb.instance.addVocabulary(
      bookId: bookId,
      word: data.surface,
      lemma: data.lemma,
      pos: data.upos,
      translation: translation,
      forms: data.forms,
    );
    if (mounted) setState(() => _saved = true);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
      ),
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        MediaQuery.paddingOf(context).bottom + 22,
      ),
      child: FutureBuilder<WordAnalysis>(
        future: _analysis,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(
              height: 250,
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (!snapshot.hasData) {
            return SizedBox(
              height: 220,
              child: Center(
                child: Text(
                  'Не удалось перевести слово',
                  style: TextStyle(color: scheme.error),
                ),
              ),
            );
          }
          final data = snapshot.data!;
          final contextual = data.contextualTranslation?.trim();
          final general = data.translation.trim();
          final hasContext = contextual != null &&
              contextual.isNotEmpty &&
              contextual.toLowerCase() != general.toLowerCase();
          return SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 42,
                    height: 4,
                    decoration: BoxDecoration(
                      color: scheme.outlineVariant,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            data.surface,
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${GrammarEngine.posShort(data.upos)} · ${data.lemma}',
                            style: TextStyle(
                              color: scheme.onSurface.withValues(alpha: 0.62),
                            ),
                          ),
                        ],
                      ),
                    ),
                    FilledButton.icon(
                      onPressed: _saved ? null : () => _save(data),
                      icon: Icon(_saved ? Icons.check : Icons.bookmark_add),
                      label: Text(_saved ? 'В словаре' : 'В словарь'),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Text(
                  hasContext ? 'В ЭТОЙ РЕПЛИКЕ' : 'ПЕРЕВОД',
                  style: TextStyle(
                    color: scheme.primary,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  hasContext ? contextual : general,
                  style: const TextStyle(fontSize: 22, height: 1.35),
                ),
                if (hasContext) ...[
                  const SizedBox(height: 16),
                  Text(
                    'В ОБЩЕМ',
                    style: TextStyle(
                      color: scheme.onSurface.withValues(alpha: 0.55),
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(general, style: const TextStyle(fontSize: 18)),
                ],
              ],
            ),
          );
        },
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

  List<_DialogueMessage> history(List<String> choiceIds) {
    var current = node(startNodeId);
    if (current == null) return const [];
    final messages = <_DialogueMessage>[
      _DialogueMessage(
        key: 'node-${current.id}',
        speaker: current.speaker,
        text: current.text,
      ),
    ];
    for (final choiceId in choiceIds) {
      _DialogueChoice? selected;
      for (final choice in current!.choices) {
        if (choice.id == choiceId) {
          selected = choice;
          break;
        }
      }
      if (selected == null) break;
      messages.add(_DialogueMessage(
        key: 'choice-${selected.id}',
        speaker: 'Čitavuk',
        text: selected.label,
      ));
      current = node(selected.next);
      if (current == null) break;
      messages.add(_DialogueMessage(
        key: 'node-${current.id}',
        speaker: current.speaker,
        text: current.text,
      ));
    }
    return messages;
  }

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

class _DialogueMessage {
  const _DialogueMessage({
    required this.key,
    required this.speaker,
    required this.text,
  });

  final String key;
  final String speaker;
  final String text;
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
