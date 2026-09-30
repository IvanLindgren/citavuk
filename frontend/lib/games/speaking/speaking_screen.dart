import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../screens/account_screen.dart';
import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/listening_service.dart';
import '../../services/study_service.dart';
import '../../utils/uuid.dart';
import 'genre_icon.dart';
import 'highlight.dart';
import 'speaking_models.dart';
import 'speaking_service.dart';
import 'roulette_stage.dart';
import 'voice_recorder.dart';

const _title = 'Говори или пиши';
const _settingsKey = 'citavuk-speaking-settings';
const _historyKey = 'citavuk-speaking-history';
const _maxRecordingSeconds = 180;
const _minRecordingSeconds = 3;

enum SpeakingEntryMode { speak, write }

class SpeakingScreen extends StatefulWidget {
  const SpeakingScreen({super.key, this.initialMode});
  final SpeakingEntryMode? initialMode;

  @override
  State<SpeakingScreen> createState() => _SpeakingScreenState();
}

class _SpeakingScreenState extends State<SpeakingScreen> {
  SpeakingAccess? _access;
  SpeakingCatalog? _catalog;
  String? _error;
  String? _owner;
  bool _initialized = false;

  SpeakingService get _service => SpeakingService(context.read<ApiClient>());

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final owner = context.watch<AuthService>().account?.id;
    if (!_initialized || owner != _owner) {
      _initialized = true;
      _owner = owner;
      _access = null;
      _catalog = null;
      _error = null;
      unawaited(_load());
    }
  }

  Future<void> _load() async {
    final owner = _owner;
    try {
      final access = await _service.access();
      final catalog = access.open ? await _service.topics() : null;
      if (!mounted || owner != _owner) return;
      setState(() {
        _access = access;
        _catalog = catalog;
      });
    } on ApiException catch (e) {
      if (mounted && owner == _owner) {
        setState(() => _error =
            e.isOffline ? 'Игре нужен интернет: проверь связь.' : e.message);
      }
    } catch (_) {
      if (mounted && owner == _owner) {
        setState(() => _error = 'Игра не загрузилась.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final access = _access, catalog = _catalog;
    Widget body;
    if (_error != null) {
      body = Center(
          child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(_error!, textAlign: TextAlign.center)));
    } else if (access == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (!access.open || catalog == null) {
      body = _Teaser(access: access);
    } else {
      body = _Game(
          key: ValueKey(_owner),
          catalog: catalog,
          service: _service,
          initialMode: widget.initialMode);
    }
    return Scaffold(appBar: AppBar(title: const Text('Говори!')), body: body);
  }
}

class _Teaser extends StatelessWidget {
  const _Teaser({required this.access});
  final SpeakingAccess access;

  @override
  Widget build(BuildContext context) {
    const months = [
      'января',
      'февраля',
      'марта',
      'апреля',
      'мая',
      'июня',
      'июля',
      'августа',
      'сентября',
      'октября',
      'ноября',
      'декабря'
    ];
    final date =
        '${access.publicFrom.day} ${months[access.publicFrom.month - 1]}';
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Image.asset('assets/imgs/citavuk_gram.webp',
            height: 140, cacheHeight: 280),
        const SizedBox(height: 16),
        Text(_title,
            textAlign: TextAlign.center, style: theme.textTheme.headlineSmall),
        const SizedBox(height: 12),
        const Text(
          'Случайная тема для разговора или короткого текста по-сербски.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 12),
        Text(
          'До $date игра открыта друзьям Читавука — тем, кто поддержал проект на сайте. С $date в неё сможет играть каждый.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _HistoryItem {
  _HistoryItem(
      {required this.id,
      required this.topic,
      required this.source,
      required this.level,
      required this.mistakes});

  factory _HistoryItem.fromJson(Map<String, dynamic> json) => _HistoryItem(
        id: json['id'] as String? ?? '',
        topic: json['topic'] as String? ?? '',
        source: json['source'] as String? ?? 'text',
        level: json['level'] as String? ?? '',
        mistakes: json['mistakes'] as int? ?? 0,
      );

  final String id, topic, source, level;
  final int mistakes;

  Map<String, dynamic> toJson() => {
        'id': id,
        'topic': topic,
        'source': source,
        'level': level,
        'mistakes': mistakes
      };
}

enum _Mode { none, speak, write }

class _Game extends StatefulWidget {
  const _Game(
      {super.key,
      required this.catalog,
      required this.service,
      this.initialMode});
  final SpeakingCatalog catalog;
  final SpeakingService service;
  final SpeakingEntryMode? initialMode;

  @override
  State<_Game> createState() => _GameState();
}

class _GameState extends State<_Game> {
  final _random = Random();
  final _answerKey = GlobalKey();
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  late final String _historyScope =
      '$_historyKey:${context.read<AuthService>().account?.id ?? 'guest'}';

  final Set<String> _genres = {};
  bool _hints = true;
  List<_HistoryItem> _history = [];

  int _spinId = 0;
  SpeakingTopic? _topic;
  bool _landed = false;
  _Mode _mode = _Mode.none;
  // Для голоса: пока запись не расшифрована, поле текста не показывается.
  bool _hasText = false;
  bool _busy = false;
  String _error = '';
  SpeakingReviewResult? _result;
  SpeakingTopic? _resultTopic;
  String _session = newUuid();

  @override
  void initState() {
    super.initState();
    unawaited(_restore());
  }

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final settings = jsonDecode(prefs.getString(_settingsKey) ?? '{}')
          as Map<String, dynamic>;
      final history =
          jsonDecode(prefs.getString(_historyScope) ?? '[]') as List;
      if (!mounted) return;
      final known = widget.catalog.genres.map((g) => g.id).toSet();
      setState(() {
        _genres
          ..clear()
          ..addAll([
            for (final id in settings['genres'] as List? ?? const [])
              if (known.contains(id)) id as String,
          ]);
        _hints = settings['hints'] != false;
        _history = [
          for (final item in history)
            _HistoryItem.fromJson(Map<String, dynamic>.from(item as Map)),
        ];
      });
    } catch (_) {}
  }

  Future<void> _saveSettings() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_settingsKey,
          jsonEncode({'genres': _genres.toList(), 'hints': _hints}));
    } catch (_) {}
  }

  Future<void> _saveHistory() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_historyScope,
          jsonEncode([for (final item in _history) item.toJson()]));
    } catch (_) {}
  }

  List<SpeakingTopic> get _pool => _genres.isEmpty
      ? widget.catalog.topics
      : [
          for (final topic in widget.catalog.topics)
            if (_genres.contains(topic.genre)) topic
        ];

  void _spin() {
    if (_spinId > 0 && !_landed) return;
    final pool = _pool;
    final options = pool.length > 1
        ? [
            for (final t in pool)
              if (t.id != _topic?.id) t
          ]
        : pool;
    setState(() {
      _topic = options[_random.nextInt(options.length)];
      _landed = false;
      _mode = _Mode.none;
      _hasText = false;
      _result = null;
      _error = '';
      _controller.clear();
      _session = newUuid();
      _spinId++;
    });
  }

  void _reveal() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = _answerKey.currentContext;
      if (context != null && context.mounted) {
        Scrollable.ensureVisible(context,
            duration: const Duration(milliseconds: 350),
            curve: Curves.easeOutCubic);
      }
    });
  }

  Future<void> _submit() async {
    final token = context.read<AuthService>().api.token;
    final topic = _topic;
    if (topic == null || _busy) return;
    final text = _controller.text;
    final source = _mode == _Mode.speak ? 'voice' : 'text';
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final result = await widget.service.review(
          sessionId: _session, topicId: topic.id, text: text, source: source);
      if (!mounted) return;
      final study = result.study;
      if (study != null) {
        await StudyService.instance
            .accept(study, token: token, userAction: true);
      }
      if (!mounted) return;
      final item = _HistoryItem(
        id: _session,
        topic: topic.ru,
        source: source,
        level: result.review.level,
        mistakes: result.review.mistakes.length,
      );
      setState(() {
        _result = result;
        _resultTopic = topic;
        _history =
            [item, ..._history.where((e) => e.id != item.id)].take(8).toList();
        _session = newUuid();
      });
      unawaited(_saveHistory());
      _reveal();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _error = e.isOffline
            ? 'Нет связи с сервером. Твой текст на месте — попробуй ещё раз.'
            : e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(
            () => _error = 'Не получилось разобрать текст. Попробуй ещё раз.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final signedIn = context.watch<AuthService>().isSignedIn;
    final topic = _topic;
    final genre = topic == null ? null : widget.catalog.genre(topic.genre);
    final result = _result;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: ListView(
          controller: _scroll,
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
          children: [
            Row(children: [
              Image.asset('assets/imgs/citavuk_gram.webp',
                  height: 88, cacheHeight: 176),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                          widget.initialMode == SpeakingEntryMode.speak
                              ? 'Говори!'
                              : widget.initialMode == SpeakingEntryMode.write
                                  ? 'Пиши!'
                                  : _title,
                          style: theme.textTheme.titleLarge
                              ?.copyWith(height: 1.15)),
                    ]),
              ),
            ]),
            const SizedBox(height: 8),
            Text(
              'Получи тему и ответь по-сербски.',
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ExpansionTile(
                          title: const Text('Темы'),
                          tilePadding: EdgeInsets.zero,
                          children: [
                            Wrap(spacing: 8, runSpacing: 8, children: [
                              for (final genre in widget.catalog.genres)
                                FilterChip(
                                    avatar: GenreIcon(genre: genre, size: 18),
                                    label: Text(genre.ru),
                                    selected: _genres.contains(genre.id),
                                    onSelected: _spinId > 0 && !_landed
                                        ? null
                                        : (on) {
                                            setState(() => on
                                                ? _genres.add(genre.id)
                                                : _genres.remove(genre.id));
                                            unawaited(_saveSettings());
                                          }),
                            ])
                          ]),
                      RouletteStage(
                        pool: _pool,
                        catalog: widget.catalog,
                        spinId: _spinId,
                        target: topic,
                        onLanded: () {
                          setState(() {
                            _landed = true;
                            if (widget.initialMode == SpeakingEntryMode.speak) {
                              _mode = _Mode.speak;
                            }
                            if (widget.initialMode == SpeakingEntryMode.write) {
                              _mode = _Mode.write;
                              _hasText = true;
                            }
                          });
                          _reveal();
                        },
                      ),
                      const SizedBox(height: 16),
                      Center(
                        child: FilledButton.icon(
                          onPressed: _spinId > 0 && !_landed ? null : _spin,
                          icon: const Icon(Icons.casino_outlined),
                          label: Text(_spinId == 0
                              ? 'Выбрать тему'
                              : _landed
                                  ? 'Другая тема'
                                  : 'Крутится…'),
                          style: FilledButton.styleFrom(
                              minimumSize: const Size(220, 52)),
                        ),
                      ),
                    ]),
              ),
            ),
            KeyedSubtree(
              key: _answerKey,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (topic != null && _landed && result == null)
                      _topicCard(theme, topic, genre, signedIn),
                    if (result != null && _resultTopic != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: _ReviewView(
                              topic: _resultTopic!,
                              result: result,
                              onAgain: _spin,
                              onRewrite: () => setState(() {
                                _controller.text = result.text;
                                _mode = _Mode.write;
                                _hasText = true;
                                _result = null;
                              }),
                            ),
                          ),
                        ),
                      ),
                  ]),
            ),
            if (_history.isNotEmpty) ...[
              const SizedBox(height: 24),
              Text('НЕДАВНИЕ ПОПЫТКИ',
                  style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0)),
              const SizedBox(height: 8),
              Card(
                child: Column(children: [
                  for (final item in _history)
                    ListTile(
                      dense: true,
                      leading: Icon(item.source == 'voice'
                          ? Icons.mic_none
                          : Icons.edit_outlined),
                      title: Text(item.topic,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: Text(
                        '${item.level.isEmpty ? '' : '${item.level}, '}${item.mistakes == 0 ? 'без ошибок' : 'ошибок: ${item.mistakes}'}',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                ]),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _topicCard(ThemeData theme, SpeakingTopic topic, SpeakingGenre? genre,
      bool signedIn) {
    final words = countWords(_controller.text);
    final enough = words >= speakingMinWords;
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              GenreIcon(
                  genre: genre, size: 18, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(genre?.ru ?? '',
                    style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0)),
              ),
            ]),
            const SizedBox(height: 8),
            Text(topic.ru,
                style: theme.textTheme.headlineSmall?.copyWith(height: 1.2)),
            const SizedBox(height: 6),
            Text(topic.sr,
                style: theme.textTheme.titleMedium
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            if (_hints) ...[
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final word in topic.words)
                  Chip(
                    visualDensity: VisualDensity.compact,
                    label: Text.rich(TextSpan(children: [
                      TextSpan(
                          text: word.sr,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      TextSpan(
                          text: ' — ${word.ru}',
                          style: TextStyle(
                              color: theme.colorScheme.onSurfaceVariant)),
                    ])),
                  ),
              ]),
            ],
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () {
                  setState(() => _hints = !_hints);
                  unawaited(_saveSettings());
                },
                icon: Icon(
                    _hints
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                    size: 18),
                label: Text(
                    _hints ? 'Скрыть подсказки' : 'Показать опорные слова'),
              ),
            ),
            if (_mode == _Mode.none) ...[
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: VoiceRecorder.supported
                    ? () => setState(() {
                          _mode = _Mode.speak;
                          _hasText = false;
                          _controller.clear();
                        })
                    : null,
                icon: const Icon(Icons.mic),
                label: const Text('Сказать'),
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52)),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => setState(() {
                  _mode = _Mode.write;
                  _hasText = true;
                }),
                icon: const Icon(Icons.edit_outlined),
                label: const Text('Написать'),
                style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52)),
              ),
              if (!VoiceRecorder.supported)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                      'В этой сборке нельзя записать голос — напиши ответ текстом.',
                      style: theme.textTheme.bodySmall),
                ),
            ] else ...[
              const Divider(height: 32),
              if (_mode == _Mode.speak && !_hasText) ...[
                _VoicePanel(
                  service: widget.service,
                  onTranscript: (text) => setState(() {
                    _controller.text = text;
                    _hasText = true;
                  }),
                ),
                Center(
                  child: TextButton(
                    onPressed: () => setState(() => _mode = _Mode.none),
                    child: const Text('Выбрать по-другому'),
                  ),
                ),
              ] else ...[
                if (_mode == _Mode.speak)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                        'Вот что услышал Читавук. Если слово распознано неверно, поправь его.',
                        style: theme.textTheme.bodySmall),
                  ),
                TextField(
                  controller: _controller,
                  enabled: !_busy,
                  minLines: 7,
                  maxLines: 14,
                  maxLength: speakingMaxChars,
                  textCapitalization: TextCapitalization.sentences,
                  enableSuggestions: false,
                  autocorrect: false,
                  onChanged: (_) => setState(() {}),
                  style: theme.textTheme.titleMedium?.copyWith(height: 1.5),
                  decoration: InputDecoration(
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16)),
                    hintText:
                        'Пиши по-сербски — латиницей или кириллицей. Хватит пяти-восьми предложений.',
                    counterText: '',
                    helperText:
                        '$words ${_wordForm(words)}${enough ? '' : ', нужно ещё хотя бы ${speakingMinWords - words}'}',
                  ),
                ),
                if (_error.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(_error,
                        style: TextStyle(color: theme.colorScheme.error)),
                  ),
                const SizedBox(height: 12),
                Wrap(spacing: 12, runSpacing: 12, children: [
                  if (signedIn)
                    FilledButton.icon(
                      onPressed: enough && !_busy ? _submit : null,
                      icon: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.fact_check_outlined),
                      label: Text(
                          _busy ? 'Читавук проверяет…' : 'Разобрать ошибки'),
                      style: FilledButton.styleFrom(
                          minimumSize: const Size(200, 52)),
                    )
                  else
                    FilledButton(
                      onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                              builder: (_) => const AccountScreen())),
                      style: FilledButton.styleFrom(
                          minimumSize: const Size(200, 52)),
                      child: const Text('Войти, чтобы разобрать'),
                    ),
                  OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => setState(() {
                              if (_mode == _Mode.speak) {
                                _hasText = false;
                                _controller.clear();
                              } else {
                                _mode = _Mode.none;
                              }
                            }),
                    icon: const Icon(Icons.replay),
                    label: Text(
                        _mode == _Mode.speak ? 'Записать заново' : 'Назад'),
                    style: OutlinedButton.styleFrom(
                        minimumSize: const Size(160, 52)),
                  ),
                ]),
              ],
            ],
          ]),
        ),
      ),
    );
  }
}

