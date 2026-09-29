import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'case_game_data.dart';

class PrintedLine {
  const PrintedLine({
    required this.before,
    required this.typed,
    required this.after,
    required this.status,
    this.correct = '',
    this.missing = const [],
  });

  final String before, typed, after;

  /// ok, slip (без чёрточек) или wrong.
  final String status;
  final String correct;
  final List<String> missing;
}

class KeyStrike {
  const KeyStrike(this.key, this.id);
  final String key;
  final int id;
}

const _ink = Color(0xFF1D1A17);
const _inkRed = Color(0xFFB3261E);
const _paper = Color(0xFFFBF6E8);
const _gold = Color(0xFFD9B25F);
const _font = 'CourierPrime';

/// Печатная машинка игры на падежи: лист, валик, корпус с клавишами и лапы
/// Читавука, которые жмут клавиши. Виджет занимает всё отведённое место и сам
/// подбирает размер клавиши под ширину и высоту.
class TypewriterView extends StatefulWidget {
  const TypewriterView({
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
  State<TypewriterView> createState() => _TypewriterViewState();
}

class _PawState {
  const _PawState(this.tip, this.angle, {this.pressed = false, this.resting = true});
  final Offset tip;
  final double angle;
  final bool pressed, resting;
}

class _TypewriterViewState extends State<TypewriterView> {
  final _stackKey = GlobalKey();
  final _keyKeys = <String, GlobalKey>{};
  final _timers = <Timer>[];
  String? _pressed;
  _PawState? _left, _right;
  double _key = 36;

  GlobalKey _keyFor(String key) => _keyKeys.putIfAbsent(key, GlobalKey.new);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _rest());
  }

  @override
  void dispose() {
    for (final t in _timers) {
      t.cancel();
    }
    super.dispose();
  }

  Rect? _rectOf(String key) {
    final stack = _stackKey.currentContext?.findRenderObject() as RenderBox?;
    final box = _keyKeys[key]?.currentContext?.findRenderObject() as RenderBox?;
    if (stack == null || box == null || !box.attached) return null;
    final topLeft = box.localToGlobal(Offset.zero, ancestor: stack);
    return topLeft & box.size;
  }

  // Лапы лежат на передней панели под пробелом.
  (_PawState, _PawState)? _restPositions() {
    final stack = _stackKey.currentContext?.findRenderObject() as RenderBox?;
    final space = _rectOf(' ');
    if (stack == null || space == null) return null;
    final y = space.bottom + space.height * 1.5;
    return (
      _PawState(Offset(stack.size.width * .3, y), .1),
      _PawState(Offset(stack.size.width * .7, y), -.1),
    );
  }

  void _rest() {
    final rest = _restPositions();
    if (!mounted || rest == null) return;
    setState(() {
      _left = rest.$1;
      _right = rest.$2;
    });
  }

