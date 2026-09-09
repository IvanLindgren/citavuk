import 'dart:async';
import 'package:flutter/material.dart';
import '../services/study_service.dart';
import '../course/widgets/bone_mascot.dart';
import 'wolf_mascot.dart';
import 'stove_icon.dart';

class StudyOverlay extends StatefulWidget {
  const StudyOverlay({super.key, required this.child});
  final Widget child;
  @override
  State<StudyOverlay> createState() => _StudyOverlayState();
}

class _StudyOverlayState extends State<StudyOverlay> with WidgetsBindingObserver {
  late int _seen;
  bool _show = false;
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _seen = StudyService.instance.celebration;
    StudyService.instance.addListener(_changed);
  }

  void _changed() {
    final service = StudyService.instance;
    if (service.snapshot == null) {
      _timer?.cancel();
      if (mounted) setState(() => _show = false);
      return;
    }
    if (service.celebration == _seen) return;
    _seen = service.celebration;
    if (mounted) setState(() => _show = true);
    _timer?.cancel();
    _timer = Timer(const Duration(seconds: 5), () {
      if (mounted) setState(() => _show = false);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(StudyService.instance.refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    StudyService.instance.removeListener(_changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Stack(children: [
        widget.child,
        if (_show)
          Positioned(
              left: 16,
              right: 16,
              bottom: 24,
              child: SafeArea(
                  child: Align(
                      alignment: Alignment.bottomCenter,
                      child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 420),
                          child: Material(
                              elevation: 12,
                              borderRadius: BorderRadius.circular(24),
                              color: Theme.of(context)
                                  .colorScheme
                                  .surfaceContainer,
                              child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Row(children: [
                                          Expanded(
                                              child: Text('Огонь зажжён!',
                                                  style: Theme.of(context)
                                                      .textTheme
                                                      .titleLarge)),
                                          IconButton(
                                              tooltip: 'Закрыть',
                                              onPressed: () =>
                                                  setState(() => _show = false),
                                              icon: const Icon(Icons.close))
                                        ]),
                                        StoveMoment(key: ValueKey(_seen)),
                                        Text(
                                            'Твоя серия: ${StudyService.instance.snapshot?['current'] ?? 1} дн.',
                                            style: Theme.of(context)
                                                .textTheme
                                                .titleMedium),
                                      ])))))))
      ]);
}

class StoveMoment extends StatefulWidget {
  const StoveMoment({super.key});
  @override
  State<StoveMoment> createState() => _StoveMomentState();
}

class _StoveMomentState extends State<StoveMoment>
    with SingleTickerProviderStateMixin {
  late final AnimationController _motion = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1800));
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _motion.value = 1;
    } else if (_motion.value == 0) {
      _motion.forward();
    }
  }

  @override
  void dispose() {
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
      height: 170,
      child: Stack(alignment: Alignment.bottomCenter, children: [
        Positioned(
            left: 4,
            bottom: 0,
            child: SizedBox(
                width: 155,
                height: 170,
                child: BoneMascot(
                    reaction: 'stoke',
                    height: 170,
                    fallback: Image.asset(Wolf.zdravo)))),
        Positioned(
            right: 30,
            bottom: 10,
            child: AnimatedBuilder(
                animation: _motion,
                builder: (context, child) {
                  final glow = ((_motion.value - .4) / .4).clamp(0.0, 1.0);
                  return Stack(alignment: Alignment.center, children: [
                    Container(
                        width: 130,
                        height: 130,
                        decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(colors: [
                              Colors.amber.withValues(alpha: .32 * glow),
                              Colors.transparent
                            ]))),
                    Opacity(opacity: .3 + .7 * glow, child: child!),
                    if (glow > 0)
                      Positioned(
                          top: 8,
                          right: 18,
                          child: Icon(Icons.auto_awesome,
                              color: Colors.amber.withValues(alpha: glow),
                              size: 24))
                  ]);
                },
                child: const StoveIcon(size: 100))),
      ]));
}

class StudyStatsPanel extends StatelessWidget {
  const StudyStatsPanel({super.key, this.data});
  final Map<String, dynamic>? data;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
      listenable: StudyService.instance,
      builder: (context, _) {
        final s = StudyService.instance.snapshot ?? data;
        if (s == null) return const SizedBox.shrink();
        final days = (s['days'] as List? ?? []).whereType<Map>().toList();
        final recent = days.length > 60 ? days.sublist(days.length - 60) : days;
        return Card(
            child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Твоя серия',
                          style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 12),
                      Wrap(spacing: 18, runSpacing: 10, children: [
                        Text('Сейчас: ${s['current']} дн.'),
                        Text('Рекорд: ${s['longest']} дн.'),
                        Text('Занятий по дням: ${s['activeDays']}'),
                        Text('Заморозки: ${s['freezes']} из 2')
                      ]),
                      const SizedBox(height: 12),
                      Text(
                          'Часовой пояс: ${s['timezone']}. Заморозка сохраняет серию, но не добавляет день занятий.'),
                      const SizedBox(height: 12),
                      Wrap(
                          spacing: 5,
                          runSpacing: 5,
                          children: recent
                              .map((d) => Tooltip(
                                  message:
                                      '${d['date']}: ${d['kind'] == 'frozen' ? 'заморозка' : 'занятие'}',
                                  child: Icon(
                                      d['kind'] == 'frozen'
                                          ? Icons.ac_unit
                                          : Icons.local_fire_department,
                                      size: 20,
                                      color: d['kind'] == 'frozen'
                                          ? Colors.lightBlue
                                          : Theme.of(context)
                                              .colorScheme
                                              .primary)))
                              .toList()),
                    ])));
      });
}
