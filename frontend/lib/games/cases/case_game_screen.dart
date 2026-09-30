import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/study_service.dart';
import '../../utils/uuid.dart';
import 'case_game_data.dart';
import 'case_game_service.dart';
import 'typewriter_sounds.dart';
import 'typewriter_3d_view.dart';
import 'typewriter_view.dart';

const _title = 'Уничтожь эти падежи с Читавуком!';
const _limits = [
  (60, '1 минута'),
  (300, '5 минут'),
  (900, '15 минут'),
  (0, 'Без конца')
];
const _levels = [('a', 'A1–A2'), ('b', 'до B2'), ('all', 'Все слова')];
const _voiceRetries = 3;

class _Settings {
  _Settings(
      {this.limit = 60,
      this.scope = 'all',
      this.level = 'b',
      this.voice = false});
  int limit;
  String scope, level;
  bool voice;

  static const _key = 'citavuk-case-game-settings';

  static Future<_Settings> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getStringList(_key);
      if (raw != null && raw.length == 4) {
        return _Settings(
            limit: int.tryParse(raw[0]) ?? 60,
            scope: raw[1],
            level: raw[2],
            voice: raw[3] == '1');
      }
    } catch (_) {}
    return _Settings();
  }

  Future<void> save() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs
          .setStringList(_key, ['$limit', scope, level, voice ? '1' : '0']);
    } catch (_) {}
  }

  String get scopeKey => '$scope:$level';
}

/// Игра «Уничтожь эти падежи с Читавуком!»: настройка, партия на печатной
/// машинке (клавиатурой или голосом) и итоги.
class CaseGameScreen extends StatefulWidget {
  const CaseGameScreen({super.key});

  @override
  State<CaseGameScreen> createState() => _CaseGameScreenState();
}

enum _Phase { setup, play, done }

class _CaseGameScreenState extends State<CaseGameScreen> {
  CaseGameAccess? _access;
  CaseGameData? _data;
  _Settings? _settings;
  String? _error;
  _Phase _phase = _Phase.setup;
  List<Attempt> _attempts = const [];
  int _elapsed = 0;
  List<CaseGameRecord> _history = const [];
  String? _owner;
  bool _initialized = false;

  CaseGameService get _service => CaseGameService(context.read<ApiClient>());

  @override
  void initState() {
    super.initState();
    unawaited(TypewriterSounds.instance.prepare());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final owner = context.watch<AuthService>().account?.id;
    if (!_initialized || owner != _owner) {
      _initialized = true;
      _owner = owner;
      _access = null;
      _error = null;
      _history = const [];
      _attempts = const [];
      _phase = _Phase.setup;
      unawaited(_load());
    }
  }