String _wordForm(int n) {
  final tail = n % 100;
  if (tail >= 11 && tail <= 14) return 'слов';
  return n % 10 == 1
      ? 'слово'
      : (n % 10 >= 2 && n % 10 <= 4)
          ? 'слова'
          : 'слов';
}

String _clock(int seconds) =>
    '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';

enum _RecState { idle, recording, transcribing, error }

/// Запись голоса и расшифровка; готовый текст отдаётся наверх.
class _VoicePanel extends StatefulWidget {
  const _VoicePanel({required this.service, required this.onTranscript});
  final SpeakingService service;
  final ValueChanged<String> onTranscript;

  @override
  State<_VoicePanel> createState() => _VoicePanelState();
}

class _VoicePanelState extends State<_VoicePanel> {
  final _recorder = VoiceRecorder();
  _RecState _state = _RecState.idle;
  String _message = '';
  int _seconds = 0;
  double _level = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() {
      _state = _RecState.error;
      _message = message;
    });
  }

  Future<void> _begin() async {
    try {
      await _recorder.start(onLevel: (level) {
        if (mounted && _state == _RecState.recording) {
          setState(() => _level = level);
        }
      });
    } on VoiceRecorderException catch (e) {
      _fail(e.message);
      return;
    }
    if (!mounted) return;
    setState(() {
      _state = _RecState.recording;
      _seconds = 0;
      _level = 0;
    });
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _seconds++);
      if (_seconds >= _maxRecordingSeconds) unawaited(_finish());
    });
  }

  Future<void> _finish() async {
    if (_state != _RecState.recording) return;
    _timer?.cancel();
    setState(() {
      _state = _RecState.transcribing;
      _level = 0;
    });
    try {
      final recording = await _recorder.stop();
      if (recording.seconds < _minRecordingSeconds) {
        if (mounted) {
          _fail('Запись слишком короткая. Скажи хотя бы пару предложений.');
        }
        return;
      }
      final text = await widget.service
          .transcribe(recording.bytes, recording.filename, recording.mime);
      if (!mounted) return;
      setState(() => _state = _RecState.idle);
      widget.onTranscript(text);
    } on ApiException catch (e) {
      _fail(e.isOffline ? 'Нет связи с сервером.' : e.message);
    } on VoiceRecorderException catch (e) {
      _fail(e.message);
    } catch (_) {
      if (mounted) {
        _fail('Не удалось расшифровать запись. Попробуй ещё раз.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final recording = _state == _RecState.recording;
    final busy = _state == _RecState.transcribing;
    final left = _maxRecordingSeconds - _seconds;
    return Column(children: [
      const SizedBox(height: 8),
      SizedBox(
        width: 140,
        height: 140,
        child: Stack(alignment: Alignment.center, children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 100),
            width: recording ? 96 + _level * 44 : 96,
            height: recording ? 96 + _level * 44 : 96,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: theme.colorScheme.primary
                  .withValues(alpha: recording ? .16 : 0),
            ),
          ),
          Semantics(
            button: true,
            label: recording ? 'Остановить запись' : 'Начать запись',
            child: Material(
              color: theme.colorScheme.primary,
              shape: const CircleBorder(),
              elevation: 4,
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: busy ? null : (recording ? _finish : _begin),
                child: SizedBox(
                  width: 96,
                  height: 96,
                  child: Center(
                    child: busy
                        ? SizedBox(
                            width: 34,
                            height: 34,
                            child: CircularProgressIndicator(
                                strokeWidth: 3,
                                color: theme.colorScheme.onPrimary),
                          )
                        : Icon(recording ? Icons.stop_rounded : Icons.mic,
                            size: 44, color: theme.colorScheme.onPrimary),
                  ),
                ),
              ),
            ),
          ),
        ]),
      ),
      const SizedBox(height: 8),
      SizedBox(
        height: 60,
        child: switch (_state) {
          _RecState.idle => Text(
              'Нажми и говори по-сербски: хватит одной-двух минут. Потом нажми ещё раз, чтобы закончить.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          _RecState.recording => Column(children: [
              Text(_clock(_seconds),
                  style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      fontFeatures: const [FontFeature.tabularFigures()])),
              Text(
                  left < 20
                      ? 'Запись остановится через $left с'
                      : 'Идёт запись…',
                  style: theme.textTheme.bodySmall),
            ]),
          _RecState.transcribing => Text(
              'Читавук слушает запись и расшифровывает её…',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium),
          _RecState.error => Text(_message,
              textAlign: TextAlign.center,
              style: TextStyle(color: theme.colorScheme.error)),
        },
      ),
    ]);
  }
}

