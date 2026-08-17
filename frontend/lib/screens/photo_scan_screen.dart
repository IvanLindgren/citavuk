/// Снимок как книга: объявление, вывеска, слова из тетради.
///
/// Читать по-сербски приходится не только книги, но импорт до сих пор принимал
/// только файл. Здесь человек наводит камеру на то, что перед ним, — и текст
/// попадает в библиотеку обычной книгой, с разбором слов и словарём.
///
/// Кадров можно снять несколько подряд: тетрадь — это страницы, а не один
/// снимок, и заводить по книге на страницу значит рассыпать её по библиотеке.
///
/// Распознанное ПРАВИТСЯ до сохранения. Модель ошибается на тенях, засветах и
/// чужом почерке, а ошибка, ушедшая в книгу, разойдётся дальше — в разбор слов
/// и в словарь, откуда её уже не выковырять.
library;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/api_client.dart';
import '../services/photo_scan_service.dart';
import '../services/user_db.dart';

class PhotoScanScreen extends StatefulWidget {
  const PhotoScanScreen({super.key, required this.service});

  final PhotoScanService service;

  @override
  State<PhotoScanScreen> createState() => _PhotoScanScreenState();
}

class _PhotoScanScreenState extends State<PhotoScanScreen> {
  final _picker = ImagePicker();
  final _title = TextEditingController();
  final _shots = <TextEditingController>[];
  bool _busy = false;
  bool _saving = false;

  @override
  void dispose() {
    _title.dispose();
    for (final shot in _shots) {
      shot.dispose();
    }
    super.dispose();
  }

  Future<void> _shoot(ImageSource source) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      // Кадр ужимается ещё телефоном: снимок в полном разрешении — это
      // десяток мегабайт, которые модель всё равно уменьшит до своей стороны,
      // а заплачено будет за целый.
      final file = await _picker.pickImage(
        source: source,
        maxWidth: 2200,
        maxHeight: 2200,
        imageQuality: 85,
      );
      if (file == null) return;

      final bytes = await file.readAsBytes();
      final paragraphs = await widget.service.recognize(
        bytes,
        filename: file.name.isEmpty ? 'kadar.jpg' : file.name,
        mime: file.mimeType ?? 'image/jpeg',
      );
      if (!mounted || paragraphs.isEmpty) return;

      setState(() {
        _shots.add(TextEditingController(text: paragraphs.join('\n\n')));
        if (_title.text.trim().isEmpty) {
          _title.text = photoBookTitle(paragraphs);
        }
      });
    } on ApiException catch (e) {
      // Сервер объясняет отказ по-русски и по делу: «снимите ближе и ровнее»,
      // «предел на сегодня». Пересказывать это своими словами незачем.
      _say(e.message);
    } catch (_) {
      _say('Не удалось прочитать снимок.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _say(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  /// Всё снятое одной книгой. Пустые куски выбрасываются: кадр могли и стереть.
  List<String> get _paragraphs => [
        for (final shot in _shots)
          for (final block in shot.text.split(RegExp(r'\n\s*\n')))
            if (block.trim().isNotEmpty) block.trim(),
      ];

  Future<void> _save() async {
    final paragraphs = _paragraphs;
    if (paragraphs.isEmpty || _saving) return;
    setState(() => _saving = true);
    try {
      final title = _title.text.trim().isEmpty
          ? photoBookTitle(paragraphs)
          : _title.text.trim();
      // Источник помечает происхождение книги: у снимка нет файла, а пустой
      // путь синхронизация принимает за незаполненную запись.
      final source = 'photo://${DateTime.now().millisecondsSinceEpoch}';
      await UserDb.instance.insertBook(title, source, paragraphs);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) setState(() => _saving = false);
      _say('Не удалось сохранить книгу.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ready = _paragraphs.isNotEmpty;

    return Scaffold(
      appBar: AppBar(title: const Text('Снять текст')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Text(
              'Наведите камеру на объявление, вывеску или тетрадь. '
              'Снимков можно сделать несколько — все они попадут в одну книгу.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy ? null : () => _shoot(ImageSource.camera),
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: const Text('Снять'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : () => _shoot(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('Из галереи'),
                  ),
                ),
              ],
            ),
            if (_busy) ...[
              const SizedBox(height: 16),
              const LinearProgressIndicator(),
              const SizedBox(height: 6),
              Text('Разбираем снимок…',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall),
            ],
            if (_shots.isNotEmpty) ...[
              const SizedBox(height: 20),
              TextField(
                controller: _title,
                decoration: const InputDecoration(
                  labelText: 'Название книги',
                  isDense: true,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Проверьте текст: распознавание ошибается на тенях и почерке, '
                'а неверное слово уйдёт и в разбор, и в словарь.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              ),
              for (var i = 0; i < _shots.length; i++) _shotCard(scheme, i),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: ready && !_saving ? _save : null,
                  child: Text(_saving ? 'Сохраняем…' : 'Сохранить книгу'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _shotCard(ColorScheme scheme, int index) {
    return Card(
      margin: const EdgeInsets.only(top: 12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('Снимок ${index + 1}',
                    style: Theme.of(context).textTheme.labelLarge),
                const Spacer(),
                IconButton(
                  tooltip: 'Убрать снимок',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () => setState(() {
                    _shots.removeAt(index).dispose();
                  }),
                ),
              ],
            ),
            TextField(
              controller: _shots[index],
              maxLines: null,
              minLines: 3,
              style: const TextStyle(fontFamily: 'NotoSerif', height: 1.45),
              decoration: InputDecoration(
                border: const OutlineInputBorder(),
                hintText: 'Текст снимка',
                fillColor: scheme.surfaceContainerHighest,
                filled: true,
              ),
              onChanged: (_) => setState(() {}),
            ),
          ],
        ),
      ),
    );
  }
}
