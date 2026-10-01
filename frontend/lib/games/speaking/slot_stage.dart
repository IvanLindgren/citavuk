import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import '../cases/typewriter_3d_view.dart' show typewriter3dSupported;
import 'slot_machine_view.dart';
import 'speaking_models.dart';

/// Пропорции сцены — те же, что `SLOT_ASPECT` в
/// web/src/games/speaking/slotMath.ts: на узком экране Читавук стоит на крыше
/// автомата, на широком — рядом с ним.
const slotAspectCompact = 600 / 824;
const slotAspectWide = 1200 / 700;

Future<String>? _page;

/// Игровой автомат тем с Читавуком-фокусником: та же сцена, что на сайте,
/// внутри WebView (`assets/games/slot_machine.html`, собирается
/// `node web/scripts/build-slot-embed.mjs`). Если страница не поднялась —
/// нативный [SlotMachineView].
class SlotStage extends StatefulWidget {
  const SlotStage(
      {super.key,
      required this.pool,
      required this.catalog,
      required this.spinId,
      required this.target,
      required this.title,
      required this.muted,
      required this.onLanded,
      required this.onPull});
  final List<SpeakingTopic> pool;
  final SpeakingCatalog catalog;
  final int spinId;
  final SpeakingTopic? target;

  /// Надпись на вывеске: «Говори!» или «Пиши!».
  final String title;

  /// Звуки автомата и фокусов Читавука выключены.
  final bool muted;
  final VoidCallback onLanded;

  /// Игрок дёрнул рычаг на странице: экран выбирает тему и поднимает [spinId].
  final VoidCallback onPull;
  @override
  State<SlotStage> createState() => _SlotStageState();
}

class _SlotStageState extends State<SlotStage> {
  InAppWebViewController? _controller;
  String? _html;
  bool _ready = false, _failed = !typewriter3dSupported;
  Timer? _timeout;
  int _landed = 0;
  @override
  void initState() {
    super.initState();
    if (_failed) return;
    unawaited((_page ??= rootBundle.loadString('assets/games/slot_machine.html'))
        .then((html) {
      if (mounted) setState(() => _html = html);
    }).catchError((Object _) {
      _page = null;
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
          if (ids.contains(g.id)) {'id': g.id, 'ru': g.ru, 'art': g.art}
      ],
      'topics': [
        for (final t in widget.pool) {'id': t.id, 'genre': t.genre, 'ru': t.ru}
      ],
      'title': widget.title,
      'muted': widget.muted,
      'spinId': widget.spinId,
      'topicId': widget.target?.id,
      'reduced': MediaQuery.disableAnimationsOf(context)
    });
    unawaited(_controller!
        .evaluateJavascript(
            source: 'window.SlotMachine && window.SlotMachine.setState($state)')
        .catchError((Object _) => null));
  }

  @override
  void didUpdateWidget(covariant SlotStage old) {
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
      case 'pull':
        HapticFeedback.lightImpact();
        widget.onPull();
      case 'landed':
        if (widget.spinId > _landed) {
          _landed = widget.spinId;
          HapticFeedback.mediumImpact();
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
      return SlotMachineView(
          pool: widget.pool,
          spinId: widget.spinId,
          target: widget.target,
          title: widget.title,
          onPull: widget.onPull,
          onLanded: () => _message({'type': 'landed'}));
    }
    return LayoutBuilder(
        builder: (context, constraints) => AspectRatio(
            aspectRatio: constraints.maxWidth < 560
                ? slotAspectCompact
                : slotAspectWide,
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
                      // Звук фокусов играет страница: кнопка «Выбрать тему» нажата
                      // во Flutter, а не в WebView, поэтому жест не требуем.
                      mediaPlaybackRequiresUserGesture: false,
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
                        handlerName: 'slot',
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
            ])));
  }
}
