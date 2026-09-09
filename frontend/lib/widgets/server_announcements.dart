import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/server_announcement.dart';
import '../services/announcements_controller.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import 'serbian_ornament.dart';

/// Баннеры объявлений над библиотекой: максимум одно обычное плюс отдельно
/// критическое сервисное (его нельзя потерять из-за лимита и случайно
/// скрыть — крестика у него нет).
///
/// Одна карточка: категория, заголовок, краткое описание, одно основное
/// действие, закрытие. Длинный текст не режется молча — есть «Подробнее».
/// Закрытие сохраняется (сервер у вошедшего, кеш у гостя) и переживает
/// перезапуски; состояние изолировано по аккаунтам (см. контроллер).
class ServerAnnouncementBanner extends StatelessWidget {
  const ServerAnnouncementBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final banners = context.watch<AnnouncementsController>().banners;
    final ids = banners.map((item) => item.id).join(',');
    final reduce = MediaQuery.disableAnimationsOf(context);
    // Переключение набора — кросс-фейд со сдвигом 6–8 px за ~200 мс;
    // закрытие плавно освобождает место, контент не прыгает.
    return AnimatedSize(
      duration: reduce ? Duration.zero : const Duration(milliseconds: 200),
      curve: Curves.easeOut,
      alignment: Alignment.topCenter,
      child: AnimatedSwitcher(
        duration: reduce ? Duration.zero : const Duration(milliseconds: 200),
        switchInCurve: Curves.easeOut,
        switchOutCurve: Curves.easeOut,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: animation.drive(
              Tween(begin: const Offset(0, -0.04), end: Offset.zero),
            ),
            child: child,
          ),
        ),
        child: banners.isEmpty
            ? const SizedBox.shrink(key: ValueKey('banners-empty'))
            : Column(
                key: ValueKey('banners-$ids'),
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final item in banners)
                    _AnnouncementCard(
                        key: ValueKey('banner-${item.id}'), item: item),
                ],
              ),
      ),
    );
  }
}

class _AnnouncementCard extends StatelessWidget {
  const _AnnouncementCard({super.key, required this.item});

  final ServerAnnouncement item;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final critical = item.kind == 'maintenance';
    final short = item.bannerText.isNotEmpty
        ? item.bannerText
        : (item.body.length > 140
            ? '${item.body.substring(0, 140).trimRight()}…'
            : item.body);
    final needsDetails =
        item.bannerText.isNotEmpty ? item.body.isNotEmpty : item.body.length > 140;
    final wide = MediaQuery.sizeOf(context).width >= 600;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AppTheme.radiusCard),
        border: Border.all(
          color: critical ? scheme.error : scheme.outlineVariant,
          width: critical ? 1.5 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        child: wide
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  _kindMark(scheme, item.kind),
                  const SizedBox(width: 12),
                  Expanded(child: _texts(text, scheme, short, needsDetails)),
                  const SizedBox(width: 8),
                  _actions(context, compact: true),
                  _closeButton(context, critical),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _kindMark(scheme, item.kind),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _title(text, scheme),
                      ),
                      _closeButton(context, critical),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(right: 8, top: 6),
                    child: _description(text, scheme, short),
                  ),
                  if (needsDetails || item.actionUrl.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(right: 8, top: 8),
                      child: _actions(context, compact: true),
                    ),
                ],
              ),
      ),
    );
  }

  Widget _texts(TextTheme text, ColorScheme scheme, String short, bool more) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _title(text, scheme),
          const SizedBox(height: 2),
          _description(text, scheme, short),
        ],
      );

  Widget _title(TextTheme text, ColorScheme scheme) => Wrap(
        spacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          _KindChip(kind: item.kind),
          Text(item.title,
              style: text.titleSmall?.copyWith(color: scheme.onSurface)),
        ],
      );

  Widget _description(TextTheme text, ColorScheme scheme, String short) =>
      Text(short, style: text.bodySmall?.copyWith(height: 1.4));

  /// Одно основное действие: ссылка — понятной кнопкой (сырой URL в текст
  /// не вставляется), иначе «Подробнее» с полным содержимым.
  Widget _actions(BuildContext context, {required bool compact}) {
    final padding = compact
        ? const EdgeInsets.symmetric(horizontal: 14, vertical: 8)
        : const EdgeInsets.symmetric(horizontal: 18, vertical: 12);
    if (item.actionUrl.isNotEmpty) {
      return Wrap(
        spacing: 4,
        runSpacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          FilledButton.tonal(
            onPressed: () => _launch(item.actionUrl),
            style: FilledButton.styleFrom(padding: padding),
            child: Text(
                item.actionLabel.isEmpty ? 'Открыть' : item.actionLabel),
          ),
          TextButton(
            onPressed: () => showServerAnnouncement(context, item),
            style: TextButton.styleFrom(padding: padding),
            child: const Text('Подробнее'),
          ),
        ],
      );
    }
    return FilledButton.tonal(
      onPressed: () => showServerAnnouncement(context, item),
      style: FilledButton.styleFrom(padding: padding),
      child: const Text('Подробнее'),
    );
  }

  Widget _closeButton(BuildContext context, bool critical) {
    if (critical) return const SizedBox.shrink();
    return IconButton(
      tooltip: 'Скрыть объявление',
      icon: const Icon(Icons.close),
      onPressed: () => context
          .read<AnnouncementsController>()
          .dismissAnnouncement(item.id)
          .catchError((_) {}),
    );
  }
}