class _ReviewView extends StatefulWidget {
  const _ReviewView(
      {required this.topic,
      required this.result,
      required this.onAgain,
      required this.onRewrite});
  final SpeakingTopic topic;
  final SpeakingReviewResult result;
  final VoidCallback onAgain, onRewrite;

  @override
  State<_ReviewView> createState() => _ReviewViewState();
}

class _ReviewViewState extends State<_ReviewView> {
  final _player = AudioPlayer();
  bool _playing = false;
  bool _stopped = false;

  @override
  void dispose() {
    _stopped = true;
    _player.dispose();
    super.dispose();
  }

  /// Сервер озвучивает не больше 399 знаков за раз: режем по предложениям.
  static List<String> _chunks(String text) {
    const max = 399;
    final out = <String>[];
    var current = '';
    for (final match in RegExp(r'[^.!?…]+[.!?…]*\s*').allMatches(text)) {
      var part = match.group(0)!;
      while (part.length > max) {
        var cut = part.lastIndexOf(' ', max);
        if (cut <= 0) cut = max;
        if (current.isNotEmpty) {
          out.add(current.trim());
          current = '';
        }
        out.add(part.substring(0, cut).trim());
        part = part.substring(cut);
      }
      if (current.isNotEmpty && current.length + part.length > max) {
        out.add(current.trim());
        current = '';
      }
      current += part;
    }
    if (current.trim().isNotEmpty) out.add(current.trim());
    return out;
  }