  @override
  void didUpdateWidget(covariant TypewriterView old) {
    super.didUpdateWidget(old);
    final strike = widget.strike;
    if (strike == null || strike.id == old.strike?.id) return;
    final rect = _rectOf(strike.key);
    final rest = _restPositions();
    if (rect == null || rest == null) return;
    final left = strike.key == ' ' ? Random().nextBool() : leftPawFor(strike.key);
    final home = left ? rest.$1 : rest.$2;
    final center = rect.center;
    // Лапа тянется наискосок — чуть наклоняем её к клавише.
    final angle = ((center.dx - home.tip.dx) / 14).clamp(-16, 16) * pi / 180;
    for (final t in _timers) {
      t.cancel();
    }
    _timers.clear();
    _pressed = strike.key;
    final pressedState = _PawState(center + Offset(0, rect.height * .12), angle, pressed: true, resting: false);
    if (left) {
      _left = pressedState;
    } else {
      _right = pressedState;
    }
    _timers
      ..add(Timer(const Duration(milliseconds: 110), () {
        if (!mounted) return;
        setState(() {
          _pressed = null;
          final hover = _PawState(center - Offset(0, rect.height * .35), angle, resting: false);
          if (left) {
            _left = hover;
          } else {
            _right = hover;
          }
        });
      }))
      ..add(Timer(const Duration(milliseconds: 900), _rest));
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      final width = constraints.maxWidth;
      final height = constraints.maxHeight;
      // Самый длинный ряд — 12 клавиш с промежутками и сдвигом, плюс поля корпуса.
      _key = min((width - 16) / 14.6, (height.isFinite ? height : 800) / 13.5).clamp(22.0, 50.0);
      final k = _key;
      return Stack(
        key: _stackKey,
        clipBehavior: Clip.hardEdge,
        children: [
          Column(
            children: [
              Expanded(child: RepaintBoundary(child: _paperWindow(k))),
              _platen(k),
              // На совсем узком экране корпус ужимается целиком, а не режет ряд.
              RepaintBoundary(child: FittedBox(fit: BoxFit.scaleDown, child: _body(k))),
            ],
          ),
          if (_left != null) _paw(_left!, false, k),
          if (_right != null) _paw(_right!, true, k),
        ],
      );
    });
  }

  Widget _paperWindow(double k) {
    final fontSize = k * .46;
    final charWidth = _charWidth(fontSize);
    final lineHeight = fontSize * 1.6;
    final lineLength = (widget.before.isEmpty ? 0 : widget.before.length + 1) + widget.typed.length;
    final style = TextStyle(fontFamily: _font, fontSize: fontSize, height: 1.6, color: _ink);
    final lines = widget.lines.length > 8 ? widget.lines.sublist(widget.lines.length - 8) : widget.lines;
    return LayoutBuilder(builder: (context, constraints) {
      final strikeX = constraints.maxWidth / 2;
      final paperLeft = strikeX - (3 + lineLength) * charWidth;
      return ShaderMask(
        // Верх листа растворяется: он уходит за край, как бумага за валик.
        shaderCallback: (rect) => const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.transparent, Colors.black],
          stops: [0, .42],
        ).createShader(rect),
        blendMode: BlendMode.dstIn,
        child: ClipRect(
          child: Stack(children: [
            AnimatedPositioned(
              duration: Duration(milliseconds: widget.returning ? 420 : 80),
              curve: widget.returning ? Curves.easeOutCubic : Curves.linear,
              left: paperLeft,
              bottom: 0,
              top: 0,
              width: charWidth * 50,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: _paper,
                  boxShadow: const [BoxShadow(color: Color(0x2E000000), blurRadius: 18, offset: Offset(0, 6))],
                  border: Border(left: BorderSide(color: _inkRed.withValues(alpha: .28), width: 1)),
                ),
                child: Padding(
                  padding: EdgeInsets.fromLTRB(charWidth * 3, 0, charWidth, fontSize * .55),
                  child: TweenAnimationBuilder<double>(
                    // Новая строка: лист поднимается на строку, как при переводе каретки.
                    key: ValueKey(widget.lines.length),
                    tween: Tween(begin: lineHeight, end: 0),
                    duration: const Duration(milliseconds: 260),
                    curve: Curves.easeOutCubic,
                    builder: (_, dy, child) => Transform.translate(offset: Offset(0, dy), child: child),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (final line in lines) Text.rich(_printed(line), style: style, softWrap: false),
                        Text.rich(
                          TextSpan(children: [
                            TextSpan(text: widget.before.isEmpty ? '' : '${widget.before} '),
                            TextSpan(text: widget.typed),
                            const TextSpan(text: '_', style: TextStyle(color: _inkRed)),
                            if (widget.after.isNotEmpty)
                              TextSpan(
                                text: widget.after.startsWith('!') || widget.after.startsWith('.') ? widget.after : ' ${widget.after}',
                                style: TextStyle(color: _ink.withValues(alpha: .35)),
                              ),
                          ]),
                          style: style,
                          softWrap: false,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ]),
        ),
      );
    });
  }

  final _charWidths = <double, double>{};
  double _charWidth(double fontSize) => _charWidths.putIfAbsent(fontSize, () {
        final painter = TextPainter(
          text: TextSpan(text: 'M', style: TextStyle(fontFamily: _font, fontSize: fontSize)),
          textDirection: TextDirection.ltr,
        )..layout();
        return painter.width;
      });

  TextSpan _printed(PrintedLine line) {
    final lead = line.before.isEmpty ? '' : '${line.before} ';
    final tail = line.after.isEmpty
        ? ''
        : line.after.startsWith('!') || line.after.startsWith('.')
            ? line.after
            : ' ${line.after}';
    if (line.status == 'wrong') {
      return TextSpan(children: [
        TextSpan(text: lead),
        TextSpan(
          text: line.typed.isEmpty ? '___' : line.typed,
          style: const TextStyle(decoration: TextDecoration.lineThrough, decorationThickness: 2),
        ),
        const TextSpan(text: ' '),
        TextSpan(text: line.correct, style: const TextStyle(color: _inkRed)),
        TextSpan(text: tail),
      ]);
    }
    if (line.status == 'slip') {
      return TextSpan(children: [
        TextSpan(text: lead),
        TextSpan(
          text: line.typed,
          style: const TextStyle(decoration: TextDecoration.underline, decorationStyle: TextDecorationStyle.wavy, decorationColor: _inkRed),
        ),
        TextSpan(text: tail),
        TextSpan(text: '  нужна ${line.missing.join(', ')}', style: const TextStyle(color: _inkRed, fontSize: 12)),
      ]);
    }
    return TextSpan(text: '$lead${line.typed}$tail');
  }

  Widget _platen(double k) {
    return SizedBox(
      height: k * .95,
      child: Stack(clipBehavior: Clip.none, children: [
        Positioned.fill(
          left: k * .5,
          right: k * .5,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF3A3835), Color(0xFF0E0D0C), Color(0xFF24221F)],
                stops: [0, .55, 1],
              ),
              boxShadow: const [BoxShadow(color: Color(0x59000000), blurRadius: 10, offset: Offset(0, 4))],
            ),
          ),
        ),
        for (final left in [true, false])
          Positioned(
            left: left ? 0 : null,
            right: left ? null : 0,
            top: k * .1,
            child: Container(
              width: k * .75,
              height: k * .75,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  center: Alignment(-.3, -.4),
                  colors: [Colors.white, Color(0xFFC4C8CD), Color(0xFF7E8388), Color(0xFF4D5156)],
                  stops: [0, .35, .7, 1],
                ),
              ),
            ),
          ),
        // Рычаг возврата каретки — тоже «напечатать ответ».
        Positioned(
          left: k * .2,
          top: -k * .55,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (_) => widget.onKey('enter'),
            child: AnimatedRotation(
              turns: widget.returning ? -.02 : -.065,
              duration: const Duration(milliseconds: 160),
              alignment: Alignment.centerRight,
              child: Container(
                width: k * 1.5,
                height: k * .34,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xFFF4F5F6), Color(0xFF9EA3A8), Color(0xFF6C7075)],
                  ),
                  boxShadow: const [BoxShadow(color: Color(0x59000000), blurRadius: 6, offset: Offset(0, 3))],
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _body(double k) {
    final gap = k * .16;
    Widget row(List<String> keys, {double indent = 0, Widget? trailing}) => Padding(
          padding: EdgeInsets.only(top: gap * 1.2, left: indent),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final (index, key) in keys.indexed) ...[
                if (index > 0) SizedBox(width: gap),
                _TwKey(
                  key: _keyFor(key),
                  size: k,
                  pressed: _pressed == key,
                  serbian: serbianLetters.contains(key),
                  onTap: () => widget.onKey(key),
                  child: Text(key.toUpperCase(),
                      style: TextStyle(fontFamily: _font, fontWeight: FontWeight.w700, fontSize: k * .4, color: _ink, height: 1)),
                ),
              ],
              if (trailing != null) ...[SizedBox(width: gap), trailing],
            ],
          ),
        );
    return Container(
      padding: EdgeInsets.fromLTRB(k * .3, k * .4, k * .3, k * 1.5),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.vertical(top: Radius.circular(k * 1.1), bottom: Radius.circular(k * .45)),
        gradient: const RadialGradient(
          center: Alignment.topCenter,
          radius: 1.3,
          colors: [Color(0xFF45403A), Color(0xFF1D1A17), Color(0xFF121010)],
          stops: [0, .55, 1],
        ),
        boxShadow: const [BoxShadow(color: Color(0x8C000000), blurRadius: 40, offset: Offset(0, 22), spreadRadius: -12)],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(width: k * 7.5, height: k * 1.05, child: CustomPaint(painter: _BasketPainter())),
          Padding(
            padding: EdgeInsets.only(top: k * .15, bottom: k * .2),
            child: Column(children: [
              Text('ČITAVUK',
                  style: TextStyle(fontFamily: 'Lora', fontWeight: FontWeight.w700, fontSize: k * .36, letterSpacing: k * .12, color: _gold)),
              Text('PISAĆA MAŠINA',
                  style: TextStyle(fontFamily: 'Lora', fontSize: k * .16, letterSpacing: k * .08, color: _gold.withValues(alpha: .7))),
            ]),
          ),
          row(typewriterRows[0]),
          row(typewriterRows[1], indent: k * .4),
          row(typewriterRows[2],
              indent: k * .2,
              trailing: _TwKey(
                key: _keyFor('enter'),
                size: k,
                pressed: _pressed == 'enter',
                onTap: () => widget.onKey('enter'),
                child: Icon(Icons.keyboard_return, size: k * .45, color: _ink),
              )),
          Padding(
            padding: EdgeInsets.only(top: gap * 1.6, left: k * 1.5),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              GestureDetector(
                key: _keyFor(' '),
                onTapDown: (_) => widget.onKey(' '),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 70),
                  width: k * 6.5,
                  height: k * .5,
                  transform: Matrix4.translationValues(0, _pressed == ' ' ? k * .07 : 0, 0),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    gradient: const LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0xFFF7F8F9), Color(0xFFA5AAAF), Color(0xFF6E7378)],
                    ),
                    boxShadow: [BoxShadow(color: const Color(0xFF2A2826), offset: Offset(0, _pressed == ' ' ? 1 : k * .08))],
                  ),
                ),
              ),
              SizedBox(width: k * .5),
              // «Стереть» у пробела: верхний ряд короче — клавиши крупнее.
              _TwKey(
                key: _keyFor('backspace'),
                size: k,
                pressed: _pressed == 'backspace',
                onTap: () => widget.onKey('backspace'),
                child: Icon(Icons.backspace_outlined, size: k * .42, color: _ink),
              ),
            ]),
          ),
        ],
      ),
    );
  }

  Widget _paw(_PawState state, bool right, double k) {
    final width = k * 2.5;
    final height = width * 3;
    return AnimatedPositioned(
      duration: Duration(milliseconds: state.resting ? 380 : 95),
      curve: state.resting ? Curves.easeOutCubic : Curves.easeOut,
      left: state.tip.dx - width * .5,
      top: state.tip.dy - height * .047,
      width: width,
      height: height,
      child: IgnorePointer(
        child: RepaintBoundary(
          child: AnimatedRotation(
            turns: state.angle / (2 * pi),
            duration: const Duration(milliseconds: 95),
            alignment: const Alignment(0, -.9),
            child: AnimatedScale(
              scale: state.pressed ? .93 : 1,
              duration: const Duration(milliseconds: 70),
              alignment: const Alignment(0, -.9),
              child: Transform(
                alignment: Alignment.center,
                transform: Matrix4.diagonal3Values(right ? -1 : 1, 1, 1),
                child: SvgPicture.string(pawSvg, width: width, height: height),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TwKey extends StatelessWidget {
  const _TwKey({
    super.key,
    required this.size,
    required this.pressed,
    required this.onTap,
    required this.child,
    this.serbian = false,
  });

  final double size;
  final bool pressed, serbian;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => onTap(),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 70),
        width: size,
        height: size,
        padding: EdgeInsets.all(size * .085),
        transform: Matrix4.translationValues(0, pressed ? size * .09 : 0, 0),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const SweepGradient(
            colors: [Color(0xFFF7F8F9), Color(0xFF8C9196), Color(0xFFE9EBED), Color(0xFF6E7378), Color(0xFFF7F8F9)],
          ),
          boxShadow: [
            BoxShadow(color: const Color(0xFF2A2826), offset: Offset(0, pressed ? size * .02 : size * .1)),
            BoxShadow(color: const Color(0x8C000000), blurRadius: pressed ? size * .08 : size * .14, offset: Offset(0, pressed ? size * .05 : size * .16)),
          ],
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              center: const Alignment(0, -.4),
              colors: serbian
                  ? const [Color(0xFFFFF6F3), Color(0xFFF4DCD4), Color(0xFFD9B0A3)]
                  : const [Color(0xFFFFFDF6), Color(0xFFF1E7CC), Color(0xFFD9CBA5)],
              stops: const [0, .58, 1],
            ),
          ),
          child: Center(child: child),
        ),
      ),
    );
  }
}

