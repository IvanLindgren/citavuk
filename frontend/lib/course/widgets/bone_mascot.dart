import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class _RigData {
  _RigData(this.json, this.image) {
    for (final bone in (json['bones'] as List).cast<Map<String, dynamic>>()) {
      children.putIfAbsent(bone['parent'] as String?, () => []).add(bone);
    }
    for (final part in (json['parts'] as List).cast<Map<String, dynamic>>()) {
      final rect = (part['rect'] as List).cast<num>();
      final path = Path();
      final outline = part['outline'] as List;
      for (var i = 0; i < outline.length; i++) {
        final p = outline[i] as List;
        final x = (p[0] as num) * rect[2] / 100,
            y = (p[1] as num) * rect[3] / 100;
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      paths.add(path..close());
    }
  }
  final Map<String, dynamic> json;
  final ui.Image image;
  final children = <String?, List<Map<String, dynamic>>>{};
  final paths = <Path>[];
  static Future<_RigData>? _pending;
  static Future<_RigData> load() => _pending ??= _load();
  static Future<_RigData> _load() async {
    final json =
        jsonDecode(await rootBundle.loadString('assets/course/mascot_rig.json'))
            as Map<String, dynamic>;
    final bytes = await rootBundle.load('assets/imgs/${json['atlas']}');
    final codec = await ui.instantiateImageCodec(bytes.buffer.asUint8List());
    try {
      return _RigData(json, (await codec.getNextFrame()).image);
    } finally {
      codec.dispose();
    }
  }
}

/// Один контроллер на весь скелет; контуры кешируются на приложение.
class BoneMascot extends StatefulWidget {
  static Future<void> precache() async {
    await _RigData.load();
  }

  const BoneMascot(
      {super.key,
      required this.reaction,
      required this.height,
      required this.fallback,
      this.still = false,
      this.onCompleted});
  final String reaction;
  final double height;
  final Widget fallback;
  final bool still;
  final VoidCallback? onCompleted;
  @override
  State<BoneMascot> createState() => _BoneMascotState();
}

class _BoneMascotState extends State<BoneMascot>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _motion = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1600));
  late final Future<_RigData> _data = _RigData.load();
  bool _started = false;
  bool _muted = true;
  bool _background = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _motion.addStatusListener((status) {
      if (status == AnimationStatus.completed &&
          !_muted &&
          widget.reaction != 'thinking') {
        widget.onCompleted?.call();
      }
    });
  }

  void _sync({bool restart = false}) {
    final wasMuted = _muted;
    _muted = _background ||
        widget.still ||
        MediaQuery.disableAnimationsOf(context) ||
        !TickerMode.valuesOf(context).enabled ||
        widget.reaction == 'idle';
    if (_muted) {
      _motion.stop();
      _motion.value = 1;
    } else if (!_started || restart || wasMuted) {
      if (widget.reaction == 'thinking') {
        _motion.repeat(period: const Duration(milliseconds: 3200));
      } else {
        _motion.forward(from: 0);
      }
    }
    _started = true;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(BoneMascot oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync(restart: oldWidget.reaction != widget.reaction);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _background = state != AppLifecycleState.resumed;
    _sync();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: widget.height * .8,
        height: widget.height,
        child: FutureBuilder<_RigData>(
            future: _data,
            builder: (context, snapshot) {
              if (!snapshot.hasData) return widget.fallback;
              return Semantics(
                  image: true,
                  label: 'Читавук',
                  child: RepaintBoundary(
                      child: CustomPaint(
                          painter: _BonePainter(
                              snapshot.data!, _motion, widget.reaction))));
            }),
      );
}