  Future<void> _load() async {
    final owner = _owner;
    try {
      final results = await Future.wait<Object>([
        _service.access(),
        CaseGameData.load(),
        _Settings.load(),
      ]);
      if (!mounted || owner != _owner) return;
      setState(() {
        _access = results[0] as CaseGameAccess;
        _data = results[1] as CaseGameData;
        _settings = results[2] as _Settings;
      });
      unawaited(_loadHistory());
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

  Future<void> _loadHistory() async {
    final owner = _owner;
    if (!context.read<AuthService>().isSignedIn) return;
    try {
      final items = await _service.results();
      if (mounted && owner == _owner) setState(() => _history = items);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final access = _access, data = _data, settings = _settings;
    Widget body;
    if (_error != null) {
      body = Center(
          child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(_error!, textAlign: TextAlign.center)));
    } else if (access == null || data == null || settings == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (!access.open) {
      body = _Teaser(access: access);
    } else if (_phase == _Phase.play) {
      body = _Play(
        data: data,
        settings: settings,
        onQuit: () => setState(() => _phase = _Phase.setup),
        onFinish: (attempts, elapsed) => setState(() {
          _attempts = attempts;
          _elapsed = elapsed;
          _phase = _Phase.done;
        }),
      );
    } else if (_phase == _Phase.done) {
      body = _Results(
        settings: settings,
        attempts: _attempts,
        elapsed: _elapsed,
        history: _history,
        service: _service,
        onAgain: () => setState(() => _phase = _Phase.play),
        onSetup: () {
          unawaited(_loadHistory());
          setState(() => _phase = _Phase.setup);
        },
      );
    } else {
      body = _Setup(
        settings: settings,
        history: _history,
        onStart: () {
          unawaited(settings.save());
          setState(() => _phase = _Phase.play);
        },
        onChanged: () => setState(() {}),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Уничтожь падежи')),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 260),
        switchInCurve: Curves.easeOutCubic,
        child:
            KeyedSubtree(key: ValueKey('$_phase-${access?.open}'), child: body),
      ),
    );
  }
}

class _Teaser extends StatelessWidget {
  const _Teaser({required this.access});
  final CaseGameAccess access;

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
        const Center(
          child: Chip(
              avatar: Icon(Icons.lock_outline, size: 18),
              label: Text('Ранний доступ')),
        ),
        const SizedBox(height: 8),
        Text(_title,
            textAlign: TextAlign.center, style: theme.textTheme.headlineSmall),
        const SizedBox(height: 12),
        const Text(
          'Печатная машинка, лапы Читавука и настоящий звук клавиш: пиши сербские слова в нужном падеже и времени — или говори их голосом.',
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

class _Setup extends StatelessWidget {
  const _Setup(
      {required this.settings,
      required this.history,
      required this.onStart,
      required this.onChanged});
  final _Settings settings;
  final List<CaseGameRecord> history;
  final VoidCallback onStart, onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Widget chip(String label, bool selected, VoidCallback onTap,
            {IconData? icon}) =>
        ChoiceChip(
          label: Text(label),
          avatar: icon == null ? null : Icon(icon, size: 18),
          selected: selected,
          onSelected: (_) {
            onTap();
            onChanged();
          },
        );
    Widget section(String title, List<Widget> chips) => Padding(
          padding: const EdgeInsets.only(top: 16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title.toUpperCase(),
                style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    letterSpacing: 0)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: chips),
          ]),
        );
    final best = history
        .where((r) =>
            r.scope == settings.scopeKey &&
            r.limitSeconds == settings.limit &&
            settings.limit > 0)
        .fold<CaseGameRecord?>(
            null, (b, r) => b == null || r.correct > b.correct ? r : b);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        Row(children: [
          Image.asset('assets/imgs/citavuk_gram.webp',
              width: 84, cacheWidth: 168),
          const SizedBox(width: 12),
          Expanded(child: Text(_title, style: theme.textTheme.titleLarge)),
        ]),
        const SizedBox(height: 8),
        const Text(
          'Читавук даёт слово и падеж — ты печатаешь форму на машинке или говоришь её вслух. Чёрточки над č, ć, š, ž, đ можно не ставить: ответ засчитается, но Читавук подскажет, где они нужны.',
        ),
        section('Время', [
          for (final item in _limits)
            chip(item.$2, settings.limit == item.$1,
                () => settings.limit = item.$1,
                icon:
                    item.$1 == 0 ? Icons.all_inclusive : Icons.timer_outlined),
        ]),
        section('Падежи', [
          chip('Все падежи', settings.scope == 'all',
              () => settings.scope = 'all'),
          chip('Существительные', settings.scope == 'nouns',
              () => settings.scope = 'nouns'),
          chip('Местоимения', settings.scope == 'pronouns',
              () => settings.scope = 'pronouns'),
        ]),
        section('Один падеж', [
          for (final c in caseInfos)
            chip(c.ru, settings.scope == 'case:${c.key}',
                () => settings.scope = 'case:${c.key}'),
        ]),
        section('Времена глаголов', [
          chip('Все времена', settings.scope == 'verbs',
              () => settings.scope = 'verbs'),
          for (final t in tenseInfos)
            chip(t.ru, settings.scope == 'tense:${t.key}',
                () => settings.scope = 'tense:${t.key}'),
        ]),
        section('Слова', [
          for (final l in _levels)
            chip(l.$2, settings.level == l.$1, () => settings.level = l.$1),
        ]),
        section('Как отвечать', [
          chip('Печатать', !settings.voice, () => settings.voice = false,
              icon: Icons.keyboard_outlined),
          chip('Говорить голосом', settings.voice, () => settings.voice = true,
              icon: Icons.mic_none),
        ]),
        if (settings.voice)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
                'Скажи форму — Читавук узнает её сразу, как услышит, и напечатает сам.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: () {
            unawaited(TypewriterSounds.instance.prepare());
            onStart();
          },
          icon: const Icon(Icons.play_arrow),
          label: const Text('Начать'),
          style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16)),
        ),
        if (best != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
                'Рекорд в этом режиме: ${best.correct} верно, ${best.accuracy.round()}%',
                textAlign: TextAlign.center),
          ),
      ],
    );
  }
}