/// Веер рычагов с литерами над клавиатурой.
class _BasketPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height);
    final paint = Paint()
      ..color = const Color(0xFF9CA0A6).withValues(alpha: .8)
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;
    final outer = size.height;
    final inner = size.height * .38;
    for (var i = 0; i <= 32; i++) {
      final angle = pi + pi * i / 32;
      final dir = Offset(cos(angle), sin(angle));
      canvas.drawLine(center + dir * inner, center + Offset(dir.dx * outer * 3.4, dir.dy * outer), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Лапа Читавука — тот же рисунок, что на сайте (web/src/games/cases/Typewriter.tsx).
const pawSvg = '''
<svg viewBox="0 0 120 360" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="fur" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#6b6e79"/><stop offset="0.5" stop-color="#9da1ac"/><stop offset="1" stop-color="#686b76"/></linearGradient>
<linearGradient id="sleeve" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ded6c5"/><stop offset="0.5" stop-color="#fdfaf3"/><stop offset="1" stop-color="#d8cfbd"/></linearGradient>
</defs>
<path d="M13 214 Q6 290 0 360 L120 360 Q114 290 107 214 Z" fill="url(#sleeve)" stroke="#2e2a2f" stroke-width="3.5"/>
<path d="M11 236 L109 236" stroke="#b3261e" stroke-width="6"/>
<path d="M11 250 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l6 8" fill="none" stroke="#b3261e" stroke-width="3" stroke-linejoin="round"/>
<path d="M10 258 L110 258" stroke="#2e2a2f" stroke-width="2.2"/>
<path d="M23 270 l10 10 M33 270 l-10 10 M45 270 l10 10 M55 270 l-10 10 M67 270 l10 10 M77 270 l-10 10 M89 270 l10 10 M99 270 l-10 10" stroke="#b3261e" stroke-width="2.6" stroke-linecap="round"/>
<path d="M13 214 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0 q6 8 12 0" fill="#fdfaf3" stroke="#2e2a2f" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M27 92 Q20 160 17 216 L103 216 Q100 160 93 92 Z" fill="url(#fur)" stroke="#2e2a2f" stroke-width="3.5"/>
<path d="M60 104 Q57 160 58 206" fill="none" stroke="#c4c7cf" stroke-width="7" stroke-linecap="round" opacity="0.55"/>
<path d="M24 140 q-6 4 -3 10 M96 150 q6 4 3 10 M22 180 q-6 5 -2 11" fill="none" stroke="#c4c7cf" stroke-width="3" stroke-linecap="round"/>
<path d="M22 96 q7 -9 14 0 q7 -9 14 0 q7 -9 14 0 q7 -9 14 0 q7 -9 14 0 q6 -8 12 0 L96 106 Q60 116 24 106 Z" fill="#b9bcc5" stroke="#2e2a2f" stroke-width="3" stroke-linejoin="round"/>
<ellipse cx="60" cy="60" rx="45" ry="38" fill="#a8acb6" stroke="#2e2a2f" stroke-width="3.5"/>
<circle cx="27" cy="30" r="14" fill="#c9ccd4" stroke="#2e2a2f" stroke-width="3.5"/><ellipse cx="27" cy="32" rx="6.3" ry="5.3" fill="#e9b7bd"/><path d="M23.5 17 q3.5 -7 7 0" fill="#f4f1ec" stroke="#2e2a2f" stroke-width="2"/>
<circle cx="48" cy="17" r="15" fill="#c9ccd4" stroke="#2e2a2f" stroke-width="3.5"/><ellipse cx="48" cy="19" rx="6.8" ry="5.7" fill="#e9b7bd"/><path d="M44.5 3 q3.5 -7 7 0" fill="#f4f1ec" stroke="#2e2a2f" stroke-width="2"/>
<circle cx="72" cy="17" r="15" fill="#c9ccd4" stroke="#2e2a2f" stroke-width="3.5"/><ellipse cx="72" cy="19" rx="6.8" ry="5.7" fill="#e9b7bd"/><path d="M68.5 3 q3.5 -7 7 0" fill="#f4f1ec" stroke="#2e2a2f" stroke-width="2"/>
<circle cx="93" cy="30" r="14" fill="#c9ccd4" stroke="#2e2a2f" stroke-width="3.5"/><ellipse cx="93" cy="32" rx="6.3" ry="5.3" fill="#e9b7bd"/><path d="M89.5 17 q3.5 -7 7 0" fill="#f4f1ec" stroke="#2e2a2f" stroke-width="2"/>
<path d="M40 72 q20 12 40 0" fill="none" stroke="#7e828d" stroke-width="3" stroke-linecap="round"/>
</svg>
''';
