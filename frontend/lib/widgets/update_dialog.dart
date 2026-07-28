import 'package:flutter/material.dart';

import '../services/update_service.dart';

/// Показывает предложение обновиться. Возвращает после закрытия диалога.
Future<void> showUpdateDialog(BuildContext context, UpdateInfo info) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _UpdateDialog(info: info),
  );
}

/// Проверяет обновления и показывает диалог, если они есть.
///
/// [silent] — фоновая проверка при запуске: молчит, когда обновлений нет или
/// сеть недоступна.
Future<void> checkForUpdates(
  BuildContext context, {
  bool silent = true,
}) async {
  if (!UpdateService.supported) return;
  final service = UpdateService();
  UpdateInfo? info;
  try {
    info = await service.check();
  } catch (e) {
    if (!silent && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось проверить обновления: $e')),
      );
    }
    return;
  }
  if (!context.mounted) return;
  if (info == null) {
    if (!silent) {
      final version = await service.currentVersion();
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Установлена последняя версия ($version)')),
      );
    }
    return;
  }
  await showUpdateDialog(context, info);
}

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({required this.info});

  final UpdateInfo info;

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  final _service = UpdateService();
  double _progress = 0;
  bool _busy = false;
  String? _error;

  Future<void> _update() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final file = await _service.download(
        widget.info,
        (p) => mounted ? setState(() => _progress = p) : null,
      );
      await _service.install(file);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = '$e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final info = widget.info;
    final megabytes = info.size > 0
        ? ' · ${(info.size / 1024 / 1024).round()} МБ'
        : '';

    return AlertDialog(
      title: Text('Доступна версия ${info.version}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (info.notes.isNotEmpty) ...[
            Text(info.notes, style: const TextStyle(height: 1.4)),
            const SizedBox(height: 14),
          ],
          if (_busy) ...[
            LinearProgressIndicator(value: _progress > 0 ? _progress : null),
            const SizedBox(height: 8),
            Text(
              _progress > 0
                  ? 'Загрузка: ${(_progress * 100).round()}%'
                  : 'Загрузка…',
              style: const TextStyle(fontSize: 13),
            ),
          ] else
            Text(
              'Приложение скачает обновление и установит его$megabytes. '
              'После установки оно перезапустится.',
              style: const TextStyle(fontSize: 14, height: 1.4),
            ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(
                fontSize: 13,
                color: Theme.of(context).colorScheme.error,
              ),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('Позже'),
        ),
        FilledButton(
          onPressed: _busy ? null : _update,
          child: const Text('Обновить'),
        ),
      ],
    );
  }
}
