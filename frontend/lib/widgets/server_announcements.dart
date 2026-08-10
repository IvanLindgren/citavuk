import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/server_announcement.dart';
import '../services/announcements_controller.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';

class ServerAnnouncementBanner extends StatelessWidget {
  const ServerAnnouncementBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final announcement = context.watch<AnnouncementsController>().banner;
    if (announcement == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.secondaryContainer,
      child: InkWell(
        onTap: () => showServerAnnouncement(context, announcement),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
          child: Row(
            children: [
              Icon(_kindIcon(announcement.kind),
                  color: scheme.onSecondaryContainer),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  announcement.bannerText.isEmpty
                      ? announcement.title
                      : announcement.bannerText,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: scheme.onSecondaryContainer,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Icon(Icons.chevron_right, color: scheme.onSecondaryContainer),
              IconButton(
                tooltip: 'Скрыть объявление',
                icon: const Icon(Icons.close),
                color: scheme.onSecondaryContainer,
                onPressed: () => context
                    .read<AnnouncementsController>()
                    .dismissAnnouncement(announcement.id)
                    .catchError((_) {}),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ServerNotificationButton extends StatelessWidget {
  const ServerNotificationButton({super.key});

  @override
  Widget build(BuildContext context) {
    final unread = context.watch<AnnouncementsController>().unreadCount;
    return IconButton(
      tooltip: 'Объявления и уведомления',
      onPressed: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const ServerNotificationsScreen()),
      ),
      icon: Badge(
        isLabelVisible: unread > 0,
        label: Text(unread > 99 ? '99+' : '$unread'),
        child: const Icon(Icons.notifications_outlined),
      ),
    );
  }
}

class ServerNotificationsScreen extends StatefulWidget {
  const ServerNotificationsScreen({super.key});

  @override
  State<ServerNotificationsScreen> createState() =>
      _ServerNotificationsScreenState();
}

class _ServerNotificationsScreenState extends State<ServerNotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AnnouncementsController>().refresh().catchError((_) {});
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AnnouncementsController>();
    final signedIn = context.watch<AuthService>().isSignedIn;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Уведомления'),
        actions: [
          if (controller.unreadCount > 0)
            TextButton.icon(
              onPressed: () =>
                  controller.markAllNotificationsRead().catchError((_) {}),
              icon: const Icon(Icons.done_all),
              label: const Text('Прочитать все'),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            if (!signedIn)
              const ListTile(
                leading: Icon(Icons.login),
                title: Text('Войдите в аккаунт'),
                subtitle: Text(
                    'Тогда уведомления и полученные награды будут доступны на всех устройствах.'),
              ),
            for (final item in controller.notifications)
              ListTile(
                leading: Icon(
                  item.read
                      ? Icons.notifications_none
                      : Icons.notifications_active,
                ),
                title: Text(
                  item.title,
                  style:
                      TextStyle(fontWeight: item.read ? null : FontWeight.w700),
                ),
                subtitle: Text(item.body),
                trailing: item.createdAt == null
                    ? null
                    : Text(_shortDate(item.createdAt!.toLocal())),
                onTap: () async {
                  if (!item.read) {
                    await controller
                        .markNotificationRead(item.id)
                        .catchError((_) {});
                  }
                  if (!context.mounted) return;
                  ServerAnnouncement? related;
                  for (final announcement in controller.announcements) {
                    if (announcement.title == item.title) {
                      related = announcement;
                      break;
                    }
                  }
                  if (related != null) {
                    await showServerAnnouncement(context, related);
                  } else if (item.targetUrl.isNotEmpty) {
                    await _launch(item.targetUrl);
                  }
                },
              ),
            if (controller.notifications.isEmpty)
              Padding(
                padding: const EdgeInsets.all(40),
                child: Column(
                  children: [
                    Icon(Icons.notifications_none,
                        size: 44, color: Theme.of(context).colorScheme.outline),
                    const SizedBox(height: 12),
                    const Text('Здесь пока тихо'),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

Future<void> showServerAnnouncement(
  BuildContext context,
  ServerAnnouncement announcement,
) async {
  await context
      .read<AnnouncementsController>()
      .markAnnouncementRead(announcement.id)
      .catchError((_) {});
  if (!context.mounted) return;
  await showDialog<void>(
    context: context,
    builder: (context) => _AnnouncementDialog(announcement: announcement),
  );
}

class _AnnouncementDialog extends StatefulWidget {
  const _AnnouncementDialog({required this.announcement});

  final ServerAnnouncement announcement;

  @override
  State<_AnnouncementDialog> createState() => _AnnouncementDialogState();
}

class _AnnouncementDialogState extends State<_AnnouncementDialog> {
  final _proofController = TextEditingController();
  String _network = 'telegram';
  bool _claiming = false;
  String _error = '';

  @override
  void dispose() {
    _proofController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final latest = context
        .watch<AnnouncementsController>()
        .announcements
        .where((item) => item.id == widget.announcement.id)
        .firstOrNull;
    final item = latest ?? widget.announcement;
    final width = MediaQuery.sizeOf(context).width;
    return Dialog(
      child: ConstrainedBox(
        constraints: BoxConstraints(
            maxWidth: 620, maxHeight: MediaQuery.sizeOf(context).height * 0.9),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(_kindIcon(item.kind), size: 28),
                  const SizedBox(width: 12),
                  Expanded(
                      child: Text(item.title,
                          style: Theme.of(context).textTheme.headlineSmall)),
                  IconButton(
                    tooltip: 'Закрыть',
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              if (item.imageUrl.isNotEmpty) ...[
                const SizedBox(height: 16),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    item.imageUrl,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              SelectableText(item.body,
                  style: Theme.of(context).textTheme.bodyLarge),
              if (item.actionUrl.isNotEmpty) ...[
                const SizedBox(height: 18),
                OutlinedButton.icon(
                  onPressed: () => _launch(item.actionUrl),
                  icon: const Icon(Icons.open_in_new),
                  label: Text(
                      item.actionLabel.isEmpty ? 'Открыть' : item.actionLabel),
                ),
              ],
              if (item.shareRequired) ...[
                const SizedBox(height: 24),
                const Divider(),
                const SizedBox(height: 12),
                Text('Получить специальный фон',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(item.claimed
                    ? 'Фон уже открыт и появился в настройках чтения.'
                    : 'Поделись Читавуком, затем добавь ссылку на опубликованный пост.'),
                if (!item.claimed) ...[
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton.icon(
                        onPressed: () => _share(item),
                        icon: const Icon(Icons.ios_share),
                        label: const Text('Поделиться'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => Clipboard.setData(
                            ClipboardData(text: item.shareText)),
                        icon: const Icon(Icons.content_copy),
                        label: const Text('Скопировать текст'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  DropdownMenu<String>(
                    width: width < 520 ? width - 96 : 280,
                    initialSelection: _network,
                    label: const Text('Социальная сеть'),
                    onSelected: (value) =>
                        setState(() => _network = value ?? _network),
                    dropdownMenuEntries: const [
                      DropdownMenuEntry(value: 'instagram', label: 'Instagram'),
                      DropdownMenuEntry(value: 'threads', label: 'Threads'),
                      DropdownMenuEntry(value: 'facebook', label: 'Facebook'),
                      DropdownMenuEntry(value: 'twitter', label: 'X / Twitter'),
                      DropdownMenuEntry(value: 'vk', label: 'ВКонтакте'),
                      DropdownMenuEntry(value: 'telegram', label: 'Telegram'),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _proofController,
                    keyboardType: TextInputType.url,
                    decoration: const InputDecoration(
                      labelText: 'Ссылка на опубликованный пост',
                      hintText: 'https://...',
                      prefixIcon: Icon(Icons.link),
                    ),
                  ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(_error,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: _claiming ? null : () => _claim(item),
                    icon: _claiming
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.redeem),
                    label: const Text('Открыть фон'),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _share(ServerAnnouncement item) async {
    await Clipboard.setData(ClipboardData(text: item.shareText));
    final text = Uri.encodeComponent(item.shareText);
    final site = Uri.encodeComponent('https://citavuk.ru');
    final url = switch (_network) {
      'telegram' => 'https://t.me/share/url?url=$site&text=$text',
      'vk' => 'https://vk.com/share.php?url=$site&title=$text',
      'twitter' => 'https://twitter.com/intent/tweet?text=$text&url=$site',
      'facebook' => 'https://www.facebook.com/sharer/sharer.php?u=$site',
      'threads' => 'https://www.threads.net/',
      _ => 'https://www.instagram.com/',
    };
    await _launch(url);
  }

  Future<void> _claim(ServerAnnouncement item) async {
    setState(() {
      _claiming = true;
      _error = '';
    });
    try {
      await context
          .read<AnnouncementsController>()
          .claim(item.id, _network, _proofController.text);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Не удалось проверить публикацию.');
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }
}

IconData _kindIcon(String kind) => switch (kind) {
      'campaign' => Icons.celebration_outlined,
      'maintenance' => Icons.build_outlined,
      _ => Icons.campaign_outlined,
    };

String _shortDate(DateTime value) =>
    '${value.day.toString().padLeft(2, '0')}.${value.month.toString().padLeft(2, '0')}';

Future<void> _launch(String raw) async {
  final uri = Uri.tryParse(raw);
  if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
}
