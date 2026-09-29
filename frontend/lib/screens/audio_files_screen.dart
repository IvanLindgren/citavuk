import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/local_audio_file.dart';
import '../services/api_client.dart';
import '../services/audio_file_service.dart';
import '../services/auth_service.dart';
import '../services/clipboard_import.dart';
import '../services/user_db.dart';
import 'account_screen.dart';
import 'audio_file_player_screen.dart';

class AudioFilesScreen extends StatefulWidget {
  const AudioFilesScreen({super.key, this.initialPayload});

  final ClipboardPayload? initialPayload;

  @override
  State<AudioFilesScreen> createState() => _AudioFilesScreenState();
}

class _AudioFilesScreenState extends State<AudioFilesScreen> {
  List<LocalAudioFile> _files = const [];
  bool _loading = true;
  bool _importing = false;

  @override
  void initState() {
    super.initState();
    _reload();
    final payload = widget.initialPayload;
    if (payload != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _importPayload(payload);
        }
      });
    }
  }

  Future<void> _reload() async {
    try {
      final files = await UserDb.instance.getAudioFiles();
      if (!mounted) return;
      setState(() {
        _files = files;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loading = false);
      _showError('Не удалось открыть локальную медиатеку: $error');
    }
  }

  AudioFileService _service() => AudioFileService(
        api: context.read<ApiClient>(),
        auth: context.read<AuthService>(),
      );

  Future<void> _pickFile() async {
    if (_importing) return;
    final auth = context.read<AuthService>();
    if (!auth.isSignedIn) {
      await Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const AccountScreen()),
      );
      return;
    }
    if (kIsWeb) {
      _showError('В приложении для браузера добавь запись на сайте Читавука.');
      return;
    }

    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: audioFileExtensions,
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final picked = result.files.first;
    final Uint8List? bytes = picked.bytes;
    if (bytes == null) {
      _showError('Не удалось прочитать выбранный аудиофайл.');
      return;
    }

    await _importBytes(picked.name, bytes);
  }

  Future<void> _pasteFromClipboard() async {
    if (_importing) return;
    final auth = context.read<AuthService>();
    if (!auth.isSignedIn) {
      await Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const AccountScreen()),
      );
      return;
    }
    if (kIsWeb) {
      _showError('В браузере вставляй запись на сайте Читавука.');
      return;
    }
    try {
      final payload = await readClipboardPayload();
      if (!mounted) return;
      if (payload == null || !payload.isFile) {
        _showError('В буфере нет аудиофайла.');
        return;
      }
      await _importPayload(payload);
    } catch (error) {
      if (mounted) _showError(error.toString());
    }
  }

  Future<void> _importPayload(ClipboardPayload payload) async {
    if (!context.read<AuthService>().isSignedIn) {
      await Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const AccountScreen()),
      );
      // Вызов может прийти из главной сразу после вставки. Не теряем уже
      // прочитанный payload, если пользователь только что вошёл в аккаунт.
      if (!mounted || !context.read<AuthService>().isSignedIn) return;
    }
    if (!payload.isFile || payload.filename == null || payload.bytes == null) {
      _showError('В буфере нет файла.');
      return;
    }
    final extension = payload.filename!.contains('.')
        ? payload.filename!.split('.').last.toLowerCase()
        : '';
    if (!audioFileExtensions.contains(extension)) {
      _showError('Это не аудиофайл. Для книги используй «Моя библиотека».');
      return;
    }
    await _importBytes(payload.filename!, payload.bytes!);
  }

  Future<void> _importBytes(String filename, Uint8List bytes) async {
    if (_importing) return;
    setState(() => _importing = true);
    try {
      final file = await _service().import(filename: filename, bytes: bytes);
      if (!mounted) return;
      setState(() => _files = [file, ..._files]);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Сербская речь распознана. Запись добавлена.')),
      );
    } catch (error) {
      if (!mounted) return;
      _showError(error is ApiException ? error.message : error.toString());
    } finally {
      if (mounted) setState(() => _importing = false);
    }
  }

  Future<void> _delete(LocalAudioFile file) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Удалить запись?'),
        content:
            Text('«${file.title}» и расшифровка исчезнут с этого устройства.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await _service().delete(file);
      if (mounted) {
        setState(
            () => _files = _files.where((item) => item.id != file.id).toList());
      }
    } catch (error) {
      if (mounted) _showError('Не удалось удалить запись: $error');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Звуковые файлы')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _importing ? null : _pickFile,
        icon: _importing
            ? SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: scheme.onPrimary),
              )
            : const Icon(Icons.add_rounded),
        label: Text(_importing ? 'Распознаю речь' : 'Добавить запись'),
      ),
      body: LayoutBuilder(builder: (context, constraints) {
        final horizontal = constraints.maxWidth >= 1200
            ? (constraints.maxWidth - 1120) / 2
            : constraints.maxWidth >= 700
                ? 28.0
                : 16.0;
        final columns = constraints.maxWidth >= 1050
            ? 3
            : constraints.maxWidth >= 650
                ? 2
                : 1;
        return CustomScrollView(
          slivers: [
            SliverPadding(
              padding: EdgeInsets.fromLTRB(horizontal, 20, horizontal, 24),
              sliver: SliverToBoxAdapter(
                child: _hero(theme, scheme),
              ),
            ),
            if (_loading)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_files.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _empty(theme, scheme),
              )
            else
              SliverPadding(
                padding: EdgeInsets.fromLTRB(horizontal, 0, horizontal, 96),
                sliver: SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: constraints.maxWidth < 650 ? 2.45 : 1.65,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, index) => _fileCard(_files[index], theme, scheme),
                    childCount: _files.length,
                  ),
                ),
              ),
          ],
        );
      }),
    );
  }

  Widget _hero(ThemeData theme, ColorScheme scheme) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [
            scheme.secondaryContainer,
            scheme.surfaceContainerLow,
          ]),
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Row(children: [
          Container(
            width: 66,
            height: 66,
            decoration: BoxDecoration(
              color: scheme.secondary,
              borderRadius: BorderRadius.circular(19),
            ),
            child: Icon(Icons.multitrack_audio_rounded,
                color: scheme.onSecondary, size: 34),
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Твоя локальная аудиотека',
                    style: theme.textTheme.headlineSmall),
                const SizedBox(height: 6),
                Text(
                  'Читавук проверит сербскую речь, разделит говорящих и привяжет '
                  'каждое слово к точному месту в дорожке.',
                  style:
                      TextStyle(height: 1.45, color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: 9),
                Text(
                    'Файл и расшифровка остаются только на этом устройстве.',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: scheme.primary)),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 8,
                  children: [
                    FilledButton.tonalIcon(
                      onPressed: _importing ? null : _pasteFromClipboard,
                      icon: const Icon(Icons.content_paste_rounded),
                      label: const Text('Вставить из буфера'),
                    ),
                    if (!kIsWeb)
                      OutlinedButton.icon(
                        onPressed: _importing ? null : _pickFile,
                        icon: const Icon(Icons.folder_open_rounded),
                        label: const Text('Выбрать файл'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ]),
      );

  Widget _empty(ThemeData theme, ColorScheme scheme) => Center(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 110),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.audio_file_rounded, size: 64, color: scheme.primary),
            const SizedBox(height: 18),
            Text('Здесь появятся твои записи',
                style: theme.textTheme.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 7),
            Text(
                'Добавь интервью, подкаст, голосовое сообщение или лекцию на сербском.',
                textAlign: TextAlign.center,
                style: TextStyle(color: scheme.onSurfaceVariant)),
          ]),
        ),
      );

  Widget _fileCard(LocalAudioFile file, ThemeData theme, ColorScheme scheme) {
    return Material(
      color: scheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(22),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => AudioFilePlayerScreen(audioId: file.id)),
        ),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Row(children: [
            Container(
              width: 64,
              height: double.infinity,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [scheme.secondary, scheme.primary],
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(Icons.graphic_eq_rounded,
                  size: 32, color: scheme.onPrimary),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(file.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(
                    '${_time(file.duration)}  ${file.speakerCount} ${_speakerWord(file.speakerCount)}  ${_size(file.sizeBytes)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:
                        TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            PopupMenuButton<String>(
              tooltip: 'Действия с записью',
              onSelected: (value) {
                if (value == 'delete') _delete(file);
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'delete', child: Text('Удалить')),
              ],
            ),
          ]),
        ),
      ),
    );
  }

  String _time(double seconds) {
    final safe = seconds.isFinite ? seconds.round().clamp(0, 864000) : 0;
    return '${safe ~/ 60}:${(safe % 60).toString().padLeft(2, '0')}';
  }

  String _size(int bytes) => bytes >= 1024 * 1024
      ? '${(bytes / 1024 / 1024).toStringAsFixed(1)} МБ'
      : '${(bytes / 1024).ceil().clamp(1, 999)} КБ';

  String _speakerWord(int count) {
    final last = count % 10;
    final lastTwo = count % 100;
    if (last == 1 && lastTwo != 11) return 'голос';
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
      return 'голоса';
    }
    return 'голосов';
  }
}
