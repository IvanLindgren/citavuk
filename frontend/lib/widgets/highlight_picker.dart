import 'package:flutter/material.dart';

import '../models/highlight_colors.dart';

/// Кнопка «Выделить»: подчеркнуть фрагмент или отметить одним из пяти цветов.
/// Меню, а не ряд кружков: в шапке шторки разбора на узком телефоне шесть
/// кнопок подряд не помещаются.
class HighlightMenuButton extends StatelessWidget {
  const HighlightMenuButton({
    super.key,
    required this.onPick,
    this.current,
    this.tooltip = 'Выделить',
    this.icon = Icons.border_color_outlined,
  });

  final ValueChanged<String> onPick;

  /// Текущий цвет выделения — отмечается галочкой; null — ещё не выделено.
  final String? current;
  final String tooltip;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return PopupMenuButton<String>(
      tooltip: tooltip,
      icon: Icon(icon),
      onSelected: onPick,
      itemBuilder: (_) => [
        PopupMenuItem(
          value: '',
          child: _Option(
            leading: Icon(Icons.format_underlined, color: scheme.primary, size: 22),
            label: 'Подчеркнуть',
            selected: current == '',
          ),
        ),
        for (final key in HighlightColors.keys)
          PopupMenuItem(
            value: key,
            child: _Option(
              leading: Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: HighlightColors.dot(key),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2),
                  boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 2)],
                ),
              ),
              label: HighlightColors.labels[key]!,
              selected: current == key,
            ),
          ),
      ],
    );
  }
}

class _Option extends StatelessWidget {
  const _Option({required this.leading, required this.label, required this.selected});

  final Widget leading;
  final String label;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        leading,
        const SizedBox(width: 12),
        Expanded(child: Text(label)),
        if (selected) const Icon(Icons.check, size: 18),
      ],
    );
  }
}
