import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/radio_service.dart';
import '../state/app_settings.dart';
import 'wolf_mascot.dart';

/// Анимированный «эквалайзер» из трёх столбиков — индикатор проигрывания.
class EqualizerBars extends StatefulWidget {
  final Color color;
  final double height;
  final bool active;
  const EqualizerBars({
    super.key,
    required this.color,
    this.height = 18,
    this.active = true,
  });

  @override
  State<EqualizerBars> createState() => _EqualizerBarsState();
}

class _EqualizerBarsState extends State<EqualizerBars>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
        ..repeat();

  @override
  void didUpdateWidget(covariant EqualizerBars old) {
    super.didUpdateWidget(old);
    if (widget.active && !_c.isAnimating) _c.repeat();
    if (!widget.active && _c.isAnimating) _c.stop();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const phases = [0.0, 0.35, 0.7];
    return SizedBox(
      height: widget.height,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final p in phases) ...[
            AnimatedBuilder(
              animation: _c,
              builder: (context, _) {
                final t = (_c.value + p) % 1.0;
                final wave = 0.35 + 0.65 * (0.5 - (t - 0.5).abs()) * 2;
                final h = widget.active ? widget.height * wave : widget.height * 0.3;
                return Container(
                  width: 3.5,
                  height: h.clamp(2.0, widget.height),
                  decoration: BoxDecoration(
                    color: widget.color,
                    borderRadius: BorderRadius.circular(2),
                  ),
                );
              },
            ),
            const SizedBox(width: 3),
          ],
        ],
      ),
    );
  }
}

/// Кнопка радио для AppBar: иконка отражает состояние, тап открывает панель.
class RadioAppBarButton extends StatelessWidget {
  const RadioAppBarButton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: RadioService.instance,
      builder: (context, _) {
        final radio = RadioService.instance;
        final on = radio.playing;
        return IconButton(
          tooltip: 'Музыка для чтения',
          onPressed: () => showRadioSheet(context),
          icon: on
              ? const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 2),
                  child: EqualizerBars(color: Colors.white, height: 18),
                )
              : Icon(radio.loading ? Icons.hourglass_top : Icons.headphones),
        );
      },
    );
  }
}

Future<void> showRadioSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const RadioControlSheet(),
  );
}

/// Панель управления радио: станция, громкость, play/stop.
class RadioControlSheet extends StatelessWidget {
  const RadioControlSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final settings = context.read<AppSettings>();
    final radio = RadioService.instance;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 26),
      child: ListenableBuilder(
        listenable: radio,
        builder: (context, _) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: scheme.onSurface.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  const Text('🎧', style: TextStyle(fontSize: 22)),
                  const SizedBox(width: 8),
                  Text('Радио для чтения',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: scheme.onSurface)),
                  const Spacer(),
                  if (radio.playing)
                    EqualizerBars(color: scheme.primary, height: 20),
                ],
              ),
              const SizedBox(height: 4),
              Text('Может быть, с музыкой вам будет легче сосредоточиться? Здесь можно выбрать станцию с lo-fi и эмбиентом и отрегулировать громкость.',
                  style: TextStyle(
                      fontSize: 13,
                      color: scheme.onSurface.withValues(alpha: 0.65))),
              const SizedBox(height: 16),

              // Главная кнопка play/stop.
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    backgroundColor:
                        radio.playing ? scheme.surfaceContainerHighest : scheme.primary,
                    foregroundColor:
                        radio.playing ? scheme.onSurface : scheme.onPrimary,
                  ),
                  icon: radio.loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : Icon(radio.playing ? Icons.stop_rounded : Icons.play_arrow_rounded),
                  label: Text(radio.loading
                      ? 'Подключаюсь…'
                      : radio.playing
                          ? 'Остановить'
                          : 'Включить ${radio.station.emoji} ${radio.station.name}'),
                  onPressed: () async {
                    final wantOn = !(radio.playing || radio.loading);
                    await radio.toggle();
                    await settings.setMusic(enabled: wantOn);
                  },
                ),
              ),
              if (radio.error != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.error_outline, size: 16, color: scheme.error),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(radio.error!,
                          style: TextStyle(fontSize: 12, color: scheme.error)),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 18),
              Text('Станция',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: scheme.onSurface.withValues(alpha: 0.7))),
              const SizedBox(height: 8),
              ...List.generate(RadioService.stations.length, (i) {
                final s = RadioService.stations[i];
                final selected = i == radio.stationIndex;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () async {
                      await radio.setStation(i);
                      await settings.setMusic(station: i);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: selected
                            ? scheme.primary.withValues(alpha: 0.12)
                            : scheme.onSurface.withValues(alpha: 0.03),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: selected
                              ? scheme.primary
                              : scheme.onSurface.withValues(alpha: 0.12),
                          width: selected ? 1.5 : 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Text(s.emoji, style: const TextStyle(fontSize: 20)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(s.name,
                                    style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: selected
                                            ? scheme.primary
                                            : scheme.onSurface)),
                                Text(s.genre,
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: scheme.onSurface
                                            .withValues(alpha: 0.6))),
                              ],
                            ),
                          ),
                          if (selected && radio.playing)
                            EqualizerBars(color: scheme.primary, height: 16)
                          else if (selected)
                            Icon(Icons.check_circle,
                                size: 18, color: scheme.primary),
                        ],
                      ),
                    ),
                  ),
                );
              }),
              const SizedBox(height: 10),
              Row(
                children: [
                  Icon(Icons.volume_down,
                      size: 20, color: scheme.onSurface.withValues(alpha: 0.6)),
                  Expanded(
                    child: Slider(
                      value: radio.volume,
                      onChanged: (v) async {
                        await radio.setVolume(v);
                        await settings.setMusic(volume: v);
                      },
                    ),
                  ),
                  Icon(Icons.volume_up,
                      size: 20, color: scheme.onSurface.withValues(alpha: 0.6)),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Первый вопрос: «любишь читать с музыкой?». Показывается один раз.
Future<void> showMusicPrompt(BuildContext context) async {
  final settings = context.read<AppSettings>();
  final yes = await showDialog<bool>(
    context: context,
    builder: (ctx) {
      final scheme = Theme.of(ctx).colorScheme;
      return AlertDialog(
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const WolfSticker(asset: Wolf.gram, size: 120),
            const SizedBox(height: 14),
            Text('Читаем с музыкой?',
                style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.bold,
                    color: scheme.onSurface)),
            const SizedBox(height: 8),
            Text(
              'Могу включить lofi-музыку для чтения, ведь многим так '
              'легче сосредоточиться. Включить можно и потом кнопкой 🎧 сверху (И поменять стиль музыки).',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 14, color: scheme.onSurface.withValues(alpha: 0.75)),
            ),
          ],
        ),
        actionsAlignment: MainAxisAlignment.spaceBetween,
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Нет, в тишине'),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.pop(ctx, true),
            icon: const Icon(Icons.play_arrow_rounded),
            label: const Text('Да, включить'),
          ),
        ],
      );
    },
  );

  await settings.setMusicPrompted(true);
  if (yes == true) {
    RadioService.instance.configure(
        stationIndex: settings.musicStation, volume: settings.musicVolume);
    await settings.setMusic(enabled: true);
    await RadioService.instance.play();
  }
}
