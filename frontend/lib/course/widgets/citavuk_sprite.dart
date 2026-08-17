/// Отрисовка sprite-анимаций Читавука из atlas (master-prompt §11.6).
///
/// Atlas декодируется один раз и кешируется; кадры рисуются как source
/// rectangle одного изображения. Никаких `Image.asset` на каждый кадр.
library;

import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart' show Ticker;
import 'package:flutter/services.dart' show rootBundle;

import '../services/sprite_manifest.dart';

/// Кеш декодированных atlas: один decode на изображение за время жизни
/// приложения.
class SpriteAtlasCache {
  SpriteAtlasCache._();

  static final SpriteAtlasCache instance = SpriteAtlasCache._();

  final Map<String, ui.Image> _images = {};
  final Map<String, Future<ui.Image>> _pending = {};

  ui.Image? peek(String asset) => _images[asset];

  Future<ui.Image> load(String asset) {
    final cached = _images[asset];
    if (cached != null) return Future.value(cached);
    return _pending[asset] ??= _decode(asset).then((image) {
      _images[asset] = image;
      _pending.remove(asset);
      return image;
    }, onError: (Object e) {
      _pending.remove(asset);
      throw e;
    });
  }

  Future<ui.Image> _decode(String asset) async {
    final data = await rootBundle.load(asset);
    final codec = await ui.instantiateImageCodec(data.buffer.asUint8List());
    final frame = await codec.getNextFrame();
    return frame.image;
  }

  /// Прогревает atlas до открытия урока, чтобы первый кадр не мигал.
  Future<void> precache(Iterable<SpriteAnimationSpec> specs) async {
    for (final spec in specs) {
      try {
        await load(spec.asset);
      } catch (e) {
        debugPrint('sprite: не удалось декодировать ${spec.asset} ($e)');
      }
    }
  }

  @visibleForTesting
  void clear() {
    for (final image in _images.values) {
      image.dispose();
    }
    _images.clear();
  }
}

/// Проигрывает одну анимацию из atlas.
///
/// При `MediaQuery.disableAnimations` показывает статичный кадр: движение
/// отключено системно и навязывать его нельзя (§11.6, §20).
class CitavukSprite extends StatefulWidget {
  const CitavukSprite({
    super.key,
    required this.spec,
    required this.height,
    this.semanticLabel,
    this.fallback,
    this.onCompleted,
    this.still = false,
  });

  final SpriteAnimationSpec spec;
  final double height;
  final String? semanticLabel;

  /// Показать только первый кадр и не заводить тикер.
  ///
  /// Нужно там, где Читавук — часть оформления, а не реакция на действие: на
  /// карте курса он крутился в шапке и рядом с тропой, перерисовывая себя
  /// восемь раз в секунду поверх и без того тяжёлого списка.
  final bool still;

  /// Что показать, если atlas недоступен.
  final Widget? fallback;

  /// Вызывается по завершении one-shot анимации.
  final VoidCallback? onCompleted;

  @override
  State<CitavukSprite> createState() => _CitavukSpriteState();
}

class _CitavukSpriteState extends State<CitavukSprite>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  Ticker? _ticker;
  ui.Image? _atlas;
  Object? _error;
  int _frame = 0;
  Duration _elapsed = Duration.zero;
  bool _completed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadAtlas();
  }

  @override
  void didUpdateWidget(CitavukSprite old) {
    super.didUpdateWidget(old);
    if (old.still != widget.still) _syncTicker();
    if (old.spec.id != widget.spec.id) {
      _frame = 0;
      _elapsed = Duration.zero;
      _completed = false;
      if (old.spec.asset != widget.spec.asset) {
        _atlas = null;
        _loadAtlas();
      } else {
        _syncTicker();
      }
    }
  }

  Future<void> _loadAtlas() async {
    // Уже декодированный atlas берём синхронно — без мигания при переходах.
    final ready = SpriteAtlasCache.instance.peek(widget.spec.asset);
    if (ready != null) {
      _atlas = ready;
      _syncTicker();
      return;
    }
    try {
      final image = await SpriteAtlasCache.instance.load(widget.spec.asset);
      if (!mounted) return;
      setState(() => _atlas = image);
      _syncTicker();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e);
    }
  }

  /// Запускает или останавливает тикер в зависимости от состояния.
  void _syncTicker() {
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final shouldRun = _atlas != null &&
        !reduceMotion &&
        !widget.still &&
        widget.spec.frames > 1 &&
        !(_completed && !widget.spec.loop);

    if (!shouldRun) {
      _ticker?.stop();
      return;
    }
    _ticker ??= createTicker(_onTick);
    if (!_ticker!.isActive) {
      _ticker!.start();
    }
  }

  void _onTick(Duration elapsed) {
    final spec = widget.spec;
    final delta = elapsed - _elapsed;
    if (delta < spec.frameDuration) return;
    _elapsed = elapsed;

    final next = _frame + 1;
    if (next >= spec.frames) {
      if (spec.loop) {
        setState(() => _frame = 0);
        return;
      }
      // One-shot доигран: замираем на последнем кадре и сообщаем один раз.
      _ticker?.stop();
      if (!_completed) {
        _completed = true;
        widget.onCompleted?.call();
      }
      return;
    }
    setState(() => _frame = next);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // В фоне анимация не крутится впустую.
    if (state == AppLifecycleState.resumed) {
      _syncTicker();
    } else {
      _ticker?.stop();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncTicker();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final spec = widget.spec;
    final width = widget.height * spec.aspectRatio;

    if (_error != null || (_atlas == null && _error != null)) {
      return _fallbackBox(width);
    }
    final atlas = _atlas;
    if (atlas == null) {
      // Размер занимаем сразу, чтобы появление кадра не двигало layout.
      return SizedBox(width: width, height: widget.height);
    }

    return Semantics(
      image: true,
      label: widget.semanticLabel,
      child: SizedBox(
        width: width,
        height: widget.height,
        child: CustomPaint(
          painter: _SpritePainter(
            atlas: atlas,
            spec: spec,
            frame: _frame.clamp(0, spec.frames - 1),
          ),
        ),
      ),
    );
  }

  Widget _fallbackBox(double width) => SizedBox(
        width: width,
        height: widget.height,
        child: widget.fallback ?? const SizedBox.shrink(),
      );
}

class _SpritePainter extends CustomPainter {
  _SpritePainter({
    required this.atlas,
    required this.spec,
    required this.frame,
  });

  final ui.Image atlas;
  final SpriteAnimationSpec spec;
  final int frame;

  @override
  void paint(Canvas canvas, Size size) {
    final column = frame % spec.columns;
    final row = frame ~/ spec.columns;
    final src = Rect.fromLTWH(
      (column * spec.frameWidth).toDouble(),
      (row * spec.frameHeight).toDouble(),
      spec.frameWidth.toDouble(),
      spec.frameHeight.toDouble(),
    );
    canvas.drawImageRect(
      atlas,
      src,
      Offset.zero & size,
      Paint()..filterQuality = FilterQuality.medium,
    );
  }

  @override
  bool shouldRepaint(_SpritePainter old) =>
      old.frame != frame || old.atlas != atlas || old.spec.id != spec.id;
}
