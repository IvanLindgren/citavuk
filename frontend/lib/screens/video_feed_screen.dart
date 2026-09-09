import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'vukotok_comments.dart';
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
  bool _saved = false, _exhausted = false;
  final _reactions = <String, int>{};
  double _drag = 0;
  DateTime _lastMove = DateTime.fromMillisecondsSinceEpoch(0);
  @override
  void initState() {
    super.initState();
    StudyService.instance.addListener(_accountChanged);
    unawaited(_load());
  }

  Future<void> _load({bool refresh = false}) async {
    if (refresh) {
      _request++;
      _loading = false;
    }
    if (_loading) return;
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final base = refresh && _items.isNotEmpty
          ? _items.take(_index + 1).toList()
          : List<MicroFeedItem>.of(_items);
      final fresh = _saved
          ? await MicroFeedService.instance.liked(video: true)
          : (await MicroFeedService.instance
                  .load(video: true, exclude: base.map((v) => v.id).toList()))
              .items;
      if (mounted && request == _request) {
        setState(() {
          if (refresh && _items.length > _index + 1) {
            _items.removeRange(_index + 1, _items.length);
          }
          final additions = fresh
              .where((v) =>
                  v.videoId.isNotEmpty && !_items.any((old) => old.id == v.id))
              .toList();
          _items.addAll(additions);
          _exhausted = _saved || additions.isEmpty;
        });
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
    setState(() {
      _items.clear();
      _reactions.clear();
      _index = 0;
      _loading = false;
      _saved = false;
      _exhausted = false;
    });
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
    return GestureDetector(
        behavior: HitTestBehavior.translucent,
        onVerticalDragStart: (_) => _drag = 0,
        onVerticalDragUpdate: (event) => _drag += event.delta.dy,
        onVerticalDragEnd: (_) {
          if (_drag.abs() > 48) _move(_drag < 0 ? 1 : -1);
        },
        child: Listener(
            onPointerSignal: (event) {
              if (event is PointerScrollEvent &&
                  event.scrollDelta.dy.abs() > 35) {
                _move(event.scrollDelta.dy > 0 ? 1 : -1);
              }
            },
            child: Column(children: [
              Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
                  child: Row(children: [
                    Text(_saved ? 'Понравившиеся' : 'Для тебя',
                        style: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w600)),
                    const Spacer(),
                    IconButton(
                        tooltip: _saved
                            ? 'Вернуться к рекомендациям'
                            : 'Понравившиеся видео',
                        icon: Icon(
                            _saved ? Icons.favorite : Icons.favorite_border),
                        onPressed: () {
                          _request++;
                          setState(() {
                            _saved = !_saved;
                            _items.clear();
                            _index = 0;
                            _loading = false;
                            _exhausted = false;
                          });
                          unawaited(_load());
                        }),
                  ])),
              if (_error != null)
                Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(_error!,
                        style: const TextStyle(color: Colors.white))),
              Expanded(
                  child: item == null
                      ? Center(
                          child: _loading
                              ? const CircularProgressIndicator()
                              : const Padding(
                                  padding: EdgeInsets.all(24),
                                  child: Text(
                                      'Доступные ролики закончились. Можно вернуться к предыдущим или открыть текстовую ленту.',
                                      textAlign: TextAlign.center)))
                      : _VideoCard(
                          key: ValueKey(item.id),
                          item: item,
                          active: widget.active,
                          reaction: _reactions[item.id] ?? item.reaction,
                          onReaction: (value) {
                            _reactions[item.id] = value;
                            if (!_saved) unawaited(_load(refresh: true));
                          })),
              SafeArea(
                  top: false,
                  child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            IconButton.outlined(
                                tooltip: 'Предыдущее видео',
                                onPressed: _index > 0 ? () => _move(-1) : null,
                                icon: const Icon(Icons.keyboard_arrow_up)),
                            Flexible(
                                child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 10),
                                    child: Text(
                                        _loading
                                            ? 'Подбираем ещё'
                                            : _exhausted &&
                                                    _index == _items.length - 1
                                                ? 'Пока это последний ролик'
                                                : 'Листай вверх к следующему',
                                        textAlign: TextAlign.center,
                                        style: const TextStyle(fontSize: 12)))),
                            IconButton.outlined(
                                tooltip: 'Следующее видео',
                                onPressed:
                                    _exhausted && _index == _items.length - 1
                                        ? null
                                        : () => _move(1),
                                icon: const Icon(Icons.keyboard_arrow_down))
                          ]))),
            ])));
  }

  void _move(int direction) {
    if (!widget.active ||
        DateTime.now().difference(_lastMove).inMilliseconds < 350) {
      return;
    }
    final next = _index + direction;
    if (next < 0) return;
    if (next >= _items.length) {
      if (!_exhausted) unawaited(_load());
      return;
    }
    _lastMove = DateTime.now();
    setState(() => _index = next);
    if (!_saved && _index + 3 >= _items.length && !_exhausted) {
      unawaited(_load());
    }
  }
}

class _VideoCard extends StatefulWidget {
  const _VideoCard(
      {super.key,
      required this.item,
      required this.active,
      required this.reaction,
      required this.onReaction});
  final MicroFeedItem item;
  final bool active;
  final int reaction;
  final ValueChanged<int> onReaction;
  @override
  State<_VideoCard> createState() => _VideoCardState();
}

