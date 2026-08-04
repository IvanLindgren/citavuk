import 'package:flutter/material.dart';

/// Меню «ещё» — шторка с разделами вместо плоского списка.
///
/// Пунктов набралось четырнадцать, и списком они читались плохо: одинаковые
/// строки одинаковой длины, глазу не за что зацепиться, а нужный пункт
/// приходится искать перечитыванием всего подряд. Хуже того, длинный список
/// сам по себе выглядит как «здесь сложно» — ровно то впечатление, которого
/// приложению для начинающих следует избегать.
///
/// Разделы решают это тем, что сокращают область поиска: человек сначала
/// выбирает «читать» или «учиться» — а это он знает про себя заранее — и
/// дальше видит три-четыре пункта вместо четырнадцати.
class MoreMenuSection {
  const MoreMenuSection(this.title, this.items);

  final String title;
  final List<MoreMenuItem> items;
}

class MoreMenuItem {
  const MoreMenuItem({
    required this.label,
    required this.icon,
    required this.onTap,
    this.note,
  });

  final String label;
  final IconData icon;

  /// Пояснение под названием. Ставится только там, где без него пункт
  /// обманывает: «Видео с субтитрами» уводит из приложения в браузер.
  final String? note;

  final VoidCallback onTap;
}

/// Показывает меню и выполняет выбранное действие.
///
/// Действие вызывается ПОСЛЕ закрытия шторки: почти каждый пункт открывает
/// новый экран, и делать это поверх закрывающейся шторки — значит показать
/// человеку, как она уезжает вниз из-под уже открывшегося экрана.
Future<void> showMoreMenu(
  BuildContext context,
  List<MoreMenuSection> sections,
) async {
  final action = await showModalBottomSheet<VoidCallback>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => _MoreMenuSheet(sections: sections),
  );
  action?.call();
}

class _MoreMenuSheet extends StatelessWidget {
  const _MoreMenuSheet({required this.sections});

  final List<MoreMenuSection> sections;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return SafeArea(
      child: ConstrainedBox(
        // Шторка не тянется на весь экран: под ней должна остаться видна
        // библиотека, иначе это уже не меню, а отдельный экран.
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.8,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final section in sections) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 12, 8, 8),
                  child: Text(
                    section.title,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
                // Пункты лежат плиткой, а не строками: так раздел из четырёх
                // пунктов занимает две строки вместо четырёх, и всё меню
                // помещается на экран без прокрутки.
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final item in section.items)
                      _MoreMenuTile(item: item),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MoreMenuTile extends StatelessWidget {
  const _MoreMenuTile({required this.item});

  final MoreMenuItem item;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Две плитки в ряд на телефоне, шире — сколько поместится. Ширина считается
    // от шторки, а не от экрана: на планшете и на десктопе это разные числа.
    final width = (MediaQuery.sizeOf(context).width - 24 - 8) / 2;

    return SizedBox(
      width: width.clamp(150.0, 240.0),
      child: Material(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => Navigator.pop(context, item.onTap),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              children: [
                Icon(item.icon, size: 22, color: scheme.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        item.label,
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          height: 1.2,
                        ),
                      ),
                      if (item.note != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            item.note!,
                            style: TextStyle(
                              fontSize: 11,
                              height: 1.2,
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                    ],
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
