import 'dart:math' as math;
import 'package:flutter/material.dart';

String personalSuit(String kind) => switch (kind) {
      'reading' || 'writing' => '♠',
      'grammar' => '♣',
      'listening' => '♥',
      _ => '♦',
    };

/// Статические скачанные спрайты переиспользуются всей колодой.
/// Двигается только световой слой выбранной карты, без постоянного цикла.
class PersonalPlayingCard extends StatefulWidget {
  const PersonalPlayingCard(
      {super.key,
      required this.day,
      required this.month,
      required this.title,
      required this.subtitle,
      required this.kind,
      required this.ready,
      required this.today,
      required this.onTap});
  final int day, month;
  final String title, subtitle, kind;
  final bool ready, today;
  final VoidCallback onTap;
  @override
  State<PersonalPlayingCard> createState() => _PersonalPlayingCardState();
}

class _PersonalPlayingCardState extends State<PersonalPlayingCard>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final _shine = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1400));
  bool _shown = false, _allowed = false, _foreground = true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _allowed = !MediaQuery.disableAnimationsOf(context) &&
        TickerMode.valuesOf(context).enabled;
    if (!_allowed) {
      _shine.stop();
      _shine.value = 1;
    } else if (!_shown && widget.today && widget.ready) {
      _shown = true;
      _shine.forward(from: 0);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (!_foreground) {
      _shine.stop();
      _shine.value = 1;
    }
  }

  void _flash() {
    if (_allowed && _foreground && !_shine.isAnimating) {
      _shine.forward(from: 0);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _shine.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const gold = Color(0xffeed399), text = Color(0xfffff3dc);
    final kind = switch (widget.kind) {
      'reading' => 'Чтение',
      'grammar' => 'Грамматика',
      'listening' => 'Понимание речи',
      'writing' => 'Письмо',
      _ => 'Лексика'
    };
    Widget index() => Column(mainAxisSize: MainAxisSize.min, children: [
          Text('${widget.day}',
              style: const TextStyle(
                  fontFamily: 'Prata',
                  fontSize: 24,
                  fontWeight: FontWeight.w400,
                  height: 1.05,
                  color: gold)),
          Text(personalSuit(widget.kind),
              style: const TextStyle(fontSize: 22, color: gold, height: 1.15)),
        ]);
    final surface = RepaintBoundary(
        child: Stack(fit: StackFit.expand, children: [
      DecoratedBox(
          decoration: BoxDecoration(
              gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: widget.ready
                      ? const [Color(0xff233852), Color(0xff111e33)]
                      : const [
                          Color(0xffa44849),
                          Color(0xff752b37),
                          Color(0xff341e34)
                        ]))),
      if (widget.ready)
        Positioned.fill(
            left: 10,
            top: 10,
            right: 10,
            bottom: 10,
            child: Image.network(
                'https://citavuk.ru/personal/months/${widget.month.toString().padLeft(2, '0')}.webp',
                fit: BoxFit.cover,
                alignment: const Alignment(0, -.04),
                cacheWidth: 600,
                errorBuilder: (_, error, stack) => const SizedBox.shrink())),
      if (widget.ready)
        const DecoratedBox(
            decoration: BoxDecoration(
                gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
              Color(0xbf101e35),
              Color(0x00101e35),
              Color(0x00101e35),
              Color(0xf0101e35),
              Color(0xff101e35)
            ],
                    stops: [
              0,
              .3,
              .47,
              .8,
              1
            ]))),
      if (!widget.ready)
        Align(
            alignment: const Alignment(0, -.05),
            child: FractionallySizedBox(
                widthFactor: .58,
                heightFactor: .37,
                child: Image.asset('assets/imgs/card_ravanica_medallion.png',
                    fit: BoxFit.contain))),
      Positioned.fill(
          child: IgnorePointer(
              child: Image.asset('assets/imgs/card_engraved_frame.png',
                  fit: BoxFit.fill))),
      Positioned(left: 25, top: 30, child: index()),
      Positioned(
          right: 25,
          bottom: 29,
          child: RotatedBox(quarterTurns: 2, child: index())),
      Positioned(
          top: 40,
          left: 66,
          right: 36,
          child: Text(kind,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: text, fontSize: 11, fontWeight: FontWeight.w700))),
      Positioned(
          bottom: 35,
          left: 31,
          right: 61,
          child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                    widget.today && widget.ready
                        ? 'ТВОЯ КАРТА СЕГОДНЯ'
                        : widget.ready
                            ? 'ОТКРЫТАЯ КАРТА'
                            : 'ВПЕРЕДИ НОВОЕ ОТКРЫТИЕ',
                    style: const TextStyle(
                        color: gold,
                        fontSize: 9,
                        height: 1.3,
                        letterSpacing: .4,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(widget.title,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontFamily: 'Prata',
                        color: text,
                        fontSize: 20,
                        height: 1.24,
                        fontWeight: FontWeight.w400)),
                const SizedBox(height: 10),
                Text(
                    widget.ready
                        ? (widget.subtitle.startsWith('Пройдено')
                            ? widget.subtitle
                            : 'Открыть карту')
                        : 'Закрыта',
                    maxLines: 2,
                    style: const TextStyle(
                        color: gold,
                        fontSize: 12,
                        fontWeight: FontWeight.w600)),
              ])),
      const IgnorePointer(
          child: DecoratedBox(
              decoration: BoxDecoration(
                  gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
            Color(0x00ffffff),
            Color(0x20fff6df),
            Color(0x02ffffff),
            Color(0x00ffffff)
          ],
                      stops: [
            .1,
            .28,
            .43,
            .57
          ])))),
      if (widget.today && widget.ready) ...[
        Positioned(
            top: -50,
            right: -50,
            child: IgnorePointer(
                child: Opacity(
                    opacity: .2,
                    child: Image.asset('assets/imgs/card_glow.png',
                        width: 190, height: 190)))),
        Positioned(
            top: -7,
            right: 2,
            child: IgnorePointer(
                child: Image.asset('assets/imgs/card_glint.png',
                    width: 66, height: 66))),
      ],
    ]));
    return Semantics(
        button: true,
        enabled: widget.ready,
        label:
            'Карта ${widget.day}. ${widget.title}. ${widget.ready ? widget.subtitle : 'Закрыта'}',
        excludeSemantics: true,
        child: DecoratedBox(
            decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: gold),
                boxShadow: [
                  const BoxShadow(
                      color: Color(0x4823182b),
                      offset: Offset(0, 10),
                      blurRadius: 22),
                  if (widget.today && widget.ready)
                    const BoxShadow(
                        color: Color(0x66eab859),
                        blurRadius: 25,
                        spreadRadius: 3)
                ]),
            child: ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                        onTap: widget.ready ? widget.onTap : null,
                        onTapDown: widget.ready ? (_) => _flash() : null,
                        onHover: (hover) {
                          if (hover) {
                            _flash();
                          }
                        },
                        onFocusChange: (focus) {
                          if (focus) {
                            _flash();
                          }
                        },
                        child: LayoutBuilder(
                            builder: (context, box) => AnimatedBuilder(
                                animation: _shine,
                                child: surface,
                                builder: (context, child) {
                                  final t = _shine.value;
                                  return Stack(fit: StackFit.expand, children: [
                                    child!,
                                    if (t > 0 && t < 1)
                                      Positioned(
                                          left: box.maxWidth * (t * 2.4 - 1.1),
                                          top: -box.maxHeight * .4,
                                          child: IgnorePointer(
                                              child: Opacity(
                                                  opacity:
                                                      math.sin(t * math.pi) *
                                                          .55,
                                                  child: Transform.rotate(
                                                      angle: -.35,
                                                      child: Image.asset(
                                                          'assets/imgs/card_flare.png',
                                                          width:
                                                              box.maxWidth * .9,
                                                          height:
                                                              box.maxHeight *
                                                                  1.8,
                                                          fit: BoxFit.fill))))),
                                  ]);
                                })))))));
  }
}
