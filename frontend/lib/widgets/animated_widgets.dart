import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/tokens.dart';

export '../theme/tokens.dart' show AppMotion;

/// Набор лёгких переиспользуемых анимаций, чтобы интерфейс «оживал»:
/// плавное появление, мягкое «парение» маскота, нажатие с откликом.
///
/// Длительности — из общего источника токенов (design/tokens.json).

/// Появление с затуханием и сдвигом снизу вверх. [delay] позволяет делать
/// каскад (списки появляются по очереди).
class FadeSlideIn extends StatefulWidget {
  final Widget child;
  final Duration duration;
  final Duration delay;
  final double offsetY;
  final double offsetX;

  const FadeSlideIn({
    super.key,
    required this.child,
    this.duration = const Duration(milliseconds: 420),
    this.delay = Duration.zero,
    this.offsetY = 16,
    this.offsetX = 0,
  });

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

/// Однократные золотые искры для верного ответа и завершения занятия.
class SparkleBurst extends StatefulWidget {
  const SparkleBurst({super.key, this.size = 120});
  final double size;

  @override
  State<SparkleBurst> createState() => _SparkleBurstState();
}

class _SparkleBurstState extends State<SparkleBurst>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 760),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.value = 1;
    } else if (!_controller.isAnimating && _controller.value == 0) {
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: SizedBox.square(
          dimension: widget.size,
          child: AnimatedBuilder(
            animation: _controller,
            builder: (_, __) => CustomPaint(
              painter: _SparklePainter(
                progress: _controller.value,
                color: const Color(0xFFC9A24B),
              ),
            ),
          ),
        ),
      );
}

class _SparklePainter extends CustomPainter {
  const _SparklePainter({required this.progress, required this.color});
  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    for (var i = 0; i < 7; i++) {
      final delayed = ((progress - i * .045) / .73).clamp(0.0, 1.0);
      if (delayed <= 0 || delayed >= 1) continue;
      final angle = i * math.pi * 2 / 7 - math.pi / 2;
      final distance =
          size.shortestSide * (.12 + .34 * Curves.easeOut.transform(delayed));
      final point =
          center + Offset(math.cos(angle), math.sin(angle)) * distance;
      final opacity = math.sin(delayed * math.pi);
      final radius = size.shortestSide * .035 * (1 - delayed * .35);
      final path = Path();
      for (var ray = 0; ray < 8; ray++) {
        final a = ray * math.pi / 4;
        final r = ray.isEven ? radius : radius * .28;
        final p = point + Offset(math.cos(a), math.sin(a)) * r;
        if (ray == 0) {
          path.moveTo(p.dx, p.dy);
        } else {
          path.lineTo(p.dx, p.dy);
        }
      }
      path.close();
      canvas.drawPath(path, Paint()..color = color.withValues(alpha: opacity));
    }
  }

  @override
  bool shouldRepaint(_SparklePainter old) =>
      old.progress != progress || old.color != color;
}

/// Ожидание из трёх точек; контроллер работает только пока виджет видим.
class ThinkingDots extends StatefulWidget {
  const ThinkingDots({super.key, this.color});
  final Color? color;

  @override
  State<ThinkingDots> createState() => _ThinkingDotsState();
}

class _ThinkingDotsState extends State<ThinkingDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final disabled = MediaQuery.disableAnimationsOf(context) ||
        !TickerMode.valuesOf(context).enabled;
    if (disabled) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _controller,
        builder: (_, __) => Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (index) {
            final phase = (_controller.value - index * .16) * math.pi * 2;
            final lift = math.max(0.0, math.sin(phase)) * 4;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Transform.translate(
                offset: Offset(0, -lift),
                child: Container(
                  width: 5,
                  height: 5,
                  decoration: BoxDecoration(
                    color:
                        widget.color ?? Theme.of(context).colorScheme.primary,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            );
          }),
        ),
      );
}

class _FadeSlideInState extends State<FadeSlideIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: widget.duration);
  late final Animation<double> _t =
      CurvedAnimation(parent: _c, curve: Curves.easeOutCubic);
  bool _scheduled = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Контроллер запускается только если движение разрешено — иначе появление
    // сразу в конечном состоянии (см. build). didChangeDependencies, а не
    // initState: MediaQuery доступен только здесь. Переключение системной
    // настройки на ходу подхватывается здесь же.
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      // Завершить значением 1: возврат к незавершённой прозрачности хуже
      // отсутствия анимации. Флаг остаётся: при возврате движения начинать
      // уже нечего — конечное состояние и так показано.
      _scheduled = true;
      _c.value = 1.0;
      _c.stop();
      return;
    }
    if (_scheduled) return;
    _scheduled = true;
    if (widget.delay == Duration.zero) {
      _c.forward();
    } else {
      Future.delayed(widget.delay, () {
        // Настройка могла смениться за время задержки — проверяем заново,
        // иначе контроллер стартует уже после запрета движения.
        if (!mounted) return;
        if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return;
        _c.forward();
      });
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Системное «уменьшить движение»: появление сразу в конечном состоянии,
    // контроллер даже не запускается.
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return widget.child;
    }
    // FadeTransition меняет прозрачность слоя, не перестраивая виджеты: на
    // каскаде из десятка карточек это заметно дешевле Opacity в builder.
    return FadeTransition(
      opacity: _t,
      child: AnimatedBuilder(
        animation: _t,
        builder: (context, child) {
          final v = _t.value;
          return Transform.translate(
            offset: Offset(widget.offsetX * (1 - v), widget.offsetY * (1 - v)),
            child: child,
          );
        },
        child: widget.child,
      ),
    );
  }
}

