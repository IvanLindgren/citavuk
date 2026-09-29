import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'genre_icon.dart';
import 'speaking_models.dart';

const _rowHeight = 76.0;
const _spinDuration = Duration(milliseconds: 3600);
const _filler = 26;

/// Барабан тем: вертикальная лента, которая раскручивается и плавно
/// останавливается на выпавшей теме. Тему выбирает экран — барабан только
/// показывает её (парная реализация: `web/src/games/speaking/Reel.tsx`).
class TopicReel extends StatefulWidget {
  const TopicReel({
    super.key,
    required this.pool,
    required this.catalog,
    required this.spinId,
    required this.target,
    required this.onLanded,
  });

  final List<SpeakingTopic> pool;
  final SpeakingCatalog catalog;

  /// Каждое новое значение запускает вращение к [target].
  final int spinId;
  final SpeakingTopic? target;
  final VoidCallback onLanded;

  @override
  State<TopicReel> createState() => _TopicReelState();
}

class _TopicReelState extends State<TopicReel> with SingleTickerProviderStateMixin {
  final _random = Random();
  late final AnimationController _controller = AnimationController(vsync: this, duration: _spinDuration);
  late List<SpeakingTopic> _strip;
  double _row = 2;
  int _finalRow = 0;
  int _landed = -1;
  int _lastRow = 1;

  @override
  void initState() {
    super.initState();
    _strip = widget.pool.isEmpty ? [] : List.generate(5, (_) => _pick());
    _controller.addListener(_onFrame);
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) _finish();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  SpeakingTopic _pick([SpeakingTopic? not]) {
    final pool = widget.pool;
    for (var i = 0; i < 8; i++) {
      final item = pool[_random.nextInt(pool.length)];
      if (item != not || pool.length == 1) return item;
    }
    return pool.first;
  }

  @override
  void didUpdateWidget(covariant TopicReel old) {
    super.didUpdateWidget(old);
    if (widget.spinId != old.spinId && widget.spinId > 0 && widget.target != null && widget.pool.isNotEmpty) {
      _start(widget.target!);
    }
  }

  void _start(SpeakingTopic target) {
    final current = _strip.isEmpty ? null : _strip[_row.round().clamp(0, _strip.length - 1)];
    final next = <SpeakingTopic>[_pick(), current ?? _pick()];
    for (var i = 0; i < _filler; i++) {
      next.add(_pick(next.last));
    }
    _finalRow = next.length;
    next
      ..add(target)
      ..add(_pick(target))
      ..add(_pick());
    setState(() {
      _strip = next;
      _landed = -1;
      _row = 1;
      _lastRow = 1;
    });
    if (MediaQuery.disableAnimationsOf(context)) {
      // Мы внутри сборки родителя: его setState отложен до конца кадра.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _finish();
      });
      return;
    }
    _controller.forward(from: 0);
  }

  void _onFrame() {
    if (!_controller.isAnimating) return;
    final t = Curves.easeOutQuart.transform(_controller.value);
    final row = 1 + (_finalRow - 1) * t;
    final crossed = row.round();
    if (crossed != _lastRow) {
      _lastRow = crossed;
      HapticFeedback.selectionClick();
    }
    setState(() => _row = row);
  }

  void _finish() {
    setState(() {
      _row = _finalRow.toDouble();
      _landed = _finalRow;
    });
    HapticFeedback.mediumImpact();
    widget.onLanded();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final surface = scheme.surfaceContainerLow;
    final idle = widget.spinId == 0;
    final landed = _landed >= 0;
    return Semantics(
      label: landed && widget.target != null ? 'Выпала тема: ${widget.target!.ru}' : 'Барабан тем',
      child: ExcludeSemantics(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Container(
            height: _rowHeight * 3,
            decoration: BoxDecoration(
              color: surface,
              border: Border.all(color: scheme.outlineVariant),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Stack(
              children: [
                Positioned.fill(
                  child: OverflowBox(
                    alignment: Alignment.topCenter,
                    minHeight: 0,
                    maxHeight: _strip.length * _rowHeight,
                    child: Transform.translate(
                      offset: Offset(0, -(_row - 1) * _rowHeight),
                      child: Column(
                        children: [
                          for (final (index, topic) in _strip.indexed)
                            Opacity(
                              opacity: idle || (landed && index != _landed) ? .6 : 1,
                              child: _TopicRow(topic: topic, genre: widget.catalog.genre(topic.genre)),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 8,
                  right: 8,
                  top: _rowHeight,
                  height: _rowHeight,
                  child: IgnorePointer(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 300),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        color: landed ? scheme.primary.withValues(alpha: .06) : null,
                        border: Border.all(color: landed ? scheme.primary : scheme.outlineVariant, width: 2),
                      ),
                    ),
                  ),
                ),
                for (final top in [true, false])
                  Positioned(
                    left: 0,
                    right: 0,
                    top: top ? 0 : null,
                    bottom: top ? null : 0,
                    height: 70,
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: top ? Alignment.topCenter : Alignment.bottomCenter,
                            end: top ? Alignment.bottomCenter : Alignment.topCenter,
                            colors: [surface, surface.withValues(alpha: 0)],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TopicRow extends StatelessWidget {
  const _TopicRow({required this.topic, required this.genre});
  final SpeakingTopic topic;
  final SpeakingGenre? genre;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      height: _rowHeight,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: theme.colorScheme.outlineVariant),
              ),
              child: GenreIcon(genre: genre, size: 24, color: theme.colorScheme.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (genre?.ru ?? '').toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w800,
                      letterSpacing: .4,
                    ),
                  ),
                  Text(
                    topic.ru,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600, height: 1.25),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
