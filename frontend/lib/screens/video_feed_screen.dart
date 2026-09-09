import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import '../widgets/linux_video_player.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/micro_feed.dart';
import '../services/micro_feed_service.dart';
import '../services/api_client.dart';
import '../services/study_service.dart';

class VideoFeedScreen extends StatefulWidget {
  const VideoFeedScreen({super.key, required this.active});
  final bool active;
  @override
  State<VideoFeedScreen> createState() => _VideoFeedScreenState();
}

class _VideoFeedScreenState extends State<VideoFeedScreen> {
  int _epoch = StudyService.instance.accountEpoch;
  int _request = 0;
  final _items = <MicroFeedItem>[];
  bool _loading = false;
  int _index = 0;
  String? _error;
  @override
  void initState() {
    super.initState();
    StudyService.instance.addListener(_accountChanged);
    unawaited(_load());
  }

  Future<void> _load() async {
    if (_loading) return;
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await MicroFeedService.instance
          .load(video: true, exclude: _items.map((v) => v.id).toList());
      if (mounted && request == _request) {
        setState(() => _items.addAll(page.items.where((v) =>
            v.videoId.isNotEmpty && !_items.any((old) => old.id == v.id))));
      }
    } catch (e) {
      if (mounted && request == _request) {
        setState(() =>
            _error = e is ApiException ? e.message : 'Видео не загрузились.');
      }
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  void _accountChanged() {
    if (_epoch == StudyService.instance.accountEpoch) return;
    _epoch = StudyService.instance.accountEpoch;
    _request++;
    setState(() { _items.clear(); _index=0; _loading=false; });
    unawaited(_load());
  }

  @override
  void dispose() {
    _request++;
    StudyService.instance.removeListener(_accountChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final item = _items.isEmpty ? null : _items[_index];
    return Column(children: [
      if (_error != null)
        Padding(
            padding: const EdgeInsets.all(12),
            child: Text(_error!, style: const TextStyle(color: Colors.white))),
      Expanded(
          child: item == null
              ? Center(
                  child: _loading
                      ? const CircularProgressIndicator()
                      : const Padding(
                          padding: EdgeInsets.all(24),
                          child: Text(
                              'Пока нет новых опубликованных видео. Ролики появятся после проверки сербской речи.',
                              textAlign: TextAlign.center)))
              : _VideoCard(
                  key: ValueKey(item.id), item: item, active: widget.active)),
      SafeArea(
          top: false,
          child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    OutlinedButton(
                        onPressed:
                            _index > 0 ? () => setState(() => _index--) : null,
                        child: const Text('Предыдущее')),
                    FilledButton(
                        onPressed: _loading
                            ? null
                            : () {
                                if (_index + 1 < _items.length) {
                                  setState(() => _index++);
                                  if (_index + 3 >= _items.length) {
                                    unawaited(_load());
                                  }
                                } else {
                                  unawaited(_load());
                                }
                              },
                        child: Text(_index + 1 < _items.length
                            ? 'Следующее'
                            : 'Найти ещё'))
                  ]))),
    ]);
  }
}

class _VideoCard extends StatefulWidget {
  const _VideoCard({super.key, required this.item, required this.active});
  final MicroFeedItem item;
  final bool active;
  @override
  State<_VideoCard> createState() => _VideoCardState();
}

