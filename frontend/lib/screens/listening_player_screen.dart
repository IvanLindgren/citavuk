import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import '../models/audio_lesson.dart';
import '../services/listening_service.dart';
import '../services/user_db.dart';
import '../utils/tokenizer.dart';
import '../widgets/eagle_mascot.dart';
import 'book_reader_screen.dart' show WordAnalysisSheet;

/// Караоке-плеер аудирования (бета): текст подсвечивается по мере звучания,
/// «трудные на слух» слова — красным, каждое слово можно разобрать и добавить
/// в словарь. Скорость: 0.5x / 1x / 1.5x / 2x.
class ListeningPlayerScreen extends StatefulWidget {
  final AudioLesson lesson;
  const ListeningPlayerScreen({super.key, required this.lesson});

  @override
  State<ListeningPlayerScreen> createState() => _ListeningPlayerScreenState();
}

class _ListeningPlayerScreenState extends State<ListeningPlayerScreen> {
  final AudioPlayer _player = AudioPlayer();
  final List<StreamSubscription> _subs = [];

  // Реплики живут в состоянии: для эпизодов подкаста с transcript_url они
  // лениво заменяются полным транскриптом с сайта.
  late List<AudioCue> _cues;
  late List<List<Token>> _cueTokens;
  late List<List<bool>> _hardFlags;
  late List<GlobalKey> _cueKeys;
  bool _loadingTranscript = false;

  int _cue = 0;
  int _activeChar = -1; // позиция «звучащего» символа внутри текущей реплики
  bool _playing = false;
  bool _started = false; // потоковый режим: play() уже вызывался
  bool _finished = false;
  double _speed = 1.0;
  Duration _cueDuration = Duration.zero;
  int? _bookId; // приёмник сохранённых слов («🎧 Аудирование»)

  AudioLesson get lesson => widget.lesson;

  void _setCues(List<AudioCue> cues) {
    _cues = cues;
    _cueTokens = cues.map((c) => SerbianTokenizer.tokenize(c.text)).toList();
    _hardFlags = _cueTokens
        .map((tokens) => tokens
            .map((t) =>
                t.isWord && ListeningService.instance.isHardToHear(t.text))
            .toList())
        .toList();
    _cueKeys = List.generate(cues.length, (_) => GlobalKey());
  }

  @override
  void initState() {
    super.initState();
    _setCues(lesson.cues);

    // Полный транскрипт эпизода — лениво, вместо реплик из описания.
    if (lesson.transcriptUrl != null) {
      _loadingTranscript = true;
      ListeningService.instance
          .fetchTranscriptCues(lesson.transcriptUrl!, lesson.durationSec)
          .then((cues) {
        if (!mounted) return;
        setState(() {
          _loadingTranscript = false;
          if (cues.length > _cues.length) {
            _setCues(cues);
            _cue = 0;
            _activeChar = -1;
          }
        });
      });
    }

    UserDb.instance.ensureBook('🎧 Аудирование').then((id) {
      if (mounted) _bookId = id;
    });

    _subs.add(_player.onDurationChanged.listen((d) => _cueDuration = d));
    _subs.add(_player.onPositionChanged.listen(_onPosition));
    _subs.add(_player.onPlayerComplete.listen((_) => _onComplete()));
    _subs.add(_player.onPlayerStateChanged.listen((s) {
      if (!mounted) return;
      setState(() => _playing = s == PlayerState.playing);
    }));
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _player.dispose();
    super.dispose();
  }

  // --- Синхронизация подсветки ---

  void _onPosition(Duration pos) {
    if (!mounted) return;
    if (lesson.isTts) {
      // Реплика = отдельный файл: позицию слова оцениваем пропорционально
      // символам (TTS читает с почти постоянной скоростью).
      final ms = _cueDuration.inMilliseconds;
      if (ms <= 0) return;
      final text = _cues[_cue].text;
      final char = (pos.inMilliseconds / ms * text.length).round();
      if (char != _activeChar) setState(() => _activeChar = char);
    } else {
      // Поток: ищем реплику по таймингам, внутри неё — пропорционально.
      final sec = pos.inMilliseconds / 1000.0;
      var idx = _cue;
      for (var i = 0; i < _cues.length; i++) {
        final c = _cues[i];
        if (c.start != null &&
            sec >= c.start! &&
            (c.end == null || sec < c.end!)) {
          idx = i;
          break;
        }
      }
      final c = _cues[idx];
      var char = -1;
      if (c.start != null && c.end != null && c.end! > c.start!) {
        char = ((sec - c.start!) / (c.end! - c.start!) * c.text.length).round();
      }
      if (idx != _cue) {
        setState(() {
          _cue = idx;
          _activeChar = char;
        });
        _scrollToCue(idx);
      } else if (char != _activeChar) {
        setState(() => _activeChar = char);
      }
    }
  }

