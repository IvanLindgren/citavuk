import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'typewriter_view.dart';

const _pageAsset = 'assets/games/typewriter3d.html';

/// Сколько ждём, пока страница с машинкой поднимется и скажет «готово».
const _readyTimeout = Duration(seconds: 10);

Future<String>? _page;

/// Страница читается из ассетов один раз: около мегабайта вместе со шрифтами.
Future<String> _loadPage() => _page ??= rootBundle.loadString(_pageAsset).catchError((Object e) {
      _page = null;
      throw e;
    });

/// Есть ли на этой платформе WebView для объёмной машинки. На Linux он
/// собирается отдельным плагином и в игре не используется, в вебе машинка
/// объёмная и так — там работает сама страница сайта.
bool get typewriter3dSupported {
  if (kIsWeb) return false;
  return switch (defaultTargetPlatform) {
    TargetPlatform.android || TargetPlatform.iOS || TargetPlatform.windows || TargetPlatform.macOS => true,
    _ => false,
  };
}

/// Машинка игры на падежи: объёмная, как на сайте (три.js внутри WebView), а
/// если её не удалось запустить, — плоская [TypewriterView]. Интерфейс у обеих
/// один, экран игры об этом не знает.
class TypewriterStage extends StatefulWidget {
  const TypewriterStage({
    super.key,
    required this.lines,
    required this.before,
    required this.typed,
    required this.after,
    required this.strike,
    required this.returning,
    required this.onKey,
  });

  final List<PrintedLine> lines;
  final String before, typed, after;
  final KeyStrike? strike;
  final bool returning;
  final ValueChanged<String> onKey;

  @override
  State<TypewriterStage> createState() => _TypewriterStageState();
}

enum _Stage { loading, ready, failed }

class _TypewriterStageState extends State<TypewriterStage> {
  InAppWebViewController? _controller;
  String? _html;
  _Stage _stage = typewriter3dSupported ? _Stage.loading : _Stage.failed;
  Timer? _timeout;
  // Экран игры дописывает строки в тот же список, поэтому по ссылке изменение
  // не заметить — сравнивается длина.
  int _sentLines = -1;

  @override
  void initState() {
    super.initState();
    if (_stage == _Stage.failed) return;
    unawaited(_loadPage().then((html) {
      if (mounted) setState(() => _html = html);
    }).catchError((Object _) {
      if (mounted) setState(() => _stage = _Stage.failed);
    }));
    _timeout = Timer(_readyTimeout, () {
      if (mounted && _stage == _Stage.loading) setState(() => _stage = _Stage.failed);
    });
  }

  @override
  void dispose() {
    _timeout?.cancel();
    super.dispose();
  }

  /// Состояние листа так, как его ждёт сцена (`PaperState` в typewriterScene.ts).
  /// Пока каретка возвращается, строка уже ушла на лист, а новая ещё пуста.
  String _paperJson() {
    final w = widget;
    return jsonEncode({
      'lines': [
        for (final line in w.lines)
          {
            'before': line.before,
            'typed': line.typed,
            'after': line.after,
            'status': line.status,
            'correct': line.correct,
            'missing': line.missing,
          },
      ],
      'before': w.returning ? '' : w.before,
      'typed': w.returning ? '' : w.typed,
      'after': w.returning ? '' : w.after,
    });
  }

  void _run(String source) {
    final controller = _controller;
    if (controller == null || _stage != _Stage.ready) return;
    unawaited(controller.evaluateJavascript(source: source).catchError((Object _) => null));
  }

  void _pushPaper() {
    _sentLines = widget.lines.length;
    _run('window.TW && window.TW.setPaper(${_paperJson()});');
  }

  @override
  void didUpdateWidget(covariant TypewriterStage old) {
    super.didUpdateWidget(old);
    final w = widget;
    if (_stage != _Stage.ready) return;
    if (w.lines.length != _sentLines ||
        w.before != old.before ||
        w.typed != old.typed ||
        w.after != old.after ||
        w.returning != old.returning) {
      _pushPaper();
    }
    final strike = w.strike;
    if (strike != null && strike.id != old.strike?.id) {
      _run('window.TW && window.TW.strike(${jsonEncode(strike.key)});');
    }
  }

  void _onMessage(Object? message) {
    if (message is! Map) return;
    switch (message['type']) {
      case 'ready':
        _timeout?.cancel();
        if (!mounted) return;
        setState(() => _stage = _Stage.ready);
        _pushPaper();
      case 'key':
        final key = message['key'];
        if (key is String && key.isNotEmpty) widget.onKey(key);
      case 'failed':
        // Нет WebGL или потерян его контекст: играем на плоской машинке.
        _timeout?.cancel();
        if (mounted) setState(() => _stage = _Stage.failed);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_stage == _Stage.failed) {
      return TypewriterView(
        lines: widget.lines,
        before: widget.before,
        typed: widget.typed,
        after: widget.after,
        strike: widget.strike,
        returning: widget.returning,
        onKey: widget.onKey,
      );
    }
    final html = _html;
    return Stack(
      children: [
        if (html != null)
          Positioned.fill(
            child: InAppWebView(
              initialData: InAppWebViewInitialData(data: html, baseUrl: WebUri('about:blank'), mimeType: 'text/html', encoding: 'utf-8'),
              initialSettings: InAppWebViewSettings(
                javaScriptEnabled: true,
                transparentBackground: true,
                supportZoom: false,
                disableContextMenu: true,
                disableVerticalScroll: true,
                disableHorizontalScroll: true,
                verticalScrollBarEnabled: false,
                horizontalScrollBarEnabled: false,
                useShouldOverrideUrlLoading: true,
                supportMultipleWindows: false,
                javaScriptHandlersForMainFrameOnly: true,
              ),
              // Страница своя и лежит в приложении: уходить с неё некуда.
              shouldOverrideUrlLoading: (controller, action) async => NavigationActionPolicy.CANCEL,
              onWebViewCreated: (controller) {
                _controller = controller;
                controller.addJavaScriptHandler(
                  handlerName: 'tw',
                  callback: (args) {
                    if (args.isNotEmpty) _onMessage(args.first);
                    return null;
                  },
                );
              },
              onReceivedError: (controller, request, error) {
                if (request.isForMainFrame ?? true) {
                  if (mounted) setState(() => _stage = _Stage.failed);
                }
              },
            ),
          ),
        // Пока сцена собирается, страница закрыта: полупрозрачная заготовка
        // без содержимого выглядела бы поломкой.
        if (_stage == _Stage.loading)
          Positioned.fill(
            child: ColoredBox(
              color: Theme.of(context).scaffoldBackgroundColor,
              child: const Center(child: CircularProgressIndicator()),
            ),
          ),
      ],
    );
  }
}