class _VideoCardState extends State<_VideoCard> with WidgetsBindingObserver {
  final _epoch = StudyService.instance.accountEpoch;
  final _playing = Stopwatch();
  bool _foreground = true, _busy = false;
  late int _reaction = widget.item.reaction;
  String? _error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didUpdateWidget(covariant _VideoCard old) {
    super.didUpdateWidget(old);
    if (!widget.active) _playing.stop();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!mounted) return;
    setState(() => _foreground = state == AppLifecycleState.resumed);
    if (!_foreground) _playing.stop();
  }

  @override
  void dispose() {
    _playing.stop();
    WidgetsBinding.instance.removeObserver(this);
    if (_playing.elapsedMilliseconds > 0 && _epoch == StudyService.instance.accountEpoch) {
      unawaited(MicroFeedService.instance
          .record(widget.item.id,
              _playing.elapsedMilliseconds < 2000 ? 'quick_skip' : 'view',
              dwellMs: _playing.elapsedMilliseconds.clamp(0, 3600000))
          .catchError((Object _) {}));
    }
    super.dispose();
  }

  Future<void> _react(int value) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final next = _reaction == value ? 0 : value;
      await MicroFeedService.instance.record(
          widget.item.id,
          next == 0
              ? 'reaction_cleared'
              : next == 1
                  ? 'like'
                  : 'dislike');
      if (mounted) setState(() => _reaction = next);
    } catch (_) {
      if (mounted) setState(() => _error = 'Не удалось сохранить реакцию.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(children: [
                  Text(item.titleLatin,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  Text(
                      '${item.sourceTitle} · ${item.cefr} · ${item.videoDuration} сек.'),
                  const SizedBox(height: 12),
                  Expanded(
                      child: !kIsWeb && defaultTargetPlatform == TargetPlatform.linux
                          ? LinuxVideoPlayer(item: item, active: widget.active)
                          : widget.active && _foreground
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(18),
                              child: InAppWebView(
                                initialUrlRequest: URLRequest(
                                    url: WebUri(
                                        'https://citavuk.ru/video-player.html?v=${Uri.encodeComponent(item.videoId)}')),
                                initialSettings: InAppWebViewSettings(
                                    javaScriptEnabled: true,
                                    allowsInlineMediaPlayback: true,
                                    mediaPlaybackRequiresUserGesture: true,
                                    useShouldOverrideUrlLoading: true,
                                    javaScriptHandlersForMainFrameOnly: true,
                                    javaScriptHandlersOriginAllowList: {
                                      'https://citavuk.ru'
                                    },
                                    supportMultipleWindows: false),
                                onWebViewCreated: (controller) {
                                  controller.addJavaScriptHandler(
                                      handlerName: 'citavukVideo',
                                      callback: (JavaScriptHandlerFunctionData value) {
                                        if (!value.isMainFrame ||
                                            value.origin.toString() != 'https://citavuk.ru' ||
                                            value.requestUrl.path != '/video-player.html') {
                                          return null;
                                        }
                                        final args = value.args;
                                        if (args.isEmpty || args.first is! Map) {
                                          return null;
                                        }
                                        final event = args.first as Map;
                                        if (event['id'] != item.videoId ||
                                            !mounted) {
                                          return null;
                                        }
                                        if (event['state'] == 1 &&
                                            widget.active &&
                                            _foreground) {
                                          _playing.start();
                                        } else {
                                          _playing.stop();
                                        }
                                        if (event['state'] == -2) {
                                          setState(() => _error =
                                              'Видео недоступно. Можно перейти к следующему.');
                                        }
                                        return null;
                                      });
                                },
                                shouldOverrideUrlLoading:
                                    (controller, action) async {
                                  if (action.isForMainFrame != true) {
                                    return NavigationActionPolicy.ALLOW;
                                  }
                                  final uri = action.request.url;
                                  if (uri == null) {
                                    return NavigationActionPolicy.CANCEL;
                                  }
                                  if (uri.scheme == 'https' &&
                                      uri.host == 'citavuk.ru' &&
                                      uri.path == '/video-player.html') {
                                    return NavigationActionPolicy.ALLOW;
                                  }
                                  if (uri.scheme == 'https' &&
                                      (uri.host == 'www.youtube.com' ||
                                          uri.host == 'youtube.com' ||
                                          uri.host == 'youtu.be')) {
                                    unawaited(launchUrl(
                                        Uri.parse(uri.toString()),
                                        mode: LaunchMode.externalApplication));
                                  }
                                  return NavigationActionPolicy.CANCEL;
                                },
                                onReceivedError: (controller, request, error) {
                                  if (request.isForMainFrame == true && mounted) {
                                    setState(() => _error =
                                        'Не удалось открыть плеер. Проверь подключение.');
                                  }
                                },
                                onPermissionRequest: (controller,
                                        request) async =>
                                    PermissionResponse(
                                        resources: request.resources,
                                        action: PermissionResponseAction.DENY),
                              ))
                          : const SizedBox.shrink()),
                  if (_error != null) Text(_error!),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, children: [
                    TextButton(
                        onPressed: _busy ? null : () => _react(1),
                        child: Text(_reaction == 1
                            ? '✓ Больше такого'
                            : 'Больше такого')),
                    TextButton(
                        onPressed: _busy ? null : () => _react(-1),
                        child: const Text('Меньше такого')),
                    IconButton(
                        tooltip: 'Открыть на YouTube',
                        onPressed: () => launchUrl(Uri.parse(item.sourceUrl),
                            mode: LaunchMode.externalApplication),
                        icon: const Icon(Icons.open_in_new))
                  ]),
                ]))));
  }
}
