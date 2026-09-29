import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../models/local_audio_file.dart';
import '../services/audio_file_storage.dart';
import '../services/user_db.dart';
import '../utils/tokenizer.dart';
import '../widgets/keep_awake.dart';
import 'book_reader_screen.dart' show WordAnalysisSheet;

class AudioFilePlayerScreen extends StatefulWidget {
  const AudioFilePlayerScreen({super.key, required this.audioId});

  final String audioId;

  @override
  State<AudioFilePlayerScreen> createState() => _AudioFilePlayerScreenState();
}

class _AudioFilePlayerScreenState extends State<AudioFilePlayerScreen> {
  final AudioPlayer _player = AudioPlayer();
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  LocalAudioFile? _file;
  String? _error;
  bool _playing = false;
  bool _started = false;
  double _position = 0;
  int _segment = -1;
  int? _vocabularyBookId;
  List<GlobalKey> _segmentKeys = const [];

  @override
  void initState() {
    super.initState();
    _subscriptions.add(_player.onPositionChanged.listen(_onPosition));
    _subscriptions.add(_player.onPlayerStateChanged.listen((state) {
      if (mounted) setState(() => _playing = state == PlayerState.playing);
    }));
    _load();
    UserDb.instance.ensureBook('🔊 Звуковые файлы').then((id) {
      if (mounted) _vocabularyBookId = id;
    });
  }

  Future<void> _load() async {
    try {
      final file = await UserDb.instance.getAudioFile(widget.audioId);
      if (file == null || file.transcript == null) {
        throw StateError('Расшифровка не найдена на этом устройстве.');
      }
      if (!await storedAudioExists(file.storedPath)) {
        throw StateError(
            'Исходный аудиофайл больше недоступен на этом устройстве.');
      }
      if (!mounted) return;
      setState(() {
        _file = file;
        _segmentKeys =
            List.generate(file.transcript!.segments.length, (_) => GlobalKey());
      });
    } catch (error) {
      if (mounted) {
        setState(
            () => _error = error.toString().replaceFirst('Bad state: ', ''));
      }
    }
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      subscription.cancel();
    }
    _player.dispose();
    super.dispose();
  }

  void _onPosition(Duration position) {
    if (!mounted || _file?.transcript == null) return;
    final seconds = position.inMilliseconds / 1000;
    final segments = _file!.transcript!.segments;
    var current = _segment;
    for (var i = 0; i < segments.length; i++) {
      if (seconds >= segments[i].start && seconds < segments[i].end) {
        current = i;
        break;
      }
    }
    final changed = current != _segment;
    setState(() {
      _position = seconds;
      _segment = current;
    });
    if (changed && current >= 0) _scrollTo(current);
  }

  void _scrollTo(int index) {
    if (index < 0 || index >= _segmentKeys.length) return;
    final target = _segmentKeys[index].currentContext;
    if (target == null) return;
    Scrollable.ensureVisible(
      target,
      duration: const Duration(milliseconds: 320),
      alignment: .18,
    );
  }

  Future<void> _start() async {
    final file = _file;
    if (file == null) return;
    if (!_started) {
      await _player.play(DeviceFileSource(file.storedPath));
      _started = true;
    } else {
      await _player.resume();
    }
  }

  Future<void> _toggle() async {
    try {
      if (_playing) {
        await _player.pause();
      } else {
        await _start();
      }
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось включить запись: $error')));
    }
  }

  Future<void> _seek(double seconds, {bool play = true}) async {
    final duration = Duration(milliseconds: (seconds * 1000).round());
    try {
      if (!_started) {
        await _start();
      }
      await _player.seek(duration);
      if (play) await _player.resume();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Не удалось перейти к таймкоду: $error')));
      }
    }
  }

  Future<void> _openWord(AudioTranscriptSegment segment, Token token,
      AudioTranscriptWord word) async {
    await _seek((word.start - .06).clamp(0, double.infinity));
    if (!mounted || _vocabularyBookId == null) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => WordAnalysisSheet(
        bookId: _vocabularyBookId!,
        sentence: segment.text,
        token: token,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final file = _file;
    final transcript = file?.transcript;
    final scheme = Theme.of(context).colorScheme;
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Звуковой файл')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Text(_error!, textAlign: TextAlign.center),
          ),
        ),
      );
    }
    if (file == null || transcript == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return KeepAwake(
      child: Scaffold(
        appBar: AppBar(
          title: Text(file.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
        body: Column(children: [
          _playerPanel(file, scheme),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              itemCount: transcript.segments.length,
              itemBuilder: (context, index) {
                final segment = transcript.segments[index];
                final speakerIndex =
                    transcript.speakers.indexOf(segment.speaker);
                return Padding(
                  key: _segmentKeys[index],
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _TranscriptSegmentCard(
                    segment: segment,
                    speaker:
                        'Говорящий ${speakerIndex < 0 ? 1 : speakerIndex + 1}',
                    currentTime: _position,
                    onSeek: () => _seek(segment.start),
                    onWord: (token, word) => _openWord(segment, token, word),
                  ),
                );
              },
            ),
          ),
        ]),
      ),
    );
  }

  Widget _playerPanel(LocalAudioFile file, ColorScheme scheme) {
    final max = file.duration <= 0 ? 1.0 : file.duration;
    final value = _position.clamp(0.0, max);
    return Material(
      color: scheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 13),
        child: Column(children: [
          Row(children: [
            FilledButton.tonalIcon(
              onPressed: _toggle,
              icon: Icon(
                  _playing ? Icons.pause_rounded : Icons.play_arrow_rounded),
              label: Text(_playing ? 'Пауза' : 'Слушать'),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Semantics(
                label: 'Позиция воспроизведения',
                child: Slider(
                  value: value,
                  max: max,
                  onChanged: (next) => setState(() => _position = next),
                  onChangeEnd: (next) => _seek(next),
                ),
              ),
            ),
            Text('${_time(_position)} / ${_time(file.duration)}',
                style: const TextStyle(fontSize: 12, fontFeatures: [])),
          ]),
          Row(children: [
            Icon(Icons.record_voice_over_rounded,
                size: 17, color: scheme.primary),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                '${file.speakerCount} ${file.speakerCount == 1 ? 'говорящий' : 'говорящих'}. Нажми слово, чтобы услышать его и открыть разбор.',
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ),
          ]),
        ]),
      ),
    );
  }

  String _time(double seconds) {
    final safe = seconds.isFinite ? seconds.floor().clamp(0, 864000) : 0;
    return '${safe ~/ 60}:${(safe % 60).toString().padLeft(2, '0')}';
  }
}

