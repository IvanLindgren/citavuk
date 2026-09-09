import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:desktop_webview_window/desktop_webview_window.dart';
import '../models/micro_feed.dart';
import '../services/micro_feed_service.dart';
import '../services/study_service.dart';

class LinuxVideoPlayer extends StatefulWidget {
  const LinuxVideoPlayer({super.key, required this.item, required this.active});
  final MicroFeedItem item;
  final bool active;
  @override
  State<LinuxVideoPlayer> createState() => _LinuxVideoPlayerState();
}

class _LinuxVideoPlayerState extends State<LinuxVideoPlayer> {
  Webview? _window;
  bool _opening = false;
  String? _error;
  final _playing = Stopwatch();
  final _epoch = StudyService.instance.accountEpoch;
  void _close() {
    _playing.stop();
    final window = _window;
    _window = null;
    window?.close();
  }

  @override
  void didUpdateWidget(covariant LinuxVideoPlayer old) {
    super.didUpdateWidget(old);
    if (!widget.active) _close();
  }

  @override
  void dispose() {
    _close();
    if (_epoch == StudyService.instance.accountEpoch &&
        _playing.elapsedMilliseconds > 0) {
      final ms = _playing.elapsedMilliseconds.clamp(0, 3600000);
      unawaited(MicroFeedService.instance
          .record(widget.item.id, ms < 2000 ? 'quick_skip' : 'view',
              dwellMs: ms)
          .catchError((Object _) {}));
    }
    super.dispose();
  }

  Future<void> _open() async {
    if (_opening) return;
    if (_window != null) {
      await _window!.bringToForeground();
      return;
    }
    setState(() {
      _opening = true;
      _error = null;
    });
    try {
      final window = await WebviewWindow.create(
          configuration: CreateConfiguration(
              windowWidth: 540,
              windowHeight: 820,
              title: widget.item.titleLatin));
      if (!mounted || !widget.active) {
        window.close();
        return;
      }
      _window = window;
      // Плеер может навигировать вложенные фреймы YouTube. Этот API не
      // различает главный фрейм и вложенный, поэтому не обрываем их загрузку.
      // Секретов/заголовков авторизации в окно не передаём.
      window.registerJavaScriptMessageHandler('citavukVideo', (name, body) {
        try {
          final event = body is String ? jsonDecode(body) : body;
          if (event is! Map ||
              event['id'] != widget.item.videoId ||
              !mounted ||
              !widget.active) {
            return;
          }
          if (event['state'] == 1) {
            _playing.start();
          } else {
            _playing.stop();
          }
        } catch (_) {/* Неизвестное сообщение не влияет на приложение. */}
      });
      unawaited(window.onClose.then((_) {
        _playing.stop();
        if (identical(_window, window)) _window = null;
      }));
      window.launch(
          'https://citavuk.ru/video-player.html?v=${Uri.encodeComponent(widget.item.videoId)}');
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Не удалось открыть плеер. Можно открыть оригинал на YouTube.');
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.play_circle_outline, size: 72),
        const SizedBox(height: 20),
        FilledButton(
            onPressed: widget.active && !_opening ? _open : null,
            child: Text(_opening ? 'Открываем…' : 'Смотреть видео')),
        const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Видео откроется в отдельном окне Читавука.',
                textAlign: TextAlign.center)),
        if (_error != null) Text(_error!, textAlign: TextAlign.center),
      ]));
}