class _VideoCardState extends State<_VideoCard> with WidgetsBindingObserver {
  final _epoch = StudyService.instance.accountEpoch;
  final _playing = Stopwatch();
  bool _foreground = true, _busy = false;
  late int _reaction = widget.reaction;
  late int _comments = widget.item.commentsCount;
  bool _discussing = false, _failed = false;
  InAppWebViewController? _player;
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
    if (!_failed &&
        _playing.elapsedMilliseconds > 0 &&
        _epoch == StudyService.instance.accountEpoch) {
      unawaited(MicroFeedService.instance
          .record(widget.item.id,
              _playing.elapsedMilliseconds < 2000 ? 'quick_skip' : 'view',
              dwellMs: _playing.elapsedMilliseconds.clamp(0, 3600000))
          .catchError((Object _) {}));
      if (widget.item.videoDuration > 0 &&
          _playing.elapsedMilliseconds >= 3000 &&
          _playing.elapsedMilliseconds >= widget.item.videoDuration * 800) {
        unawaited(MicroFeedService.instance
            .record(widget.item.id, 'complete',
                dwellMs: _playing.elapsedMilliseconds.clamp(0, 3600000))
            .catchError((Object _) {}));
      }
    }
    super.dispose();
  }

  Future<void> _react(int value) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final next = _reaction == value ? 0 : value;
      await MicroFeedService.instance.record(
          widget.item.id,
          next == 0
              ? 'reaction_cleared'
              : next == 1
                  ? 'like'
                  : 'dislike');
      if (mounted && _epoch == StudyService.instance.accountEpoch) {
        setState(() => _reaction = next);
        widget.onReaction(next);
      }
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
                      style: const TextStyle(
                          fontSize: 17,
                          height: 1.45,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 14,
                      runSpacing: 6,
                      children: [
                        Text(item.sourceTitle,
                            style: const TextStyle(fontSize: 12)),
                        Text(item.cefr, style: const TextStyle(fontSize: 12)),
                        Text('${item.videoDuration} сек.',
                            style: const TextStyle(fontSize: 12))
                      ]),
                  const SizedBox(height: 12),
                  Expanded(
                      child: !kIsWeb &&
                              defaultTargetPlatform == TargetPlatform.linux
                          ? LinuxVideoPlayer(
                              item: item, active: widget.active && !_discussing)
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
                                        javaScriptHandlersForMainFrameOnly:
                                            true,
                                        javaScriptHandlersOriginAllowList: {
                                          'https://citavuk.ru'
                                        },
                                        supportMultipleWindows: false),
                                    onWebViewCreated: (controller) {
                                      _player = controller;
                                      controller.addJavaScriptHandler(
                                          handlerName: 'citavukVideo',
                                          callback:
                                              (JavaScriptHandlerFunctionData
                                                  value) {
                                            if (!value.isMainFrame ||
                                                value.origin.toString() !=
                                                    'https://citavuk.ru' ||
                                                value.requestUrl.path !=
                                                    '/video-player.html') {
                                              return null;
                                            }
                                            final args = value.args;
                                            if (args.isEmpty ||
                                                args.first is! Map) {
                                              return null;
                                            }
                                            final event = args.first as Map;
                                            if (event['id'] != item.videoId ||
                                                !mounted) {
                                              return null;
                                            }
                                            if (event['state'] == 1 &&
                                                widget.active &&
                                                _foreground &&
                                                !_discussing) {
                                              if (_failed) {
                                                setState(() {
                                                  _failed = false;
                                                  _error = null;
                                                });
                                              }
                                              _playing.start();
                                            } else {
                                              _playing.stop();
                                            }
                                            if (event['state'] == -2) {
                                              _failed = true;
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
                                            mode: LaunchMode
                                                .externalApplication));
                                      }
                                      return NavigationActionPolicy.CANCEL;
                                    },
                                    onReceivedError:
                                        (controller, request, error) {
                                      if (request.isForMainFrame == true &&
                                          mounted) {
                                        _failed = true;
                                        setState(() => _error =
                                            'Не удалось открыть плеер. Проверь подключение.');
                                      }
                                    },
                                    onPermissionRequest: (controller,
                                            request) async =>
                                        PermissionResponse(
                                            resources: request.resources,
                                            action:
                                                PermissionResponseAction.DENY),
                                  ))
                              : const SizedBox.shrink()),
                  if (_error != null) Text(_error!),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, children: [
                    TextButton.icon(
                        onPressed: _busy ? null : () => _react(1),
                        icon: Icon(
                            _reaction == 1
                                ? Icons.favorite
                                : Icons.favorite_border,
                            color: _reaction == 1
                                ? const Color(0xFFFF9385)
                                : null),
                        label: const Text('Нравится')),
                    TextButton.icon(
                        onPressed: _openComments,
                        icon: const Icon(Icons.chat_bubble_outline),
                        label: Text(_comments > 0
                            ? 'Обсудить $_comments'
                            : 'Обсудить')),
                    TextButton.icon(
                        onPressed: _busy ? null : () => _react(-1),
                        icon: const Icon(Icons.thumb_down_outlined),
                        label: const Text('Не моё')),
                    IconButton(
                        tooltip: 'Открыть на YouTube',
                        onPressed: () => launchUrl(Uri.parse(item.sourceUrl),
                            mode: LaunchMode.externalApplication),
                        icon: const Icon(Icons.open_in_new))
                  ]),
                ]))));
  }

  Future<void> _openComments() async {
    setState(() => _discussing = true);
    _playing.stop();
    try {
      await _player?.evaluateJavascript(
          source:
              "window.postMessage({type:'citavuk-control',action:'pause'},location.origin)");
    } catch (_) {}
    if (!mounted) return;
    final count = await showModalBottomSheet<int>(
        context: context,
        isScrollControlled: true,
        builder: (_) => VukotokCommentsSheet(itemId: widget.item.id));
    if (mounted) {
      setState(() {
        _discussing = false;
        if (count != null) _comments = count;
      });
    }
  }
}
