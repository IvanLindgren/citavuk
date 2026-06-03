import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/lexicon_db.dart';
import '../state/app_settings.dart';
import 'wolf_mascot.dart';

/// Приветствие при первом запуске: коротко объясняет, что перевод работает
/// онлайн (а грамматика/чтение — офлайн), и предлагает скачать словарь.
Future<void> showWelcomeDialog(BuildContext context) async {
  final settings = context.read<AppSettings>();
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const _WelcomeDialog(),
  );
  await settings.setFirstRunDone(true);
}

class _WelcomeDialog extends StatefulWidget {
  const _WelcomeDialog();

  @override
  State<_WelcomeDialog> createState() => _WelcomeDialogState();
}

class _WelcomeDialogState extends State<_WelcomeDialog> {
  bool _downloading = false;
  String? _status;
  bool _ok = false;

  Future<void> _download() async {
    setState(() {
      _downloading = true;
      _status = null;
    });
    final ok = await LexiconDb.instance
        .downloadDictionary(AppSettings.defaultDictionaryUrl);
    if (!mounted) return;
    setState(() {
      _downloading = false;
      _ok = ok;
      _status = ok
          ? 'Словарь загружен ✓ — слова из него работают офлайн.'
          : 'Не получилось скачать словарь. Проверь интернет и попробуй позже '
              '(в «Ещё → Сервер и словарь»).';
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const WolfSticker(asset: Wolf.zdravo, size: 130),
            const SizedBox(height: 12),
            Text('Здраво! Я волк Читавук',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.bold,
                    color: scheme.onSurface)),
            const SizedBox(height: 10),
            _point(scheme, Icons.menu_book_rounded,
                'Чтение и грамматика работают без интернета.'),
            _point(scheme, Icons.translate_rounded,
                'Перевод слов — онлайн (нужен интернет). Переведённые слова '
                'запоминаются и потом доступны офлайн.'),
            _point(scheme, Icons.download_rounded,
                'Можно заранее скачать словарь, чтобы переводить офлайн.'),
            if (_status != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: (_ok ? Colors.green : scheme.error)
                      .withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(_status!,
                    style: TextStyle(
                        fontSize: 12.5,
                        color: _ok ? Colors.green.shade800 : scheme.error)),
              ),
            ],
          ],
        ),
      ),
      actionsAlignment: MainAxisAlignment.spaceBetween,
      actions: [
        TextButton.icon(
          onPressed: _downloading ? null : _download,
          icon: _downloading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.download_outlined),
          label: Text(_downloading ? 'Скачиваю…' : 'Скачать словарь'),
        ),
        ElevatedButton(
          onPressed:
              _downloading ? null : () => Navigator.of(context).pop(),
          child: const Text('Начать чтение'),
        ),
      ],
    );
  }

  Widget _point(ColorScheme scheme, IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: scheme.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: TextStyle(
                    fontSize: 13.5,
                    height: 1.3,
                    color: scheme.onSurface.withValues(alpha: 0.85))),
          ),
        ],
      ),
    );
  }
}