class _Play extends StatefulWidget {
  const _Play(
      {required this.data,
      required this.settings,
      required this.onFinish,
      required this.onQuit});
  final CaseGameData data;
  final _Settings settings;
  final void Function(List<Attempt> attempts, int elapsed) onFinish;
  final VoidCallback onQuit;

  @override
  State<_Play> createState() => _PlayState();
}

class _PlayState extends State<_Play> {
  late final TaskSource _source =
      TaskSource(widget.data, widget.settings.scope, widget.settings.level);
  late GameTask _task = _source.next();
  final _attempts = <Attempt>[];
  final _lines = <PrintedLine>[];
  final _focus = FocusNode();
  // Пробел-заглушка: без него экранная клавиатура не присылает «стереть».
  final _phoneInput = TextEditingController.fromValue(const TextEditingValue(
      text: ' ', selection: TextSelection.collapsed(offset: 1)));
  final _phoneFocus = FocusNode();
  final _started = DateTime.now();
  Timer? _ticker;
  String _typed = '';
  KeyStrike? _strike;
  int _strikeId = 0;
  bool _returning = false;
  bool _locked = false;
  bool _done = false;

  // Голос.
  final _speech = SpeechToText();
  bool _voiceOn = false;
  bool _listening = false;
  String? _voiceError;
  String _heard = '';
  String? _locale;
  int _session = 0;
  (int, int)? _consumed;
  int _misses = 0;

  int get _elapsed => DateTime.now().difference(_started).inSeconds;

  @override
  void initState() {
    super.initState();
    // Конец партии — один таймер. Часы тикают в своём виджете: перерисовывать
    // ради цифр всю машинку четыре раза в секунду незачем.
    if (widget.settings.limit > 0) {
      _ticker = Timer(Duration(seconds: widget.settings.limit), _finish);
    }
    if (widget.settings.voice) unawaited(_startVoice());
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _voiceOn = false;
    unawaited(_speech.cancel());
    _focus.dispose();
    _phoneInput.dispose();
    _phoneFocus.dispose();
    super.dispose();
  }

  void _finish() {
    if (_done) return;
    _done = true;
    _ticker?.cancel();
    _voiceOn = false;
    unawaited(_speech.cancel());
    TypewriterSounds.instance.play(TypewriterSound.bell);
    final elapsed = widget.settings.limit > 0
        ? widget.settings.limit.clamp(1, _elapsed.clamp(1, 1 << 30))
        : _elapsed.clamp(1, 1 << 30);
    widget.onFinish(List.of(_attempts), elapsed);
  }

  void _press(String key) {
    _strikeId++;
    _strike = KeyStrike(key, _strikeId);
    TypewriterSounds.instance
        .play(key == ' ' ? TypewriterSound.space : TypewriterSound.key);
    HapticFeedback.selectionClick();
  }

