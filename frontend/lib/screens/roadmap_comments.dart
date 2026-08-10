import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/roadmap.dart';
import '../services/auth_service.dart';
import '../services/roadmap_service.dart';

/// Обсуждение уровня дорожной карты.
///
/// Своя ветка на каждую ступень: «что читать на A2» не должно тонуть в спорах
/// про C1. Глубина ответов одна — дерево произвольной глубины на телефоне
/// упирается в ширину экрана, и ответ на ответ сервер цепляет к корню ветки.
class RoadmapCommentsScreen extends StatefulWidget {
  const RoadmapCommentsScreen({super.key, required this.level});

  final String level;

  @override
  State<RoadmapCommentsScreen> createState() => _RoadmapCommentsScreenState();
}

class _RoadmapCommentsScreenState extends State<RoadmapCommentsScreen> {
  final TextEditingController _input = TextEditingController();
  List<RoadmapComment>? _comments;
  String _error = '';
  String _replyTo = '';
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final comments =
          await context.read<RoadmapService>().comments(widget.level);
      if (!mounted) return;
      setState(() {
        _comments = comments;
        _error = '';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Обсуждение не загрузилось. $e');
    }
  }

  Future<void> _send() async {
    final body = _input.text.trim();
    if (body.isEmpty) return;
    setState(() => _sending = true);
    try {
      final comment = await context
          .read<RoadmapService>()
          .addComment(widget.level, body, parentId: _replyTo);
      if (!mounted) return;
      setState(() {
        _comments = [...?_comments, comment];
        _input.clear();
        _replyTo = '';
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Не отправилось. $e')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _delete(RoadmapComment comment) async {
    try {
      await context.read<RoadmapService>().deleteComment(comment.id);
      if (!mounted) return;
      setState(() => _comments =
          (_comments ?? []).where((item) => item.id != comment.id).toList());
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось удалить.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final comments = _comments;
    final signedIn = context.watch<AuthService>().account != null;
    final roots = (comments ?? []).where((item) => item.parentId.isEmpty).toList();
    final replies = <String, List<RoadmapComment>>{};
    for (final comment in comments ?? <RoadmapComment>[]) {
      if (comment.parentId.isEmpty) continue;
      replies.putIfAbsent(comment.parentId, () => []).add(comment);
    }

    return Scaffold(
      appBar: AppBar(title: Text('Обсуждение ${widget.level}')),
      body: Column(
        children: [
          Expanded(
            child: _error.isNotEmpty
                ? Center(
                    child: Padding(
                        padding: const EdgeInsets.all(24), child: Text(_error)))
                : comments == null
                    ? const Center(child: CircularProgressIndicator())
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                          children: [
                            Text(
                              'Любая дорожная карта требует обсуждений и '
                              'дополнений, которые мог не учесть автор. Что '
                              'добавить в этот уровень, что убрать, где ты '
                              'застряли?',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 14),
                            if (roots.isEmpty)
                              const Text('Пока никто не высказался. '
                                  'Будь первым.'),
                            for (final root in roots)
                              _Thread(
                                root: root,
                                replies: replies[root.id] ?? const [],
                                canReply: signedIn,
                                onReply: () => setState(() => _replyTo = root.id),
                                onDelete: _delete,
                              ),
                          ],
                        ),
                      ),
          ),
          if (signedIn)
            SafeArea(
              top: false,
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  12,
                  6,
                  12,
                  12 + MediaQuery.viewInsetsOf(context).bottom,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_replyTo.isNotEmpty)
                      Row(
                        children: [
                          const Icon(Icons.subdirectory_arrow_right, size: 16),
                          const SizedBox(width: 4),
                          const Text('Ответ на реплику'),
                          const Spacer(),
                          TextButton(
                            onPressed: () => setState(() => _replyTo = ''),
                            child: const Text('Отмена'),
                          ),
                        ],
                      ),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _input,
                            minLines: 1,
                            maxLines: 5,
                            decoration: InputDecoration(
                              hintText: _replyTo.isEmpty
                                  ? 'Что добавить в этот уровень?'
                                  : 'Твой ответ',
                              border: const OutlineInputBorder(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          onPressed: _sending ? null : _send,
                          icon: const Icon(Icons.send),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Войдите, чтобы участвовать в обсуждении. '
                  'Читать его можно и без входа.'),
            ),
        ],
      ),
    );
  }
}

class _Thread extends StatelessWidget {
  const _Thread({
    required this.root,
    required this.replies,
    required this.canReply,
    required this.onReply,
    required this.onDelete,
  });

  final RoadmapComment root;
  final List<RoadmapComment> replies;
  final bool canReply;
  final VoidCallback onReply;
  final Future<void> Function(RoadmapComment comment) onDelete;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Body(comment: root, onDelete: onDelete),
            if (replies.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(top: 10, left: 8),
                padding: const EdgeInsets.only(left: 10),
                decoration: BoxDecoration(
                  border: Border(
                    left: BorderSide(color: scheme.outlineVariant, width: 2),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final reply in replies)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _Body(comment: reply, onDelete: onDelete),
                      ),
                  ],
                ),
              ),
            if (canReply)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: onReply,
                  icon: const Icon(Icons.reply, size: 18),
                  label: const Text('Ответить'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.comment, required this.onDelete});

  final RoadmapComment comment;
  final Future<void> Function(RoadmapComment comment) onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(comment.author,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            Text(
              '${comment.createdAt.day.toString().padLeft(2, '0')}.'
              '${comment.createdAt.month.toString().padLeft(2, '0')}.'
              '${comment.createdAt.year}',
              style: theme.textTheme.bodySmall,
            ),
            if (comment.mine)
              IconButton(
                tooltip: 'Удалить',
                icon: const Icon(Icons.delete_outline, size: 18),
                onPressed: () => onDelete(comment),
              ),
          ],
        ),
        Text(comment.body, style: theme.textTheme.bodyMedium),
      ],
    );
  }
}