  void _onComplete() {
    if (!mounted) return;
    if (lesson.isTts && _cue + 1 < _cues.length) {
      _playCue(_cue + 1);
    } else {
      setState(() {
        _finished = true;
        _playing = false;
        _activeChar = -1;
      });
    }
  }

  void _scrollToCue(int i) {
    if (i < 0 || i >= _cueKeys.length) return;
    final ctx = _cueKeys[i].currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 350),
        alignment: 0.25,
      );
    }
  }

  // --- Управление воспроизведением ---

  Future<void> _applySpeed() async {
    try {
      await _player.setPlaybackRate(_speed);
    } catch (_) {
      // на части платформ смена скорости не поддерживается — не падаем
    }
  }

  Future<void> _playCue(int i) async {
    setState(() {
      _cue = i;
      _activeChar = -1;
      _finished = false;
      _cueDuration = Duration.zero;
    });
    _scrollToCue(i);
    try {
      if (lesson.isTts) {
        await _player.stop();
        await _player
            .play(UrlSource(ListeningService.instance.ttsUrl(_cues[i].text)));
      } else {
        if (!_started) {
          await _player.play(UrlSource(
              ListeningService.instance.playableAudioUrl(lesson.audioUrl!)));
          _started = true;
        }
        final start = _cues[i].start;
        if (start != null) {
          await _player.seek(Duration(milliseconds: (start * 1000).round()));
          await _player.resume();
        }
      }
      await _applySpeed();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось включить аудио: $e')),
      );
    }
  }

  Future<void> _togglePlay() async {
    if (_playing) {
      await _player.pause();
    } else if (_finished) {
      await _playCue(0);
    } else if (lesson.isTts && !_started) {
      _started = true;
      await _playCue(_cue);
    } else if (!lesson.isTts && !_started) {
      await _playCue(_cue);
    } else {
      await _player.resume();
      await _applySpeed();
    }
  }

  Future<void> _setSpeed(double v) async {
    setState(() => _speed = v);
    await _applySpeed();
  }

  // --- Разбор слова ---

  Future<void> _onTapWord(int cueIndex, Token token) async {
    await _player.pause();
    if (!mounted || _bookId == null) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => WordAnalysisSheet(
        bookId: _bookId!,
        sentence: _cues[cueIndex].text,
        token: token,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Expanded(
              child: Text(lesson.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w600)),
            ),
            _betaChip(scheme),
          ],
        ),
      ),
      body: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(14, 10, 14, 4),
            child: EagleBubble(
              asset: Eagle.slusa,
              title: 'Слухао слушает с тобой',
              text: 'Следи за подсветкой. Красные слова — их труднее всего '
                  'поймать на слух. Тапни любое слово — разберём и добавим '
                  'в словарь.',
              eagleSize: 92,
            ),
          ),
          if (_loadingTranscript)
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 4, 18, 8),
              child: Row(
                children: [
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: scheme.primary,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Загружаю полный транскрипт эпизода…',
                      style: TextStyle(
                        fontSize: 12.5,
                        color: scheme.onSurface.withValues(alpha: 0.65),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
              itemCount: _cues.length,
              itemBuilder: (context, i) => Padding(
                key: _cueKeys[i],
                padding: const EdgeInsets.only(bottom: 14),
                child: _KaraokeCue(
                  tokens: _cueTokens[i],
                  hardFlags: _hardFlags[i],
                  isCurrent: i == _cue,
                  activeChar: i == _cue ? _activeChar : -1,
                  onTapWord: (t) => _onTapWord(i, t),
                  onTapCue: () => _playCue(i),
                ),
              ),
            ),
          ),
          _controls(scheme),
        ],
      ),
    );
  }

  Widget _betaChip(ColorScheme scheme) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: scheme.tertiary.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: scheme.tertiary.withValues(alpha: 0.5)),
        ),
        child: Text('БЕТА',
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.5,
                color: scheme.tertiary)),
      );

  Widget _controls(ColorScheme scheme) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
        border: Border(
            top: BorderSide(color: scheme.onSurface.withValues(alpha: 0.08))),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton.filledTonal(
                  tooltip: 'Предыдущая фраза',
                  onPressed: _cue > 0 ? () => _playCue(_cue - 1) : null,
                  icon: const Icon(Icons.skip_previous),
                ),
                const SizedBox(width: 10),
                IconButton.filled(
                  tooltip: _playing ? 'Пауза' : 'Слушать',
                  iconSize: 34,
                  onPressed: _togglePlay,
                  icon: Icon(_playing ? Icons.pause : Icons.play_arrow),
                ),
                const SizedBox(width: 10),
                IconButton.filledTonal(
                  tooltip: 'Следующая фраза',
                  onPressed:
                      _cue + 1 < _cues.length ? () => _playCue(_cue + 1) : null,
                  icon: const Icon(Icons.skip_next),
                ),
                const SizedBox(width: 16),
                Text('${_cue + 1} / ${_cues.length}',
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: scheme.onSurface.withValues(alpha: 0.7))),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final v in const [0.5, 1.0, 1.5, 2.0])
                  ChoiceChip(
                    label: Text(v == 1.0 ? '1x' : '${v}x'),
                    selected: _speed == v,
                    visualDensity: VisualDensity.compact,
                    onSelected: (_) => _setSpeed(v),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Одна реплика с караоке-подсветкой: текущее слово — заливкой, «трудные на
/// слух» — красным; каждое слово тапается (разбор + в словарь).
class _KaraokeCue extends StatefulWidget {
  final List<Token> tokens;
  final List<bool> hardFlags;
  final bool isCurrent;
  final int activeChar; // -1 — ничего не звучит
  final void Function(Token token) onTapWord;
  final VoidCallback onTapCue;

  const _KaraokeCue({
    required this.tokens,
    required this.hardFlags,
    required this.isCurrent,
    required this.activeChar,
    required this.onTapWord,
    required this.onTapCue,
  });

  @override
  State<_KaraokeCue> createState() => _KaraokeCueState();
}

class _KaraokeCueState extends State<_KaraokeCue> {
  final Map<int, TapGestureRecognizer> _recognizers = {};

  @override
  void initState() {
    super.initState();
    for (var i = 0; i < widget.tokens.length; i++) {
      if (widget.tokens[i].isWord) {
        final t = widget.tokens[i];
        _recognizers[i] = TapGestureRecognizer()
          ..onTap = () => widget.onTapWord(t);
      }
    }
  }

  @override
  void dispose() {
    for (final r in _recognizers.values) {
      r.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dim = widget.isCurrent ? 1.0 : 0.55;
    final base = TextStyle(
      fontSize: 18,
      height: 1.55,
      fontFamily: 'NotoSerif',
      color: scheme.onSurface.withValues(alpha: dim),
    );
    final hardColor = scheme.error.withValues(alpha: dim);

    final spans = <InlineSpan>[];
    for (var i = 0; i < widget.tokens.length; i++) {
      final t = widget.tokens[i];
      // «Звучащий» токен: текущая позиция символа попала в его диапазон.
      final active = widget.isCurrent &&
          widget.activeChar >= t.start &&
          widget.activeChar < t.end &&
          t.isWord;
      final hard = widget.hardFlags[i];

      var style = base;
      if (hard) {
        style = style.copyWith(color: hardColor, fontWeight: FontWeight.w600);
      }
      if (active) {
        style = style.copyWith(
          color: scheme.onPrimary,
          backgroundColor: scheme.primary,
          fontWeight: FontWeight.w700,
        );
      }
      spans.add(TextSpan(
        text: t.text,
        style: style,
        recognizer: t.isWord ? _recognizers[i] : null,
      ));
    }

    return GestureDetector(
      // Тап по пустому месту реплики — слушать с неё.
      onTap: widget.onTapCue,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color:
              widget.isCurrent ? scheme.primary.withValues(alpha: 0.06) : null,
          borderRadius: BorderRadius.circular(10),
          border: widget.isCurrent
              ? Border.all(color: scheme.primary.withValues(alpha: 0.25))
              : null,
        ),
        child: Text.rich(TextSpan(children: spans)),
      ),
    );
  }
}