class _TranscriptSegmentCard extends StatefulWidget {
  const _TranscriptSegmentCard({
    required this.segment,
    required this.speaker,
    required this.currentTime,
    required this.onSeek,
    required this.onWord,
  });

  final AudioTranscriptSegment segment;
  final String speaker;
  final double currentTime;
  final VoidCallback onSeek;
  final void Function(Token token, AudioTranscriptWord word) onWord;

  @override
  State<_TranscriptSegmentCard> createState() => _TranscriptSegmentCardState();
}

class _TranscriptSegmentCardState extends State<_TranscriptSegmentCard> {
  late List<Token> _tokens;
  late List<AudioTranscriptWord?> _words;
  final Map<int, TapGestureRecognizer> _recognizers = {};

  @override
  void initState() {
    super.initState();
    _prepare();
  }

  void _prepare() {
    _tokens = SerbianTokenizer.tokenize(widget.segment.text);
    var wordIndex = 0;
    _words = List.generate(_tokens.length, (index) {
      if (!_tokens[index].isWord || wordIndex >= widget.segment.words.length) {
        return null;
      }
      return widget.segment.words[wordIndex++];
    });
    for (var i = 0; i < _tokens.length; i++) {
      final word = _words[i];
      if (word == null) continue;
      _recognizers[i] = TapGestureRecognizer()
        ..onTap = () => widget.onWord(_tokens[i], word);
    }
  }

  @override
  void dispose() {
    for (final recognizer in _recognizers.values) {
      recognizer.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final active = widget.currentTime >= widget.segment.start &&
        widget.currentTime < widget.segment.end;
    final spans = <InlineSpan>[];
    for (var i = 0; i < _tokens.length; i++) {
      final token = _tokens[i];
      final word = _words[i];
      final sounding = word != null &&
          widget.currentTime >= word.start &&
          widget.currentTime < word.end;
      spans.add(TextSpan(
        text: token.text,
        recognizer: _recognizers[i],
        style: TextStyle(
          color: sounding ? scheme.onPrimary : scheme.onSurface,
          backgroundColor: sounding ? scheme.primary : null,
          fontWeight: sounding ? FontWeight.w700 : FontWeight.w400,
        ),
      ));
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: active
            ? scheme.primaryContainer.withValues(alpha: .34)
            : scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: active
              ? scheme.primary.withValues(alpha: .35)
              : scheme.outlineVariant,
        ),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
          width: 92,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(widget.speaker,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: scheme.primary)),
            TextButton(
              onPressed: widget.onSeek,
              style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 32),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap),
              child: Text(_time(widget.segment.start)),
            ),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text.rich(
            TextSpan(children: spans),
            style: const TextStyle(
                fontFamily: 'NotoSerif', fontSize: 18, height: 1.55),
          ),
        ),
      ]),
    );
  }

  String _time(double seconds) {
    final safe = seconds.floor().clamp(0, 864000);
    return '${safe ~/ 60}:${(safe % 60).toString().padLeft(2, '0')}';
  }
}