/// Бесконечное мягкое «парение» по вертикали — для маскота и иконок.
class FloatingBob extends StatefulWidget {
  final Widget child;
  final double amplitude;
  final Duration period;

  const FloatingBob({
    super.key,
    required this.child,
    this.amplitude = 6,
    this.period = const Duration(milliseconds: 2600),
  });

  @override
  State<FloatingBob> createState() => _FloatingBobState();
}

class _FloatingBobState extends State<FloatingBob>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: widget.period);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Повторяющийся контроллер останавливается, а не просто прячется:
    // невидимое парение тоже будит GPU. Переключение системной настройки на
    // ходу подхватывается здесь же.
    if ((MediaQuery.maybeDisableAnimationsOf(context) ?? false) ||
        !TickerMode.valuesOf(context).enabled) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Системный «уменьшить движение»: бесконечное парение выключается везде
    // сразу, без правок в каждом экране.
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return widget.child;
    }
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        // Плавная синусоида через две easeInOut-фазы.
        final t = _c.value;
        final phase = (t < 0.5 ? t * 2 : (1 - t) * 2); // 0..1..0
        final eased = Curves.easeInOut.transform(phase);
        return Transform.translate(
          offset: Offset(0, -widget.amplitude * eased),
          child: child,
        );
      },
      child: RepaintBoundary(child: widget.child),
    );
  }
}

/// Переход смены содержимого карточки: короткое появление со сдвигом 7 px
/// за 180 мс (см. AppMotion). Один на шторку и боковую панель разбора, чтобы
/// смена слова выглядела одинаково везде.
Widget cardTransitionBuilder(Widget child, Animation<double> animation) {
  final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
  return FadeTransition(
    opacity: curved,
    child: AnimatedBuilder(
      animation: curved,
      builder: (context, c) => Transform.translate(
        offset: Offset(0, AppMotion.cardShift * (1 - curved.value)),
        child: c,
      ),
      child: child,
    ),
  );
}

/// Кнопка/карточка, которая слегка «вдавливается» при нажатии.
///
/// Одного GestureDetector для кнопки мало: без роли, фокуса и клавиатуры её
/// нет ни для скринридера, ни для таба. Поэтому здесь же Semantics (кнопка),
/// фокус и Enter/Space — снаружи ничего оборачивать не нужно.
class PressableScale extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final double scale;

  /// Подпись для скринридера. Без неё озвучится содержимое.
  final String? semanticLabel;

  const PressableScale({
    super.key,
    required this.child,
    this.onTap,
    this.scale = 0.96,
    this.semanticLabel,
  });

  @override
  State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale> {
  bool _down = false;

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.enter || key == LogicalKeyboardKey.space) {
      widget.onTap?.call();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: widget.onTap != null,
      label: widget.semanticLabel,
      child: Focus(
        onKeyEvent: _onKey,
        // Таб-стоп на карточке без действия не нужен.
        canRequestFocus: widget.onTap != null,
        child: GestureDetector(
          onTapDown:
              widget.onTap == null ? null : (_) => setState(() => _down = true),
          onTapUp: widget.onTap == null
              ? null
              : (_) => setState(() => _down = false),
          onTapCancel:
              widget.onTap == null ? null : () => setState(() => _down = false),
          onTap: widget.onTap,
          child: MouseRegion(
            cursor: widget.onTap == null
                ? SystemMouseCursors.basic
                : SystemMouseCursors.click,
            child: AnimatedScale(
              scale: _down ? widget.scale : 1.0,
              duration: AppMotion.press,
              curve: Curves.easeOut,
              child: widget.child,
            ),
          ),
        ),
      ),
    );
  }
}

/// Однократная реакция маскота: сжатие перед прыжком и мягкое приземление.
/// Живёт здесь, а не в курсе: реакция нужна любому экрану, где волк встречает
/// или отвечает (приветствие после перерыва, радость рубежа). Дочерний арт не
/// перестраивается на каждом кадре.
class MascotReaction extends StatefulWidget {
  const MascotReaction(
      {super.key,
      required this.reaction,
      required this.child,
      this.still = false});
  final String reaction;
  final Widget child;
  final bool still;

  @override
  State<MascotReaction> createState() => _MascotReactionState();
}

