import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import '../cases/typewriter_3d_view.dart' show typewriter3dSupported;
import 'speaking_models.dart';
import 'topic_reel.dart';

Future<String>? _page;

class RouletteStage extends StatefulWidget {
  const RouletteStage(
      {super.key,
      required this.pool,
      required this.catalog,
      required this.spinId,
      required this.target,
      required this.onLanded});
  final List<SpeakingTopic> pool;
  final SpeakingCatalog catalog;
  final int spinId;
  final SpeakingTopic? target;
  final VoidCallback onLanded;
  @override
  State<RouletteStage> createState() => _RouletteStageState();
}

class _RouletteStageState extends State<RouletteStage> {
  InAppWebViewController? _controller;
  String? _html;
  bool _ready = false, _failed = !typewriter3dSupported;
  Timer? _timeout;
  int _landed = 0;
  @override
  void initState() {
    super.initState();
    if (_failed) return;
    unawaited((_page ??= rootBundle.loadString('assets/games/roulette3d.html'))
        .then((html) {
      if (mounted) setState(() => _html = html);
    }).catchError((Object _) {
      if (mounted) setState(() => _failed = true);
    }));
    _timeout = Timer(const Duration(seconds: 10), () {
      if (mounted && !_ready) setState(() => _failed = true);
    });
  }

  @override
  void dispose() {
    _timeout?.cancel();
    super.dispose();
  }

  void _push() {
    if (!_ready || _controller == null) return;
    final ids = widget.pool.map((t) => t.genre).toSet();
    final state = jsonEncode({
      'genres': [
        for (final g in widget.catalog.genres)
          if (ids.contains(g.id)) {'id': g.id, 'ru': g.ru}
      ],
      'spinId': widget.spinId,
      'genre': widget.target?.genre,
      'reduced': MediaQuery.disableAnimationsOf(context)
    });
    unawaited(_controller!
        .evaluateJavascript(
            source: 'window.Roulette && window.Roulette.setState($state)')
        .catchError((Object _) => null));
  }

  @override
  void didUpdateWidget(covariant RouletteStage old) {
    super.didUpdateWidget(old);
    _push();
  }

  void _message(Object? value) {
    if (!mounted || value is! Map) return;
    switch (value['type']) {
      case 'ready':
        _timeout?.cancel();
        setState(() => _ready = true);
        _push();
      case 'landed':
        if (widget.spinId > _landed) {
          _landed = widget.spinId;
          widget.onLanded();
        }
      case 'failed':
        _timeout?.cancel();
        setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return TopicReel(
          pool: widget.pool,
          catalog: widget.catalog,
          spinId: widget.spinId,
          target: widget.target,
          onLanded: () => _message({'type': 'landed'}));
    }
    return AspectRatio(
        aspectRatio: 1.32,
        child: Stack(children: [
          if (_html != null)
            Positioned.fill(
                child: InAppWebView(
              initialData: InAppWebViewInitialData(
                  data: _html!,
                  baseUrl: WebUri('about:blank'),
                  mimeType: 'text/html',
                  encoding: 'utf-8'),
              initialSettings: InAppWebViewSettings(
                  javaScriptEnabled: true,
                  transparentBackground: true,
                  supportZoom: false,
                  disableContextMenu: true,
                  disableVerticalScroll: true,
                  disableHorizontalScroll: true,
                  useShouldOverrideUrlLoading: true,
                  supportMultipleWindows: false,
                  javaScriptHandlersForMainFrameOnly: true),
              shouldOverrideUrlLoading: (controller, action) async =>
                  NavigationActionPolicy.CANCEL,
              onWebViewCreated: (controller) {
                _controller = controller;
                controller.addJavaScriptHandler(
                    handlerName: 'roulette',
                    callback: (JavaScriptHandlerFunctionData data) {
                      if (data.isMainFrame && data.args.isNotEmpty) {
                        _message(data.args.first);
                      }
                      return null;
                    });
              },
              onReceivedError: (controller, request, error) {
                if (request.isForMainFrame == true && mounted) {
                  setState(() => _failed = true);
                }
              },
            )),
          if (!_ready) const Center(child: CircularProgressIndicator()),
        ]));
  }
}