Widget _kindMark(ColorScheme scheme, String kind) => Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: _kindColor(scheme, kind).withValues(alpha: 0.14),
      ),
      child: Icon(_kindIcon(kind), size: 20, color: _kindColor(scheme, kind)),
    );

/// Подпись категории: новость, акция или сервисные работы.
class _KindChip extends StatelessWidget {
  const _KindChip({required this.kind});

  final String kind;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = _kindColor(scheme, kind);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        _kindLabel(kind),
        style: Theme.of(context)
            .textTheme
            .labelSmall
            ?.copyWith(color: color, height: 1.2),
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
    final scheme = Theme.of(context).colorScheme;
    // Объявления, не попавшие в баннер (лимит — одно обычное), ждут здесь,
    // а не теряются: баннер показывает не всё.
    final moreAnnouncements = [
      for (final item in controller.announcements)
        if (!item.dismissed) item,
    ];
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
            if (controller.lastError != null &&
                controller.notifications.isEmpty)
              ListTile(
                leading: Icon(Icons.cloud_off_outlined, color: scheme.error),
                title: const Text('Не удалось загрузить уведомления'),
                subtitle: Text(controller.lastError!),
                trailing: TextButton(
                  onPressed: () => controller.refresh().catchError((_) {}),
                  child: const Text('Повторить'),
                ),
              )
            else if (controller.busy &&
                controller.notifications.isEmpty &&
                signedIn)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              ),
            for (final item in controller.notifications)
              ListTile(
                leading: Icon(
                  item.read
                      ? Icons.notifications_none
                      : Icons.notifications_active,
                  color: item.read ? null : scheme.primary,
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
            if (moreAnnouncements.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Text('Объявления',
                    style: Theme.of(context).textTheme.labelSmall),
              ),
              for (final item in moreAnnouncements)
                ListTile(
                  leading: Icon(_kindIcon(item.kind),
                      color: item.read ? null : _kindColor(scheme, item.kind)),
                  title: Text(
                    item.title,
                    style: TextStyle(
                        fontWeight: item.read ? null : FontWeight.w700),
                  ),
                  subtitle: Text(
                    item.bannerText.isNotEmpty
                        ? item.bannerText
                        : item.body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => showServerAnnouncement(context, item),
                ),
            ],
            if (controller.notifications.isEmpty &&
                moreAnnouncements.isEmpty &&
                controller.lastError == null &&
                !controller.busy)
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
              // Килимная кромка — только здесь: награда — тот самый особый
              // случай, ради которого мотив и заведён.
              if (item.kind == 'campaign') ...[
                const KilimEdge(),
                const SizedBox(height: 12),
              ],
              Row(
                children: [
                  Icon(_kindIcon(item.kind),
                      size: 28, color: _kindColor(Theme.of(context).colorScheme, item.kind)),
                  const SizedBox(width: 12),
                  Expanded(
                      child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _KindChip(kind: item.kind),
                      const SizedBox(height: 4),
                      Text(item.title,
                          style: Theme.of(context).textTheme.headlineSmall),
                    ],
                  )),
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

/// Цвет категории: сервисные работы — цветом ошибки (не брендом),
/// акция — акцентом, новость — спокойным чернильным.
Color _kindColor(ColorScheme scheme, String kind) => switch (kind) {
      'campaign' => scheme.primary,
      'maintenance' => scheme.error,
      _ => scheme.secondary,
    };

String _kindLabel(String kind) => switch (kind) {
      'campaign' => 'Акция',
      'maintenance' => 'Сервис',
      _ => 'Новость',
    };

String _shortDate(DateTime value) =>
    '${value.day.toString().padLeft(2, '0')}.${value.month.toString().padLeft(2, '0')}';

Future<void> _launch(String raw) async {
  final uri = Uri.tryParse(raw);
  if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
}
