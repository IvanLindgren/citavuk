import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

/// Жалобы, скрытые авторы и правила обсуждений.
///
/// Apple пускает приложение с комментариями, только если на чужую запись можно
/// пожаловаться, автора — скрыть, а пишущий согласился с правилами (App Review
/// 1.2). Жалоба уходит модератору, скрытые авторы хранятся на устройстве.
class CommentModeration extends ChangeNotifier {
  CommentModeration._(this._api);

  static CommentModeration? _instance;
  static CommentModeration get instance =>
      _instance ??= CommentModeration._(null);

  static void configure({required ApiClient api}) {
    _instance = CommentModeration._(api);
    _instance!._load();
  }

  final ApiClient? _api;

  static const _blockedKey = 'comments.blocked_authors';
  static const _rulesKey = 'comments.rules_accepted';

  Set<String> _blocked = {};
  bool _rulesAccepted = false;

  /// Вид комментария на сервере.
  static const feed = 'feed';
  static const roadmap = 'roadmap';
  static const book = 'book';

  bool isBlocked(String authorId) =>
      authorId.isNotEmpty && _blocked.contains(authorId);

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    _blocked = (prefs.getStringList(_blockedKey) ?? const []).toSet();
    _rulesAccepted = prefs.getBool(_rulesKey) ?? false;
    notifyListeners();
  }

  Future<void> block(String authorId) async {
    if (authorId.isEmpty) return;
    _blocked = {..._blocked, authorId};
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_blockedKey, _blocked.toList());
    notifyListeners();
  }

  Future<void> unblockAll() async {
    _blocked = {};
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_blockedKey);
    notifyListeners();
  }

  int get blockedCount => _blocked.length;

  Future<void> report(String kind, String id, String reason) async {
    final api = _api;
    if (api == null) throw ApiException('Нет связи с сервером.');
    await api.post('/v1/comments/reports', {
      'kind': kind,
      'id': id,
      'reason': reason,
    });
  }

  /// Перед первым сообщением человек соглашается с правилами. Возвращает,
  /// можно ли отправлять.
  Future<bool> ensureRules(BuildContext context) async {
    if (_rulesAccepted) return true;
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Правила обсуждений'),
        content: const SingleChildScrollView(
          child: Text(
            'В обсуждениях Читавука нельзя оскорблять людей, писать мат, '
            'угрозы, разжигать ненависть, публиковать спам и непристойности.\n\n'
            'Терпимости к такому нет: сообщения с грубыми словами не '
            'отправляются, на любое сообщение можно пожаловаться, жалобы '
            'разбираются в течение суток, нарушения удаляются, а аккаунты '
            'нарушителей блокируются.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Согласен'),
          ),
        ],
      ),
    );
    if (accepted != true) return false;
    _rulesAccepted = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_rulesKey, true);
    return true;
  }

  /// Меню чужого сообщения: пожаловаться или скрыть автора.
  Future<void> showActions(
    BuildContext context, {
    required String kind,
    required String commentId,
    required String authorId,
    required String authorName,
  }) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: const Text('Пожаловаться'),
              subtitle: const Text('Модератор посмотрит в течение суток'),
              onTap: () => Navigator.pop(context, 'report'),
            ),
            if (authorId.isNotEmpty)
              ListTile(
                leading: const Icon(Icons.block),
                title: Text('Скрыть сообщения: $authorName'),
                subtitle: const Text('Больше не увидишь ничего от этого автора'),
                onTap: () => Navigator.pop(context, 'block'),
              ),
          ],
        ),
      ),
    );
    if (!context.mounted || action == null) return;
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (action == 'block') {
      await block(authorId);
      messenger?.showSnackBar(
        SnackBar(content: Text('Сообщения $authorName скрыты')),
      );
      return;
    }
    final reason = await _askReason(context);
    if (reason == null) return;
    try {
      await report(kind, commentId, reason);
      messenger?.showSnackBar(
        const SnackBar(content: Text('Жалоба отправлена. Спасибо!')),
      );
    } catch (e) {
      messenger?.showSnackBar(SnackBar(
        content: Text(e is ApiException ? e.message : 'Не удалось отправить жалобу.'),
      ));
    }
  }

  Future<String?> _askReason(BuildContext context) {
    const reasons = [
      'Оскорбление или травля',
      'Мат или непристойность',
      'Спам или реклама',
      'Другое',
    ];
    return showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text('Что не так с сообщением?',
                  style: TextStyle(fontWeight: FontWeight.w700)),
            ),
            for (final reason in reasons)
              ListTile(
                title: Text(reason),
                onTap: () => Navigator.pop(context, reason),
              ),
          ],
        ),
      ),
    );
  }
}
