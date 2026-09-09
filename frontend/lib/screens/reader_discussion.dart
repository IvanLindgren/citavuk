part of 'book_reader_screen.dart';

class _DiscussionPanel extends StatefulWidget {
  const _DiscussionPanel({
    super.key,
    required this.token,
    required this.paragraph,
  });

  final String token;
  final int paragraph;

  @override
  State<_DiscussionPanel> createState() => _DiscussionPanelState();
}

class _DiscussionPanelState extends State<_DiscussionPanel> {
  final _controller = TextEditingController();
  List<BookComment>? _comments;
  bool _sending = false;
  String _error = '';

  ShareService get _service => ShareService(context.read<ApiClient>());

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final comments = await _service.comments(widget.token, widget.paragraph);
      if (mounted) setState(() => _comments = comments);
    } catch (_) {
      if (mounted) setState(() => _comments = const []);
    }
  }

  Future<void> _send() async {
    final body = _controller.text.trim();
    if (body.isEmpty) return;
    setState(() {
      _sending = true;
      _error = '';
    });
    try {
      final comment =
          await _service.addComment(widget.token, widget.paragraph, body);
      if (!mounted) return;
      setState(() {
        _comments = [...?_comments, comment];
        _controller.clear();
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _delete(BookComment comment) async {
    await _service.deleteComment(comment.id);
    if (mounted) {
      setState(() => _comments =
          _comments?.where((item) => item.id != comment.id).toList());
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = context.watch<AuthService>().isSignedIn;
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Обсуждение этой страницы',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                ),
                const Text(
                  'само по-сербски',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (_comments == null)
              const Center(child: CircularProgressIndicator())
            else if (_comments!.isEmpty)
              Text(
                'Здесь пока тихо. Напишите первым.',
                style: TextStyle(color: scheme.onSurfaceVariant),
              )
            else
              for (final comment in _comments!)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(comment.author,
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text(comment.body),
                  trailing: comment.mine
                      ? IconButton(
                          tooltip: 'Убрать сообщение',
                          onPressed: () => _delete(comment),
                          icon: const Icon(Icons.delete_outline),
                        )
                      : null,
                ),
            if (signedIn) ...[
              const SizedBox(height: 10),
              TextField(
                controller: _controller,
                minLines: 2,
                maxLines: 5,
                maxLength: 1000,
                decoration: const InputDecoration(
                  hintText: 'Napišite nešto o ovoj strani…',
                ),
              ),
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_error,
                      style: TextStyle(color: scheme.error, fontSize: 12)),
                ),
              FilledButton.icon(
                onPressed: _sending ? null : _send,
                icon: _sending
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send_outlined),
                label: const Text('Отправить'),
              ),
            ] else
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  'Войдите в аккаунт, чтобы писать.',
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Верхняя полоса нижней панели: «ручка» по центру + явный крестик «закрыть»
/// справа (на жестовой навигации Pixel свайпом закрыть бывает неочевидно).
Widget _sheetHandleBar(BuildContext context, ColorScheme scheme) {
  return SizedBox(
    height: 44,
    child: Stack(
      children: [
        Align(
          alignment: Alignment.topCenter,
          child: Container(
            margin: const EdgeInsets.only(top: 8),
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: scheme.onSurface.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: IconButton(
            tooltip: 'Закрыть',
            visualDensity: VisualDensity.compact,
            icon: Icon(Icons.close,
                color: scheme.onSurface.withValues(alpha: 0.65)),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ),
      ],
    ),
  );
}