  Future<void> _togglePlay(String text) async {
    if (_playing) {
      _stopped = true;
      await _player.stop();
      if (mounted) setState(() => _playing = false);
      return;
    }
    _stopped = false;
    setState(() => _playing = true);
    try {
      for (final chunk in _chunks(text)) {
        if (_stopped || !mounted) break;
        final done = _player.onPlayerComplete.first;
        await _player.play(UrlSource(ListeningService.instance.ttsUrl(chunk)));
        await done.timeout(const Duration(minutes: 2));
      }
    } catch (_) {
      // Озвучка — приятное дополнение: молча останавливаемся.
    }
    if (mounted) setState(() => _playing = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final review = widget.result.review;
    final text = widget.result.text;
    final clean = review.mistakes.isEmpty;
    final parts = annotate(text, review.mistakes);
    // Номера идут в порядке появления в тексте, как и карточки ниже.
    final order = <int, int>{};
    for (final part in parts) {
      final index = part.mistake;
      if (index != null) order[index] = order.length + 1;
    }

    Widget title(String value) => Padding(
          padding: const EdgeInsets.only(top: 20, bottom: 8),
          child: Text(value.toUpperCase(),
              style: theme.textTheme.labelSmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0)),
        );

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('РАЗБОР, ${widget.topic.ru}'.toUpperCase(),
          style: theme.textTheme.labelSmall?.copyWith(
              color: scheme.primary,
              fontWeight: FontWeight.w800,
              letterSpacing: 0)),
      const SizedBox(height: 12),
      Wrap(spacing: 8, runSpacing: 8, children: [
        if (review.level.isNotEmpty)
          Chip(
            backgroundColor: scheme.primary,
            label: Text('Уровень текста ≈ ${review.level}',
                style: TextStyle(
                    color: scheme.onPrimary, fontWeight: FontWeight.w700)),
          ),
        Chip(
          avatar: clean ? const Icon(Icons.check, size: 18) : null,
          label:
              Text(clean ? 'Без ошибок' : 'Ошибок: ${review.mistakes.length}'),
        ),
        if (!review.onTopic) const Chip(label: Text('Немного мимо темы')),
      ]),
      const SizedBox(height: 12),
      Text(review.summary,
          style: theme.textTheme.titleMedium
              ?.copyWith(height: 1.4, fontWeight: FontWeight.w400)),
      for (final item in review.strengths)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.check, size: 18, color: Colors.green.shade700),
            const SizedBox(width: 8),
            Expanded(child: Text(item)),
          ]),
        ),
      title('Твой текст'),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant),
          color: scheme.surfaceContainerLow,
        ),
        child: SelectableText.rich(
          TextSpan(
            style: theme.textTheme.titleMedium?.copyWith(height: 1.7),
            children: [
              for (final part in parts)
                if (part.mistake == null)
                  TextSpan(text: part.text)
                else ...[
                  TextSpan(
                    text: part.text,
                    style: TextStyle(
                      decoration: TextDecoration.underline,
                      decorationStyle: TextDecorationStyle.wavy,
                      decorationColor: scheme.primary,
                      decorationThickness: 2,
                      backgroundColor: scheme.primary.withValues(alpha: .08),
                    ),
                  ),
                  TextSpan(
                    text: '${order[part.mistake]}',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: scheme.primary,
                        height: 0),
                  ),
                ],
            ],
          ),
        ),
      ),
      if (!clean) ...[
        title('Разбор'),
        for (final part in parts.where((p) => p.mistake != null))
          Builder(builder: (context) {
            final mistake = review.mistakes[part.mistake!];
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              elevation: 0,
              color: scheme.surfaceContainerLow,
              shape: RoundedRectangleBorder(
                side: BorderSide(color: scheme.outlineVariant),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 10,
                          runSpacing: 4,
                          children: [
                            Text('${order[part.mistake]}',
                                style: TextStyle(
                                    color: scheme.primary,
                                    fontWeight: FontWeight.w800)),
                            Text.rich(TextSpan(
                                style: theme.textTheme.titleMedium,
                                children: [
                                  TextSpan(
                                    text: mistake.original,
                                    style: TextStyle(
                                        color: scheme.primary,
                                        decoration: TextDecoration.lineThrough,
                                        decorationThickness: 2),
                                  ),
                                  const TextSpan(text: '  →  '),
                                  TextSpan(
                                      text: mistake.fixed,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800)),
                                ])),
                            Chip(
                                visualDensity: VisualDensity.compact,
                                label: Text(mistake.label)),
                          ]),
                      if (mistake.explanation.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(mistake.explanation,
                              style: TextStyle(
                                  color: scheme.onSurfaceVariant, height: 1.4)),
                        ),
                    ]),
              ),
            );
          }),
        // Ошибки, которым не нашлось места в тексте, всё равно показываются.
        for (final entry
            in review.mistakes.indexed.where((e) => !order.containsKey(e.$1)))
          ListTile(
            dense: true,
            title: Text.rich(TextSpan(children: [
              TextSpan(
                  text: entry.$2.original,
                  style:
                      const TextStyle(decoration: TextDecoration.lineThrough)),
              const TextSpan(text: '  →  '),
              TextSpan(
                  text: entry.$2.fixed,
                  style: const TextStyle(fontWeight: FontWeight.w800)),
            ])),
            subtitle: Text(entry.$2.explanation),
          ),
      ],
      if (review.polished.isNotEmpty && !clean) ...[
        title('Как это звучит правильно'),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: scheme.outlineVariant),
            color: scheme.surfaceContainerLow,
          ),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SelectableText(review.polished,
                style: theme.textTheme.titleMedium?.copyWith(height: 1.7)),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _togglePlay(review.polished),
              icon: Icon(_playing ? Icons.stop : Icons.volume_up_outlined),
              label: Text(_playing ? 'Остановить' : 'Послушать'),
            ),
          ]),
        ),
      ],
      if (review.tips.isNotEmpty) ...[
        title('Что потренировать'),
        for (final tip in review.tips)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Icon(Icons.circle, size: 6)),
              const SizedBox(width: 10),
              Expanded(child: Text(tip, style: const TextStyle(height: 1.4))),
            ]),
          ),
      ],
      if (review.words.isNotEmpty) ...[
        title('Пригодилось бы по этой теме'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final word in review.words)
            Chip(
              visualDensity: VisualDensity.compact,
              label: Text.rich(TextSpan(children: [
                TextSpan(
                    text: word.sr,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                TextSpan(
                    text: ' — ${word.ru}',
                    style: TextStyle(color: scheme.onSurfaceVariant)),
              ])),
            ),
        ]),
      ],
      const SizedBox(height: 24),
      FilledButton.icon(
        onPressed: widget.onAgain,
        icon: const Icon(Icons.casino_outlined),
        label: const Text('Крутить ещё'),
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: widget.onRewrite,
        icon: const Icon(Icons.replay),
        label: const Text('Попробовать эту тему ещё раз'),
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
      ),
    ]);
  }
}
