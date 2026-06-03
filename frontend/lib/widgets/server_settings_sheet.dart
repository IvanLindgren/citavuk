import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/analysis_repository.dart';
import '../services/lexicon_db.dart';
import '../services/user_db.dart';
import '../state/app_settings.dart';

Future<void> showServerSettings(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const _ServerSettingsSheet(),
  );
}

class _ServerSettingsSheet extends StatefulWidget {
  const _ServerSettingsSheet();

  @override
  State<_ServerSettingsSheet> createState() => _ServerSettingsSheetState();
}

class _ServerSettingsSheetState extends State<_ServerSettingsSheet> {
  late final TextEditingController _ctrl;
  bool _downloading = false;
  String? _status;
  bool _ok = false;
  int _cached = 0;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(
        text: context.read<AppSettings>().backendUrl);
    UserDb.instance.cachedTranslationCount().then((c) {
      if (mounted) setState(() => _cached = c);
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final settings = context.read<AppSettings>();
    await settings.setBackendUrl(_ctrl.text);
    AnalysisRepository.baseUrl = settings.backendUrl;
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Адрес сервера сохранён')));
  }

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
          ? 'Словарь обновлён ✓'
          : 'Не удалось скачать словарь (проверь интернет).';
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
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
            Text('Сервер и словарь',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: scheme.onSurface)),
            const SizedBox(height: 6),
            Text(
              'Сервер используется для точного разбора и перевода слов. По '
              'умолчанию — публичный Hugging Face Space. Можно указать свой.',
              style: TextStyle(
                  fontSize: 13, color: scheme.onSurface.withValues(alpha: 0.65)),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _ctrl,
              keyboardType: TextInputType.url,
              decoration: InputDecoration(
                labelText: 'Адрес сервера',
                isDense: true,
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  tooltip: 'Сбросить по умолчанию',
                  icon: const Icon(Icons.restart_alt),
                  onPressed: () => setState(
                      () => _ctrl.text = AppSettings.defaultBackendUrl),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton.icon(
                onPressed: _save,
                icon: const Icon(Icons.save_outlined, size: 18),
                label: const Text('Сохранить адрес'),
              ),
            ),
            const Divider(height: 28),
            Text('Офлайн-словарь',
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: scheme.onSurface)),
            const SizedBox(height: 4),
            Text(
              'Скачивает словарь с сервера для перевода без интернета. Сейчас '
              'офлайн доступно слов (из кэша): $_cached.',
              style: TextStyle(
                  fontSize: 13, color: scheme.onSurface.withValues(alpha: 0.65)),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _downloading ? null : _download,
                icon: _downloading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.download_outlined),
                label: Text(_downloading ? 'Скачиваю…' : 'Скачать словарь'),
              ),
            ),
            if (_status != null) ...[
              const SizedBox(height: 10),
              Text(_status!,
                  style: TextStyle(
                      fontSize: 13,
                      color: _ok ? Colors.green.shade700 : scheme.error)),
            ],
          ],
        ),
      ),
    );
  }
}
