/// Справка по горячим клавишам и жестам.
///
/// Один список на экран: на десктопе показываются клавиши, на телефоне — жесты.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

class Shortcut {
  const Shortcut(this.keys, this.action, {this.gesture});

  /// Комбинации клавиш («Space», «Ctrl + →»).
  final List<String> keys;
  final String action;

  /// Жест на телефоне; null — действия на телефоне нет.
  final String? gesture;
}

/// Наборы по экранам.
class ReaderShortcuts {
  static const reader = [
    Shortcut(['→', 'Space', 'PgDn'], 'Следующая страница',
        gesture: 'Свайп справа налево'),
    Shortcut(['←', 'Shift + Space', 'PgUp'], 'Предыдущая страница',
        gesture: 'Свайп слева направо'),
    Shortcut(['Home', 'End'], 'В начало / в конец книги'),
    Shortcut(['+', '−'], 'Размер шрифта'),
    Shortcut(['S', 'F2'], 'Настройки чтения'),
    Shortcut(['D'], 'Словарь книги'),
    Shortcut(['Esc'], 'Закрыть книгу'),
    Shortcut([], 'Разбор слова', gesture: 'Тап по слову'),
    Shortcut([], 'Разбор фразы', gesture: 'Долгое нажатие и протянуть'),
  ];

  static const flashcards = [
    Shortcut(['Space', 'Enter'], 'Показать ответ', gesture: 'Свайп по карточке'),
    Shortcut(['1'], 'Снова', gesture: 'Свайп влево'),
    Shortcut(['2'], 'Хорошо', gesture: 'Свайп вправо'),
    Shortcut(['3'], 'Легко', gesture: 'Свайп вверх'),
    Shortcut(['Esc'], 'Выйти'),
  ];

  static const lesson = [
    Shortcut(['Enter'], 'Проверить ответ / дальше'),
    Shortcut(['1', '…', '9'], 'Выбрать вариант ответа'),
    Shortcut(['Esc'], 'Выйти из урока'),
  ];
}

Future<void> showShortcutsSheet(
    BuildContext context, List<Shortcut> shortcuts) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _ShortcutsSheet(shortcuts: shortcuts),
  );
}

class _ShortcutsSheet extends StatelessWidget {
  const _ShortcutsSheet({required this.shortcuts});

  final List<Shortcut> shortcuts;

  bool get _desktop =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.windows ||
          defaultTargetPlatform == TargetPlatform.linux ||
          defaultTargetPlatform == TargetPlatform.macOS);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final showKeys = _desktop || kIsWeb;

    final rows = <Widget>[];
    for (final s in shortcuts) {
      final keys = showKeys ? s.keys : const <String>[];
      final gesture = s.gesture;
      if (keys.isEmpty && gesture == null) continue;
      rows.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 168,
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final key in keys) _KeyCap(key),
                  if (keys.isEmpty && gesture != null)
                    Icon(Icons.touch_app_outlined,
                        size: 18, color: scheme.onSurfaceVariant),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.action,
                      style: Theme.of(context).textTheme.bodyMedium),
                  if (gesture != null)
                    Text(gesture,
                        style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ));
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.keyboard_outlined, color: scheme.primary),
                  const SizedBox(width: 10),
                  Text(showKeys ? 'Горячие клавиши' : 'Жесты',
                      style: Theme.of(context).textTheme.titleLarge),
                ],
              ),
              const SizedBox(height: 12),
              ...rows,
            ],
          ),
        ),
      ),
    );
  }
}

class _KeyCap extends StatelessWidget {
  const _KeyCap(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: scheme.shadow.withValues(alpha: 0.10),
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Text(label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            color: scheme.onSurface,
          )),
    );
  }
}