class _BonePainter extends CustomPainter {
  _BonePainter(this.data, this.motion, this.reaction) : super(repaint: motion);
  final _RigData data;
  final Animation<double> motion;
  final String reaction;
  double sample(List<double> values) {
    final p = motion.value * (values.length - 1);
    final i = p.floor().clamp(0, values.length - 2);
    final t = (p - i).clamp(0.0, 1.0);
    final a = values[i], b = values[i + 1];
    final m0 = i == 0 ? 0.0 : (b - values[i - 1]) / 2;
    final m1 = i + 2 >= values.length ? 0.0 : (values[i + 2] - a) / 2;
    return (2 * t * t * t - 3 * t * t + 1) * a +
        (t * t * t - 2 * t * t + t) * m0 +
        (-2 * t * t * t + 3 * t * t) * b +
        (t * t * t - t * t) * m1;
  }

  bool get happy => [
        'correct',
        'lessonComplete',
        'finalCelebration',
        'checkpoint'
      ].contains(reaction);
  double angle(String id) {
    if (reaction == 'stoke') {
      return sample(switch (id) {
            'body' => [0, 0, 10, 10, 0],
            'head' => [0, 10, 18, 12, 0],
            'armR' => [0, -35, -95, -95, -15, 0],
            'forearmR' => [0, 15, 30, 30, 0],
            'tail' => [0, -10, 5, 0],
            _ => [0, 0]
          }) *
          math.pi /
          180;
    }
    final thinking = reaction == 'thinking';
    return sample(switch (id) {
          'head' => happy
              ? [0, 7, -12, 5, -6, 0]
              : [0, thinking ? 14 : -12, thinking ? 14 : -6, 0],
          'earL' => happy ? [0, 8, 8, -22, 10, -5, 0] : [0, 18, 12, 0],
          'earR' => happy ? [0, -8, -8, 18, -12, 5, 0] : [0, -12, -18, 0],
          'armL' => happy
              ? [0, -12, 125, 85, 125, 25, 0]
              : [0, thinking ? 15 : 40, thinking ? 15 : 32, 0],
          'armR' => happy
              ? [0, 12, -70, -120, -85, -25, 0]
              : [0, thinking ? -145 : -25, thinking ? -138 : -35, 0],
          'tail' =>
            happy ? [0, 0, 24, -18, 26, -16, 15, -8, 0] : [0, -12, 8, 0],
          'legL' => happy ? [0, 8, -12, 0] : [0, 0],
          'forearmL' => happy
              ? [0, -15, -48, -30, -55, -12, 0]
              : [0, thinking ? -10 : -45, -20, 0],
          'forearmR' => happy
              ? [0, 12, 45, 65, 35, 10, 0]
              : [0, thinking ? 80 : 40, thinking ? 75 : 20, 0],
          'legR' => happy ? [0, -8, 12, 0] : [0, 0],
          _ => [0, 0],
        }) *
        math.pi /
        180;
  }

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 400, size.height / 500);
    void draw(Map<String, dynamic> bone) {
      canvas.save();
      canvas.translate(
          (bone['x'] as num).toDouble(), (bone['y'] as num).toDouble());
      canvas.scale((bone['scale'] as num?)?.toDouble() ?? 1);
      if (bone['id'] == 'body' && happy) {
        canvas.translate(0, sample([0, 12, -35, -20, 5, -8, 0]));
      }
      canvas.rotate(angle(bone['id'] as String) +
          ((bone['rotation'] as num?)?.toDouble() ?? 0) * math.pi / 180);
      if (bone['id'] == 'body' && happy) {
        final squash = sample([1, .92, 1.06, 1.02, .96, 1]);
        canvas.scale(1 / math.sqrt(squash), squash);
      }
      if (bone['part'] != null) {
        final part = (data.json['parts'] as List)[bone['part'] as int]
            as Map<String, dynamic>;
        final src = (part['rect'] as List).cast<num>();
        final dst = (bone['rect'] as List).cast<num>();
        canvas.save();
        canvas.translate(dst[0].toDouble(), dst[1].toDouble());
        canvas.scale(dst[2] / src[2], dst[3] / src[3]);
        if (bone['mirror'] == true) {
          canvas.translate(src[2].toDouble(), 0);
          canvas.scale(-1, 1);
        }
        canvas.clipPath(data.paths[bone['part'] as int]);
        canvas.drawImageRect(
            data.image,
            Rect.fromLTWH(src[0].toDouble(), src[1].toDouble(),
                src[2].toDouble(), src[3].toDouble()),
            Rect.fromLTWH(0, 0, src[2].toDouble(), src[3].toDouble()),
            Paint()..filterQuality = FilterQuality.medium);
        canvas.restore();
      }
      _face(canvas, bone['id'] as String);
      for (final child
          in data.children[bone['id']] ?? const <Map<String, dynamic>>[]) {
        draw(child);
      }
      canvas.restore();
    }

    for (final bone in data.children[null] ?? const <Map<String, dynamic>>[]) {
      draw(bone);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_BonePainter old) =>
      old.data != data || old.reaction != reaction || old.motion != motion;

  void _face(Canvas canvas, String id) {
    const ink = Color(0xff342735);
    final thinking = reaction == 'thinking';
    void oval(double x, double y, double rx, double ry, Color color) =>
        canvas.drawOval(
            Rect.fromCenter(
                center: Offset(x, y), width: rx * 2, height: ry * 2),
            Paint()..color = color);
    void stroke(Path path, [double width = 3]) => canvas.drawPath(
        path,
        Paint()
          ..color = ink
          ..style = PaintingStyle.stroke
          ..strokeWidth = width
          ..strokeCap = StrokeCap.round);
    if (id == 'eyeL' || id == 'eyeR') {
      stroke(
          Path()
            ..moveTo(-16, -34)
            ..quadraticBezierTo(
                0,
                happy
                    ? -42
                    : thinking
                        ? -40
                        : reaction == 'incorrect'
                            ? -43
                            : -38,
                16,
                -34),
          3.5);
      canvas.save();
      canvas.scale(
          1,
          sample(id == 'eyeL' && happy
                  ? [1, 1, .08, 1, .08, 1, 1]
                  : [1, .08, 1, 1, 1, 1, 1])
              .clamp(.06, 1.0));
      oval(0, 0, 18, 26, const Color(0xfffff6eb));
      canvas.translate(thinking ? 5 : 0, thinking ? -4 : 0);
      oval(0, 0, 13, 22, const Color(0xff251f30));
      oval(0, 11, 10, 8, const Color(0xff514052));
      oval(4, -8, 6, 8, Colors.white);
      oval(-5, 7, 3, 3, Colors.white);
      canvas.restore();
    }
    if (id == 'mouth') {
      if (happy) {
        final mouth = Path()
          ..moveTo(-19, -4)
          ..quadraticBezierTo(0, 4, 19, -4)
          ..quadraticBezierTo(14, 26, 0, 27)
          ..quadraticBezierTo(-14, 26, -19, -4)
          ..close();
        canvas.drawPath(mouth, Paint()..color = const Color(0xff642e3b));
        stroke(mouth, 2.5);
        final teeth = Path()
          ..moveTo(-14, -2)
          ..quadraticBezierTo(0, 4, 14, -2)
          ..lineTo(11, 5)
          ..quadraticBezierTo(0, 9, -11, 5)
          ..close();
        canvas.drawPath(teeth, Paint()..color = const Color(0xfffff6eb));
        oval(0, 20, 9, 5, const Color(0xffed7d86));
      } else if (thinking) {
        oval(0, 0, 6, 8, const Color(0xff642e3b));
      } else {
        stroke(reaction == 'incorrect'
            ? (Path()
              ..moveTo(-17, 6)
              ..quadraticBezierTo(0, -4, 17, 6))
            : (Path()
              ..moveTo(-17, 0)
              ..quadraticBezierTo(-8, 13, 0, 6)
              ..quadraticBezierTo(8, 13, 17, 0)));
      }
    }
  }
}