  void _handleKey(String key) {
    if (_locked || _done) return;
    setState(() {
      if (key == 'enter') {
        _press('enter');
        if (_typed.trim().isNotEmpty) _submit(_typed);
        return;
      }
      if (key == 'backspace') {
        _press('backspace');
        if (_typed.isNotEmpty) _typed = _typed.substring(0, _typed.length - 1);
        return;
      }
      if (_typed.length >= 40) return;
      _press(key);
      _typed += key;
    });
  }

  void _submit(String value, {bool viaVoice = false}) {
    if (_locked || _done) return;
    final verdict = checkAnswer(value, _task.answers);
    // Голосом «забыть чёрточку» нельзя: ответ засчитывается полностью.
    if (viaVoice && verdict.result == VerdictKind.diacritics) {
      verdict.result = VerdictKind.exact;
      verdict.missing = [];
    }
    _attempts.add(Attempt(_task, value, verdict));
    _lines.add(PrintedLine(
      before: _task.before,
      typed: value.trim(),
      after: _task.after,
      status: switch (verdict.result) {
        VerdictKind.exact => 'ok',
        VerdictKind.diacritics => 'slip',
        VerdictKind.wrong => 'wrong',
      },
      correct: verdict.matched,
      missing: verdict.missing,
    ));
    if (verdict.result == VerdictKind.wrong) {
      TypewriterSounds.instance.play(TypewriterSound.thud);
      HapticFeedback.mediumImpact();
    } else {
      TypewriterSounds.instance.play(TypewriterSound.bell);
    }
    _locked = true;
    _returning = true;
    _heard = '';
    _misses = 0;
    setState(() {});
    Future.delayed(
        Duration(milliseconds: verdict.result == VerdictKind.wrong ? 700 : 420),
        () {
      if (!mounted || _done) return;
      setState(() {
        _typed = '';
        _task = _source.next();
        _returning = false;
        _locked = false;
      });
    });
  }

  // --- Голос ---

  Future<void> _startVoice() async {
    try {
      final ok = await _speech.initialize(
        onError: (SpeechRecognitionError error) {
          if (!mounted) return;
          if (error.errorMsg.contains('permission')) {
            setState(() => _voiceError =
                'Нет доступа к микрофону. Разреши его в настройках — или играй на клавиатуре.');
            _voiceOn = false;
          }
        },
        onStatus: (status) {
          if (!mounted) return;
          final listening = status == 'listening';
          if (listening != _listening) setState(() => _listening = listening);
          // Система останавливает распознавание после паузы — перезапускаем.
          if ((status == 'done' || status == 'notListening') &&
              _voiceOn &&
              !_done) {
            Future.delayed(const Duration(milliseconds: 200), _listen);
          }
        },
      );
      if (!ok) {
        setState(() => _voiceError =
            'На этом устройстве нет распознавания речи. Можно играть на клавиатуре.');
        return;
      }
      final locales = await _speech.locales();
      final serbian = locales
          .where((l) =>
              l.localeId.toLowerCase().replaceAll('-', '_').startsWith('sr'))
          .toList();
      if (serbian.isEmpty) {
        setState(() => _voiceError =
            'Распознавание на этом устройстве не знает сербского. Можно играть на клавиатуре.');
        return;
      }
      _locale = serbian
          .firstWhere((l) => l.localeId.contains('RS'),
              orElse: () => serbian.first)
          .localeId;
      _voiceOn = true;
      await _listen();
    } catch (_) {
      if (mounted) {
        setState(() => _voiceError =
            'Микрофон не запустился. Можно продолжать на клавиатуре.');
      }
    }
  }

  Future<void> _listen() async {
    if (!_voiceOn || _done || !mounted || _speech.isListening) return;
    _session++;
    final session = _session;
    try {
      await _speech.listen(
        onResult: (result) => _onHeard(
          [for (final a in result.alternates) a.recognizedWords],
          result.finalResult,
          session,
        ),
        listenOptions: SpeechListenOptions(
          partialResults: true,
          listenMode: ListenMode.dictation,
          cancelOnError: false,
          pauseFor: const Duration(seconds: 4),
          listenFor: const Duration(minutes: 1),
          localeId: _locale,
        ),
      );
    } catch (_) {}
  }

