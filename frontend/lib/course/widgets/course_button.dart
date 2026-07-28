/// Объёмная кнопка курса.
///
/// У кнопки есть «подошва» — тёмная полоска снизу, которая исчезает при
/// нажатии, и кнопка визуально вдавливается. Это даёт физический отклик без
/// звука и анимации, поэтому работает и при отключённых анимациях.
library;

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

enum CourseButtonTone { primary, neutral, success, danger }

class CourseButton extends StatefulWidget {
  const CourseButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.tone = CourseButtonTone.primary,
    this.expand = true,
  });

  final String label;

  /// null — кнопка неактивна.
  final VoidCallback? onPressed;
  final IconData? icon;
  final CourseButtonTone tone;
  final bool expand;

  @override
  State<CourseButton> createState() => _CourseButtonState();
}

class _CourseButtonState extends State<CourseButton> {
  bool _pressed = false;

  /// Высота «подошвы» в спокойном состоянии.
  static const double _depth = 4;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final enabled = widget.onPressed != null;

    final base = switch (widget.tone) {
      CourseButtonTone.primary => scheme.primary,
      CourseButtonTone.neutral => scheme.surfaceContainerHighest,
      CourseButtonTone.success => scheme.success,
      CourseButtonTone.danger => scheme.error,
    };
    final foreground = switch (widget.tone) {
      CourseButtonTone.neutral => scheme.onSurface,
      _ => Colors.white,
    };
    // Подошва — тот же цвет, но заметно темнее.
    final sole = Color.lerp(base, Colors.black, 0.32)!;

    final pressed = _pressed && enabled;
    final offset = pressed ? _depth : 0.0;

    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: Semantics(
        button: true,
        enabled: enabled,
        label: widget.label,
        child: GestureDetector(
          onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
          onTapUp: enabled ? (_) => setState(() => _pressed = false) : null,
          onTapCancel: enabled ? () => setState(() => _pressed = false) : null,
          onTap: widget.onPressed,
          child: SizedBox(
            width: widget.expand ? double.infinity : null,
            height: 54,
            child: Stack(
              children: [
                // Подошва: видна только в спокойном состоянии.
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 54 - 2,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: enabled ? sole : Colors.transparent,
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 70),
                  curve: Curves.easeOut,
                  left: 0,
                  right: 0,
                  top: offset,
                  height: 54 - _depth,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: base,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Center(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (widget.icon != null) ...[
                            Icon(widget.icon, size: 20, color: foreground),
                            const SizedBox(width: 8),
                          ],
                          Flexible(
                            child: Text(
                              widget.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: foreground,
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ),
                        ],
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