class _MascotReactionState extends State<MascotReaction>
    with SingleTickerProviderStateMixin {
  bool _played = false;
  late final AnimationController _controller = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 800));
  bool get _active => ['thinking', 'correct', 'incorrect', 'lessonComplete']
      .contains(widget.reaction);

  void _play({bool restart = false}) {
    if (widget.still ||
        MediaQuery.disableAnimationsOf(context) ||
        !TickerMode.valuesOf(context).enabled ||
        !_active) {
      _controller.stop();
      _controller.value = 1;
    } else if (!_played || restart) {
      _controller.forward(from: 0);
      _played = true;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _play();
  }

  @override
  void didUpdateWidget(MascotReaction oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.reaction != widget.reaction ||
        oldWidget.still != widget.still) {
      _play(restart: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _controller,
        child: widget.child,
        builder: (context, child) {
          final t = _controller.value;
          final wave = math.sin(t * math.pi);
          final happy = widget.reaction == 'correct' ||
              widget.reaction == 'lessonComplete';
          final lift = happy ? -14 * math.pow(wave, 2).toDouble() : 0.0;
          return Transform.translate(
            offset: Offset(0, lift),
            child: Transform.rotate(
              angle: happy ? math.sin(t * math.pi * 2) * 0.07 : -wave * 0.12,
              alignment: Alignment.bottomCenter,
              child: Transform.scale(
                scaleX: 1 + math.sin(t * math.pi * 2) * 0.035,
                scaleY: 1 - math.sin(t * math.pi * 2) * 0.035,
                alignment: Alignment.bottomCenter,
                child: child,
              ),
            ),
          );
        },
      );
}

/// Мерцающий «скелет» полки книг на время загрузки: видно, что появится и
/// где, а не пустой экран с кругом посередине. Один контроллер на весь скелет,
/// при «уменьшить движение» — статичные плашки.
class SkeletonShelf extends StatefulWidget {
  const SkeletonShelf({super.key, this.cards = 6});

  final int cards;

  @override
  State<SkeletonShelf> createState() => _SkeletonShelfState();
}

class _SkeletonShelfState extends State<SkeletonShelf>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if ((MediaQuery.maybeDisableAnimationsOf(context) ?? false) ||
        !TickerMode.valuesOf(context).enabled) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final base = scheme.surfaceContainerHighest;
    final shine = scheme.surfaceContainerLow;
    Widget bar(double width, double height) => Container(
          width: width,
          height: height,
          decoration: BoxDecoration(color: base, borderRadius: BorderRadius.circular(6)),
        );
    final card = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(children: [
        Container(
          width: 96,
          decoration: BoxDecoration(color: base, borderRadius: BorderRadius.circular(8)),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              bar(double.infinity, 16),
              const SizedBox(height: 8),
              bar(120, 12),
              const SizedBox(height: 18),
              bar(double.infinity, 6),
            ],
          ),
        ),
      ]),
    );
    return LayoutBuilder(builder: (context, constraints) {
      final columns = constraints.maxWidth >= 900 ? 3 : constraints.maxWidth >= 600 ? 2 : 1;
      final grid = GridView.count(
        crossAxisCount: columns,
        padding: const EdgeInsets.all(16),
        mainAxisSpacing: 16,
        crossAxisSpacing: 16,
        childAspectRatio: columns > 1 ? 1.46 : 2.4,
        physics: const NeverScrollableScrollPhysics(),
        children: List.filled(widget.cards, card),
      );
      return AnimatedBuilder(
        animation: _c,
        builder: (context, child) => ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (rect) => LinearGradient(
            colors: [base, shine, base],
            stops: const [0.35, 0.5, 0.65],
            transform: _SlideGradient(_c.value),
          ).createShader(rect),
          child: child,
        ),
        child: RepaintBoundary(child: grid),
      );
    });
  }
}

class _SlideGradient extends GradientTransform {
  const _SlideGradient(this.t);
  final double t;

  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) =>
      Matrix4.translationValues(bounds.width * (t * 2 - 1), 0, 0);
}

/// Карточка слегка приподнимается под курсором мыши. На телефоне событий
/// наведения нет, и обёртка ничего не делает.
class HoverLift extends StatefulWidget {
  const HoverLift({super.key, required this.child, this.radius = 22});

  final Widget child;
  final double radius;

  @override
  State<HoverLift> createState() => _HoverLiftState();
}

class _HoverLiftState extends State<HoverLift> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return widget.child;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        transform: Matrix4.translationValues(0, _hover ? -3 : 0, 0),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(widget.radius),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: _hover ? .14 : 0),
              blurRadius: _hover ? 22 : 0,
              offset: Offset(0, _hover ? 10 : 0),
            ),
          ],
        ),
        child: widget.child,
      ),
    );
  }
}

/// Полоса прогресса, которая при появлении плавно наполняется до значения.
class AnimatedProgressBar extends StatelessWidget {
  const AnimatedProgressBar({
    super.key,
    required this.value,
    this.minHeight = 6,
    this.backgroundColor,
  });

  final double value;
  final double minHeight;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    Widget bar(double v) => LinearProgressIndicator(
          value: v,
          minHeight: minHeight,
          backgroundColor: backgroundColor,
        );
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return bar(value);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: value),
      duration: const Duration(milliseconds: 700),
      curve: Curves.easeOutCubic,
      builder: (_, v, __) => bar(v),
    );
  }
}