  void _onHeard(List<String> alternatives, bool isFinal, int session) {
    if (_done || !mounted) return;
    // Слова, уже засчитанные в этой фразе, не участвуют в следующем задании.
    final skip = _consumed?.$1 == session ? _consumed!.$2 : 0;
    final fresh = [
      for (final text in alternatives) spokenWords(text).skip(skip).join(' ')
    ];
    setState(() => _heard = fresh.isEmpty ? '' : fresh.first);
    if (_locked) return;
    final match = spokenAnswer(fresh, _task.answers);
    if (match != null) {
      _consumed =
          (session, skip + spokenWords(alternatives.first).skip(skip).length);
      _typeOut(match);
      return;
    }
    if (isFinal && fresh.isNotEmpty && fresh.first.trim().isNotEmpty) {
      _misses++;
      if (_misses >= _voiceRetries) _submit(fresh.first, viaVoice: true);
    }
  }

  /// Верная форма печатается лапами сама, буква за буквой.
  void _typeOut(String answer) {
    _locked = true;
    final letters = answer.split('');
    var index = 0;
    _typed = '';
    Timer.periodic(const Duration(milliseconds: 45), (timer) {
      if (!mounted || _done) {
        timer.cancel();
        return;
      }
      if (index < letters.length) {
        setState(() {
          _press(letters[index]);
          _typed += letters[index];
        });
        index++;
        return;
      }
      timer.cancel();
      _locked = false;
      _submit(answer, viaVoice: true);
    });
  }

