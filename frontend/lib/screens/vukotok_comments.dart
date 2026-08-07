import 'package:flutter/material.dart';

import '../models/micro_feed.dart';
import '../services/micro_feed_service.dart';

/// Обсуждение карточки Вукотока.
///
/// Читать может кто угодно, писать — только вошедший. Разделение не в удобстве:
/// анонимная запись, видимая всем, — приглашение для спама, а модератор в
/// проекте один и он же автор.
///
/// В приложении обсуждения не было вовсе, хотя сервер отдавал его с самого
/// начала: не было ни экрана, ни токена сессии в запросах ленты — то есть
/// написать было нечем, даже войдя в аккаунт.
///
/// Закрывается с числом реплик: счётчик на карточке обязан сойтись с тем, что
/// человек только что видел своими глазами.
class VukotokCommentsSheet extends StatefulWidget {
  const VukotokCommentsSheet({super.key, required this.itemId});

  final String itemId;

  @override
  State<VukotokCommentsSheet> createState() => _VukotokCommentsSheetState();
}

class _VukotokCommentsSheetState extends State<VukotokCommentsSheet> {
  final TextEditingController _input = TextEditingController();

  List<MicroFeedComment>? _items;
  bool _signedIn = false;
  bool _sending = false;
  String _error = '';

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
      final signedIn = await MicroFeedService.instance.signedIn();
      final items = await MicroFeedService.instance.comments(widget.itemId);
      if (!mounted) return;
      setState(() {
        _items = items;
        _signedIn = signedIn;
        _error = '';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _items = const [];
        _error = 'Не удалось загрузить обсуждение';
      });
    }
  }

  Future<void> _send() async {
    final body = _input.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _error = '';
    });
    try {
      final comment =
          await MicroFeedService.instance.addComment(widget.itemId, body);
      if (!mounted) return;
      setState(() {
        _items = [...?_items, comment];
        _input.clear();
        _sending = false;
      });
    } catch (e) {
      if (!mounted) return;
      // Сообщение сервера показывается как есть: там написано по делу —
      // «слишком часто», «длиннее 600 символов». Подменять его общим «не
      // удалось» значит скрыть единственное, что человеку нужно знать.
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _sending = false;
      });
    }
  }

  Future<void> _delete(MicroFeedComment comment) async {
    try {
      await MicroFeedService.instance.deleteComment(comment.id);
      if (!mounted) return;
      setState(() {
        _items = [
          for (final item in _items ?? const <MicroFeedComment>[])
            if (item.id != comment.id) item,
        ];
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось удалить комментарий');
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    return PopScope(
      // Число реплик уезжает обратно на карточку при любом закрытии — и по
      // кнопке, и жестом «назад».
      onPopInvokedWithResult: (didPop, _) {},
      child: DraggableScrollableSheet(
        initialChildSize: .8,
        minChildSize: .5,
        maxChildSize: .95,
        expand: false,
        builder: (context, controller) => Padding(
          // Отступ на клавиатуру: без него поле ответа уезжает под неё ровно в
          // тот момент, когда реплику начали писать.
          padding:
              EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 8, 8),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text('Обсуждение',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.w800)),
                    ),
                    IconButton(
                      onPressed: () =>
                          Navigator.of(context).pop(items?.length ?? 0),
                      icon: const Icon(Icons.close, color: Colors.white54),
                      tooltip: 'Закрыть',
                    ),
                  ],
                ),
              ),
              Expanded(
                child: items == null
                    ? const Center(child: CircularProgressIndicator())
                    : items.isEmpty
                        ? const Center(
                            child: Padding(
                              padding: EdgeInsets.all(28),
                              child: Text(
                                'Пока никто ничего не написал.\nБудьте первым.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Colors.white54),
                              ),
                            ),
                          )
                        : ListView.separated(
                            controller: controller,
                            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                            itemCount: items.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 14),
                            itemBuilder: (_, index) => _CommentTile(
                              comment: items[index],
                              onDelete: () => _delete(items[index]),
                            ),
                          ),
              ),
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                  child: Text(_error,
                      style: const TextStyle(
                          color: Color(0xFFFFB4AE), fontSize: 13)),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                child: _signedIn ? _composer() : _signInHint(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _composer() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: TextField(
            controller: _input,
            minLines: 1,
            maxLines: 4,
            maxLength: 600,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(
              hintText: 'Что думаете?',
              hintStyle: TextStyle(color: Colors.white38),
              counterText: '',
              filled: true,
              fillColor: Color(0xFF262019),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(14)),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        IconButton.filled(
          onPressed: _sending ? null : _send,
          icon: _sending
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.send),
        ),
      ],
    );
  }

  Widget _signInHint() {
    return const Text(
      'Войдите в аккаунт, чтобы писать в обсуждении.',
      textAlign: TextAlign.center,
      style: TextStyle(color: Colors.white54),
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({required this.comment, required this.onDelete});

  final MicroFeedComment comment;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(comment.author,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700)),
            ),
            if (comment.createdAt != null)
              Text(shortDate(comment.createdAt!),
                  style: const TextStyle(color: Colors.white38, fontSize: 12)),
            if (comment.mine)
              IconButton(
                onPressed: onDelete,
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.delete_outline,
                    size: 18, color: Colors.white38),
                tooltip: 'Удалить',
              ),
          ],
        ),
        const SizedBox(height: 2),
        Text(comment.body,
            style: const TextStyle(
                color: Colors.white70, fontSize: 15, height: 1.35)),
      ],
    );
  }
}

/// Дата без года: обсуждение живёт днями, и год в нём только шум.
String shortDate(DateTime value) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(value.day)}.${two(value.month)} ${two(value.hour)}:${two(value.minute)}';
}