  KeyEventResult _onKeyEvent(FocusNode node, KeyEvent event) {
    if (event is KeyUpEvent) return KeyEventResult.ignored;
    if (HardwareKeyboard.instance.isControlPressed ||
        HardwareKeyboard.instance.isMetaPressed) {
      return KeyEventResult.ignored;
    }
    if (event.logicalKey == LogicalKeyboardKey.enter ||
        event.logicalKey == LogicalKeyboardKey.numpadEnter) {
      _handleKey('enter');
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.backspace) {
      _handleKey('backspace');
      return KeyEventResult.handled;
    }
    final letter = letterForKey(event);
    if (letter == null) return KeyEventResult.ignored;
    for (final ch in letter.split('')) {
      _handleKey(ch);
    }
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final correct =
        _attempts.where((a) => a.verdict.result != VerdictKind.wrong).length;
    final wrong = _attempts.length - correct;
    final limit = widget.settings.limit;
    return Focus(
      focusNode: _focus,
      autofocus: true,
      onKeyEvent: _onKeyEvent,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Row(children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                    color: const Color(0xFF1D1A17),
                    borderRadius: BorderRadius.circular(12)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(limit > 0 ? Icons.timer_outlined : Icons.all_inclusive,
                      size: 18, color: const Color(0xFFD9B25F)),
                  const SizedBox(width: 6),
                  _Clock(started: _started, limit: limit),
                ]),
              ),
              const SizedBox(width: 8),
              _Counter(
                  icon: Icons.check,
                  value: correct,
                  color: Colors.green.shade700),
              const SizedBox(width: 6),
              _Counter(
                  icon: Icons.close,
                  value: wrong,
                  color: theme.colorScheme.error),
              const Spacer(),
              if (widget.settings.voice)
                Icon(_voiceError != null ? Icons.mic_off : Icons.mic,
                    color: _voiceError != null
                        ? theme.colorScheme.error
                        : _listening
                            ? theme.colorScheme.primary
                            : theme.colorScheme.outline),
              IconButton(
                tooltip: TypewriterSounds.instance.muted
                    ? 'Включить звук машинки'
                    : 'Выключить звук машинки',
                icon: Icon(TypewriterSounds.instance.muted
                    ? Icons.volume_off
                    : Icons.volume_up),
                onPressed: () async {
                  await TypewriterSounds.instance
                      .setMuted(!TypewriterSounds.instance.muted);
                  if (mounted) setState(() {});
                },
              ),
              TextButton(
                  onPressed: limit > 0 ? widget.onQuit : _finish,
                  child: Text(limit > 0 ? 'Выйти' : 'Закончить')),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              transitionBuilder: (child, animation) => FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position:
                      Tween(begin: const Offset(0, -.08), end: Offset.zero)
                          .animate(animation),
                  child: child,
                ),
              ),
              child: Container(
                key: ValueKey(
                    '${_task.lemma}:${_task.label}:${_attempts.length}'),
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFBF6E8),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: const [
                    BoxShadow(
                        color: Color(0x1F000000),
                        blurRadius: 12,
                        offset: Offset(0, 4))
                  ],
                ),
                child: Column(children: [
                  Text.rich(
                    TextSpan(children: [
                      TextSpan(
                          text: _task.lemma,
                          style: const TextStyle(
                              fontFamily: 'CourierPrime',
                              fontWeight: FontWeight.w700,
                              fontSize: 30)),
                      TextSpan(
                          text: '  ${_task.translation}',
                          style: const TextStyle(
                              fontSize: 15, color: Color(0xFF5A4A3A))),
                    ]),
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFF1D1A17)),
                  ),
                  const SizedBox(height: 4),
                  Text.rich(
                    TextSpan(children: [
                      TextSpan(
                          text: _task.label,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF9E2B25),
                              fontSize: 16)),
                      TextSpan(
                          text: '  ${_task.labelSr}',
                          style: const TextStyle(
                              fontSize: 13, color: Color(0xFF5A4A3A))),
                    ]),
                    textAlign: TextAlign.center,
                  ),
                ]),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            child: Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 12,
              children: [
                if (widget.settings.voice && _voiceError == null)
                  Text(
                      _heard.isEmpty
                          ? 'Скажи форму вслух — или напечатай её.'
                          : 'Слышу: $_heard',
                      style: theme.textTheme.bodySmall),
                if (_voiceError != null)
                  Text(_voiceError!,
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.error)),
                TextButton(
                    onPressed: () => _submit(_typed),
                    child: const Text('Не знаю')),
                TextButton(
                  onPressed: () => _phoneFocus.requestFocus(),
                  child: const Text('Клавиатура телефона'),
                ),
              ],
            ),
          ),
          // Невидимое поле для экранной клавиатуры: ввод уходит на машинку.
          SizedBox(
            height: 1,
            child: Opacity(
              opacity: 0,
              child: TextField(
                controller: _phoneInput,
                focusNode: _phoneFocus,
                autocorrect: false,
                enableSuggestions: false,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) {
                  _handleKey('enter');
                  _phoneFocus.requestFocus();
                },
                onChanged: (value) {
                  if (value.isEmpty) {
                    _handleKey('backspace');
                  } else {
                    final added =
                        value.startsWith(' ') ? value.substring(1) : value;
                    for (final ch in textFromInput(added).split('')) {
                      if (ch.isNotEmpty) _handleKey(ch);
                    }
                  }
                  // Заглушка возвращается, чтобы следующему «стереть» было что стирать.
                  _phoneInput.value = const TextEditingValue(
                      text: ' ', selection: TextSelection.collapsed(offset: 1));
                },
              ),
            ),
          ),
          Expanded(
            child: TypewriterStage(
              lines: _lines,
              before: _task.before,
              typed: _typed,
              after: _task.after,
              strike: _strike,
              returning: _returning,
              onKey: (key) {
                unawaited(TypewriterSounds.instance.prepare());
                _handleKey(key);
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Часы партии: обратный отсчёт или прошедшее время. Тикают сами по себе.
class _Clock extends StatefulWidget {
  const _Clock({required this.started, required this.limit});
  final DateTime started;
  final int limit;

  @override
  State<_Clock> createState() => _ClockState();
}

class _ClockState extends State<_Clock> {
  late final Timer _timer =
      Timer.periodic(const Duration(milliseconds: 500), (_) {
    if (mounted) setState(() {});
  });

  @override
  void initState() {
    super.initState();
    _timer;
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final elapsed = DateTime.now().difference(widget.started).inSeconds;
    final seconds = widget.limit > 0
        ? (widget.limit - elapsed).clamp(0, widget.limit)
        : elapsed;
    return Text('${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}',
        style: const TextStyle(
            fontFamily: 'CourierPrime',
            fontWeight: FontWeight.w700,
            fontSize: 20,
            color: Color(0xFFF4EAD0)));
  }
}

class _Counter extends StatelessWidget {
  const _Counter(
      {required this.icon, required this.value, required this.color});
  final IconData icon;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
          color: color.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(10)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 4),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          transitionBuilder: (child, animation) =>
              ScaleTransition(scale: animation, child: child),
          child: Text('$value',
              key: ValueKey(value),
              style: TextStyle(color: color, fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }
}

class _Results extends StatefulWidget {
  const _Results({
    required this.settings,
    required this.attempts,
    required this.elapsed,
    required this.history,
    required this.service,
    required this.onAgain,
    required this.onSetup,
  });
  final _Settings settings;
  final List<Attempt> attempts;
  final int elapsed;
  final List<CaseGameRecord> history;
  final CaseGameService service;
  final VoidCallback onAgain, onSetup;

  @override
  State<_Results> createState() => _ResultsState();
}

class _ResultsState extends State<_Results> {
  late final GameSummary _summary = summarize(widget.attempts, widget.elapsed);
  late final CaseGameRecord? _previousBest = widget.history
      .where((r) =>
          r.scope == widget.settings.scopeKey &&
          r.limitSeconds == widget.settings.limit &&
          widget.settings.limit > 0)
      .fold<CaseGameRecord?>(
          null, (b, r) => b == null || r.correct > b.correct ? r : b);
  String _saved = '';

  @override
  void initState() {
    super.initState();
    unawaited(_save());
  }

  Future<void> _save() async {
    final auth = context.read<AuthService>();
    if (!auth.isSignedIn) {
      setState(() => _saved =
          'Войди в аккаунт, чтобы результаты сохранялись и продлевали серию.');
      return;
    }
    if (_summary.words == 0) return;
    setState(() => _saved = 'Сохраняю результат…');
    try {
      final study = await widget.service.save({
        'id': newUuid(),
        'scope': widget.settings.scopeKey,
        'limitSeconds': widget.settings.limit,
        'elapsedSeconds': widget.elapsed,
        'words': _summary.words,
        'correct': _summary.correct,
        'wrong': _summary.wrong,
        'diacriticSlips': _summary.diacriticSlips,
        'chars': _summary.chars,
        'cpm': _summary.cpm,
        'accuracy': _summary.accuracy,
        'weak': [for (final w in _summary.weak) w.toJson()],
      });
      if (study != null) {
        await StudyService.instance
            .accept(study, token: auth.api.token, userAction: true);
      }
      if (mounted) {
        setState(() => _saved = study != null
            ? 'Результат в профиле, серия продлена.'
            : 'Результат сохранён в профиле.');
      }
    } catch (_) {
      if (mounted) {
        setState(
            () => _saved = 'Результат не сохранился — нет связи с сервером.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = _summary;
    final best = _previousBest;
    final record = widget.settings.limit > 0 &&
        s.correct > 0 &&
        (best == null || s.correct > best.correct);
    final mistakes = widget.attempts
        .where((a) => a.verdict.result == VerdictKind.wrong)
        .toList()
        .reversed
        .take(12)
        .toList();
    Widget stat(String value, String label, int index) =>
        TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: Duration(milliseconds: 380 + index * 90),
          curve: Curves.easeOutBack,
          builder: (_, t, child) => Opacity(
              opacity: t.clamp(0, 1),
              child: Transform.scale(scale: .8 + .2 * t, child: child)),
          child: Column(children: [
            Text(value,
                style: const TextStyle(
                    fontFamily: 'CourierPrime',
                    fontWeight: FontWeight.w700,
                    fontSize: 30)),
            Text(label, style: theme.textTheme.bodySmall),
          ]),
        );
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
              color: const Color(0xFF1D1A17),
              borderRadius: BorderRadius.circular(20)),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('PROTOKOL',
                style: TextStyle(
                    color: Color(0xFFD9B25F),
                    letterSpacing: 0,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(s.correct > 0 ? 'Падежи уничтожены!' : 'Падежи устояли',
                style: const TextStyle(
                    fontFamily: 'CourierPrime',
                    fontWeight: FontWeight.w700,
                    fontSize: 26,
                    color: Color(0xFFF4EAD0))),
            Text(
                '${scopeTitle(widget.settings.scope)}, ${widget.elapsed ~/ 60}:${(widget.elapsed % 60).toString().padLeft(2, '0')}',
                style: const TextStyle(color: Color(0xBFF4EAD0))),
            if (record)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Row(children: [
                  Icon(Icons.emoji_events, color: Color(0xFFD9B25F), size: 18),
                  SizedBox(width: 6),
                  Text('Новый рекорд',
                      style: TextStyle(
                          color: Color(0xFFD9B25F),
                          fontWeight: FontWeight.w700)),
                ]),
              ),
          ]),
        ),
        const SizedBox(height: 16),
        Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
          stat('${s.correct}', 'верно', 0),
          stat('${s.wrong}', 'ошибок', 1),
          stat('${s.accuracy}%', 'точность', 2),
          stat('${s.wpm}', 'слов/мин', 3),
        ]),
        const SizedBox(height: 12),
        Text('${s.cpm} знаков в минуту, без чёрточек: ${s.diacriticSlips}',
            textAlign: TextAlign.center),
        if (s.weak.isNotEmpty) ...[
          const SizedBox(height: 20),
          Text('Где падежи пока сильнее', style: theme.textTheme.titleMedium),
          for (final w in s.weak)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(child: Text(w.label)),
                      Text('${w.wrong} из ${w.total}')
                    ]),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: TweenAnimationBuilder<double>(
                        tween: Tween(begin: 0, end: w.wrong / w.total),
                        duration: const Duration(milliseconds: 700),
                        curve: Curves.easeOutCubic,
                        builder: (_, v, __) =>
                            LinearProgressIndicator(value: v, minHeight: 8),
                      ),
                    ),
                  ]),
            ),
        ],
        if (mistakes.isNotEmpty) ...[
          const SizedBox(height: 20),
          Text('Ошибки', style: theme.textTheme.titleMedium),
          for (final m in mistakes)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text.rich(
                  TextSpan(children: [
                    TextSpan(text: '${m.task.before} '),
                    TextSpan(
                        text: m.typed.isEmpty ? '…' : m.typed,
                        style: const TextStyle(
                            decoration: TextDecoration.lineThrough)),
                    const TextSpan(text: ' '),
                    TextSpan(
                        text: m.verdict.matched,
                        style: TextStyle(
                            color: theme.colorScheme.primary,
                            fontWeight: FontWeight.w700)),
                  ]),
                  style: const TextStyle(fontFamily: 'CourierPrime')),
              subtitle: Text('${m.task.lemma}, ${m.task.label}'),
            ),
        ],
        const SizedBox(height: 16),
        if (_saved.isNotEmpty) Text(_saved, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        FilledButton.icon(
            onPressed: widget.onAgain,
            icon: const Icon(Icons.replay),
            label: const Text('Ещё раз')),
        const SizedBox(height: 8),
        OutlinedButton(
            onPressed: widget.onSetup, child: const Text('Другой режим')),
      ],
    );
  }
}
